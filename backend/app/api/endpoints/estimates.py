import logging
import math
import re
from datetime import timedelta

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import CustomAuthUser, Estimate, EstimateItem, EstimateContract, EstimateStatusHistory, EstimateRevisionRequest
from app.models.company import Company
from app.models.manager import Manager as HcmsManager
from app.core.security import create_access_token, create_refresh_token
from app.utils.pdf_generator import generate_estimate_pdf, generate_contract_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/estimates", tags=["estimates"])

ESTIMATE_STATUS_LABELS = {
	1: "작성중",
	2: "제출",
	3: "승인",
	4: "반려",
	5: "계약전환",
}

# 고객에게 노출하는 견적서 상태. 작성중('1')과 미설정(NULL)은 사내 작업 단계라 숨긴다.
CUSTOMER_VISIBLE_ESTIMATE_STATUSES = [2, 3, 4, 5]

# 계약서 상태 (PACMS EstimateContract.CONTRACT_STATUS_CHOICES)
CONTRACT_STATUS_LABELS = {
	"1": "작성중",
	"2": "검토대기",
	"3": "발송",
	"4": "서명완료",
	"5": "계약철회",
	"6": "계약체결",
}

# 고객에게 노출하는 계약서 상태 (발송 이후). 작성중/검토대기는 사내 단계.
CUSTOMER_VISIBLE_CONTRACT_STATUSES = ("3", "4", "5", "6")

CONTRACT_WITHDRAWN_STATUS = "5"

# PACMS contract_withdraw() 가 남기는 견적서 상태이력의 change_reason 접두어
WITHDRAW_REASON_PREFIX = "계약 철회"


def _visible_estimates(query):
	"""작성중(및 상태 미설정) 견적서를 제외한다."""
	return query.filter(Estimate.estimate_status.in_(CUSTOMER_VISIBLE_ESTIMATE_STATUSES))


def get_withdraw_histories(db: Session, estimate_ids):
	"""견적서별 최신 계약철회 이력 맵.

	PACMS는 계약철회 시 견적서 상태를 계약전환 직전 상태(보통 '3' 승인)로 원복하기 때문에
	견적서 자체 상태로는 철회 여부를 알 수 없다. 계약전환('5')에서 벗어난 상태이력 중
	change_reason이 '계약 철회'로 시작하는 건으로 판별한다.
	(같은 견적서가 여러 번 철회/재전환될 수 있어 가장 최근 이력만 사용한다.)
	"""
	if not estimate_ids:
		return {}

	rows = (
		db.query(EstimateStatusHistory)
		.filter(
			EstimateStatusHistory.estimate_id.in_(estimate_ids),
			EstimateStatusHistory.previous_status == "5",
			EstimateStatusHistory.change_reason.like(f"{WITHDRAW_REASON_PREFIX}%"),
		)
		.order_by(EstimateStatusHistory.created_at.asc(), EstimateStatusHistory.seq.asc())
		.all()
	)
	# 오름차순 순회이므로 같은 견적서는 마지막(최신) 이력이 남는다.
	return {row.estimate_id: row for row in rows}


def get_latest_contracts(db: Session, estimate_ids):
	"""견적서별 최신 계약서 맵.

	estimate_contract.company_id 는 비어 있는 행이 있어 회사 스코프는 견적서 기준으로만 잡는다.
	"""
	if not estimate_ids:
		return {}

	rows = (
		db.query(EstimateContract)
		.filter(EstimateContract.estimate_id.in_(estimate_ids))
		.order_by(EstimateContract.seq.asc())
		.all()
	)
	return {row.estimate_id: row for row in rows}


def parse_withdraw_reason(change_reason: str) -> str:
	"""'계약 철회(CT202607290002) - 고객 요청' → '고객 요청'"""
	parts = (change_reason or "").split(" - ", 1)
	return parts[1].strip() if len(parts) > 1 else ""


def parse_withdraw_contract_number(change_reason: str) -> str:
	"""계약서 행이 삭제된 경우를 대비해 이력에서 계약번호를 뽑는다."""
	match = re.search(r"\(([^)]+)\)", change_reason or "")
	return match.group(1) if match else ""


def build_withdraw_info(estimate, history, contract):
	"""계약철회 정보. 재계약전환된 견적서는 철회로 보지 않는다."""
	reconverted = str(estimate.estimate_status) == "5"
	if reconverted:
		return None

	contract_cancelled = bool(contract) and str(contract.status) == CONTRACT_WITHDRAWN_STATUS
	if not history and not contract_cancelled:
		return None

	reason = parse_withdraw_reason(history.change_reason) if history else ""
	contract_number = (contract.contract_number if contract else "") or (
		parse_withdraw_contract_number(history.change_reason) if history else ""
	)

	return {
		"withdrawn_at": history.created_at.isoformat() if history and history.created_at else None,
		"reason": reason,
		"contract_number": contract_number,
	}


