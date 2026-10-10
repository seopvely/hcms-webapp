"""직원 유지보수 요청 처리 — 댓글·포인트 책정/실행·완료·삭제.

cms(managed/views.py add_managelist_comment 등)와 같은 행을 같은 값으로 쓴다(SPEC 02 §12):
- 코드값은 문자열('1'~'4'), 직원 댓글 writer_id = 직원 id, 고객 댓글 writer_id = NULL
- 포인트 부호: 책정·사용은 음수. 책정 = point_type '3'/status '1', 실행 = '2'/'2'
- 사용분의 주기 귀속은 created_at(책정 시각) — 실행할 때 created_at 을 바꾸지 않는다
cms 의 레거시 경로("status 만 2 로 바꾸는" 완료 처리, Manageworker, ManagelistLog)는 옮기지 않는다.
"""
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.customer import (
    CommentAttachment,
    CustomAuthUser,
    Managelist,
    ManagelistComment,
    ManagelistDeleteLog,
    MaintenanceAttachment,
    PointHistory,
    Project,
)
from app.models.manager import Manager
from app.services import staff_auth
from app.utils.free_maint import free_maint_state
from app.utils.html_sanitize import sanitize_html

STATUS_PREFIX = {"2": "[알림] ", "3": "[처리중] ", "4": "[완료] "}
WORKER_DISPLAY = {
    "1": "계약담당자", "2": "기획담당자", "3": "디자인담당자",
    "4": "프론트엔드담당자", "5": "백엔드담당자", "6": "유지보수담당자",
}


def lock_managelist(db: Session, seq: int) -> Managelist:
    ml = db.query(Managelist).filter(Managelist.seq == seq).with_for_update().first()
    if ml is None:
        raise HTTPException(status_code=404, detail="유지보수 요청을 찾을 수 없습니다.")
    return ml


def recompute_status(db: Session, ml: Managelist) -> None:
    """cms Managelist.update_status_from_comments 와 같은 규칙: 완료 댓글이 있으면 4, 없고 처리중이 있으면 3."""
    statuses = {str(s) for (s,) in db.query(ManagelistComment.status).filter(ManagelistComment.managelist_id == ml.seq)}
    if "4" in statuses:
        ml.status = "4"
        if not ml.complete_date:
            ml.complete_date = datetime.now()
    elif "3" in statuses:
        ml.status = "3"


def create_request(db: Session, staff: CustomAuthUser, company_id: int, project_id: int | None,
                   writer_seq: int | None, title: str, contents: str, files: list[tuple[str, str]]) -> Managelist:
    """직원이 고객 대신 요청 등록. 무상 유지보수 기간 프로젝트면 is_free_maint."""
    project = None
    if project_id:
        project = db.query(Project).filter(Project.seq == project_id, Project.company_id == company_id).first()
        if project is None:
            raise HTTPException(status_code=400, detail="선택한 회사의 프로젝트가 아닙니다.")
    if writer_seq:
        writer = db.query(Manager).filter(Manager.seq == writer_seq, Manager.company_id == company_id).first()
        if writer is None:
            raise HTTPException(status_code=400, detail="선택한 회사의 고객 담당자가 아닙니다.")
    now = datetime.now()
    ml = Managelist(
        company_id=company_id,
        project_id=project_id,
        writer_id=writer_seq,
        title=title,
        contents=sanitize_html(contents),
        request_date=now,
        status="1",
        points_used=0,
        is_free_maint=bool(project and free_maint_state(project, now.date())["state"] == "free_maint"),
        created_at=now,
        updated_at=now,
    )
    db.add(ml)
    db.flush()
    for path, filename in files:
        db.add(MaintenanceAttachment(managelist_id=ml.seq, file=path, filename=filename, uploaded_at=now))
    return ml


