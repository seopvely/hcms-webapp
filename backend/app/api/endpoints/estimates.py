import math
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone as tz

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import Estimate, EstimateItem, EstimateContract, EstimateStatusHistory, EstimateRevisionRequest
from app.models.company import Company
from app.models.manager import Manager as HcmsManager
from app.core.security import create_access_token, create_refresh_token
from app.utils.pdf_generator import generate_estimate_pdf, generate_contract_pdf

router = APIRouter(prefix="/estimates", tags=["estimates"])

ESTIMATE_STATUS_LABELS = {
    1: "작성중",
    2: "제출",
    3: "승인",
    4: "반려",
    5: "계약전환",
}


class RejectRequest(BaseModel):
    reason: str = ""


class RevisionRequest(BaseModel):
    requester_name: str = ""
    title: str
    content: str


@router.get("")
def list_estimates(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query("", description="Search in estimate_title"),
    status: str = Query("", description="Filter by estimate_status (1-5)"),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    query = db.query(Estimate).filter(Estimate.company_id == company_id)

    if search:
        query = query.filter(Estimate.estimate_title.ilike(f"%{search}%"))

    if status:
        query = query.filter(Estimate.estimate_status == int(status))

    total = query.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    items_db = (
        query.options(joinedload(Estimate.project), joinedload(Estimate.items))
        .order_by(Estimate.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for e in items_db:
        items.append(
            {
                "id": e.seq,
                "title": e.estimate_title,
                "estimate_number": e.estimate_number,
                "estimate_type": e.estimate_type,
                "status": str(e.estimate_status) if e.estimate_status else "1",
                "status_label": ESTIMATE_STATUS_LABELS.get(int(e.estimate_status) if e.estimate_status else 0, ""),
                "total_amount": e.estimate_amount if e.estimate_amount else sum((item.quantity or 0) * (item.unit_price or 0) for item in e.items),
                "estimate_date": (
                    e.estimate_date.isoformat() if e.estimate_date else None
                ),
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "project_title": e.project.title if e.project else None,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@router.get("/auth/verify-token")
def verify_estimate_token(
    token: str = Query(..., description="Estimate approval token"),
    estimate_id: int = Query(..., description="Estimate ID"),
    db: Session = Depends(get_db),
):
    """이메일 링크에서 견적서 토큰 검증 후 자동 로그인 정보 반환"""
    from datetime import datetime, timezone as tz

    # 1. 견적서 조회
    estimate = (
        db.query(Estimate)
        .options(joinedload(Estimate.company))
        .filter(Estimate.seq == estimate_id)
        .first()
    )

    if not estimate:
        raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")

    # 2. 토큰 검증
    # Note: approval_token is stored as CharField in Django's Estimate model
    approval_token = getattr(estimate, 'approval_token', None)
    if not approval_token or approval_token != token:
        raise HTTPException(status_code=401, detail="유효하지 않은 링크입니다.")

    # 3. 24시간 만료 체크
    token_created = getattr(estimate, 'approval_token_created_at', None)
    if token_created:
        now = datetime.now(tz.utc)
        if token_created.tzinfo is None:
            # Naive datetime - assume UTC
            from datetime import timezone as dt_tz
            token_created = token_created.replace(tzinfo=dt_tz.utc)
        if (now - token_created) > timedelta(hours=24):
            raise HTTPException(status_code=401, detail="링크가 만료되었습니다. (24시간 초과)")

    # 4. 회사 정보로 매니저 찾기
    company = estimate.company
    if not company:
        raise HTTPException(status_code=404, detail="업체 정보를 찾을 수 없습니다.")

    # 회사의 첫 번째 매니저를 찾아서 자동 로그인
    manager = (
        db.query(HcmsManager)
        .filter(HcmsManager.company_id == company.seq)
        .order_by(HcmsManager.seq)
        .first()
    )

    if not manager:
        raise HTTPException(status_code=404, detail="해당 업체의 등록된 관리자가 없습니다.")

    # 5. JWT 토큰 생성
    token_data = {"sub": str(manager.seq), "login_id": manager.login_id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "seq": manager.seq,
            "login_id": manager.login_id,
            "name": manager.name,
            "email": manager.email,
            "company_name": company.name if company else None,
            "company_id": manager.company_id,
        },
        "estimate_id": estimate_id,
        "estimate_status": str(estimate.estimate_status) if estimate.estimate_status else "1",
    }


@router.get("/contracts/auth/verify-token")
def verify_contract_token(
    token: str = Query(..., description="Contract signature token"),
    contract_id: int = Query(..., description="Contract ID"),
    db: Session = Depends(get_db),
):
    """계약서 이메일 링크에서 토큰 검증 후 자동 로그인 정보 반환"""
    from datetime import datetime, timezone as tz

    # 1. 계약서 조회
    contract = (
        db.query(EstimateContract)
        .options(joinedload(EstimateContract.company))
        .filter(EstimateContract.seq == contract_id)
        .first()
    )

    if not contract:
        raise HTTPException(status_code=404, detail="계약서를 찾을 수 없습니다.")

    # 2. 토큰 검증
    if not contract.customer_signature_token or contract.customer_signature_token != token:
        raise HTTPException(status_code=401, detail="유효하지 않은 링크입니다.")

    # 3. 24시간 만료 체크
    if contract.sent_at:
        now = datetime.now(tz.utc)
        sent_at = contract.sent_at
        if sent_at.tzinfo is None:
            from datetime import timezone as dt_tz
            sent_at = sent_at.replace(tzinfo=dt_tz.utc)
        if (now - sent_at) > timedelta(hours=24):
            raise HTTPException(status_code=401, detail="링크가 만료되었습니다. (24시간 초과)")

    # 4. 회사 정보로 매니저 찾기
    company = contract.company
    if not company:
        raise HTTPException(status_code=404, detail="업체 정보를 찾을 수 없습니다.")

    manager = (
        db.query(HcmsManager)
        .filter(HcmsManager.company_id == company.seq)
        .order_by(HcmsManager.seq)
        .first()
    )

    if not manager:
        raise HTTPException(status_code=404, detail="해당 업체의 등록된 관리자가 없습니다.")

    # 5. JWT 토큰 생성
    token_data = {"sub": str(manager.seq), "login_id": manager.login_id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # 연결된 견적서 ID 찾기
    estimate_id = contract.estimate_id

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "seq": manager.seq,
            "login_id": manager.login_id,
            "name": manager.name,
            "email": manager.email,
            "company_name": company.name if company else None,
            "company_id": manager.company_id,
        },
        "contract_id": contract_id,
        "estimate_id": estimate_id,
        "contract_status": contract.status or "1",
    }


@router.get("/{estimate_id}")
def get_estimate_detail(
    estimate_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    item = (
        db.query(Estimate)
        .options(
            joinedload(Estimate.items),
            joinedload(Estimate.project),
            joinedload(Estimate.company),
        )
        .filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Estimate not found")

    # Build items list
    estimate_items = []
    for ei in item.items:
        line_total = (ei.quantity or 0) * (ei.unit_price or 0)
        estimate_items.append(
            {
                "name": ei.item_name,
                "quantity": ei.quantity or 0,
                "unit": ei.unit or "",
                "unit_price": ei.unit_price or 0,
                "amount": line_total,
            }
        )

    # Amount breakdown
    supply_amount = item.estimate_amount if item.estimate_amount else sum(
        (ei.quantity or 0) * (ei.unit_price or 0) for ei in item.items
    )

    # Discount calculation
    discount = 0
    if item.discount_type == '1' and item.discount_rate:
        discount = int(supply_amount * (item.discount_rate / 100))
    elif item.discount_type == '2' and item.discount_amount:
        discount = item.discount_amount

    after_discount = supply_amount - discount
    tax_rate = item.tax_rate or 10.0
    tax_amount = int(after_discount * (tax_rate / 100))
    total_amount = after_discount + tax_amount

    return {
        "id": item.seq,
        "title": item.estimate_title,
        "status": str(item.estimate_status),
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "valid_until": None,
        "company_name": item.company.name if item.company else None,
        "items": estimate_items,
        "subtotal": supply_amount,
        "discount": discount,
        "discount_description": item.discount_description or "",
        "tax": tax_amount,
        "total": total_amount,
        "notes": item.estimate_content,
    }


@router.get("/{estimate_id}/pdf")
def download_estimate_pdf(
    estimate_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    item = (
        db.query(Estimate)
        .options(
            joinedload(Estimate.items),
            joinedload(Estimate.project),
            joinedload(Estimate.company),
        )
        .filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
        .first()
    )

    if not item:
        raise HTTPException(status_code=404, detail="Estimate not found")

    # Build items list
    estimate_items = []
    for ei in item.items:
        line_total = (ei.quantity or 0) * (ei.unit_price or 0)
        estimate_items.append(
            {
                "name": ei.item_name,
                "quantity": ei.quantity or 0,
                "unit": ei.unit or "",
                "unit_price": ei.unit_price or 0,
                "amount": line_total,
            }
        )

    # Amount breakdown
    supply_amount = item.estimate_amount if item.estimate_amount else sum(
        (ei.quantity or 0) * (ei.unit_price or 0) for ei in item.items
    )
    discount = 0
    if item.discount_type == "1" and item.discount_rate:
        discount = int(supply_amount * (item.discount_rate / 100))
    elif item.discount_type == "2" and item.discount_amount:
        discount = item.discount_amount

    after_discount = supply_amount - discount
    tax_rate = item.tax_rate or 10.0
    tax_amount = int(after_discount * (tax_rate / 100))
    total_amount = after_discount + tax_amount

    data = {
        "id": item.seq,
        "title": item.estimate_title,
        "estimate_number": item.estimate_number,
        "estimate_date": item.estimate_date,
        "valid_until": None,
        "company_name": item.company.name if item.company else None,
        "company_ceo": item.company.ceoname if item.company else None,
        "company_business_number": item.company.business_number if item.company else None,
        "company_address": item.company.address if item.company else None,
        "items": estimate_items,
        "subtotal": supply_amount,
        "discount": discount,
        "discount_description": item.discount_description or "",
        "tax": tax_amount,
        "total": total_amount,
        "notes": item.estimate_content,
    }

    pdf_bytes = bytes(generate_estimate_pdf(data))

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=estimate_{estimate_id}.pdf"},
    )


@router.get("/{estimate_id}/contract-pdf")
def download_contract_pdf(
    estimate_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    # Verify the estimate belongs to the user's company
    estimate = (
        db.query(Estimate)
        .filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
        .first()
    )
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found")

    contract = (
        db.query(EstimateContract)
        .filter(EstimateContract.estimate_id == estimate_id)
        .first()
    )
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found for this estimate")

    data = {
        "contract_number": contract.contract_number,
        "contract_title": contract.contract_title,
        "contract_date": contract.contract_date,
        "party_a_name": contract.party_a_name,
        "party_a_ceo": contract.party_a_ceo,
        "party_a_business_number": contract.party_a_business_number,
        "party_a_address": contract.party_a_address,
        "party_a_email": contract.party_a_email,
        "party_b_name": contract.party_b_name,
        "party_b_ceo": contract.party_b_ceo,
        "party_b_business_number": contract.party_b_business_number,
        "party_b_address": contract.party_b_address,
        "party_b_email": contract.party_b_email,
        "project_description": contract.project_description,
        "service_scope": contract.service_scope,
        "contract_period": contract.contract_period,
        "contract_start_date": contract.contract_start_date,
        "contract_end_date": contract.contract_end_date,
        "contract_amount": contract.contract_amount,
        "payment_terms": contract.payment_terms,
        "special_terms": contract.special_terms,
    }

    pdf_bytes = bytes(generate_contract_pdf(data))

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=contract_{estimate_id}.pdf"},
    )


@router.post("/{estimate_id}/approve")
def approve_estimate(
    estimate_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """고객이 견적서를 승인"""
    company_id = current_user.company_id

    estimate = (
        db.query(Estimate)
        .filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
        .first()
    )

    if not estimate:
        raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")

    status = str(estimate.estimate_status) if estimate.estimate_status else "1"

    if status == "3":
        raise HTTPException(status_code=400, detail="이미 승인된 견적서입니다.")
    if status == "4":
        raise HTTPException(status_code=400, detail="이미 거절된 견적서입니다.")
    if status == "5":
        raise HTTPException(status_code=400, detail="이미 계약으로 전환된 견적서입니다.")
    if status != "2":
        raise HTTPException(status_code=400, detail="승인할 수 없는 상태의 견적서입니다.")

    previous_status = status
    estimate.estimate_status = 3
    estimate.updated_at = datetime.now(tz.utc)

    history = EstimateStatusHistory(
        estimate_id=estimate_id,
        previous_status=previous_status,
        new_status="3",
        changed_by_id=None,
        change_reason=f"고객 HCMS 승인 ({current_user.name})",
        created_at=datetime.now(tz.utc),
    )
    db.add(history)
    db.commit()

    return {"success": True, "message": "견적서가 승인되었습니다.", "status": "3"}


@router.post("/{estimate_id}/reject")
def reject_estimate(
    estimate_id: int,
    body: RejectRequest,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """고객이 견적서를 거절"""
    company_id = current_user.company_id

    estimate = (
        db.query(Estimate)
        .filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
        .first()
    )

    if not estimate:
        raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")

    status = str(estimate.estimate_status) if estimate.estimate_status else "1"

    if status == "3":
        raise HTTPException(status_code=400, detail="이미 승인된 견적서입니다.")
    if status == "4":
        raise HTTPException(status_code=400, detail="이미 거절된 견적서입니다.")
    if status == "5":
        raise HTTPException(status_code=400, detail="이미 계약으로 전환된 견적서입니다.")
    if status != "2":
        raise HTTPException(status_code=400, detail="처리할 수 없는 상태의 견적서입니다.")

    previous_status = status
    estimate.estimate_status = 4
    estimate.updated_at = datetime.now(tz.utc)

    reason_text = f"고객 HCMS 거절 ({current_user.name})"
    if body.reason:
        reason_text += f": {body.reason}"

    history = EstimateStatusHistory(
        estimate_id=estimate_id,
        previous_status=previous_status,
        new_status="4",
        changed_by_id=None,
        change_reason=reason_text,
        created_at=datetime.now(tz.utc),
    )
    db.add(history)
    db.commit()

    return {"success": True, "message": "견적서가 거절되었습니다.", "status": "4"}


@router.post("/{estimate_id}/revision")
def request_revision(
    estimate_id: int,
    body: RevisionRequest,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """고객이 견적서 수정요청"""
    company_id = current_user.company_id

    estimate = (
        db.query(Estimate)
        .filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
        .first()
    )

    if not estimate:
        raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")

    status = str(estimate.estimate_status) if estimate.estimate_status else "1"

    if status != "2":
        raise HTTPException(status_code=400, detail="수정요청을 할 수 없는 상태의 견적서입니다.")

    revision = EstimateRevisionRequest(
        estimate_id=estimate_id,
        requester_email=current_user.email or "",
        requester_name=body.requester_name or current_user.name,
        title=body.title,
        content=body.content,
        is_resolved=False,
        created_at=datetime.now(tz.utc),
        updated_at=datetime.now(tz.utc),
    )
    db.add(revision)
    db.commit()

    return {"success": True, "message": "수정요청이 등록되었습니다."}
