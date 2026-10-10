"""알림 job — cms check_alarms.py 를 job 별로 나눈 이식(SPEC 11 §5).

cms 와 다른 점:
- 알람: 이벤트 일시별 발송 선점(job_claim) → 09:00 중복 실행이 있어도 한 번만 보낸다(SPEC 07 §6.2).
- 할일 요약: (사용자, 날짜) 선점 → 하루 1통. 09:00~09:59 사이 첫 실행에서 보낸다(5분 창 → 1시간 창).
- 발송 결과를 outbox(notification_event)에도 남긴다(iMessage 전달기 교체용).
"""

from datetime import date, datetime, time, timedelta
from html import escape

from dateutil.relativedelta import relativedelta
from sqlalchemy import or_, text

from app.core.config import settings
from app.jobs.core import JobContext, pre
from app.models.customer import CustomAuthUser, Managelist, Payment, PaymentAlarm, PaymentAlarmHistory, PaymentHistory, Project
from app.models.worktools import AlarmAttachment, AlarmEventDate, AlarmHistory, AlarmSetting, MeetingAlarm, MeetingAppointment, Todo
from app.services import billing as bl
from app.services.notify import emit
from app.utils.media import resolve_media_path


def _agent_emails(db) -> list[str]:
    return [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.group == "agent", CustomAuthUser.is_active == True) if u.email]  # noqa: E712


# ── 알람 ─────────────────────────────────────────────────────────────────

def _offset_days(a: AlarmSetting) -> int:
    if a.when_to_notify == "month":
        return 30
    if a.when_to_notify == "week":
        return 7
    if a.when_to_notify == "custom":
        return a.custom_days if a.custom_days is not None else 1
    return 0


def _due(a: AlarmSetting, events: list[AlarmEventDate], now: datetime) -> list[AlarmEventDate]:
    """cms AlarmSetting.get_due_event_dates — 발송일 당일은 시각(alarm_time / 당일 알람은 이벤트 시각 / 09:00) 이후, 지난 날은 즉시."""
    days, today, due = _offset_days(a), now.date(), []
    for ed in events:
        notify_date = (ed.event_date - timedelta(days=days)).date()
        if today < notify_date:
            continue
        if today == notify_date:
            if a.alarm_time:
                h, m = a.alarm_time.hour, a.alarm_time.minute
            elif days == 0:
                h, m = ed.event_date.hour, ed.event_date.minute
            else:
                h, m = 9, 0
            if now < datetime.combine(notify_date, time(h, m)):
                continue
        due.append(ed)
    return due


def _advance(a: AlarmSetting, dt: datetime) -> datetime | None:
    c = a.cycle_type
    if c == "daily":
        return dt + timedelta(days=1)
    if c in ("weekday", "weekend"):
        n = dt + timedelta(days=1)
        while (n.weekday() >= 5) if c == "weekday" else (n.weekday() < 5):
            n += timedelta(days=1)
        return n
    if c == "weekly":
        return dt + timedelta(weeks=1)
    if c == "monthly":
        return dt + relativedelta(months=1)
    if c == "yearly":
        return dt + relativedelta(years=1)
    if c == "custom" and a.cycle_days and a.cycle_days >= 1:
        return dt + timedelta(days=a.cycle_days)
    return None


def _next_cycle(a: AlarmSetting, from_dt: datetime, today: date) -> datetime | None:
    """cms get_next_cycle_date — 발송 시점이 이미 지난 회차는 건너뛴다(밀린 회차 폭주 방지)."""
    if not a.cycle_type or a.cycle_type == "none":
        return None
    nxt = _advance(a, from_dt)
    guard = 0
    while nxt is not None and (nxt - timedelta(days=_offset_days(a))).date() <= today:
        nxt = _advance(a, nxt)
        guard += 1
        if guard > 1000:
            return None
    if nxt is None or (a.cycle_end_date and nxt.date() > a.cycle_end_date):
        return None
    return nxt