def add_staff_comment(
    db: Session,
    staff: CustomAuthUser,
    ml: Managelist,
    content: str,
    status: str | None,
    point: int,
    request_type: str | None,
    expected_date: date | None,
    parent_id: int | None,
    files: list[tuple[str, str]],
) -> ManagelistComment:
    now = datetime.now()
    if status not in (None, "2", "3", "4"):
        raise HTTPException(status_code=400, detail="상태 값이 올바르지 않습니다.")
    if parent_id:
        parent = db.query(ManagelistComment).filter(
            ManagelistComment.seq == parent_id, ManagelistComment.managelist_id == ml.seq
        ).first()
        if parent is None:
            parent_id = None

    worker_type = str(staff.type) if staff.type else None
    comment = ManagelistComment(
        managelist_id=ml.seq,
        writer_id=staff.id,
        content=STATUS_PREFIX.get(status or "", "") + sanitize_html(content),
        status=status,
        worker_type=worker_type,
        completion_date=expected_date,
        parent_id=parent_id,
        point=0,
        point_executed=False,
        created_at=now,
        updated_at=now,
    )
    db.add(comment)
    db.flush()
    for path, filename in files:
        db.add(CommentAttachment(comment_id=comment.seq, file=path, filename=filename, uploaded_at=now))

    if status == "3" and expected_date:
        ml.completion_date = expected_date
    recompute_status(db, ml)
    if status in ("2", "3", "4"):
        dates = [
            d for (d,) in db.query(ManagelistComment.completion_date).filter(
                ManagelistComment.managelist_id == ml.seq, ManagelistComment.completion_date.isnot(None)
            )
        ]
        if dates:
            ml.completion_date = max(dates)

    # 포인트 책정 — 실행은 별도(execute_points). 무상 유지보수 요청은 책정하지 않는다
    if point and point > 0 and not ml.is_free_maint:
        if not ml.request_type and request_type in ("maint", "dev"):
            ml.request_type = request_type
        project = db.query(Project).filter(Project.seq == ml.project_id).first() if ml.project_id else None
        db.add(PointHistory(
            company_id=ml.company_id,
            project_id=ml.project_id,
            point=-int(point),
            content=f"유지보수 요청: {ml.title}",
            managelist_id=ml.seq,
            comment_id=comment.seq,
            worker_type=worker_type,
            point_type="3",
            status="1",
            point_category="2" if ml.request_type == "dev" else "1",
            contract_date=project.contract_date if project else None,
            contract_termination_date=project.contract_termination_date if project else None,
            writer_id=staff.id,
            created_at=now,
            updated_at=now,
            edited_at=now,
        ))
        comment.point = int(point)

    ml.updated_at = now
    return comment


def execute_points(db: Session, comment_ids: list[int]) -> list[int]:
    """책정 포인트 실행. 댓글·요청 행을 잠가 동시에 눌러도 한 번만 차감된다. 실행된 댓글 id 를 돌려준다."""
    now = datetime.now()
    comments = (
        db.query(ManagelistComment)
        .filter(ManagelistComment.seq.in_(comment_ids))
        .order_by(ManagelistComment.seq)
        .with_for_update()
        .all()
    )
    executed = []
    for c in comments:
        if c.point_executed or not c.point or c.point <= 0:
            continue
        for ph in db.query(PointHistory).filter(PointHistory.comment_id == c.seq, PointHistory.point_type == 3).with_for_update():
            ph.point_type = "2"
            ph.status = "2"
            ph.updated_at = now
            ph.edited_at = now
        ml = lock_managelist(db, c.managelist_id)
        ml.points_used = (ml.points_used or 0) + c.point
        ml.updated_at = now
        c.point_executed = True
        c.updated_at = now
        executed.append(c.seq)
    return executed