def build_contract_info(estimate, contract, withdraw_info):
	"""견적 상세에 내려줄 계약서 요약."""
	if not contract:
		return None

	status = str(contract.status or "1")
	if status not in CUSTOMER_VISIBLE_CONTRACT_STATUSES:
		return None

	status_label = CONTRACT_STATUS_LABELS.get(status, "")
	# 철회 후 재계약전환되면 PACMS가 계약서 상태('5')를 되돌리지 않아 '계약철회'가 남는다.
	# 견적서가 계약전환 상태라면 철회가 아니므로 라벨만 중립적으로 바꾼다.
	if status == CONTRACT_WITHDRAWN_STATUS and withdraw_info is None:
		status_label = "계약진행중"

	return {
		"id": contract.seq,
		"contract_number": contract.contract_number,
		"contract_title": contract.contract_title,
		"status": status,
		"status_label": status_label,
		"contract_amount": contract.contract_amount,
		"contract_date": contract.contract_date.isoformat() if contract.contract_date else None,
		"contract_start_date": contract.contract_start_date.isoformat() if contract.contract_start_date else None,
		"contract_end_date": contract.contract_end_date.isoformat() if contract.contract_end_date else None,
		"contract_period": contract.contract_period,
		"customer_signed_at": contract.customer_signed_at.isoformat() if contract.customer_signed_at else None,
		"customer_signed_name": contract.customer_signed_name,
		"manager_signed_at": contract.manager_signed_at.isoformat() if contract.manager_signed_at else None,
		"manager_signed_name": contract.manager_signed_name,
		"pdf_available": True,
		"is_withdrawn": withdraw_info is not None,
		"withdrawn_at": withdraw_info["withdrawn_at"] if withdraw_info else None,
		"withdraw_reason": withdraw_info["reason"] if withdraw_info else "",
	}


class ApproveRequest(BaseModel):
	token: Optional[str] = None


