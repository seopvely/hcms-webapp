"""통합 플랜(호스팅 + 유지보수) 요금·서비스 카탈로그.

PACMS pacms/models.py MaintSubscription.PLAN_DEFAULTS / PLAN_SERVICES 와 동일하게 유지한다.
(HCMS 에서 PACMS 상수를 읽을 API 가 없어 여기 한 곳에 미러링 — 프론트는 이 값을 API 로 받는다.
 /services 페이지 홍보용 플랜 카드 문구도 이 파일 기준으로 맞춘다.)
"""
from typing import Optional

PLAN_LABELS = {"basic": "BASIC", "growth": "GROWTH", "business": "BUSINESS"}

# 월 요금(원). 내부(한결랩) 호스팅 = hosting_price + maint_price, 외부 호스팅 = maint_price 만 청구
PLAN_DEFAULTS = {
    "basic":    {"maintenance": 2,  "hosting_price": 15000, "maint_price": 35000},
    "growth":   {"maintenance": 5,  "hosting_price": 30000, "maint_price": 80000},
    "business": {"maintenance": 15, "hosting_price": 60000, "maint_price": 160000},
}

# requires_internal_hosting=True 항목은 외부 호스팅이면 제공하지 않는다
PLAN_SERVICES = {
    "basic": [
        {"code": "sites",        "name": "웹호스팅",            "spec": "1사이트",    "requires_internal_hosting": True},
        {"code": "storage",      "name": "SSD 스토리지",         "spec": "10GB",      "requires_internal_hosting": True},
        {"code": "ssl",          "name": "SSL/TLS 인증서",       "spec": "",          "requires_internal_hosting": False},
        {"code": "backup",       "name": "일일 자동 백업",        "spec": "",          "requires_internal_hosting": True},
        {"code": "monitoring",   "name": "Uptime 모니터링",      "spec": "",          "requires_internal_hosting": False},
        {"code": "support",      "name": "이메일 지원",           "spec": "",          "requires_internal_hosting": False},
        {"code": "maint_points", "name": "유지보수",             "spec": "월 2포인트",  "requires_internal_hosting": False},
    ],
    "growth": [
        {"code": "sites",        "name": "웹호스팅",            "spec": "3사이트",    "requires_internal_hosting": True},
        {"code": "storage",      "name": "SSD 스토리지",         "spec": "50GB",      "requires_internal_hosting": True},
        {"code": "ssl",          "name": "SSL/TLS 인증서",       "spec": "",          "requires_internal_hosting": False},
        {"code": "backup",       "name": "일일 자동 백업",        "spec": "",          "requires_internal_hosting": True},
        {"code": "monitoring",   "name": "24시간 모니터링",       "spec": "",          "requires_internal_hosting": False},
        {"code": "cdn",          "name": "CDN 가속 지원",         "spec": "",          "requires_internal_hosting": True},
        {"code": "support",      "name": "이메일 + 전화 지원",     "spec": "",          "requires_internal_hosting": False},
        {"code": "maint_points", "name": "유지보수",             "spec": "월 5포인트",  "requires_internal_hosting": False},
    ],
    "business": [
        {"code": "sites",        "name": "웹호스팅",            "spec": "무제한",     "requires_internal_hosting": True},
        {"code": "storage",      "name": "SSD 스토리지",         "spec": "100GB",     "requires_internal_hosting": True},
        {"code": "ssl",          "name": "SSL/TLS 인증서",       "spec": "",          "requires_internal_hosting": False},
        {"code": "backup",       "name": "실시간 백업",           "spec": "",          "requires_internal_hosting": True},
        {"code": "monitoring",   "name": "24시간 모니터링 + 장애 대응", "spec": "",       "requires_internal_hosting": False},
        {"code": "cdn",          "name": "CDN + DDoS 방어",       "spec": "",          "requires_internal_hosting": True},
        {"code": "engineer",     "name": "전담 엔지니어 배정",     "spec": "",          "requires_internal_hosting": False},
        {"code": "maint_points", "name": "유지보수",             "spec": "월 15포인트", "requires_internal_hosting": False},
    ],
}

HOSTING_LABELS = {"I": "한결랩 호스팅", "E": "외부 호스팅"}


def plan_monthly_price(plan: str, hosting_type: Optional[str] = None) -> int:
    d = PLAN_DEFAULTS.get(plan) or {}
    if hosting_type == "E":
        return d.get("maint_price", 0)
    return d.get("hosting_price", 0) + d.get("maint_price", 0)


def plan_services(plan: str, hosting_type: Optional[str] = None) -> list[dict]:
    services = PLAN_SERVICES.get(plan) or []
    if hosting_type == "E":
        return [s for s in services if not s["requires_internal_hosting"]]
    return list(services)


def service_text(s: dict) -> str:
    return f"{s['name']} {s['spec']}".strip() if s.get("spec") else s["name"]


def plans_payload() -> dict:
    """배너 요금 비교용 — 호스팅 구분에 따른 금액/서비스를 모두 내려준다"""
    return {
        code: {
            "label": PLAN_LABELS[code],
            "points": d["maintenance"],
            "hosting_price": d["hosting_price"],
            "maint_price": d["maint_price"],
            "internal_price": plan_monthly_price(code, "I"),
            "external_price": plan_monthly_price(code, "E"),
            "services_internal": [service_text(s) for s in plan_services(code, "I")],
            "services_external": [service_text(s) for s in plan_services(code, "E")],
        }
        for code, d in PLAN_DEFAULTS.items()
    }


def hosting_label(hosting_type: Optional[str], provider: Optional[str], start_date, end_date) -> Optional[str]:
    """구독 카드 호스팅 표시 문구 — 구분 미지정(기존 구독)이면 None"""
    if hosting_type == "I":
        if start_date and end_date:
            return f"한결랩 호스팅 ({start_date.isoformat()} ~ {end_date.isoformat()})"
        if start_date:
            return f"한결랩 호스팅 ({start_date.isoformat()} ~)"
        return "한결랩 호스팅"
    if hosting_type == "E":
        return f"외부 호스팅 ({provider}, 고객 직접 결제)" if provider else "외부 호스팅 (고객 직접 결제)"
    return None