def run_alarms(ctx: JobContext) -> None:
    db, now = ctx.db, ctx.now
    sent = 0
    for a in db.query(AlarmSetting).filter(AlarmSetting.valid_status == "valid").all():
        pending = db.query(AlarmEventDate).filter(AlarmEventDate.alarm_id == a.seq, AlarmEventDate.notified == False).order_by(AlarmEventDate.event_date).all()  # noqa: E712
        due = _due(a, pending, now)
        has_future = db.query(AlarmEventDate.id).filter(AlarmEventDate.alarm_id == a.seq, AlarmEventDate.event_date > now).first()
        if not due:
            if not pending and not has_future:
                a.valid_status = "invalid"
            continue
        if a.send_to_all_agents:
            emails = _agent_emails(db)
        else:
            ids = [r[0] for r in db.execute(text("SELECT customauthuser_id FROM alarm_setting_recipients WHERE alarmsetting_id=:a"), {"a": a.seq})]
            emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(ids or [0])) if u.email]
        if not emails:
            ctx.log(f"알람 수신자 없음: {a.title}")
            continue
        key = f"{a.seq}:" + ",".join(f"{e.id}" for e in due)
        if not ctx.claim("alarms", key):
            ctx.log(f"이미 선점된 발송: {a.title}")
            continue
        label = {"month": "이벤트 30일 전", "week": "이벤트 7일 전"}.get(a.when_to_notify, f"이벤트 {a.custom_days}일 전" if a.when_to_notify == "custom" else "")
        dates = "\n".join(f"  - {e.event_date:%Y년 %m월 %d일 %H:%M}" for e in due)
        body = (f"안녕하세요,\n\nPACMS 알람 시스템에서 다음 알람을 전달드립니다.\n\n{'═' * 42}\n제목: {a.title}\n알람 시점: {label}\n이벤트 날짜:\n{dates}\n"
                f"{'═' * 42}\n\n내용:\n{a.content}\n\n{'═' * 42}\n\n이 메일은 자동으로 발송된 알람입니다.\n\nPACMS 시스템\n{datetime.now():%Y-%m-%d %H:%M:%S}\n")
        files = [p for p in (resolve_media_path(x) for x in [a.image, a.attach_file] + [t.file for t in db.query(AlarmAttachment).filter(AlarmAttachment.alarm_id == a.seq)] if x) if p]
        h = AlarmHistory(alarm_setting_id=a.seq, sent_at=datetime.now(), status="pending", recipient_count=len(emails), recipients=", ".join(emails), created_at=datetime.now())
        if not ctx.dry_run:
            db.add(h)
            db.flush()
        try:
            ctx.send(emails, f"[PACMS 알람] {a.title}", pre(body), files)
            h.status = "sent"
        except Exception as e:  # noqa: BLE001
            h.status, h.error_message = "failed", f"이메일 발송 오류: {e}"
            ctx.mark("alarms", key, "failed")
            ctx.log(f"✗ 알람 발송 실패: {a.title} — {e}")
            continue
        sent += 1
        stamp = datetime.now()
        for e in due:
            e.notified, e.notified_at = True, stamp
            nxt = _next_cycle(a, e.event_date, now.date())
            if nxt:
                db.add(AlarmEventDate(alarm_id=a.seq, event_date=nxt, notified=False))
        db.flush()
        if not db.query(AlarmEventDate.id).filter(AlarmEventDate.alarm_id == a.seq, or_(AlarmEventDate.notified == False, AlarmEventDate.event_date > now)).first():  # noqa: E712
            a.valid_status = "invalid"
        emit(db, "alarm.sent", f"[CMS 알람] {a.title} · {a.content[:120]}", "alarm_history", h.seq, recipients=len(emails))
        ctx.log(f"✓ 알람 발송: {a.title} ({len(due)}건)")
    ctx.log(f"알람 발송 {sent}건")


# ── 결제일 알람 ──────────────────────────────────────────────────────────

def _monday(d: date) -> date:
    return d + timedelta(days=2) if d.weekday() == 5 else d + timedelta(days=1) if d.weekday() == 6 else d


