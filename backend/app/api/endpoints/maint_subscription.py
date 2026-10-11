from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import MaintSubscription, PointHistory
from app.utils.maint_plans import PLAN_LABELS, hosting_label, plan_services, service_text
from app.services.points import cycle_used_points, subscription_cycle

router = APIRouter(prefix="/maint-subscription", tags=["maint-subscription"])

STATUS_LABELS = {"active": "이용중", "beta": "베타 이용중", "inactive": "해지"}

SERVICE_STATUS_LABELS = {"pending": "준비중", "active": "제공중", "inactive": "중지"}


@router.get("")
def get_my_maint_subscription(
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id
    sub = (
        db.query(MaintSubscription)
        .filter(MaintSubscription.company_id == company_id, MaintSubscription.status.in_(["active", "beta"]))
        .order_by(MaintSubscription.created_at.desc())
        .first()
    )
    if not sub:
        return {"has_subscription": False, "subscription": None, "services": [], "benefits": [], "recent_usage": []}

    # 현재 충전 주기(6개월) 사용 크레딧 — 충전 job·대시보드 카드와 같은 기준(SPEC A7/D10: 주기 내 사용, 이월 없음)
    monthly_points = sub.maintenance_points_per_month or 0
    cycle = subscription_cycle(sub)
    cycle_points = cycle["total_points"] if cycle else 0
    points_used = cycle_used_points(db, cycle, company_id=company_id, maintenance_only=True) if cycle else 0

    recent = (
        db.query(PointHistory)
        .filter(
            PointHistory.company_id == company_id, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.point_category == "1",
        )
        .order_by(PointHistory.created_at.desc())
        .limit(5)
        .all()
    )

    return {
        "has_subscription": True,
        "subscription": {
            "seq": sub.seq,
            "plan_type": sub.plan_type,
            "plan_label": PLAN_LABELS.get(sub.plan_type, (sub.plan_type or "").upper()),
            "status": sub.status,
            "status_label": STATUS_LABELS.get(sub.status, sub.status),
            "is_beta": bool(sub.is_beta),
            "start_date": sub.start_date.isoformat() if sub.start_date else None,
            "next_charge_date": sub.next_charge_date.isoformat() if sub.next_charge_date else None,
            "monthly_points": monthly_points,
            "cycle_points": cycle_points,
            "cycle_start": cycle["start"].isoformat() if cycle else None,
            "cycle_end": cycle["end"].isoformat() if cycle else None,
            "points_used": points_used,
            "points_remaining": max(0, cycle_points - points_used),
            "end_date": sub.end_date.isoformat() if sub.end_date else None,
            "hosting_type": sub.hosting_type,
            "hosting_provider": sub.hosting_provider,
            "hosting_label": hosting_label(sub.hosting_type, sub.hosting_provider, sub.start_date, sub.end_date),
        },
        # PACMS 에 등록된 실제 이용 서비스. 없으면(기존 구독) 프론트는 benefits 폴백을 표시
        "services": [
            {
                "code": svc.service_code,
                "name": svc.name,
                "spec": svc.spec,
                "status": svc.status,
                "status_label": SERVICE_STATUS_LABELS.get(svc.status, svc.status),
                "start_date": svc.start_date.isoformat() if svc.start_date else None,
                "end_date": svc.end_date.isoformat() if svc.end_date else None,
                # 메모는 직원용 — 외부 호스팅의 업체 안내만 고객에게 보인다(SPEC 12 L9)
                "memo": svc.memo if svc.service_code == "external_hosting" else None,
            }
            for svc in sub.services
        ],
        "benefits": [service_text(b) for b in plan_services(sub.plan_type, sub.hosting_type)],
        "recent_usage": [
            {
                "id": p.seq,
                "content": p.content,
                "point": abs(p.point or 0),
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in recent
        ],
    }
