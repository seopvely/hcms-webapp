"""고객 계약서 열람·서명 공개 API (/api/public/contracts) — 로그인 없이 메일의 토큰으로만.

cms /managed/contract/view|sign/<token>/ 을 대체한다. 서명은 발송(3) 상태에서만 가능하다
(작성중·검토대기는 404, 서명완료·취소·쌍방서명 계약은 다시 서명할 수 없다 — cms 는 6 을 4 로 덮어쓸 수 있었다).
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.customer import CustomAuthUser, EstimateContractHistory
from app.services.notify import emit
from app.services import contracts as svc
from app.services.email import notify_manager_contract_signed
from app.services.staff_auth import client_ip

router = APIRouter(prefix="/public/contracts", tags=["public-contracts"])
EXPIRED = "링크가 만료되었습니다. (24시간 초과) 담당자에게 계약서 재발송을 요청해 주세요."


class TokenBody(BaseModel):
    token: str


@router.post("/view")
def view(body: TokenBody, request: Request, db: Session = Depends(get_db)):
    c = svc.find_by_token(db, body.token)
    status = svc.status_of(c)
    if status == "3" and not svc.token_valid(c):
        raise HTTPException(status_code=410, detail=EXPIRED)
    # 조회 이력: 같은 IP 10분 안 반복 조회는 한 번만 남긴다(cms 는 조회마다 쌓였다)
    ip = client_ip(request)
    recent = db.query(EstimateContractHistory.seq).filter(
        EstimateContractHistory.contract_id == c.seq, EstimateContractHistory.action == "viewed",
        EstimateContractHistory.ip_address == ip, EstimateContractHistory.created_at >= datetime.now() - timedelta(minutes=10),
    ).first()
    if not recent:
        svc.history(db, c, "viewed", "고객 계약서 조회", request, None, c.party_a_name)
        db.commit()
    return {
        "contract_number": c.contract_number,
        "contract_title": c.contract_title,
        "party_a_name": c.party_a_name,
        "party_b_name": c.party_b_name,
        "contract_amount": c.contract_amount,
        "status": status,
        "status_label": svc.STATUS_LABELS.get(status, "-"),
        "can_sign": status == "3",
        "customer_signed_at": c.customer_signed_at.isoformat() if c.customer_signed_at else None,
        "customer_signed_name": c.customer_signed_name,
    }


@router.post("/pdf")
def pdf(body: TokenBody, db: Session = Depends(get_db)):
    c = svc.find_by_token(db, body.token)
    if svc.status_of(c) == "3" and not svc.token_valid(c):
        raise HTTPException(status_code=410, detail=EXPIRED)
    return Response(content=svc.render_pdf(db, c), media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename={c.contract_number}.pdf"})


class SignBody(BaseModel):
    token: str
    signer_name: str
    agree: bool


@router.post("/sign")
def sign(body: SignBody, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)):
    signer = " ".join(body.signer_name.split())
    if not signer or len(signer) > 50:
        raise HTTPException(status_code=400, detail="서명자 이름을 입력해주세요.")
    if not body.agree:
        raise HTTPException(status_code=400, detail="계약 내용에 동의해야 서명할 수 있습니다.")
    c = svc.find_by_token(db, body.token, lock=True)
    status = svc.status_of(c)
    if status != "3":
        raise HTTPException(status_code=400, detail="이미 서명되었거나 서명할 수 없는 계약서입니다.")
    if not svc.token_valid(c):
        raise HTTPException(status_code=410, detail=EXPIRED)
    now = datetime.now()
    ip = client_ip(request)
    c.customer_signed_at = now
    c.customer_signed_name = signer
    c.customer_signed_ip = ip
    c.customer_signed_user_agent = request.headers.get("user-agent", "")
    c.customer_signed_hash = svc.sign_hash(c, signer, now, ip)
    c.status = "4"
    c.updated_at = now
    svc.archive_pdf(db, c)
    # action 'signed' + 서명자 이름 — 맥미니 iMessage 전달기가 이 행을 읽는다(형식 유지)
    svc.history(db, c, "signed", f"고객 서명 완료: {signer} (타임스탬프 인증: {c.customer_signed_hash[:16]}...)", request, None, signer)
    emit(db, "contract.signed_by_customer", f"[계약 서명] {c.contract_number or ''} {c.contract_title or ''} 서명자 {signer}", "estimate_contract", c.seq)
    db.commit()
    owner = db.query(CustomAuthUser).filter(CustomAuthUser.id == (c.sent_by_id or c.created_by_id)).first()
    if owner and owner.email:
        background.add_task(notify_manager_contract_signed, owner.email, c.seq, c.contract_title, c.contract_number, signer)
    return {"ok": True, "signed_at": now.isoformat(), "hash": c.customer_signed_hash}
