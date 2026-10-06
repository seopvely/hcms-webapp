from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import MaintSubscription, PointHistory

router = APIRouter(prefix="/maint-subscription", tags=["maint-subscription"])

PLAN_LABELS = {"basic": "BASIC", "growth": "GROWTH", "business": "BUSINESS"}

STATUS_LABELS = {"active": "이용중", "beta": "베타 이용중", "inactive": "해지"}

# 통합 플랜(호스팅 + 유지보수) 포함 서비스 — /services 페이지 플랜 카드와 동일하게 유지
PLAN_BENEFITS = {
    "basic": [
        "웹호스팅 1사이트",
        "10GB SSD 스토리지",
        "SSL/TLS 인증서",
        "일일 자동 백업",
        "Uptime 모니터링",
        "이메일 지원",
    ],
    "growth": [
        "웹호스팅 3사이트",
        "50GB SSD 스토리지",
        "SSL/TLS 인증서",
        "일일 자동 백업",
        "24시간 모니터링",
        "CDN 가속 지원",
        "이메일 + 전화 지원",
    ],
    "business": [
        "웹호스팅 무제한",
        "100GB SSD 스토리지",
        "SSL/TLS 인증서",
        "실시간 백업",
        "24시간 모니터링 + 장애 대응",
        "CDN + DDoS 방어",
        "전담 엔지니어 배정",
    ],
}


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
        return {"has_subscription": False, "subscription": None, "benefits": [], "recent_usage": []}

    # 이번 달 사용 크레딧 — 대시보드 구독 카드와 같은 기준(유지보수 카테고리, 실행 완료)
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_points = sub.maintenance_points_per_month or 0
    points_used = int(
        db.query(func.sum(func.abs(PointHistory.point))).filter(
            PointHistory.company_id == company_id, PointHistory.point_type == 2,
            PointHistory.status == 2, PointHistory.point_category == "1",
            PointHistory.created_at >= month_start,
        ).scalar() or 0
    )

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
            "points_used": points_used,
            "points_remaining": max(0, monthly_points - points_used),
        },
        "benefits": PLAN_BENEFITS.get(sub.plan_type, []),
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
