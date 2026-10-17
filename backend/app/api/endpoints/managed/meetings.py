"""미팅약속 (/api/managed/meetings) — 목록·달력·등록/수정·알람일시·수신자·첨부·ICS·결과기록 (SPEC 06 §3).

cms 와 다른 점:
- 장소검색: 카카오 지역검색(KAKAO_REST_API_KEY 가 있을 때) + AI 찾기(/api/managed/ai/place-search — claude 웹검색, 좌표는
  Nominatim 보완, services/place_geo). 저장 시 좌표를 자동 보완하는 백그라운드 스레드는 옮기지 않는다. 좌표가 없으면 네이버 지도는 주소 검색 URL 로 연다.
- 알람 발송·만료 처리는 cms cron 이 계속 한다(P6). 메일·활동이력 링크는 STAFF_BASE_URL.
"""
import math
import os
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.core.config import settings
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser, SalesLead, SalesLeadActivity
from app.models.worktools import MeetingAlarm, MeetingAppointment, MeetingAttachment
from app.services import staff_auth
from app.services.email import send_email_sync
from app.utils.media import MEDIA_ROOT, delete_media, file_download_response, save_upload

router = APIRouter(prefix="/meetings", tags=["managed-meetings"])
WRITE = require_write("meetings")
TYPES = {"offline": "오프라인", "video": "화상미팅", "phone": "전화"}
ALARM_STATUS = {"pending": "대기", "sent": "발송완료", "failed": "발송실패", "expired": "기한경과"}


def _iso(v):
    return v.isoformat() if v else None


def _f(v):
    return float(v) if v is not None else None


def _mercator(lat, lng):
    if lat is None or lng is None:
        return None, None
    lat, lng = max(min(float(lat), 89.5), -89.5), float(lng)
    x = lng * 20037508.34 / 180.0
    y = math.log(math.tan((90.0 + lat) * math.pi / 360.0)) / (math.pi / 180.0) * 20037508.34 / 180.0
    return x, y


def naver_route_url(m: MeetingAppointment) -> str:
    """cms build_naver_route_url 와 같은 규칙(좌표 없으면 주소 우선 검색 URL)."""
    end_label = (m.end_address or m.end_place or "").strip()
    ex, ey = _mercator(m.end_lat, m.end_lng)
    if ex is None:
        return f"https://map.naver.com/p/search/{quote(end_label, safe='')}"
    e_part = f"{round(ex, 1)},{round(ey, 1)},{quote(end_label, safe='')},,"
    sx, sy = _mercator(m.start_lat, m.start_lng)
    if sx is None:
        return f"https://map.naver.com/p/directions/-/{e_part}/-/car"
    s_part = f"{round(sx, 1)},{round(sy, 1)},{quote((m.start_address or m.start_place or '').strip(), safe='')},,"
    return f"https://map.naver.com/p/directions/{s_part}/{e_part}/-/car"


def _when(m: MeetingAppointment) -> str:
    return f"{m.meeting_date:%Y-%m-%d}" + (f" {m.meeting_time:%H:%M}" if m.meeting_time else "")


def _start_dt(m: MeetingAppointment) -> datetime:
    return datetime.combine(m.meeting_date, m.meeting_time or time(0, 0))


def _cal_fields(m: MeetingAppointment) -> dict:
    if m.meeting_type == "video":
        location = m.video_meeting_url or ""
    elif m.meeting_type == "phone":
        location = ""
    else:
        location = f"{m.end_place} ({m.end_address})" if m.end_place and m.end_address else (m.end_place or m.end_address or "")
    desc = []
    if m.meeting_type == "video" and m.video_meeting_url:
        desc.append(f"화상미팅 링크: {m.video_meeting_url}")
    if m.meeting_type == "offline" and m.start_place:
        desc.append(f"출발지: {m.start_place}")
    if m.memo:
        desc.append(m.memo)
    return {"location": location, "description": "\n".join(desc)}


def _recipients(db: Session, seq: int) -> list[CustomAuthUser]:
    ids = [r[0] for r in db.execute(text("SELECT customauthuser_id FROM meeting_appointment_recipients WHERE meetingappointment_id=:m"), {"m": seq})]
    return db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(ids or [0])).all()


