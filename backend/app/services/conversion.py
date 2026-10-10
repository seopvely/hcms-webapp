"""견적 → 계약전환 / 계약 철회 (cms estimate_change_status '5' · contract_withdraw 와 같은 행을 쓴다).

한 트랜잭션 + 견적 행 잠금. 철회가 생성물을 찾을 때 쓰는 문자열 마커를 그대로 유지한다(SPEC 04 §6.3):
- 납부 비고 '… 계약 전환 …' + 견적번호, 포인트 content '계약 포인트 충전' / '초기 유지보수 포인트 충전' / '초기 개발 포인트 충전'
- 견적 이력 change_reason '계약 철회(CT…) - 사유' + previous_status '5'
cms 와 다른 점: iCloud requirements.md 파일 쓰기는 하지 않는다(요구사항은 프로젝트 requirements 필드에 이미 저장 — SPEC §6.4),
영업접수 won 은 철회 때 되돌린다(SPEC §6.4). 유형 13·15 구독 생성은 services/subscriptions.py.
"""
from datetime import date, datetime, time, timedelta

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException
from sqlalchemy import or_, text, true
from sqlalchemy.orm import Session

from app.api.endpoints.managed.estimates import amounts
from app.services import subscriptions
from app.models.customer import (
    CustomAuthUser,
    Estimate,
    EstimateContract,
    EstimateStatusHistory,
    Payment,
    PaymentHistory,
    PointHistory,
    Project,
    SalesLead,
    SalesLeadActivity,
)

CONVERSION_POINT_MARKERS = ("계약 포인트 충전", "초기 유지보수 포인트 충전", "초기 개발 포인트 충전")


def _dt(d):
    if d is None:
        return None
    return d if isinstance(d, datetime) else datetime.combine(d, time.min)


def _date(d):
    return d.date() if isinstance(d, datetime) else d


