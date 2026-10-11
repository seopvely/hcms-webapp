"""알람 (/api/managed/alarms) — cms 알람 설정 화면 이식(SPEC 06 §2).

발송 엔진(5분 cron, 회차 전진, 무효화)은 cms check_alarms.py 가 계속 맡는다(P6 에서 hcms 로 단일화).
여기서는 설정·이벤트 일시·수신자·첨부·테스트 발송만 다룬다. 첨부는 직원 인증 다운로드.
"""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import apply_sort, page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.customer import CustomAuthUser
from app.models.worktools import AlarmAttachment, AlarmEventDate, AlarmHistory, AlarmSetting
from app.services import staff_auth
from app.utils.media import delete_media, file_download_response, resolve_media_path, save_upload

router = APIRouter(prefix="/alarms", tags=["managed-alarms"])
WRITE = require_write("alarms")
WHEN = {"month": "한달전", "week": "일주일전", "custom": "커스텀 일수"}
CYCLES = {"none": "반복 안함", "daily": "매일", "weekday": "주중(월~금)", "weekend": "주말(토~일)", "weekly": "매주", "monthly": "매월",
          "yearly": "매년", "custom": "사용자지정(N일마다)"}
HISTORY_STATUS = {"pending": "대기중", "sent": "발송완료", "failed": "발송실패"}
TEMPLATES = {
    "유지보수관리": ["유지보수 작업이 예정되어 있습니다. 작업 전 필요한 준비사항을 확인해 주세요.",
                "고객 문의사항이 접수되었습니다. 신속한 처리를 위해 확인 부탁드립니다.",
                "건별 작업이 할당되었습니다. 담당자는 작업 내용을 확인하고 처리해 주세요.",
                "포인트 관련 업무가 있습니다. 포인트 차감/부여 내역을 검토해 주세요.",
                "댓글 히스토리 관련 업무가 있습니다. 고객 응답 현황을 점검해 주세요."],
    "프로젝트관리": ["프로젝트 작업 리스트를 검토해 주세요. 진행 상황을 업데이트하고 이슈사항을 확인해 주세요.",
                "진행중인 프로젝트의 상태를 점검해 주세요. 일정 지연이나 문제점이 없는지 확인 부탁드립니다.",
                "도메인 관련 업무가 있습니다. 도메인 만료일정이나 갱신 필요 사항을 확인해 주세요."],
    "고객관리": ["고객 리스트 관련 업무가 있습니다. 신규 고객 등록이나 정보 업데이트를 확인해 주세요.",
              "업체 관리 업무가 예정되어 있습니다. 협력업체 현황을 점검하고 계약 사항을 검토해 주세요.",
              "고객 프로젝트 관리 업무가 있습니다. 프로젝트 현황을 업데이트하고 고객 요구사항을 확인해 주세요."],
    "과금관리": ["납부 리스트 관련 업무가 있습니다. 미납 현황을 확인하고 필요시 고객에게 안내해 주세요.",
              "납부 내역을 검토해 주세요. 입금 확인이나 정산 관련 업무를 처리해 주세요."],
    "견적서관리": ["견적서 관련 업무가 있습니다. 견적서 작성이나 승인 업무를 확인해 주세요.",
               "영업 접수 관련 업무가 있습니다. 신규 문의사항을 검토하고 적절한 대응을 준비해 주세요."],
}


def _iso(v):
    return v.isoformat() if v else None


def _recipient_ids(db: Session, seq: int) -> list[int]:
    return [r[0] for r in db.execute(text("SELECT customauthuser_id FROM alarm_setting_recipients WHERE alarmsetting_id=:a"), {"a": seq})]


def _get(db: Session, seq: int) -> AlarmSetting:
    a = db.query(AlarmSetting).filter(AlarmSetting.seq == seq).first()
    if not a:
        raise HTTPException(404, "알람을 찾을 수 없습니다.")
    return a


def _when_label(a: AlarmSetting) -> str:
    if a.when_to_notify == "custom":
        days = a.custom_days if a.custom_days is not None else 1
        return "당일" if days == 0 else f"{days}일 전"
    return WHEN.get(a.when_to_notify, a.when_to_notify)