def _row(m: MeetingAppointment, leads: dict, next_alarm=None) -> dict:
    lead = leads.get(m.sales_lead_id)
    return {"seq": m.seq, "title": m.title, "meeting_date": _iso(m.meeting_date), "meeting_time": m.meeting_time.strftime("%H:%M") if m.meeting_time else None,
            "meeting_type": m.meeting_type, "type_label": TYPES.get(m.meeting_type, m.meeting_type), "start_place": m.start_place,
            "end_place": m.end_place, "end_address": m.end_address, "valid_status": m.valid_status, "sales_lead_id": m.sales_lead_id,
            "sales_lead": f"{lead.client_company or ''} {lead.title or ''}".strip() if lead else "", "map_url": naver_route_url(m) if m.meeting_type == "offline" else None,
            "next_alarm": _iso(next_alarm), "is_past": _start_dt(m) < datetime.now()}


def _leads(db: Session, ids) -> dict:
    return {lead.seq: lead for lead in db.query(SalesLead).filter(SalesLead.seq.in_(set(ids) - {None} or {0}))}


@router.get("")
def list_meetings(q: str | None = None, status: str | None = None, meeting_type: str | None = None, page: int = Query(1, ge=1),
                  per_page: int = Query(20, le=100),
                  sort: str | None = Query(None, description="meeting_date|title|meeting_type|valid_status, '-' 접두 = 내림차순"),
                  db: Session = Depends(get_db)):
    query = db.query(MeetingAppointment)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(MeetingAppointment.title.like(like), MeetingAppointment.end_place.like(like), MeetingAppointment.memo.like(like)))
    if status:
        query = query.filter(MeetingAppointment.valid_status == status)
    if meeting_type:
        query = query.filter(MeetingAppointment.meeting_type == meeting_type)
    total = query.count()
    M = MeetingAppointment
    query = apply_sort(query, sort, {"meeting_date": M.meeting_date, "title": M.title, "meeting_type": M.meeting_type, "valid_status": M.valid_status},
                       [M.meeting_date.desc(), M.meeting_time.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    nxt = {}
    for mid, d in db.query(MeetingAlarm.meeting_id, MeetingAlarm.alarm_datetime).filter(
            MeetingAlarm.meeting_id.in_([m.seq for m in rows] or [0]), MeetingAlarm.notified == False).order_by(MeetingAlarm.alarm_datetime):  # noqa: E712
        nxt.setdefault(mid, d)
    leads = _leads(db, [m.sales_lead_id for m in rows])
    out = page_response([_row(m, leads, nxt.get(m.seq)) for m in rows], total, page, per_page)
    out["write_enabled"] = write_enabled("meetings")
    return out


@router.get("/calendar")
def calendar(start: date, end: date, db: Session = Depends(get_db)):
    rows = db.query(MeetingAppointment).filter(MeetingAppointment.meeting_date >= start, MeetingAppointment.meeting_date <= end).all()
    return [{"id": m.seq, "title": m.title, "date": _iso(m.meeting_date), "time": m.meeting_time.strftime("%H:%M") if m.meeting_time else None,
             "type": m.meeting_type, "valid_status": m.valid_status} for m in rows]


@router.get("/options")
def options(db: Session = Depends(get_db)):
    agents = [{"id": u.id, "name": u.name or u.username} for u in db.query(CustomAuthUser).filter(
        CustomAuthUser.group == "agent", CustomAuthUser.is_active == True).order_by(CustomAuthUser.name)]  # noqa: E712
    return {"types": TYPES, "agents": agents, "place_search": bool(settings.KAKAO_REST_API_KEY), "ai_place_search": settings.AI_ENABLED}


SALES_PICK_MAX = 1000


@router.get("/sales-search")
def sales_search(q: str = "", db: Session = Depends(get_db)):
    """연결 후보. q 가 없으면 최근 SALES_PICK_MAX 건 전체 — 화면이 받아서 초성·글자 검색한다."""
    from app.api.endpoints.managed.sales import STATUS

    query = db.query(SalesLead).filter(SalesLead.is_draft == False)  # noqa: E712
    if q:
        like = f"%{q}%"
        query = query.filter(or_(SalesLead.title.like(like), SalesLead.client_company.like(like), SalesLead.client_name.like(like)))
    return [{"seq": s.seq, "title": s.title, "client_company": s.client_company, "client_name": s.client_name,
             "status": s.status, "status_label": STATUS.get(s.status or "", s.status or "")}
            for s in query.order_by(SalesLead.created_at.desc()).limit(20 if q else SALES_PICK_MAX)]


class PlaceQuery(BaseModel):
    query: str


@router.post("/place-search")
def place_search(body: PlaceQuery):
    """카카오 지역검색(서버 키). 키가 없으면 501 — 화면은 주소·좌표 직접 입력으로 안내."""
    import json
    import urllib.request

    key = settings.KAKAO_REST_API_KEY
    if not key:
        raise HTTPException(501, "장소검색 키(KAKAO_REST_API_KEY)가 설정되지 않았습니다. 주소를 직접 입력해주세요.")
    q = body.query.strip()
    if not q:
        raise HTTPException(400, "검색어를 입력해주세요.")
    req = urllib.request.Request("https://dapi.kakao.com/v2/local/search/keyword.json?" + urlencode({"query": q, "size": 5}),
                                 headers={"Authorization": f"KakaoAK {key}"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            docs = json.loads(r.read().decode()).get("documents", [])
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "장소검색에 실패했습니다.")
    return [{"name": d.get("place_name"), "address": d.get("road_address_name") or d.get("address_name"), "lat": float(d["y"]), "lng": float(d["x"]),
             "phone": d.get("phone")} for d in docs if d.get("x") and d.get("y")]


def _get(db: Session, seq: int) -> MeetingAppointment:
    m = db.query(MeetingAppointment).filter(MeetingAppointment.seq == seq).first()
    if not m:
        raise HTTPException(404, "미팅약속을 찾을 수 없습니다.")
    return m


@router.get("/{seq}")
def get_meeting(seq: int, db: Session = Depends(get_db)):
    m = _get(db, seq)
    out = _row(m, _leads(db, [m.sales_lead_id]))
    out.update({k: getattr(m, k) for k in ("start_address", "video_meeting_url", "memo")})
    out.update(start_lat=_f(m.start_lat), start_lng=_f(m.start_lng), end_lat=_f(m.end_lat), end_lng=_f(m.end_lng))
    out["alarms"] = [{"seq": a.seq, "alarm_datetime": _iso(a.alarm_datetime), "notified": bool(a.notified), "status": a.status,
                      "status_label": ALARM_STATUS.get(a.status, a.status), "error_message": a.error_message}
                     for a in db.query(MeetingAlarm).filter(MeetingAlarm.meeting_id == seq).order_by(MeetingAlarm.alarm_datetime)]
    out["recipients"] = [{"id": u.id, "name": u.name or u.username} for u in _recipients(db, seq)]
    out["attachments"] = [{"id": x.id, "name": x.original_name, "size": x.file_size}
                          for x in db.query(MeetingAttachment).filter(MeetingAttachment.meeting_id == seq).order_by(MeetingAttachment.id)]
    creator = db.query(CustomAuthUser).filter(CustomAuthUser.id == m.created_by_id).first() if m.created_by_id else None
    out["created_by"] = (creator.name or creator.username) if creator else ""
    f = _cal_fields(m)
    s = _start_dt(m)
    out["google_calendar_url"] = "https://calendar.google.com/calendar/render?" + urlencode(
        {k: v for k, v in {"action": "TEMPLATE", "text": m.title, "ctz": "Asia/Seoul",
                           "dates": f"{s:%Y%m%dT%H%M%S}/{s + timedelta(minutes=60):%Y%m%dT%H%M%S}",
                           "location": f["location"], "details": f["description"]}.items() if v})
    out["write_enabled"] = write_enabled("meetings")
    return out


@router.get("/{seq}/ics")
def ics(seq: int, db: Session = Depends(get_db)):
    """iCalendar(.ics) — UTC, 기본 60분 (cms ics_utils.build_ics)."""
    m = _get(db, seq)
    f = _cal_fields(m)
    s = _start_dt(m)

    def utc(d):
        return (d - timedelta(hours=9)).strftime("%Y%m%dT%H%M%SZ")

    def esc(t):
        return (t or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")

    def fold(line):
        b = line.encode()
        if len(b) <= 75:
            return line
        parts, i, limit = [], 0, 75
        while i < len(b):
            j = min(i + limit, len(b))
            while j < len(b) and (b[j] & 0xC0) == 0x80:
                j -= 1
            parts.append(b[i:j].decode())
            i, limit = j, 74
        return "\r\n ".join(parts)

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//hankyeul.com//HCMS Meeting Appointment//KO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             "BEGIN:VEVENT", f"UID:meeting-{m.seq}@cms.hankyeul.com", f"DTSTAMP:{utc(datetime.now())}", f"DTSTART:{utc(s)}",
             f"DTEND:{utc(s + timedelta(minutes=60))}", f"SUMMARY:{esc(m.title)}"]
    if f["location"]:
        lines.append(f"LOCATION:{esc(f['location'])}")
    if f["description"]:
        lines.append(f"DESCRIPTION:{esc(f['description'])}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    body = ("\r\n".join(fold(x) for x in lines) + "\r\n").encode()
    return Response(body, media_type="text/calendar; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="meeting_{m.seq}.ics"'})


@router.get("/{seq}/attachments/{aid}")
def download(seq: int, aid: int, db: Session = Depends(get_db)):
    x = db.query(MeetingAttachment).filter(MeetingAttachment.id == aid, MeetingAttachment.meeting_id == seq).first()
    if not x:
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    return file_download_response(x.file, x.original_name)


def _size(rel: str) -> int:
    try:
        return os.path.getsize(os.path.join(MEDIA_ROOT, rel))
    except OSError:
        return 0


def _coord(v: str | None):
    if v in (None, ""):
        return None
    try:
        d = Decimal(str(v)).quantize(Decimal("0.0000001"))
    except InvalidOperation:
        return None
    return d if abs(d) <= 180 else None


def _video_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if url.lower().startswith(("http://", "https://")):
        return url[:500]
    return ("https://" + url.lstrip("/"))[:500]


def _parse_alarms(raw: list[str]) -> list[datetime]:
    out = []
    for v in raw:
        v = (v or "").strip().replace("T", " ")
        if not v:
            continue
        d = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
            try:
                d = datetime.strptime(v, fmt).replace(second=0, microsecond=0)
                break
            except ValueError:
                continue
        if d is None:
            raise HTTPException(400, f"알람일시 형식이 올바르지 않습니다: {v}")
        if d not in out:
            out.append(d)
    return sorted(out)


def _apply(db: Session, m: MeetingAppointment, f: dict) -> None:
    m.title = (f["title"] or "").strip()
    m.meeting_type = f["meeting_type"] if f["meeting_type"] in TYPES else "offline"
    for side in ("start", "end"):
        for k in ("place", "address"):
            setattr(m, f"{side}_{k}", "")
        setattr(m, f"{side}_lat", None)
        setattr(m, f"{side}_lng", None)
    m.video_meeting_url = ""
    if m.meeting_type == "video":
        m.video_meeting_url = _video_url(f["video_meeting_url"])
    elif m.meeting_type == "offline":
        for side in ("start", "end"):
            setattr(m, f"{side}_place", (f[f"{side}_place"] or "").strip()[:255])
            setattr(m, f"{side}_address", (f[f"{side}_address"] or "").strip()[:255])
            setattr(m, f"{side}_lat", _coord(f[f"{side}_lat"]))
            setattr(m, f"{side}_lng", _coord(f[f"{side}_lng"]))
    m.memo = (f["memo"] or "").strip()
    m.valid_status = f["valid_status"] if f["valid_status"] in ("valid", "invalid") else "valid"
    try:
        m.meeting_date = date.fromisoformat(f["meeting_date"]) if f["meeting_date"] else None
        m.meeting_time = time.fromisoformat(f["meeting_time"][:5]) if f["meeting_time"] else None
    except ValueError:
        raise HTTPException(400, "약속일시 형식이 올바르지 않습니다.")
    lead_id = f["sales_lead_id"]
    m.sales_lead_id = int(lead_id) if lead_id and str(lead_id).isdigit() and db.query(SalesLead.seq).filter(SalesLead.seq == int(lead_id)).first() else None
    # 유형별 필수(cms _meeting_validate_required)
    if m.meeting_type == "video" and not (m.title and m.meeting_date and m.video_meeting_url):
        raise HTTPException(400, "제목, 약속날짜, 화상미팅 링크는 필수 항목입니다.")
    if m.meeting_type == "phone" and not (m.title and m.meeting_date):
        raise HTTPException(400, "제목, 약속날짜는 필수 항목입니다.")
    if m.meeting_type == "offline" and not (m.title and m.meeting_date and m.end_place):
        raise HTTPException(400, "제목, 약속날짜, 약속장소는 필수 항목입니다.")


def _set_recipients(db: Session, seq: int, ids: list[int], staff: CustomAuthUser) -> None:
    valid = [u for (u,) in db.query(CustomAuthUser.id).filter(CustomAuthUser.id.in_(ids or [0]), CustomAuthUser.group == "agent",
                                                             CustomAuthUser.is_active == True)] or [staff.id]  # noqa: E712
    db.execute(text("DELETE FROM meeting_appointment_recipients WHERE meetingappointment_id=:m"), {"m": seq})
    for uid in valid:
        db.execute(text("INSERT INTO meeting_appointment_recipients (meetingappointment_id, customauthuser_id) VALUES (:m, :u)"), {"m": seq, "u": uid})


def _activity(db: Session, m: MeetingAppointment, action: str, staff: CustomAuthUser) -> None:
    """영업접수 활동이력(cms build_meeting_activity_content 형식)."""
    if not m.sales_lead_id:
        return
    alarms = ", ".join(f"{a.alarm_datetime:%Y-%m-%d %H:%M}" for a in db.query(MeetingAlarm).filter(MeetingAlarm.meeting_id == m.seq).order_by(MeetingAlarm.alarm_datetime)) or "-"
    names = ", ".join((u.name or u.email or "").strip() for u in _recipients(db, m.seq)) or "-"

    def place(n, a):
        return f"{n} ({a})" if n and a else (n or a or "-")

    lines = [f"[미팅약속 {action}] {m.title}", f"- 약속일시: {_when(m)}"]
    if m.meeting_type == "video":
        lines.append(f"- 화상미팅 링크: {m.video_meeting_url or '-'}")
    elif m.meeting_type == "phone":
        lines.append("- 미팅유형: 전화")
    else:
        lines += [f"- 출발지: {place(m.start_place, m.start_address)}", f"- 약속장소: {place(m.end_place, m.end_address)}"]
    lines += [f"- 알람일시: {alarms}", f"- 수신자: {names}", f"- 메모: {m.memo.strip() or '-'}"]
    if m.meeting_type == "offline":
        lines.append(f"- 네이버지도 길찾기: {naver_route_url(m)}")
    lines.append(f"- 미팅약속 상세: {settings.STAFF_BASE_URL}/managed/meeting/{m.seq}/")
    db.add(SalesLeadActivity(sales_lead_id=m.sales_lead_id, activity_type="call" if m.meeting_type == "phone" else "meeting",
                             content="\n".join(lines), old_status="", new_status="", created_by_id=staff.id, created_at=datetime.now()))


def _form(title, meeting_type, meeting_date, meeting_time, start_place, start_address, start_lat, start_lng, end_place, end_address, end_lat,
          end_lng, video_meeting_url, memo, valid_status, sales_lead_id) -> dict:
    return dict(title=title, meeting_type=meeting_type, meeting_date=meeting_date, meeting_time=meeting_time, start_place=start_place,
                start_address=start_address, start_lat=start_lat, start_lng=start_lng, end_place=end_place, end_address=end_address,
                end_lat=end_lat, end_lng=end_lng, video_meeting_url=video_meeting_url, memo=memo, valid_status=valid_status, sales_lead_id=sales_lead_id)


@router.post("", dependencies=[WRITE])
def create_meeting(request: Request, title: str = Form(...), meeting_type: str = Form("offline"), meeting_date: str = Form(...),
                   meeting_time: str | None = Form(None), start_place: str = Form(""), start_address: str = Form(""), start_lat: str | None = Form(None),
                   start_lng: str | None = Form(None), end_place: str = Form(""), end_address: str = Form(""), end_lat: str | None = Form(None),
                   end_lng: str | None = Form(None), video_meeting_url: str = Form(""), memo: str = Form(""), valid_status: str = Form("valid"),
                   sales_lead_id: str | None = Form(None), recipients: list[int] = Form([]), alarm_datetimes: list[str] = Form([]),
                   attachments: list[UploadFile] = File([]), staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    now = datetime.now()
    m = MeetingAppointment(created_by_id=staff.id, created_at=now, updated_at=now)
    _apply(db, m, _form(title, meeting_type, meeting_date, meeting_time, start_place, start_address, start_lat, start_lng, end_place, end_address,
                        end_lat, end_lng, video_meeting_url, memo, valid_status, sales_lead_id))
    alarms = _parse_alarms(alarm_datetimes)
    if not alarms:
        raise HTTPException(400, "알람일시를 최소 1개 이상 입력해주세요.")
    past = [d for d in alarms if d < now]
    if past:
        raise HTTPException(400, "알람일시는 현재 시각 이후로 설정해주세요: " + ", ".join(f"{d:%Y-%m-%d %H:%M}" for d in past))
    db.add(m)
    db.flush()
    _set_recipients(db, m.seq, recipients, staff)
    for d in alarms:
        db.add(MeetingAlarm(meeting_id=m.seq, alarm_datetime=d, notified=False, status="pending", error_message="", created_at=now))
    for f in attachments:
        if f and f.filename:
            path, name = save_upload(f, "meeting_attachments")
            db.add(MeetingAttachment(meeting_id=m.seq, file=path, original_name=name, file_size=_size(path), created_at=now))
    db.flush()
    _activity(db, m, "등록", staff)
    staff_auth.audit(db, request, "meetings.create", user_id=staff.id, target=f"meeting:{m.seq}")
    db.commit()
    return {"seq": m.seq}


@router.post("/{seq}/update", dependencies=[WRITE])
def update_meeting(seq: int, request: Request, title: str = Form(...), meeting_type: str = Form("offline"), meeting_date: str = Form(...),
                   meeting_time: str | None = Form(None), start_place: str = Form(""), start_address: str = Form(""), start_lat: str | None = Form(None),
                   start_lng: str | None = Form(None), end_place: str = Form(""), end_address: str = Form(""), end_lat: str | None = Form(None),
                   end_lng: str | None = Form(None), video_meeting_url: str = Form(""), memo: str = Form(""), valid_status: str = Form("valid"),
                   sales_lead_id: str | None = Form(None), recipients: list[int] = Form([]), alarm_datetimes: list[str] = Form([]),
                   delete_attachment_ids: list[int] = Form([]), attachments: list[UploadFile] = File([]),
                   staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """발송된 알람은 유지하고 미발송 알람만 다시 만든다. 기존 알람일시는 과거여도 다시 제출 가능(cms meeting_update)."""
    m = _get(db, seq)
    _apply(db, m, _form(title, meeting_type, meeting_date, meeting_time, start_place, start_address, start_lat, start_lng, end_place, end_address,
                        end_lat, end_lng, video_meeting_url, memo, valid_status, sales_lead_id))
    alarms = _parse_alarms(alarm_datetimes)
    if not alarms:
        raise HTTPException(400, "알람일시를 최소 1개 이상 입력해주세요.")
    existing, notified = set(), set()
    for d, n in db.query(MeetingAlarm.alarm_datetime, MeetingAlarm.notified).filter(MeetingAlarm.meeting_id == seq):
        d = d.replace(second=0, microsecond=0)
        existing.add(d)
        if n:
            notified.add(d)
    now = datetime.now()
    past = [d for d in alarms if d not in existing and d < now]
    if past:
        raise HTTPException(400, "알람일시는 현재 시각 이후로 설정해주세요: " + ", ".join(f"{d:%Y-%m-%d %H:%M}" for d in past))
    m.updated_at = now
    _set_recipients(db, seq, recipients, staff)
    db.query(MeetingAlarm).filter(MeetingAlarm.meeting_id == seq, MeetingAlarm.notified == False).delete(synchronize_session=False)  # noqa: E712
    for d in alarms:
        if d not in notified:
            db.add(MeetingAlarm(meeting_id=seq, alarm_datetime=d, notified=False, status="pending", error_message="", created_at=now))
    removed = [x.file for x in db.query(MeetingAttachment).filter(MeetingAttachment.meeting_id == seq, MeetingAttachment.id.in_(delete_attachment_ids or [0]))]
    db.query(MeetingAttachment).filter(MeetingAttachment.meeting_id == seq, MeetingAttachment.id.in_(delete_attachment_ids or [0])).delete(synchronize_session=False)
    for f in attachments:
        if f and f.filename:
            path, name = save_upload(f, "meeting_attachments")
            db.add(MeetingAttachment(meeting_id=seq, file=path, original_name=name, file_size=_size(path), created_at=now))
    db.flush()
    _activity(db, m, "수정", staff)
    staff_auth.audit(db, request, "meetings.update", user_id=staff.id, target=f"meeting:{seq}")
    db.commit()
    for p in removed:
        delete_media(p)
    return {"ok": True}


@router.post("/{seq}/toggle", dependencies=[WRITE])
def toggle(seq: int, db: Session = Depends(get_db)):
    m = _get(db, seq)
    m.valid_status = "invalid" if m.valid_status == "valid" else "valid"
    m.updated_at = datetime.now()
    db.commit()
    return {"valid_status": m.valid_status}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_meeting(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    m = _get(db, seq)
    files = [x.file for x in db.query(MeetingAttachment).filter(MeetingAttachment.meeting_id == seq)]
    for t, col in (("meeting_alarm", "meeting_id"), ("meeting_attachment", "meeting_id"), ("meeting_appointment_recipients", "meetingappointment_id")):
        db.execute(text(f"DELETE FROM {t} WHERE {col}=:m"), {"m": seq})
    db.delete(m)
    staff_auth.audit(db, request, "meetings.delete", user_id=staff.id, target=f"meeting:{seq}", detail=m.title)
    db.commit()
    for p in files:
        delete_media(p)
    return {"ok": True}


@router.post("/{seq}/test-send", dependencies=[WRITE])
def test_send(seq: int, db: Session = Depends(get_db)):
    """테스트 발송 — 알람 상태·이력은 건드리지 않는다(cms meeting_test_send)."""
    from html import escape
    m = _get(db, seq)
    users = _recipients(db, seq)
    emails = [u.email for u in users if u.email]
    if not emails and m.created_by_id:
        c = db.query(CustomAuthUser).filter(CustomAuthUser.id == m.created_by_id).first()
        emails = [c.email] if c and c.email else []
    if not emails:
        raise HTTPException(400, "발송할 수신자가 없습니다.")
    f = _cal_fields(m)
    link = f"{settings.STAFF_BASE_URL}/managed/meeting/{m.seq}/"
    rows = [("제목", m.title), ("약속일시", _when(m)), ("유형", TYPES.get(m.meeting_type, "")), ("장소", f["location"] or "-"), ("메모", m.memo or "-")]
    html = "<p>PACMS 미팅약속 알람(테스트)입니다.</p><table>" + "".join(f"<tr><th align=left>{k}</th><td>{escape(v)}</td></tr>" for k, v in rows) + "</table>"
    if m.meeting_type == "offline":
        html += f'<p><a href="{escape(naver_route_url(m))}">네이버지도 길찾기</a></p>'
    html += f'<p><a href="{escape(link)}">미팅약속 상세</a></p>'
    try:
        send_email_sync(emails, f"[테스트] [PACMS 미팅약속] {m.title} - {_when(m)}", html)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"발송 실패: {e}")
    return {"sent": len(emails)}


class ResultBody(BaseModel):
    content: str
    activity_type: str | None = None


@router.post("/{seq}/record-result", dependencies=[WRITE])
def record_result(seq: int, body: ResultBody, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    m = _get(db, seq)
    if not m.sales_lead_id:
        raise HTTPException(400, "연결된 영업접수가 없어 결과를 기록할 수 없습니다.")
    if not body.content.strip():
        raise HTTPException(400, "기록할 내용을 입력해주세요.")
    allowed = {"call", "email", "kakao", "meeting", "prompting", "trigger", "notification", "note"}  # auto·status_change 제외(cms 와 같음)
    kind = body.activity_type if body.activity_type in allowed else ("call" if m.meeting_type == "phone" else "meeting")
    db.add(SalesLeadActivity(sales_lead_id=m.sales_lead_id, activity_type=kind, content=body.content.strip(), old_status="", new_status="",
                             created_by_id=staff.id, created_at=datetime.now()))
    db.commit()
    return {"sales_lead_id": m.sales_lead_id}