def convert(db: Session, staff: CustomAuthUser, estimate_id: int, sales_lead_id: int | None, reason: str) -> Project:
    e = db.query(Estimate).filter(Estimate.seq == estimate_id).with_for_update().first()
    if e is None:
        raise HTTPException(status_code=404, detail="견적서를 찾을 수 없습니다.")
    if e.converted_project_id:
        raise HTTPException(status_code=400, detail="이미 프로젝트로 전환된 견적서입니다.")
    if not e.company_id:
        raise HTTPException(status_code=400, detail="업체 정보가 필요합니다. 견적서를 수정해 주세요.")
    if e.project_type == "15" and not e.maint_subscription_plan:
        raise HTTPException(status_code=400, detail="유지보수구독(유형 15) 견적에 요금제가 선택되지 않았습니다.")
    if e.project_type == "14":
        raise HTTPException(status_code=400, detail="AI개발팀구축(유형 14)은 판매 종료되었습니다.")
    lead = None
    if sales_lead_id:
        lead = db.query(SalesLead).filter(SalesLead.seq == sales_lead_id).with_for_update().first()
        if lead is None:
            raise HTTPException(status_code=400, detail="선택한 영업접수 정보를 찾을 수 없습니다.")

    now = datetime.now()
    previous_status = str(e.estimate_status or "1")
    project = Project(
        company_id=e.company_id, title=e.estimate_title, category=e.estimate_type, project_type=e.project_type,
        contract_deposit=e.contract_deposit, contract_date=e.contract_date, contract_period_range=e.contract_period_range,
        contract_termination_date=e.contract_termination_date, contract_remarks=e.estimate_content, project_status="1",
        point=e.point, manager_select_contract_seq_id=e.estimate_manager_id, requirements=e.requirements,
        sales_lead_id=lead.seq if lead else None, extension_count=0, maintenance_request_enabled=True, is_opened=False,
        created_at=now, updated_at=now,
    )
    # 무상 유지보수: 서명된 계약서(쌍방서명 > 서명완료) 값 우선, 없으면 견적서 값
    signed = (db.query(EstimateContract).filter(EstimateContract.estimate_id == e.seq, EstimateContract.status == "6")
              .order_by(EstimateContract.created_at.desc()).first()
              or db.query(EstimateContract).filter(EstimateContract.estimate_id == e.seq, EstimateContract.status == "4")
              .order_by(EstimateContract.created_at.desc()).first())
    source = signed if signed and signed.free_maint_months else e
    if source.free_maint_months and e.contract_termination_date:
        start = _date(e.contract_termination_date) + timedelta(days=1)
        project.free_maint_months = source.free_maint_months
        project.free_maint_scope = source.free_maint_scope or None
        project.free_maint_start_date = start
        project.free_maint_end_date = start + relativedelta(months=source.free_maint_months) - timedelta(days=1)
    elif source.free_maint_months:
        project.free_maint_months = source.free_maint_months
        project.free_maint_scope = source.free_maint_scope or None
    db.add(project)
    db.flush()

    e.converted_project_id = project.seq
    e.project_id = project.seq

    if e.project_type in ("9", "10") and e.point:
        name = "유지보수" if e.project_type == "9" else "서버관리"
        db.add(PointHistory(company_id=e.company_id, project_id=project.seq, point=e.point, point_type="1", status="2",
                            content=f"{name} 계약 포인트 충전 (견적서: {e.estimate_number})", writer_id=staff.id,
                            created_at=now, updated_at=now, edited_at=now))

    if e.project_type == "13":
        subscriptions.convert_dev_subscription(db, e, project, staff)
    if e.project_type == "15":
        subscriptions.convert_maint_subscription(db, e, project, staff)

    # 지불조건 구간별 납부 + 납부내역 (착수금 1 / 중도금 2 / 잔금 6, 결제대기 3·미완료 2)
    total = amounts(e)["total"]
    sections = [(e.deposit_pct, e.deposit_due_date, "1", "착수금", "deposit_amount"),
                (e.progress_pct, e.progress_due_date, "2", "중도금", "progress_amount"),
                (e.balance_pct, e.balance_due_date, "6", "잔금", "balance_amount")]
    if any(s[0] for s in sections):
        for pct, due, ptype, label, field in sections:
            if not pct:
                continue
            amount = round(total * pct / 100)
            pay = Payment(project_type=e.project_type, production_price=total, company_id=e.company_id, project_id=project.seq,
                          payment_amount=amount, payment_type=ptype, payment_status="3", payment_date=_dt(due),
                          history_remarks=f"[{label} {pct}%] 견적서({e.estimate_number}) 계약 전환 자동생성",
                          created_at=now, updated_at=now)
            db.add(pay)
            db.flush()
            db.add(PaymentHistory(company_id=e.company_id, project_id=project.seq, payment_id=pay.seq, payment_amount=total,
                                  payment_tf="2", created_at=now, updated_at=now, **{field: amount}))
    else:
        pay = Payment(project_type=e.project_type, production_price=total, company_id=e.company_id, project_id=project.seq,
                      payment_amount=total, payment_type="1", payment_status="3",
                      history_remarks=f"견적서({e.estimate_number}) 계약 전환으로 자동 생성", created_at=now, updated_at=now)
        db.add(pay)
        db.flush()
        db.add(PaymentHistory(company_id=e.company_id, project_id=project.seq, payment_id=pay.seq, payment_amount=total,
                              deposit_amount=e.contract_deposit or 0, payment_tf="2", created_at=now, updated_at=now))

    if lead and lead.status != "won":
        old = lead.status
        lead.status = "won"
        lead.updated_at = now
        db.add(SalesLeadActivity(sales_lead_id=lead.seq, activity_type="auto", old_status=old, new_status="won",
                                 content=f'견적서({e.estimate_number}) 계약전환으로 프로젝트 "{project.title}"가 생성되어 상태가 수주로 변경되었습니다.',
                                 created_by_id=staff.id, created_at=now))

    e.estimate_status = "5"
    e.updated_at = now
    db.add(EstimateStatusHistory(estimate_id=e.seq, previous_status=previous_status, new_status="5", changed_by_id=staff.id,
                                 change_reason=reason, created_at=now))
    return project


def _conversion_payments(db: Session, e: Estimate, project_id: int):
    cond = Payment.history_remarks.like("%계약 전환%")
    if e.estimate_number:
        cond = or_(cond, Payment.history_remarks.like(f"%{e.estimate_number}%"))
    return db.query(Payment).filter(Payment.project_id == project_id).filter(cond).all()


def _conversion_points(db: Session, project_id: int):
    return db.query(PointHistory).filter(PointHistory.project_id == project_id, PointHistory.point_type == "1").filter(
        or_(*[PointHistory.content.like(f"%{m}%") for m in CONVERSION_POINT_MARKERS])).all()