def _row(a: AlarmSetting, next_event=None) -> dict:
    return {"seq": a.seq, "title": a.title, "when_to_notify": a.when_to_notify, "when_label": _when_label(a), "custom_days": a.custom_days,
            "valid_status": a.valid_status, "cycle_type": a.cycle_type, "cycle_label": CYCLES.get(a.cycle_type, a.cycle_type),
            "send_to_all_agents": bool(a.send_to_all_agents), "last_sent_at": _iso(a.last_sent_at), "next_event": _iso(next_event),
            "created_at": _iso(a.created_at)}


@router.get("/options")
def options(db: Session = Depends(get_db)):
    agents = [{"id": u.id, "name": u.name or u.username} for u in db.query(CustomAuthUser).filter(
        CustomAuthUser.group == "agent", CustomAuthUser.is_active == True).order_by(CustomAuthUser.name)]  # noqa: E712
    return {"when": WHEN, "cycles": CYCLES, "templates": TEMPLATES, "agents": agents}


@router.get("")
def list_alarms(q: str | None = None, status: str | None = None, when_to_notify: str | None = None, page: int = Query(1, ge=1),
                per_page: int = Query(20, le=100),
                sort: str | None = Query(None, description="title|last_sent_at|created_at|valid_status, '-' 접두 = 내림차순"),
                db: Session = Depends(get_db)):
    query = db.query(AlarmSetting)
    if q:
        query = query.filter(or_(AlarmSetting.title.like(f"%{q}%"), AlarmSetting.content.like(f"%{q}%")))
    if status:
        query = query.filter(AlarmSetting.valid_status == status)
    if when_to_notify:
        query = query.filter(AlarmSetting.when_to_notify == when_to_notify)
    total = query.count()
    query = apply_sort(query, sort, {"title": AlarmSetting.title, "last_sent_at": AlarmSetting.last_sent_at, "created_at": AlarmSetting.created_at,
                                     "valid_status": AlarmSetting.valid_status}, [AlarmSetting.created_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    nxt = {}
    for aid, d in db.query(AlarmEventDate.alarm_id, AlarmEventDate.event_date).filter(
            AlarmEventDate.alarm_id.in_([r.seq for r in rows] or [0]), AlarmEventDate.notified == False).order_by(AlarmEventDate.event_date):  # noqa: E712
        nxt.setdefault(aid, d)
    out = page_response([_row(r, nxt.get(r.seq)) for r in rows], total, page, per_page)
    out["write_enabled"] = write_enabled("alarms")
    return out


def _history_row(h: AlarmHistory, titles: dict) -> dict:
    return {"seq": h.seq, "alarm_id": h.alarm_setting_id, "alarm_title": titles.get(h.alarm_setting_id, ""), "sent_at": _iso(h.sent_at),
            "status": h.status, "status_label": HISTORY_STATUS.get(h.status, h.status), "recipient_count": h.recipient_count,
            "recipients": h.recipients, "error_message": h.error_message}


@router.get("/history")
def history(alarm_id: int | None = None, page: int = Query(1, ge=1), per_page: int = Query(20, le=100),
            sort: str | None = Query(None, description="sent_at|status|recipient_count, '-' 접두 = 내림차순"),
            db: Session = Depends(get_db)):
    query = db.query(AlarmHistory)
    if alarm_id:
        query = query.filter(AlarmHistory.alarm_setting_id == alarm_id)
    total = query.count()
    query = apply_sort(query, sort, {"sent_at": AlarmHistory.sent_at, "status": AlarmHistory.status, "recipient_count": AlarmHistory.recipient_count},
                       [AlarmHistory.sent_at.desc()])
    rows = query.offset((page - 1) * per_page).limit(per_page).all()
    titles = dict(db.query(AlarmSetting.seq, AlarmSetting.title).filter(AlarmSetting.seq.in_({h.alarm_setting_id for h in rows} or {0})))
    return page_response([_history_row(h, titles) for h in rows], total, page, per_page)


@router.get("/{seq}")
def get_alarm(seq: int, db: Session = Depends(get_db)):
    a = _get(db, seq)
    out = _row(a)
    out.update(content=a.content, alarm_time=a.alarm_time.strftime("%H:%M") if a.alarm_time else None, cycle_days=a.cycle_days,
               cycle_end_date=_iso(a.cycle_end_date), recipient_ids=_recipient_ids(db, seq), write_enabled=write_enabled("alarms"))
    out["event_dates"] = [{"id": e.id, "event_date": _iso(e.event_date), "notified": bool(e.notified), "notified_at": _iso(e.notified_at)}
                          for e in db.query(AlarmEventDate).filter(AlarmEventDate.alarm_id == seq).order_by(AlarmEventDate.event_date)]
    files = [{"id": f"att-{x.id}", "name": x.file.rsplit("/", 1)[-1]} for x in db.query(AlarmAttachment).filter(AlarmAttachment.alarm_id == seq).order_by(AlarmAttachment.id)]
    if a.attach_file:
        files.insert(0, {"id": "legacy-file", "name": a.attach_file.rsplit("/", 1)[-1]})
    out["files"] = files
    out["image"] = {"id": "image", "name": a.image.rsplit("/", 1)[-1]} if a.image else None
    out["histories"] = [_history_row(h, {}) for h in db.query(AlarmHistory).filter(AlarmHistory.alarm_setting_id == seq).order_by(AlarmHistory.sent_at.desc()).limit(10)]
    return out


@router.get("/{seq}/files/{fid}")
def download(seq: int, fid: str, db: Session = Depends(get_db)):
    a = _get(db, seq)
    if fid == "image":
        return file_download_response(a.image)
    if fid == "legacy-file":
        return file_download_response(a.attach_file)
    if fid.startswith("att-") and fid[4:].isdigit():
        x = db.query(AlarmAttachment).filter(AlarmAttachment.id == int(fid[4:]), AlarmAttachment.alarm_id == seq).first()
        if x:
            return file_download_response(x.file)
    raise HTTPException(404, "파일을 찾을 수 없습니다.")


def _parse_event_dates(raw: list[str]) -> list[datetime]:
    out = []
    for v in raw:
        v = (v or "").strip().replace("T", " ")
        if not v:
            continue
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                d = datetime.strptime(v, fmt)
                break
            except ValueError:
                d = None
        if d and d not in out:
            out.append(d)
    return sorted(out)


def _apply(a: AlarmSetting, title: str, content: str, when_to_notify: str, custom_days: str | None, cycle_type: str, cycle_days: str | None,
           cycle_end_date: str | None, alarm_time: str | None, send_to_all_agents: bool, recipients: list[int]) -> None:
    if not title.strip() or not content.strip() or when_to_notify not in WHEN:
        raise HTTPException(400, "필수 항목을 모두 입력해주세요.")
    days = None
    if when_to_notify == "custom":
        try:
            days = int(custom_days or "")
        except ValueError:
            days = -1
        if days < 0:
            raise HTTPException(400, "커스텀 일수를 올바르게 입력해주세요. (0일=당일)")
    elif custom_days:
        try:
            days = int(custom_days)
        except ValueError:
            days = None
    cycle_type = cycle_type or "none"
    if cycle_type not in CYCLES:
        raise HTTPException(400, "반복 주기가 올바르지 않습니다.")
    cdays = None
    if cycle_type == "custom":
        try:
            cdays = int(cycle_days or "")
        except ValueError:
            cdays = 0
        if cdays < 1:
            raise HTTPException(400, "반복 간격(일)을 1 이상으로 입력해주세요.")
    try:
        cend = date.fromisoformat(cycle_end_date) if cycle_end_date else None
        atime = time.fromisoformat(alarm_time) if alarm_time else None
    except ValueError:
        raise HTTPException(400, "날짜/시간 형식이 올바르지 않습니다.")
    if not send_to_all_agents and not recipients:
        raise HTTPException(400, "모든 에이전트 발송을 해제한 경우 최소 한 명의 수신자를 선택해주세요.")
    a.title, a.content, a.when_to_notify, a.custom_days = title.strip(), content, when_to_notify, days
    a.cycle_type, a.cycle_days, a.cycle_end_date, a.alarm_time = cycle_type, cdays, cend, atime
    a.send_to_all_agents = send_to_all_agents


def _set_recipients(db: Session, seq: int, all_agents: bool, ids: list[int]) -> None:
    db.execute(text("DELETE FROM alarm_setting_recipients WHERE alarmsetting_id=:a"), {"a": seq})
    if not all_agents:
        for uid in {u for (u,) in db.query(CustomAuthUser.id).filter(CustomAuthUser.id.in_(ids or [0]))}:
            db.execute(text("INSERT INTO alarm_setting_recipients (alarmsetting_id, customauthuser_id) VALUES (:a, :u)"), {"a": seq, "u": uid})


@router.post("", dependencies=[WRITE])
def create_alarm(request: Request, title: str = Form(...), content: str = Form(...), when_to_notify: str = Form("week"),
                 custom_days: str | None = Form(None), cycle_type: str = Form("none"), cycle_days: str | None = Form(None),
                 cycle_end_date: str | None = Form(None), alarm_time: str | None = Form(None), send_to_all_agents: bool = Form(True),
                 recipients: list[int] = Form([]), event_dates: list[str] = Form([]), image: UploadFile | None = File(None),
                 attach_files: list[UploadFile] = File([]), staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    dates = _parse_event_dates(event_dates)
    if not dates:
        raise HTTPException(400, "이벤트 날짜를 최소 1개 이상 등록해주세요.")
    now = datetime.now()
    a = AlarmSetting(valid_status="valid", created_at=now, updated_at=now)
    _apply(a, title, content, when_to_notify, custom_days, cycle_type, cycle_days, cycle_end_date, alarm_time, send_to_all_agents, recipients)
    if image and image.filename:
        a.image, _ = save_upload(image, "alarm_images")
    db.add(a)
    db.flush()
    for d in dates:
        db.add(AlarmEventDate(alarm_id=a.seq, event_date=d, notified=False))
    for f in attach_files:
        if f and f.filename:
            db.add(AlarmAttachment(alarm_id=a.seq, file=save_upload(f, "alarm_files")[0], created_at=now))
    _set_recipients(db, a.seq, send_to_all_agents, recipients)
    staff_auth.audit(db, request, "alarms.create", user_id=staff.id, target=f"alarm:{a.seq}")
    db.commit()
    return {"seq": a.seq}


@router.post("/{seq}/update", dependencies=[WRITE])
def update_alarm(seq: int, request: Request, title: str = Form(...), content: str = Form(...), when_to_notify: str = Form("week"),
                 custom_days: str | None = Form(None), cycle_type: str = Form("none"), cycle_days: str | None = Form(None),
                 cycle_end_date: str | None = Form(None), alarm_time: str | None = Form(None), send_to_all_agents: bool = Form(True),
                 recipients: list[int] = Form([]), event_dates: list[str] = Form([]), image: UploadFile | None = File(None),
                 image_clear: bool = Form(False), attach_file_clear: bool = Form(False), delete_attachment_ids: list[int] = Form([]),
                 attach_files: list[UploadFile] = File([]), staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """미발송 이벤트 일시만 교체(발송된 일시는 유지), 날짜가 남으면 무효 → 유효 복원(cms alarm_update)."""
    a = _get(db, seq)
    dates = _parse_event_dates(event_dates)
    if not dates:
        raise HTTPException(400, "이벤트 날짜를 최소 1개 이상 등록해주세요.")
    _apply(a, title, content, when_to_notify, custom_days, cycle_type, cycle_days, cycle_end_date, alarm_time, send_to_all_agents, recipients)
    now = datetime.now()
    if image and image.filename:
        old = a.image
        a.image, _ = save_upload(image, "alarm_images")
        delete_media(old)
    elif image_clear and a.image:
        delete_media(a.image)
        a.image = None
    if attach_file_clear and a.attach_file:
        delete_media(a.attach_file)
        a.attach_file = None
    for x in db.query(AlarmAttachment).filter(AlarmAttachment.alarm_id == seq, AlarmAttachment.id.in_(delete_attachment_ids or [0])).all():
        delete_media(x.file)
        db.delete(x)
    for f in attach_files:
        if f and f.filename:
            db.add(AlarmAttachment(alarm_id=seq, file=save_upload(f, "alarm_files")[0], created_at=now))
    notified = {d for (d,) in db.query(AlarmEventDate.event_date).filter(AlarmEventDate.alarm_id == seq, AlarmEventDate.notified == True)}  # noqa: E712
    db.query(AlarmEventDate).filter(AlarmEventDate.alarm_id == seq, AlarmEventDate.notified == False).delete(synchronize_session=False)  # noqa: E712
    for d in dates:
        if d not in notified:
            db.add(AlarmEventDate(alarm_id=seq, event_date=d, notified=False))
    db.flush()
    if a.valid_status == "invalid" and db.query(AlarmEventDate.id).filter(AlarmEventDate.alarm_id == seq, AlarmEventDate.notified == False).first():  # noqa: E712
        a.valid_status = "valid"
    a.updated_at = now
    _set_recipients(db, seq, send_to_all_agents, recipients)
    staff_auth.audit(db, request, "alarms.update", user_id=staff.id, target=f"alarm:{seq}")
    db.commit()
    return {"ok": True}


@router.post("/{seq}/toggle", dependencies=[WRITE])
def toggle(seq: int, db: Session = Depends(get_db)):
    a = _get(db, seq)
    a.valid_status = "invalid" if a.valid_status == "valid" else "valid"
    a.updated_at = datetime.now()
    db.commit()
    return {"valid_status": a.valid_status}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_alarm(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    a = _get(db, seq)
    files = [a.image, a.attach_file] + [x.file for x in db.query(AlarmAttachment).filter(AlarmAttachment.alarm_id == seq)]
    for t, col in (("alarm_attachment", "alarm_id"), ("alarm_event_date", "alarm_id"), ("alarm_history", "alarm_setting_id"),
                   ("alarm_setting_recipients", "alarmsetting_id")):
        db.execute(text(f"DELETE FROM {t} WHERE {col}=:a"), {"a": seq})
    db.delete(a)
    staff_auth.audit(db, request, "alarms.delete", user_id=staff.id, target=f"alarm:{seq}")
    db.commit()
    for f in files:  # cms 는 삭제 시 실파일을 남겼다(SPEC 06 §2 함정) — 여기서는 지운다
        if f:
            delete_media(f)
    return {"ok": True}


@router.post("/{seq}/test-send", dependencies=[WRITE])
def test_send(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """테스트 발송 — cms 처럼 alarm_history 를 남긴다. 링크는 STAFF_BASE_URL."""
    import smtplib
    from email.mime.application import MIMEApplication
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    from app.core.config import settings
    from app.services.email import FROM_EMAIL, FROM_NAME, SMTP_HOST, SMTP_PORT

    a = _get(db, seq)
    if a.send_to_all_agents:
        emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.group == "agent", CustomAuthUser.is_active == True) if u.email]  # noqa: E712
    else:
        emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(_recipient_ids(db, seq) or [0])) if u.email]
    if not emails:
        raise HTTPException(400, "발송할 에이전트가 없습니다.")
    now = datetime.now()
    h = AlarmHistory(alarm_setting_id=seq, sent_at=now, status="pending", recipient_count=len(emails), recipients=", ".join(emails), created_at=now)
    db.add(h)
    db.flush()
    nxt = db.query(AlarmEventDate).filter(AlarmEventDate.alarm_id == seq, AlarmEventDate.notified == False).order_by(AlarmEventDate.event_date).first()  # noqa: E712
    body = (f"안녕하세요,\n\n이것은 PACMS 알람 테스트 발송입니다.\n\n제목: {a.title}\n이벤트 일시: {nxt.event_date:%Y-%m-%d %H:%M}\n" if nxt else
            f"안녕하세요,\n\n이것은 PACMS 알람 테스트 발송입니다.\n\n제목: {a.title}\n")
    body += f"알람 시점: {_when_label(a)}\n\n내용:\n{a.content}\n\n알람 상세: {settings.STAFF_BASE_URL}/managed/alarm/{seq}/\n"
    msg = MIMEMultipart()
    msg["From"], msg["To"], msg["Subject"] = f"{FROM_NAME} <{FROM_EMAIL}>", ", ".join(emails), f"[PACMS 테스트 알람] {a.title}"
    msg.attach(MIMEText(body, "plain", "utf-8"))
    paths = [a.attach_file] + [x.file for x in db.query(AlarmAttachment).filter(AlarmAttachment.alarm_id == seq)]
    for stored in paths:
        p = resolve_media_path(stored) if stored else None
        if p:
            with open(p, "rb") as fh:
                part = MIMEApplication(fh.read())
            part.add_header("Content-Disposition", "attachment", filename=("utf-8", "", p.rsplit("/", 1)[-1]))
            msg.attach(part)
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
            s.sendmail(FROM_EMAIL, emails, msg.as_string())
        h.status = "sent"
    except Exception as e:  # noqa: BLE001
        h.status, h.error_message = "failed", str(e)
    staff_auth.audit(db, request, "alarms.test_send", user_id=staff.id, target=f"alarm:{seq}", detail=h.status)
    db.commit()
    if h.status == "failed":
        raise HTTPException(502, f"이메일 발송 오류: {h.error_message}")
    return {"sent": len(emails)}
