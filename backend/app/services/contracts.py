"""계약서 공용 로직 — 직원 화면·고객 서명 공개 페이지·고객 PDF 가 같이 쓴다.

서명 증적(SPEC 04 §4.3):
- 해시 = SHA-256("{계약번호}|{서명자}|{서명시각 ISO}|{IP}|{본문 SHA-256}")  — cms 형식 뒤에 본문 해시를 붙였다
  (cms 해시는 본문을 포함하지 않아 서명 뒤 내용 변경을 탐지하지 못했다)
- 서명 시점 PDF 를 contract_files/ 에 보관하고 contract_file 에 경로를 남긴다.
- IP 는 신뢰 헤더(X-Real-IP)로.
"""
import hashlib
import os
import uuid
from datetime import date, datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.customer import Estimate, EstimateContract, EstimateContractHistory
from app.services.staff_auth import client_ip
from app.utils.media import MEDIA_ROOT
from app.utils.pdf_generator import generate_contract_pdf
from app.db.locks import hold_lock
from app.db.session import SessionLocal

STATUS_LABELS = {"1": "작성중", "2": "검토대기", "3": "발송", "4": "서명완료(갑)", "5": "취소", "6": "쌍방서명완료"}
TOKEN_TTL = timedelta(hours=24)
BODY_FIELDS = (
    "contract_number", "contract_title", "project_type", "party_a_name", "party_a_ceo", "party_a_business_number",
    "party_a_address", "party_a_email", "party_b_name", "party_b_ceo", "party_b_business_number", "party_b_address",
    "party_b_email", "contract_amount", "contract_date", "contract_start_date", "contract_end_date", "contract_period",
    "project_description", "service_scope", "payment_terms", "special_terms", "maintenance_point",
    "free_maint_months", "free_maint_scope",
)


def status_of(c: EstimateContract) -> str:
    return str(c.status or "1")


def party_b_defaults() -> dict:
    return {
        "party_b_name": settings.CONTRACT_PARTY_B_NAME,
        "party_b_ceo": settings.CONTRACT_PARTY_B_CEO,
        "party_b_business_number": settings.CONTRACT_PARTY_B_BUSINESS_NUMBER,
        "party_b_address": settings.CONTRACT_PARTY_B_ADDRESS,
        "party_b_email": settings.CONTRACT_PARTY_B_EMAIL,
    }


def next_contract_number(db: Session) -> str:
    """CT{YYYYMMDD}{NNNN} — cms EstimateContract.save() 와 같은 규칙."""
    prefix = f"CT{date.today():%Y%m%d}"
    hold_lock(db, "hcms_contract_number")  # 커밋까지 다른 생성이 같은 번호를 읽지 못하게
    rows = db.query(EstimateContract.contract_number).filter(EstimateContract.contract_number.like(f"{prefix}%")).all()
    last = max((int(n[-4:]) for (n,) in rows if n and n[-4:].isdigit()), default=0)
    return f"{prefix}{last + 1:04d}"


def body_hash(c: EstimateContract) -> str:
    """계약 본문(조문에 들어가는 값)의 정규화 SHA-256."""
    parts = []
    for f in BODY_FIELDS:
        v = getattr(c, f)
        v = v.isoformat() if hasattr(v, "isoformat") else ("" if v is None else str(v))
        parts.append(f"{f}={' '.join(v.split())}")
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def history(db: Session, c: EstimateContract, action: str, desc: str, request: Request | None = None,
            by_id: int | None = None, by_name: str | None = None) -> None:
    db.add(EstimateContractHistory(contract_id=c.seq, action=action, action_by_id=by_id, action_by_name=by_name,
                                   description=desc, ip_address=client_ip(request) if request else None,
                                   created_at=datetime.now()))


def token_valid(c: EstimateContract) -> bool:
    return bool(c.sent_at) and datetime.now() - c.sent_at <= TOKEN_TTL