# 프로젝트 삭제를 막는 연결 데이터(cms get_withdraw_context 와 같은 목록)
_BLOCKER_SQL = {
    "유지보수 요청": "SELECT COUNT(*) FROM Managelist WHERE project_id=:p",
    "개별업무": "SELECT COUNT(*) FROM Inditask WHERE project_id=:p",
    "프로젝트 게시글": "SELECT COUNT(*) FROM project_board WHERE project_id=:p",
    "게시판 카테고리": "SELECT COUNT(*) FROM project_board_category WHERE project_id=:p",
    "연결 도메인": "SELECT COUNT(*) FROM project_domain WHERE project_id=:p",
    "유지보수 포인트": "SELECT COUNT(*) FROM pacms_maintenance_point WHERE project_id=:p",
    "프로젝트 공지": "SELECT COUNT(*) FROM Notice WHERE project_id=:p",
    "계약 연장 이력": "SELECT COUNT(*) FROM contract_history WHERE project_id=:p",
    "결제 알람": "SELECT COUNT(*) FROM payment_alarm WHERE project_id=:p",
    "외주 내역": "SELECT COUNT(*) FROM outsourcing WHERE project_id=:p",
    "할일(Todo)": "SELECT COUNT(*) FROM todo WHERE project_id=:p",
}


def withdraw_context(db: Session, c: EstimateContract) -> dict | None:
    e = db.query(Estimate).filter(Estimate.seq == c.estimate_id).first() if c.estimate_id else None
    if e is None or not e.converted_project_id:
        return None
    pid = e.converted_project_id
    pays = _conversion_payments(db, e, pid)
    pay_ids = [p.seq for p in pays]
    points = _conversion_points(db, pid)
    blockers = {}
    for label, sql in _BLOCKER_SQL.items():
        n = db.execute(text(sql), {"p": pid}).scalar() or 0
        if n:
            blockers[label] = n
    other_pay = db.query(Payment).filter(Payment.project_id == pid, ~Payment.seq.in_(pay_ids) if pay_ids else true()).count()
    if other_pay:
        blockers["기타 납부 내역"] = other_pay
    other_points = db.query(PointHistory).filter(PointHistory.project_id == pid, ~PointHistory.seq.in_([p.seq for p in points]) if points else true()).count()
    if other_points:
        blockers["기타 포인트 내역"] = other_points
    other_est = db.query(Estimate).filter(Estimate.project_id == pid, Estimate.seq != e.seq).count()
    if other_est:
        blockers["다른 견적서 연결"] = other_est
    project = db.query(Project).filter(Project.seq == pid).first()
    return {
        "project_id": pid, "project_title": project.title if project else None,
        "payment_count": len(pays), "paid_payment_count": sum(1 for p in pays if str(p.payment_status) == "1"),
        "point_count": len(points), "point_total": sum(p.point or 0 for p in points),
        "blockers": blockers, "can_delete_project": not blockers,
    }


