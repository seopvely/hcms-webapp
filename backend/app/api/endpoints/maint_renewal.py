import html
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import MaintRenewal
from app.models.manager import Manager
from app.services.email import notify_maint_renewal_response
from app.utils.maint_plans import HOSTING_LABELS, PLAN_LABELS, plan_monthly_price

router = APIRouter(prefix="/maint-renewal", tags=["maint-renewal"])

# 고객이 응답할 수 있는 상태 — 그 외(accepted/estimated/converted 등)는 이미 처리된 건
RESPONDABLE_STATUSES = ["pending", "contacted"]


class RenewalResponse(BaseModel):
    response: Literal["accepted", "declined"]
    chosen_plan: Optional[Literal["basic", "growth", "business"]] = None
    hosting_type: Optional[Literal["I", "E"]] = None
    hosting_provider: Optional[str] = Field(None, max_length=200)
    memo: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def check_accepted_fields(self):
        if self.response == "accepted" and (not self.chosen_plan or not self.hosting_type):
            raise ValueError("유지보수 희망 시 요금제와 호스팅 구분을 선택해 주세요.")
        return self


@router.post("/{renewal_id}/respond")
def respond_maint_renewal(
    renewal_id: int,
    body: RenewalResponse,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id
    renewal = (
        db.query(MaintRenewal)
        .filter(MaintRenewal.seq == renewal_id, MaintRenewal.company_id == company_id)
        .first()
    )
    if not renewal:
        raise HTTPException(status_code=404, detail="안내를 찾을 수 없습니다.")

    accepted = body.response == "accepted"
    provider = (body.hosting_provider or "").strip() or None
    memo = (body.memo or "").strip()
    now = datetime.now()

    if accepted:
        hosting_text = HOSTING_LABELS[body.hosting_type]
        if body.hosting_type == "E" and provider:
            hosting_text += f", {provider}"
        summary = f"유지보수 희망 ({PLAN_LABELS[body.chosen_plan]}, {hosting_text})"
    else:
        hosting_text = ""
        summary = "유지보수 안 함"
    # PACMS _append_memo 와 같은 형식으로 기존 관리자 메모 뒤에 이어 붙인다
    memo_line = f"[{now:%Y-%m-%d %H:%M}] 고객 응답(HCMS, {current_user.name}): {summary}"
    if memo:
        memo_line += f" — {memo}"

    # 상태 조건부 UPDATE — 동시 클릭/중복 요청 시 한 번만 반영
    updated = (
        db.query(MaintRenewal)
        .filter(
            MaintRenewal.seq == renewal_id,
            MaintRenewal.company_id == company_id,
            MaintRenewal.status.in_(RESPONDABLE_STATUSES),
        )
        .update(
            {
                MaintRenewal.status: body.response,
                MaintRenewal.chosen_plan: body.chosen_plan if accepted else None,
                MaintRenewal.hosting_type: body.hosting_type if accepted else renewal.hosting_type,
                MaintRenewal.hosting_provider: provider if accepted and body.hosting_type == "E" else (None if accepted else renewal.hosting_provider),
                MaintRenewal.responded_at: now,
                MaintRenewal.updated_at: now,
                MaintRenewal.memo: func.concat_ws("\n", func.nullif(MaintRenewal.memo, ""), memo_line),
            },
            synchronize_session=False,
        )
    )
    if not updated:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 처리된 안내입니다.")
    db.commit()

    company = db.query(Company).filter(Company.seq == company_id).first()
    notify_maint_renewal_response(
        db,
        renewal_id=renewal_id,
        company_name=company.name if company else "Unknown",
        project_title=renewal.project.title if renewal.project else "",
        due_date=renewal.due_date.isoformat(),
        response_label="유지보수 희망" if accepted else "유지보수 안 함",
        plan_label=PLAN_LABELS[body.chosen_plan] if accepted else None,
        hosting_text=html.escape(hosting_text),
        monthly_price=plan_monthly_price(body.chosen_plan, body.hosting_type) if accepted else 0,
        memo=memo,
        writer_name=current_user.name,
    )

    return {"status": body.response, "renewal_id": renewal_id}