def run_payment_alarms(ctx: JobContext) -> None:
    """알림일(결제일 − 선행일, 주말이면 월요일) 이후 + 알림 시각 ±4분 + 오늘 미발송일 때 발송, 다음 결제일 전진, 납부·납부내역 자동 생성."""
    db, now = ctx.db, ctx.now
    today, sent = now.date(), 0
    for (seq,) in db.query(PaymentAlarm.seq).filter(PaymentAlarm.valid_status == "valid").all():
        a = db.query(PaymentAlarm).filter(PaymentAlarm.seq == seq).with_for_update().first()
        if a.end_date and today > a.end_date:
            a.valid_status = "invalid"
            continue
        if not a.next_payment_date or today < _monday(a.next_payment_date - timedelta(days=a.notify_days_before)):
            continue
        target = (a.alarm_time.hour * 60 + a.alarm_time.minute) if a.alarm_time else 540
        if abs(now.hour * 60 + now.minute - target) > 4 or (a.last_sent_at and a.last_sent_at.date() == today):
            continue
        if a.send_to_all_agents:
            emails = _agent_emails(db)
        else:
            ids = [r[0] for r in db.execute(text("SELECT customauthuser_id FROM payment_alarm_recipients WHERE paymentalarm_id=:a"), {"a": a.seq})]
            emails = [u.email for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(ids or [0])) if u.email]
        if not emails:
            continue
        pdate = a.next_payment_date
        if not ctx.claim("payment_alarms", f"{a.seq}:{pdate}"):
            continue
        cycle = {"monthly": "매월", "yearly": "매년", "custom": f"매{a.cycle_months}개월"}.get(a.cycle_type, a.cycle_type)
        amount = f"{int(a.amount):,}원" if a.amount else "미지정"
        body = (f"안녕하세요,\n\nPACMS 결제일 알람 시스템에서 정기 결제일을 알려드립니다.\n\n{'═' * 42}\n결제명: {a.title}\n결제일: {pdate:%Y년 %m월 %d일}\n"
                f"결제금액: {amount}\n결제주기: {cycle}\n알람 선행일: {a.notify_days_before}일 전\n{'═' * 42}\n"
                + (f"\n설명:\n{a.description}\n" if a.description else "") + f"\n{'═' * 42}\n\n이 메일은 자동으로 발송된 결제일 알람입니다.\nPACMS 시스템\n{datetime.now():%Y-%m-%d %H:%M:%S}\n")
        h = PaymentAlarmHistory(payment_alarm_id=a.seq, sent_at=datetime.now(), status="pending", payment_date=pdate, recipient_count=len(emails),
                                recipients=", ".join(emails), created_at=datetime.now())
        if not ctx.dry_run:
            db.add(h)
            db.flush()
        try:
            ctx.send(emails, f"[PACMS 결제일알람] {a.title}", pre(body))
        except Exception as e:  # noqa: BLE001
            h.status, h.error_message = "failed", f"이메일 발송 오류: {e}"
            ctx.mark("payment_alarms", f"{a.seq}:{pdate}", "failed")
            continue
        h.status = "sent"
        a.last_sent_at = datetime.now()
        a.next_payment_date = bl.next_payment_date(a, pdate)
        _auto_payment_history(ctx, a, pdate)
        sent += 1
        ctx.log(f"✓ 결제일 알람: {a.title} ({pdate})")
    ctx.log(f"결제일 알람 발송 {sent}건")


def _auto_payment_history(ctx: JobContext, a: PaymentAlarm, pdate: date) -> None:
    """cms _auto_create_payment_history — 같은 알람·날짜 납부/납부내역이 있으면 만들지 않는다. 매출=계약금 칸, 매입=잔금 칸."""
    db = ctx.db
    if not a.amount:
        return
    amount, dt = int(a.amount), datetime.combine(pdate, time.min)
    project = db.query(Project).filter(Project.seq == a.project_id).first() if a.project_id else None
    company_id = project.company_id if project else None
    day = (dt, dt + timedelta(days=1))
    pays = db.query(Payment).filter(Payment.payment_alarm_id == a.seq, Payment.payment_date >= day[0], Payment.payment_date < day[1]).all()
    pay = pays[0] if pays else None
    if not pay:
        pay = Payment(company_id=company_id, project_id=a.project_id, payment_alarm_id=a.seq, payment_date=dt, payment_amount=amount, payment_type="3",
                      payment_status="3", history_remarks=f"[결제일알람] {a.title} ({pdate})", extra_items="[]", created_at=datetime.now(), updated_at=datetime.now())
        db.add(pay)
        db.flush()
        pays = [pay]
    if db.query(PaymentHistory.seq).filter(PaymentHistory.payment_id.in_([p.seq for p in pays])).first():
        return
    field = "deposit" if a.payment_type == "sales" else "balance"
    db.add(PaymentHistory(company_id=company_id, project_id=a.project_id, payment_id=pay.seq, payment_amount=amount, payment_tf="2",
                          created_at=datetime.now(), updated_at=datetime.now(), **{f"{field}_amount": amount, f"{field}_date": dt}))