def withdraw(db: Session, staff: CustomAuthUser, c: EstimateContract, reason: str, project_action: str) -> dict:
    e = db.query(Estimate).filter(Estimate.seq == c.estimate_id).with_for_update().first() if c.estimate_id else None
    if e is None:
        raise HTTPException(status_code=400, detail="연결된 견적서가 없는 계약서입니다.")
    if str(c.status) == "5":
        raise HTTPException(status_code=400, detail="이미 철회(취소) 처리된 계약서입니다.")
    if not e.converted_project_id:
        raise HTTPException(status_code=400, detail="계약전환된 프로젝트가 없습니다.")
    info = withdraw_context(db, c)
    if project_action == "delete" and not info["can_delete_project"]:
        text_ = ", ".join(f"{k} {v}건" for k, v in info["blockers"].items())
        raise HTTPException(status_code=400, detail=f"프로젝트에 연결된 업무 데이터가 있어 삭제할 수 없습니다({text_}). 중지 처리를 선택하세요.")
    project = db.query(Project).filter(Project.seq == e.converted_project_id).with_for_update().first()
    now = datetime.now()
    done, skipped = [], []

    deleted_pay = deleted_hist = 0
    for pay in _conversion_payments(db, e, project.seq):
        hists = db.query(PaymentHistory).filter(PaymentHistory.payment_id == pay.seq).all()
        if str(pay.payment_status) == "1" or any(str(h.payment_tf) == "1" for h in hists):
            skipped.append(f"납부 #{pay.seq}(결제완료)")
            continue
        for h in hists:
            db.delete(h)
        deleted_hist += len(hists)
        db.flush()
        db.delete(pay)
        deleted_pay += 1
    if deleted_pay:
        done.append(f"납부 {deleted_pay}건 / 납부내역 {deleted_hist}건 회수")

    points = _conversion_points(db, project.seq)
    if points:
        done.append(f"충전 포인트 내역 {len(points)}건({sum(p.point or 0 for p in points)}P) 회수")
        for p in points:
            db.delete(p)

    # 유형 15: 제공 서비스(FK RESTRICT)를 먼저 지우고, 전환 건은 '견적 생성' 상태로 되돌린다
    db.execute(text("DELETE FROM maint_subscription_service WHERE subscription_id IN (SELECT seq FROM pacms_maintsubscription WHERE source_estimate_id=:e)"), {"e": e.seq})
    n = db.execute(text("UPDATE maint_renewal SET status='estimated', new_project_id=NULL, updated_at=NOW() WHERE estimate_id=:e AND new_project_id=:p"),
                   {"e": e.seq, "p": project.seq}).rowcount
    if n:
        done.append(f"유지보수 전환 {n}건 '견적 생성'으로 되돌림")
    for label, table in (("개발구독", "pacms_devsubscription"), ("유지보수구독", "pacms_maintsubscription"), ("AI개발팀구축", "pacms_aidevsubscription")):
        n = db.execute(text(f"SELECT COUNT(*) FROM `{table}` WHERE source_estimate_id=:e"), {"e": e.seq}).scalar()
        if n:
            db.execute(text(f"DELETE FROM `{table}` WHERE source_estimate_id=:e"), {"e": e.seq})
            done.append(f"{label} {n}건 회수")

    e.converted_project_id = None
    e.project_id = None
    db.flush()

    pid, ptitle, lead_id = project.seq, project.title, project.sales_lead_id
    if project_action == "delete":
        db.delete(project)
        done.append(f"프로젝트 #{pid} 삭제")
    else:
        project.project_status = "3"
        project.updated_at = now
        done.append(f"프로젝트 #{pid} 중지 처리")

    prev = db.query(EstimateStatusHistory).filter(EstimateStatusHistory.estimate_id == e.seq, EstimateStatusHistory.new_status == "5").order_by(EstimateStatusHistory.created_at.desc()).first()
    restore = (prev.previous_status if prev and prev.previous_status else "3")
    e.estimate_status = restore
    e.updated_at = now
    db.add(EstimateStatusHistory(estimate_id=e.seq, previous_status="5", new_status=restore, changed_by_id=staff.id,
                                 change_reason=f"계약 철회({c.contract_number})" + (f" - {reason}" if reason else ""), created_at=now))
    done.append("견적서 상태 원복")

    # 영업접수 수주 되돌리기(cms 에는 없던 규칙): 이 전환이 won 으로 바꿨을 때만 직전 상태로
    lead = (db.query(SalesLead).filter(SalesLead.seq == lead_id).first() if lead_id else None) or \
        db.query(SalesLead).filter(SalesLead.estimate_id == e.seq).first()
    if lead and lead.status == "won":
        act = db.query(SalesLeadActivity).filter(SalesLeadActivity.sales_lead_id == lead.seq, SalesLeadActivity.new_status == "won",
                                                 SalesLeadActivity.content.like(f"%{e.estimate_number}%")).order_by(SalesLeadActivity.seq.desc()).first()
        if act:
            lead.status = act.old_status or "negotiation"
            db.add(SalesLeadActivity(sales_lead_id=lead.seq, activity_type="auto", old_status="won", new_status=lead.status,
                                     content=f"계약 철회({c.contract_number})로 수주가 취소되었습니다.", created_by_id=staff.id, created_at=now))
            done.append("영업접수 수주 취소")

    c.status = "5"
    c.updated_at = now
    desc = f"계약 철회 - {ptitle}(#{pid})\n처리내역: " + ", ".join(done)
    if skipped:
        desc += "\n보존항목: " + ", ".join(skipped)
    if reason:
        desc += f"\n철회사유: {reason}"
    return {"done": done, "skipped": skipped, "description": desc}
