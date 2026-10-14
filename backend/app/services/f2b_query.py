# backend/app/services/f2b_query.py
"""Fail2Ban 차단 조회 — 필터·집계·목록(spec §7). 화면·AI 평가·일일 job 이 함께 쓴다."""
import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, or_

from app.models.f2b import F2bBan

REASON_LABELS = {
    "wp_probe": "워드프레스 탐색",
    "secret_file_probe": "민감파일 탐색",
    "webshell_probe": "웹셸 탐색",
    "admin_panel_probe": "관리도구 탐색",
    "injection_attempt": "인젝션 시도",
    "bot_search": "봇 경로탐색",
    "scan_404": "404 대량",
    "flood": "과다 요청",
    "smtp_auth_fail": "SMTP 인증실패",
    "smtp_reject": "SMTP 수신거부",
    "smtp_scan": "SMTP 스캔",
    "imap_auth_fail": "IMAP 인증실패",
    "ssh_bruteforce": "SSH 무차별대입",
    "repeat_offender": "반복 차단(재범)",
    "unknown": "미상",
}
JAILS = ["nginx-404", "nginx-flood", "nginx-malicious", "nginx-botsearch", "postfix-auth", "postfix-auth-slow", "dovecot", "sshd", "recidive"]
MAX_DAYS = 92


@dataclass(frozen=True)
class F2bFilters:
    date_from: date
    date_to: date
    hour_from: int | None = None
    hour_to: int | None = None
    jails: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    site: str | None = None
    ip: str | None = None

    def canonical(self) -> dict:
        d = asdict(self)
        d["date_from"], d["date_to"] = self.date_from.isoformat(), self.date_to.isoformat()
        d["jails"], d["reasons"] = list(self.jails), list(self.reasons)
        return d

    def hash(self) -> str:
        return hashlib.sha256(json.dumps(self.canonical(), sort_keys=True, ensure_ascii=False).encode()).hexdigest()

    def days(self) -> int:
        return (self.date_to - self.date_from).days + 1

    def period(self) -> tuple[datetime, datetime]:
        return datetime.combine(self.date_from, time.min), datetime.combine(self.date_to, time(23, 59, 59))


def _split(text: str | None, allowed, name: str) -> tuple[str, ...]:
    items = sorted({x.strip() for x in (text or "").split(",") if x.strip()})
    bad = [x for x in items if x not in allowed]
    if bad:
        raise ValueError(f"알 수 없는 {name}: {', '.join(bad)}")
    return tuple(items)


def make_filters(date_from: date, date_to: date, hour_from: int | None = None, hour_to: int | None = None,
                 jails: str | None = "", reasons: str | None = "", site: str | None = None, ip: str | None = None) -> F2bFilters:
    if date_to < date_from:
        raise ValueError("종료일이 시작일보다 앞입니다.")
    if (date_to - date_from).days + 1 > MAX_DAYS:
        raise ValueError(f"기간은 최대 {MAX_DAYS}일입니다.")
    if (hour_from is None) != (hour_to is None):
        raise ValueError("시간대는 시작·종료를 함께 지정하세요.")
    for h in (hour_from, hour_to):
        if h is not None and not 0 <= h <= 23:
            raise ValueError("시간은 0~23 입니다.")
    return F2bFilters(date_from, date_to, hour_from, hour_to, _split(jails, JAILS, "jail"),
                      _split(reasons, REASON_LABELS, "이유"), (site or "").strip()[:255] or None, (ip or "").strip()[:45] or None)


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def apply_filters(query, f: F2bFilters):
    query = query.filter(F2bBan.banned_at >= datetime.combine(f.date_from, time.min),
                         F2bBan.banned_at < datetime.combine(f.date_to + timedelta(days=1), time.min))
    if f.hour_from is not None and f.hour_to is not None:
        hour = func.hour(F2bBan.banned_at)
        query = query.filter(hour.between(f.hour_from, f.hour_to) if f.hour_from <= f.hour_to
                             else or_(hour >= f.hour_from, hour <= f.hour_to))
    if f.jails:
        query = query.filter(F2bBan.jail.in_(f.jails))
    if f.reasons:
        query = query.filter(F2bBan.reason.in_(f.reasons))
    if f.site:
        query = query.filter(F2bBan.site == f.site)
    if f.ip:
        query = query.filter(F2bBan.ip.like(f"%{_like_escape(f.ip)}%", escape="\\"))
    return query


def summary(db, f: F2bFilters) -> dict:
    def base(*cols):
        return apply_filters(db.query(*cols), f)

    cnt = func.count(F2bBan.id)
    total = base(cnt).scalar() or 0
    by_reason = [{"reason": r, "label": REASON_LABELS.get(r, r), "count": c}
                 for r, c in base(F2bBan.reason, cnt).group_by(F2bBan.reason).order_by(cnt.desc()).all()]
    day = func.date(F2bBan.banned_at)
    by_date = [{"date": str(d), "reason": r, "count": c}
               for d, r, c in base(day, F2bBan.reason, cnt).group_by(day, F2bBan.reason).order_by(day).all()]
    hour = func.hour(F2bBan.banned_at)
    by_hour = [0] * 24
    for h, c in base(hour, cnt).group_by(hour).all():
        by_hour[int(h)] = c
    by_jail = [{"jail": j, "count": c} for j, c in base(F2bBan.jail, cnt).group_by(F2bBan.jail).order_by(cnt.desc()).all()]
    top_sites = [{"site": s, "count": c} for s, c in base(F2bBan.site, cnt).filter(F2bBan.site.isnot(None))
                 .group_by(F2bBan.site).order_by(cnt.desc()).limit(10).all()]
    top_ips = [{"ip": i, "count": c} for i, c in base(F2bBan.ip, cnt).group_by(F2bBan.ip).order_by(cnt.desc()).limit(10).all()]
    return {"total": total, "by_reason": by_reason, "by_date": by_date, "by_hour": by_hour,
            "by_jail": by_jail, "top_sites": top_sites, "top_ips": top_ips}


def ban_dict(b: F2bBan) -> dict:
    return {
        "id": b.id, "banned_at": b.banned_at.isoformat(), "unbanned_at": b.unbanned_at.isoformat() if b.unbanned_at else None,
        "jail": b.jail, "ip": b.ip, "reason": b.reason, "reason_label": REASON_LABELS.get(b.reason, b.reason),
        "reason_detail": b.reason_detail, "site": b.site, "request_count": b.request_count,
        "status_summary": b.status_summary, "user_agent": b.user_agent,
    }


def list_bans(db, f: F2bFilters, page: int, per_page: int) -> tuple[list[dict], int]:
    query = apply_filters(db.query(F2bBan), f)
    total = query.count()
    rows = query.order_by(F2bBan.banned_at.desc(), F2bBan.id.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return [ban_dict(r) for r in rows], total