# ── 미팅약속 ─────────────────────────────────────────────────────────────

def run_meetings(ctx: JobContext) -> None:
    """약속시각 지난 유효 미팅 무효화 + 알람 발송(24시간 넘게 늦으면 expired, 수신자 없으면 failed 최종, 발송 실패는 재시도)."""
    from app.api.endpoints.managed.meetings import _cal_fields, _recipients, _when, naver_route_url
    db, now = ctx.db, ctx.now
    expired = 0
    for m in db.query(MeetingAppointment).filter(MeetingAppointment.valid_status == "valid").all():
        if datetime.combine(m.meeting_date, m.meeting_time or time(0, 0)) < now:
            m.valid_status, m.updated_at = "invalid", now
            expired += 1
    sent = 0
    rows = db.query(MeetingAlarm).join(MeetingAppointment, MeetingAppointment.seq == MeetingAlarm.meeting_id).filter(
        MeetingAlarm.notified == False, MeetingAlarm.alarm_datetime <= now, MeetingAppointment.valid_status == "valid").all()  # noqa: E712
    for al in rows:
        m = db.query(MeetingAppointment).filter(MeetingAppointment.seq == al.meeting_id).first()
        if al.alarm_datetime < now - timedelta(hours=24):
            al.status, al.notified = "expired", True
            emit(db, "meeting.alarm", f"[미팅약속-expired] {m.title} {_when(m)}", "meeting_alarm", al.seq)
            continue
        emails = [u.email for u in _recipients(db, m.seq) if u.email]
        if not emails and m.created_by_id:
            c = db.query(CustomAuthUser).filter(CustomAuthUser.id == m.created_by_id).first()
            emails = [c.email] if c and c.email else []
        if not emails:
            al.status, al.error_message, al.notified = "failed", "수신자 없음", True
            continue
        if not ctx.claim("meetings", f"alarm:{al.seq}"):
            continue
        f = _cal_fields(m)
        link = f"{settings.STAFF_BASE_URL}/managed/meeting/{m.seq}/"
        rows_html = "".join(f"<tr><th align=left>{k}</th><td>{escape(v)}</td></tr>" for k, v in
                            [("제목", m.title), ("약속일시", _when(m)), ("장소", f["location"] or "-"), ("메모", m.memo or "-"), ("알람일시", f"{al.alarm_datetime:%Y-%m-%d %H:%M}")])
        html = f"<p>PACMS 미팅약속 알람입니다.</p><table>{rows_html}</table>"
        if m.meeting_type == "offline":
            html += f'<p><a href="{escape(naver_route_url(m))}">네이버지도 길찾기</a></p>'
        html += f'<p><a href="{escape(link)}">미팅약속 상세</a></p>'
        try:
            ctx.send(emails, f"[PACMS 미팅약속] {m.title} - {_when(m)}", html)
        except Exception as e:  # noqa: BLE001 — notified 는 False 로 두어 재시도(24시간 창)
            al.status, al.error_message = "failed", f"이메일 발송 오류: {e}"
            ctx.mark("meetings", f"alarm:{al.seq}", "failed")
            continue
        al.notified, al.notified_at, al.status, al.error_message = True, datetime.now(), "sent", ""
        emit(db, "meeting.alarm", f"[미팅약속] {m.title} {_when(m)} {(m.end_place or m.video_meeting_url or '')[:60]}", "meeting_alarm", al.seq)
        sent += 1
    ctx.log(f"미팅 무효화 {expired}건, 알람 발송 {sent}건")


# ── 할일 요약(다이제스트) ────────────────────────────────────────────────