def find_by_token(db: Session, token: str | None, lock: bool = False) -> EstimateContract:
    if not token:
        raise HTTPException(status_code=404, detail="계약서를 찾을 수 없습니다.")
    q = db.query(EstimateContract).filter(EstimateContract.customer_signature_token == token)
    if lock:
        q = q.with_for_update()
    c = q.first()
    if c is None or status_of(c) in ("1", "2"):
        raise HTTPException(status_code=404, detail="계약서를 찾을 수 없습니다.")
    return c


def build_pdf_data(c: EstimateContract, estimate: Estimate | None) -> dict:
    """계약서 PDF 데이터(cms contract_preview 와 같이 견적서의 프로젝트 유형을 쓴다)."""
    return {
        "project_type": (estimate.project_type if estimate else None) or c.project_type,
        "free_maint_base_date": c.contract_end_date or (estimate.contract_termination_date if estimate else None),
        **{f: getattr(c, f) for f in BODY_FIELDS if f != "project_type"},
        "customer_signed_at": c.customer_signed_at,
        "customer_signed_name": c.customer_signed_name,
        "customer_signed_ip": c.customer_signed_ip,
        "customer_signed_hash": c.customer_signed_hash,
        "manager_signed_at": c.manager_signed_at,
        "manager_signed_name": c.manager_signed_name,
        "manager_signed_ip": c.manager_signed_ip,
        "manager_signed_hash": c.manager_signed_hash,
    }


def render_pdf(db: Session, c: EstimateContract) -> bytes:
    estimate = db.query(Estimate).filter(Estimate.seq == c.estimate_id).first() if c.estimate_id else None
    return bytes(generate_contract_pdf(build_pdf_data(c, estimate)))


def archive_pdf(db: Session, c: EstimateContract, label: str, request: Request | None = None,
                by_id: int | None = None, by_name: str | None = None) -> str:
    """서명 시점 PDF 스냅샷을 새 파일로 보관하고 그 경로를 이력('pdf_archived')에 남긴다.

    contract_file 은 최신 스냅샷을 가리킨다(을 서명 때 바뀜). 이전 스냅샷(고객 서명본)은 이력 행으로 찾는다.
    커밋이 실패하면 파일을 지운다(고아 파일 방지).
    """
    now = datetime.now()
    rel = f"contract_files/{now:%Y}/{now:%m}/{c.contract_number or c.seq}_{uuid.uuid4().hex[:8]}.pdf"
    path = os.path.join(MEDIA_ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(render_pdf(db, c))
    c.contract_file = rel
    history(db, c, "pdf_archived", f"{label} PDF 보관: {rel}", request, by_id, by_name)
    db.info.setdefault("contract_pdf_files", []).append(path)
    return rel


@event.listens_for(SessionLocal, "after_rollback")
def _discard_archived_pdfs(session: Session) -> None:
    for path in session.info.pop("contract_pdf_files", []):
        try:
            os.remove(path)
        except OSError:
            pass


@event.listens_for(SessionLocal, "after_commit")
def _keep_archived_pdfs(session: Session) -> None:
    session.info.pop("contract_pdf_files", None)


def owner_emails(db: Session, c: EstimateContract, exclude_id: int | None = None) -> list[str]:
    """계약서를 만든·발송한 직원과 연결 견적 담당자의 메일(처리한 직원 제외)."""
    from app.models.customer import CustomAuthUser
    ids = {c.created_by_id, c.sent_by_id}
    if c.estimate_id:
        e = db.query(Estimate.estimate_manager_id).filter(Estimate.seq == c.estimate_id).first()
        ids.add(e[0] if e else None)
    ids = {i for i in ids if i and i != exclude_id}
    if not ids:
        return []
    return sorted({u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(ids), CustomAuthUser.is_active == True)  # noqa: E712
                   if u.email})


def sign_hash(c: EstimateContract, signer: str, signed_at: datetime, ip: str | None, suffix: str = "") -> str:
    data = f"{c.contract_number}|{signer}|{signed_at.isoformat()}|{ip}{suffix}|{body_hash(c)}"
    return hashlib.sha256(data.encode("utf-8")).hexdigest()
