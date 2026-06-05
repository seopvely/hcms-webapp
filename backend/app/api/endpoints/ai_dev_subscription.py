from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.ai_dev_subscription import AIDevSubscription

router = APIRouter(prefix="/ai-dev-subscriptions", tags=["ai-dev-subscriptions"])

PLAN_LABELS = {
    "starter": "STARTER",
    "business": "BUSINESS",
    "agency": "AGENCY",
    "enterprise": "ENTERPRISE",
}

STATUS_LABELS = {
    "active": "활성",
    "inactive": "비활성",
    "pending": "구축중",
}


def _serialize(sub: AIDevSubscription) -> dict:
    return {
        "seq": sub.seq,
        "plan_type": sub.plan_type,
        "plan_label": PLAN_LABELS.get(sub.plan_type, sub.plan_type.upper()),
        "status": sub.status,
        "status_label": STATUS_LABELS.get(sub.status, sub.status),
        "build_fee": sub.build_fee,
        "monthly_price": sub.monthly_price,
        "start_date": sub.start_date.isoformat() if sub.start_date else None,
        "next_charge_date": sub.next_charge_date.isoformat() if sub.next_charge_date else None,
        "is_beta": sub.is_beta,
        "notes": sub.notes,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
    }


@router.get("")
def list_ai_dev_subscriptions(
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subs = (
        db.query(AIDevSubscription)
        .filter(AIDevSubscription.company_id == current_user.company_id)
        .order_by(AIDevSubscription.created_at.desc())
        .all()
    )
    return [_serialize(s) for s in subs]


@router.get("/{seq}")
def get_ai_dev_subscription(
    seq: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = (
        db.query(AIDevSubscription)
        .filter(
            AIDevSubscription.seq == seq,
            AIDevSubscription.company_id == current_user.company_id,
        )
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="구독 정보를 찾을 수 없습니다.")
    return _serialize(sub)