MANAGER_FIELDS = ("manager_select_contract_seq_id", "manager_select_planning_seq_id", "manager_select_frontend_seq_id",
                  "manager_select_backend_seq_id", "manager_select_design_seq_id", "manager_select_maintenance_seq_id")
PRIORITY_ORDER = {"high": 0, "normal": 1, "low": 2}


def run_todo_digest(ctx: JobContext) -> None:
    """cms check_todo_daily_digest — 할일 담당·등록자 + 7일 내 계약 시작/종료 프로젝트 담당자에게 매일 1통(0건이어도)."""
    db, now = ctx.db, ctx.now
    today, window = now.date(), now.date() + timedelta(days=7)
    if now.hour < 9:
        return
    live = db.query(Todo).filter(Todo.is_deleted == False)  # noqa: E712
    users = {i for r in live.with_entities(Todo.assignee_id, Todo.created_by_id) for i in r if i}

    def managers(projects):
        out = {}
        for p in projects:
            for uid in {getattr(p, f) for f in MANAGER_FIELDS} - {None}:
                out.setdefault(uid, []).append(p)
        return out

    lo, hi = datetime.combine(today, time.min), datetime.combine(window, time.max)
    starting = managers(db.query(Project).filter(Project.contract_date.between(lo, hi), or_(Project.project_status.is_(None), Project.project_status != "3")).all())
    ending = managers(db.query(Project).filter(Project.contract_termination_date.between(lo, hi), or_(Project.project_status.is_(None), Project.project_status != "3")).all())
    users |= set(starting) | set(ending)
    active = db.query(Project).filter(Project.contract_date <= datetime.combine(today, time.max), Project.contract_termination_date >= datetime.combine(today, time.min),
                                      or_(Project.project_status.is_(None), Project.project_status != "3")).order_by(Project.title).all()
    maint = db.query(Managelist).filter(Managelist.status != 4).order_by(Managelist.title).all()
    sent = 0
    for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(users or [0]), CustomAuthUser.is_active == True).all():  # noqa: E712
        if not u.email or not ctx.claim("todo_digest", f"{u.id}:{today}"):
            continue
        mine = live.filter(or_(Todo.assignee_id == u.id, Todo.created_by_id == u.id))
        sections = [
            ("오늘 시작", mine.filter(Todo.start_date == today, Todo.status != "done").all()),
            ("진행중", mine.filter(Todo.status == "in_progress").all()),
            ("오늘 마감", mine.filter(Todo.due_date == today, Todo.status != "done").all()),
            ("지연", mine.filter(Todo.due_date < today, Todo.status != "done").all()),
        ]
        html = [f"<h3>{today:%Y-%m-%d} 오늘의 할일 요약</h3>"]
        for title, items in sections:
            items.sort(key=lambda t: (PRIORITY_ORDER.get(t.priority, 1), t.due_date or date.max))
            html.append(f"<h4>{title} ({len(items)})</h4><ul>" + "".join(
                f'<li><a href="{settings.STAFF_BASE_URL}/managed/todo/{t.seq}/">{escape(t.title)}</a>'
                f'{" · 마감 " + t.due_date.isoformat() if t.due_date else ""}</li>' for t in items) + "</ul>")
        for title, items in (("7일 내 계약 시작", starting.get(u.id, [])), ("7일 내 계약 종료", ending.get(u.id, [])), ("진행중 프로젝트", active)):
            html.append(f"<h4>{title} ({len(items)})</h4><ul>" + "".join(f"<li>{escape(p.title or '')}</li>" for p in items) + "</ul>")
        html.append(f"<h4>미완료 유지보수 ({len(maint)})</h4><ul>" + "".join(f"<li>{escape(x.title or '')}</li>" for x in maint) + "</ul>")
        try:
            ctx.send([u.email], f"[PACMS] {today:%Y-%m-%d} 오늘의 할일 요약", "".join(html))
            ctx.mark("todo_digest", f"{u.id}:{today}", "sent")
            sent += 1
        except Exception as e:  # noqa: BLE001
            ctx.mark("todo_digest", f"{u.id}:{today}", "failed")
            ctx.log(f"✗ 할일 요약 실패 {u.email}: {e}")
    ctx.log(f"할일 요약 발송 {sent}명")