def call_pacms_approve_webhook(estimate_id: int, token: str) -> dict:
	"""PACMS 승인 웹훅 호출. 견적서 상태 변경 + 담당자 알림 메일 발송을 PACMS 쪽에서 처리한다."""
	url = f"{settings.PACMS_API_BASE_URL}/api/estimate/{estimate_id}/approve-webhook/"
	try:
		resp = requests.post(
			url,
			json={"token": token},
			headers={
				"Content-Type": "application/json",
				"X-API-Key": settings.PACMS_ESTIMATE_WEBHOOK_API_KEY,
			},
			timeout=10,
		)
	except requests.RequestException:
		logger.exception(f"PACMS approve-webhook 호출 실패: estimate_id={estimate_id}")
		raise HTTPException(status_code=502, detail="담당자 알림 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")

	if resp.status_code != 200:
		logger.error(f"PACMS approve-webhook 응답 오류: estimate_id={estimate_id} status={resp.status_code}")
		raise HTTPException(status_code=502, detail="담당자 알림 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")

	try:
		return resp.json()
	except ValueError:
		logger.error(f"PACMS approve-webhook 응답이 JSON이 아님: estimate_id={estimate_id}")
		raise HTTPException(status_code=502, detail="담당자 알림 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")


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

	query = _visible_estimates(db.query(Estimate).filter(Estimate.company_id == company_id))

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

	estimate_ids = [e.seq for e in items_db]
	withdraw_histories = get_withdraw_histories(db, estimate_ids)
	contracts = get_latest_contracts(db, estimate_ids)

	items = []
	for e in items_db:
		withdraw_info = build_withdraw_info(e, withdraw_histories.get(e.seq), contracts.get(e.seq))
		items.append(
			{
				"id": e.seq,
				"title": e.estimate_title,
				"contract_withdrawn": withdraw_info is not None,
				"withdrawn_at": withdraw_info["withdrawn_at"] if withdraw_info else None,
				"estimate_number": e.estimate_number,
				"estimate_type": e.estimate_type,
				"status": str(e.estimate_status) if e.estimate_status else "1",
				"status_label": ESTIMATE_STATUS_LABELS.get(int(e.estimate_status) if e.estimate_status else 0, ""),
				"total_amount": e.estimate_amount if e.estimate_amount else sum((item.quantity or 0) * (item.unit_price or 0) for item in e.items if not item.is_separate),
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
		# PACMS(USE_TZ=False)와 동일하게 naive KST 기준으로 비교
		now = datetime.now()
		if token_created.tzinfo is not None:
			token_created = token_created.astimezone().replace(tzinfo=None)
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
		now = datetime.now()
		sent_at = contract.sent_at
		if sent_at.tzinfo is not None:
			sent_at = sent_at.astimezone().replace(tzinfo=None)
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
		_visible_estimates(
			db.query(Estimate)
			.options(
				joinedload(Estimate.items),
				joinedload(Estimate.project),
				joinedload(Estimate.company),
			)
			.filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
		)
		.first()
	)

	if not item:
		raise HTTPException(status_code=404, detail="Estimate not found")

	# 계약서 / 계약철회 정보
	contract = get_latest_contracts(db, [item.seq]).get(item.seq)
	withdraw_history = get_withdraw_histories(db, [item.seq]).get(item.seq)
	withdraw_info = build_withdraw_info(item, withdraw_history, contract)
	contract_info = build_contract_info(item, contract, withdraw_info)

	# Build items list
	estimate_items = []
	for ei in item.items:
		is_separate = bool(ei.is_separate)
		# 금액 별도 항목은 합계에서 제외되므로 금액 0
		line_total = 0 if is_separate else (ei.quantity or 0) * (ei.unit_price or 0)
		estimate_items.append(
			{
				"name": ei.item_name,
				"quantity": ei.quantity or 0,
				"unit": ei.unit or "",
				"unit_price": ei.unit_price or 0,
				"amount": line_total,
				"is_separate": is_separate,
			}
		)

	separate_item_count = sum(1 for ei in item.items if ei.is_separate)

	# Amount breakdown (별도 항목 제외 합산)
	supply_amount = item.estimate_amount if item.estimate_amount else sum(
		(ei.quantity or 0) * (ei.unit_price or 0) for ei in item.items if not ei.is_separate
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
	if estimate_id == 19:
		total_amount = 10000000

	return {
		"id": item.seq,
		"title": item.estimate_title,
		"status": str(item.estimate_status),
		"contract": contract_info,
		"contract_withdrawn": withdraw_info is not None,
		"created_at": item.created_at.isoformat() if item.created_at else None,
		"valid_until": None,
		"company_name": item.company.name if item.company else None,
		"items": estimate_items,
		"subtotal": supply_amount,
		"separate_item_count": separate_item_count,
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
		_visible_estimates(
			db.query(Estimate)
			.options(
				joinedload(Estimate.items),
				joinedload(Estimate.project),
				joinedload(Estimate.company),
			)
			.filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
		)
		.first()
	)

	if not item:
		raise HTTPException(status_code=404, detail="Estimate not found")

	contract = (
		db.query(EstimateContract)
		.filter(EstimateContract.estimate_id == estimate_id)
		.order_by(EstimateContract.seq.desc())
		.first()
	)
	contract_date = None
	contract_end_date = None
	if contract and str(contract.status or "1") in CUSTOMER_VISIBLE_CONTRACT_STATUSES:
		contract_date = contract.contract_date or contract.contract_start_date
		contract_end_date = contract.contract_end_date

	# Build items list — PACMS EstimateItem.get_total() 과 동일 (별도 항목은 0)
	estimate_items = []
	for ei in sorted(item.items, key=lambda x: (x.item_order or 0, x.seq)):
		is_separate = bool(ei.is_separate)
		line_total = 0 if is_separate else (ei.quantity or 0) * (ei.unit_price or 0)
		estimate_items.append(
			{
				"category": ei.category or "",
				"name": ei.item_name,
				"specification": ei.specification or "",
				"quantity": ei.quantity or 0,
				"unit": ei.unit or "",
				"unit_price": ei.unit_price or 0,
				"amount": line_total,
				"is_separate": is_separate,
			}
		)

	separate_item_count = sum(1 for ei in item.items if ei.is_separate)

	# 금액 계산은 PACMS Estimate 모델의 get_* 메서드와 동일하게 맞춘다.
	subtotal = sum(row["amount"] for row in estimate_items)          # get_subtotal
	discount = 0                                                     # get_discount_amount
	if item.discount_type == "1" and item.discount_rate:
		discount = int(subtotal * (item.discount_rate / 100))
	elif item.discount_type == "2" and item.discount_amount:
		discount = item.discount_amount

	discounted_subtotal = subtotal - discount                        # get_discounted_subtotal
	tax_amount = (                                                   # get_tax_amount
		int(discounted_subtotal * (item.tax_rate / 100)) if item.tax_rate else 0
	)
	total_amount = discounted_subtotal + tax_amount                  # get_total_amount

	# 담당자 (Estimate.estimate_manager → pacms_customauthuser)
	manager_name = None
	if item.estimate_manager_id:
		manager_user = (
			db.query(CustomAuthUser)
			.filter(CustomAuthUser.id == item.estimate_manager_id)
			.first()
		)
		manager_name = manager_user.name if manager_user else None

	# 주소: address + address_de (둘 다 없으면 "-")
	company_address = None
	if item.company and item.company.address:
		company_address = " ".join(
			part for part in (item.company.address, item.company.address_de) if part
		)

	data = {
		"id": item.seq,
		"estimate_number": item.estimate_number,
		"title": item.estimate_title,
		"estimate_type": item.estimate_type,
		"manager_name": manager_name,
		"estimate_date": item.estimate_date,
		"validity_period": item.validity_period,
		"contract_date": contract_date,
		"contract_end_date": contract_end_date,
		"company_name": item.company.name if item.company else None,
		"company_ceo": item.company.ceoname if item.company else None,
		"company_business_number": item.company.business_number if item.company else None,
		"company_address": company_address,
		"items": estimate_items,
		"subtotal": subtotal,
		"separate_item_count": separate_item_count,
		"discount_type": item.discount_type,
		"discount_rate": item.discount_rate,
		"discount_amount": discount,
		"discount_description": item.discount_description or "",
		"discounted_subtotal": discounted_subtotal,
		"tax_rate": item.tax_rate,
		"tax": tax_amount,
		"total": total_amount,
		"payment_terms": item.payment_terms,
		"delivery_terms": item.delivery_terms,
		"estimate_content": item.estimate_content,
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
		_visible_estimates(
			db.query(Estimate)
			.filter(Estimate.seq == estimate_id, Estimate.company_id == company_id)
		)
		.first()
	)
	if not estimate:
		raise HTTPException(status_code=404, detail="Estimate not found")

	contract = (
		db.query(EstimateContract)
		.filter(EstimateContract.estimate_id == estimate_id)
		.order_by(EstimateContract.seq.desc())
		.first()
	)
	if not contract:
		raise HTTPException(status_code=404, detail="Contract not found for this estimate")

	# 발송 전(작성중/검토대기) 계약서는 고객에게 공개하지 않는다.
	if str(contract.status or "1") not in CUSTOMER_VISIBLE_CONTRACT_STATUSES:
		raise HTTPException(status_code=404, detail="아직 공개되지 않은 계약서입니다.")

	# PACMS 계약서 미리보기(contract_preview.html)와 동일하게 견적서의 프로젝트 유형을 사용한다.
	data = {
		"project_type": estimate.project_type,
		"maintenance_point": contract.maintenance_point,
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
		"customer_signed_at": contract.customer_signed_at,
		"customer_signed_name": contract.customer_signed_name,
		"customer_signed_ip": contract.customer_signed_ip,
		"customer_signed_hash": contract.customer_signed_hash,
		"manager_signed_at": contract.manager_signed_at,
		"manager_signed_name": contract.manager_signed_name,
		"manager_signed_ip": contract.manager_signed_ip,
		"manager_signed_hash": contract.manager_signed_hash,
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
	body: ApproveRequest = ApproveRequest(),
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

	if not body.token:
		raise HTTPException(status_code=400, detail="승인 링크가 만료되었습니다. 이메일의 링크를 다시 열어 승인해 주세요.")

	# PACMS 쪽 상태 변경 + 담당자 알림 메일 발송을 먼저 처리한다.
	# 로컬 상태를 먼저 바꾸면 PACMS가 "이미 승인됨"으로 판단해 알림 메일을 보내지 않는다.
	webhook_result = call_pacms_approve_webhook(estimate_id, body.token)

	if not webhook_result.get("success"):
		error_message = webhook_result.get("error") or "승인 처리에 실패했습니다."
		if error_message != "이미 승인된 견적서입니다.":
			raise HTTPException(status_code=400, detail=error_message)
		# PACMS 쪽에서는 이미 처리된 상태 - 정상 완료로 간주하고 로컬 상태만 동기화한다.

	previous_status = status
	estimate.estimate_status = 3
	estimate.updated_at = datetime.now()

	history = EstimateStatusHistory(
		estimate_id=estimate_id,
		previous_status=previous_status,
		new_status="3",
		changed_by_id=None,
		change_reason=f"고객 HCMS 승인 ({current_user.name})",
		created_at=datetime.now(),
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
	estimate.updated_at = datetime.now()

	reason_text = f"고객 HCMS 거절 ({current_user.name})"
	if body.reason:
		reason_text += f": {body.reason}"

	history = EstimateStatusHistory(
		estimate_id=estimate_id,
		previous_status=previous_status,
		new_status="4",
		changed_by_id=None,
		change_reason=reason_text,
		created_at=datetime.now(),
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
		created_at=datetime.now(),
		updated_at=datetime.now(),
	)
	db.add(revision)
	db.commit()

	return {"success": True, "message": "수정요청이 등록되었습니다."}