def toggle_complete(db: Session, staff: CustomAuthUser, comment: ManagelistComment) -> str:
    """완료 처리 토글(cms complete_managelist_comment). 포인트 행은 건드리지 않는다(실행은 execute_points)."""
    now = datetime.now()
    ml = lock_managelist(db, comment.managelist_id)
    if str(comment.status) == "4":
        comment.status = "3"
        ml.status = "3"
        ml.complete_date = None
    else:
        comment.status = "4"
        wt = str(comment.worker_type) if comment.worker_type else None
        db.add(ManagelistComment(
            managelist_id=ml.seq,
            writer_id=staff.id,
            content=f"[{WORKER_DISPLAY.get(wt, '담당자')}] 완료 처리되었습니다.",
            status="4",
            worker_type=wt,
            point=0,
            point_executed=False,
            completion_date=comment.completion_date,
            created_at=now,
            updated_at=now,
        ))
        ml.status = "4"
        ml.complete_date = now
    comment.updated_at = now
    ml.updated_at = now
    return str(comment.status)


def delete_comment(db: Session, staff: CustomAuthUser, comment: ManagelistComment) -> None:
    if comment.writer_id != staff.id and not staff_auth.is_admin(staff):
        raise HTTPException(status_code=403, detail="본인 댓글만 삭제할 수 있습니다.")
    if comment.point_executed:
        raise HTTPException(status_code=400, detail="포인트가 실행된 댓글은 삭제할 수 없습니다.")
    if db.query(ManagelistComment.seq).filter(ManagelistComment.parent_id == comment.seq).first():
        raise HTTPException(status_code=400, detail="답글이 있는 댓글은 삭제할 수 없습니다.")
    ml = lock_managelist(db, comment.managelist_id)
    # 실행 전 책정 행은 함께 지운다(고아 책정 행 방지)
    db.query(PointHistory).filter(PointHistory.comment_id == comment.seq, PointHistory.status != 2).delete(
        synchronize_session=False)
    db.query(PointHistory).filter(PointHistory.comment_id == comment.seq).update(
        {PointHistory.comment_id: None}, synchronize_session=False)
    db.query(CommentAttachment).filter(CommentAttachment.comment_id == comment.seq).delete(synchronize_session=False)
    db.delete(comment)
    db.flush()
    recompute_status(db, ml)
    ml.updated_at = datetime.now()


def delete_request(db: Session, staff: CustomAuthUser, ml: Managelist) -> None:
    """요청 삭제 — 삭제 로그를 남기고 하위 행을 정리한다(DB FK 가 RESTRICT 라 직접 지운다).
    실행된 포인트가 있으면 장부 보존을 위해 거부."""
    executed = db.query(PointHistory.seq).filter(PointHistory.managelist_id == ml.seq, PointHistory.status == 2).first()
    if (ml.points_used or 0) > 0 or executed:
        raise HTTPException(status_code=400, detail="포인트가 실행된 요청은 삭제할 수 없습니다.")
    now = datetime.now()
    db.add(ManagelistDeleteLog(
        original_seq=ml.seq,
        company_name=(ml.company.name if ml.company else "") or "",
        project_title=ml.project.title if ml.project else None,
        title=ml.title or "",
        contents=ml.contents,
        writer_name=ml.writer.name if ml.writer else None,
        status=str(ml.status or ""),
        points_used=ml.points_used or 0,
        deleted_by_id=staff.id,
        deleted_at=now,
        created_at=ml.created_at,
    ))
    comment_ids = [c for (c,) in db.query(ManagelistComment.seq).filter(ManagelistComment.managelist_id == ml.seq)]
    db.query(PointHistory).filter(PointHistory.managelist_id == ml.seq).delete(synchronize_session=False)
    if comment_ids:
        db.query(CommentAttachment).filter(CommentAttachment.comment_id.in_(comment_ids)).delete(synchronize_session=False)
        db.query(ManagelistComment).filter(ManagelistComment.seq.in_(comment_ids)).delete(synchronize_session=False)
    db.query(MaintenanceAttachment).filter(MaintenanceAttachment.managelist_id == ml.seq).delete(synchronize_session=False)
    db.execute(text("DELETE FROM managelist_log WHERE managelist_id = :id"), {"id": ml.seq})
    db.execute(text("UPDATE Manageworker SET managelist_id = NULL WHERE managelist_id = :id"), {"id": ml.seq})
    db.delete(ml)
