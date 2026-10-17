"""프로젝트 메모(/api/managed/project-memos) — 직원이 프로젝트에 수동으로 연결해 두는 메모(hcms 전용, cms 에 없음).

한 메모를 여러 프로젝트에 연결할 수 있다. 제목은 직원이 쓰지 않고 저장 뒤 haiku 가 본문에서 뽑는다(services/memo_title). 유지보수·건별작업·프로젝트구축진행 상세 하단 탭(/context)에서 유형별로 거른다.
credential 유형 본문은 목록·탭에서 가리고, /reveal 로 열 때마다 감사 로그를 남긴다.
이미지 첨부는 저장 뒤 haiku 가 글자(또는 설명)를 뽑아 첨부 행에 남기고, 검색이 그 글자·설명까지 찾는다.
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import page_response, require_write, write_enabled
from app.core.deps import get_current_staff
from app.db.session import get_db
from app.models.company import Company
from app.models.customer import CustomAuthUser, Project
from app.models.project_memo import ProjectMemo, ProjectMemoAttachment, ProjectMemoProject
from app.services import memo_title, staff_auth
from app.utils.media import delete_media, file_download_response, save_upload

router = APIRouter(prefix="/project-memos", tags=["managed-project-memos"])
WRITE = require_write("project_memos")

TYPE_LABELS = {
    "info": "정보", "contact": "연락처", "request": "요청", "todo": "해야할일", "credential": "credential", "notice": "안내",
    "minutes": "회의록", "date": "날짜", "insight": "인사이트", "prompt": "프롬프트", "payment_day": "결제일",
    "md": "md 파일", "image": "이미지", "file": "첨부파일",
}
SECRET_TYPES = {"credential"}
MAX_FILES = 20


def _iso(v) -> str | None:
    return v.isoformat() if v else None


def _serialize(db: Session, memos: list[ProjectMemo], reveal: bool = False) -> list[dict]:
    if not memos:
        return []
    ids = [m.seq for m in memos]
    links: dict[int, list[int]] = {}
    for lk in db.query(ProjectMemoProject).filter(ProjectMemoProject.memo_id.in_(ids)):
        links.setdefault(lk.memo_id, []).append(lk.project_id)
    pids = {p for ps in links.values() for p in ps}
    projects = {p.seq: p for p in db.query(Project).filter(Project.seq.in_(pids))} if pids else {}
    cids = {p.company_id for p in projects.values() if p.company_id}
    companies = {c.seq: c.name for c in db.query(Company).filter(Company.seq.in_(cids))} if cids else {}
    files: dict[int, list] = {}
    for f in db.query(ProjectMemoAttachment).filter(ProjectMemoAttachment.memo_id.in_(ids)).order_by(ProjectMemoAttachment.seq):
        files.setdefault(f.memo_id, []).append({
            "id": f.seq, "filename": f.filename, "url": f"/project-memos/files/{f.seq}", "is_image": memo_title.is_image(f.filename),
            "extract_status": f.extract_status, "extract_summary": f.extract_summary, "extracted_text": f.extracted_text})
    uids = {m.created_by_id for m in memos} | {m.updated_by_id for m in memos} | {m.done_by_id for m in memos}
    staff = {u.id: (u.name or u.username) for u in db.query(CustomAuthUser).filter(CustomAuthUser.id.in_(uids - {None}))} if uids - {None} else {}
    out = []
    for m in memos:
        masked = m.memo_type in SECRET_TYPES and not reveal
        out.append({
            "seq": m.seq, "memo_type": m.memo_type, "type_label": TYPE_LABELS.get(m.memo_type, m.memo_type),
            "title": m.title, "title_status": m.title_status, "content": None if masked else m.content, "masked": masked,
            "memo_date": _iso(m.memo_date),
            "is_done": m.done_at is not None, "done_at": _iso(m.done_at), "done_by": staff.get(m.done_by_id),
            "projects": [{"seq": pid, "title": projects[pid].title if pid in projects else f"#{pid}",
                          "company_name": companies.get(projects[pid].company_id) if pid in projects else None}
                         for pid in links.get(m.seq, [])],
            "attachments": [{**f, "extract_summary": None, "extracted_text": None} for f in files.get(m.seq, [])] if masked else files.get(m.seq, []),
            "ai_pending": m.title_status == "pending" or any(f["extract_status"] == "pending" for f in files.get(m.seq, [])),
            "created_by": staff.get(m.created_by_id), "updated_by": staff.get(m.updated_by_id),
            "created_at": _iso(m.created_at), "updated_at": _iso(m.updated_at),
        })
    return out


def _get(db: Session, seq: int) -> ProjectMemo:
    m = db.query(ProjectMemo).filter(ProjectMemo.seq == seq).first()
    if m is None:
        raise HTTPException(status_code=404, detail="메모를 찾을 수 없습니다.")
    return m


@router.get("")
def list_memos(project_id: int | None = None, company_id: int | None = None, memo_type: str | None = None,
               q: str | None = None, unlinked: bool = False, hide_done: bool = False, page: int = 1, per_page: int = 30,
               db: Session = Depends(get_db)):
    page, per_page = max(page, 1), min(max(per_page, 1), 100)
    query = db.query(ProjectMemo)
    if project_id:
        query = query.filter(ProjectMemo.seq.in_(db.query(ProjectMemoProject.memo_id).filter(ProjectMemoProject.project_id == project_id)))
    elif company_id:
        pids = db.query(Project.seq).filter(Project.company_id == company_id)
        query = query.filter(ProjectMemo.seq.in_(db.query(ProjectMemoProject.memo_id).filter(ProjectMemoProject.project_id.in_(pids))))
    elif unlinked:
        query = query.filter(~ProjectMemo.seq.in_(db.query(ProjectMemoProject.memo_id)))
    if q and q.strip():
        like = f"%{q.strip()}%"
        # credential 본문은 검색 대상에서 뺀다(결과 목록으로 비밀값을 추측하지 못하게)
        in_files = db.query(ProjectMemoAttachment.memo_id).filter(or_(
            ProjectMemoAttachment.filename.like(like), ProjectMemoAttachment.extracted_text.like(like), ProjectMemoAttachment.extract_summary.like(like)))
        query = query.filter(or_(ProjectMemo.title.like(like),
                                 (ProjectMemo.content.like(like) | ProjectMemo.seq.in_(in_files)) & ProjectMemo.memo_type.notin_(SECRET_TYPES)))
    # 유형 칩 개수는 유형 필터를 걸기 전 기준
    counts = dict(query.with_entities(ProjectMemo.memo_type, func.count(ProjectMemo.seq)).group_by(ProjectMemo.memo_type).all())
    if memo_type:
        query = query.filter(ProjectMemo.memo_type == memo_type)
    if hide_done:
        query = query.filter(ProjectMemo.done_at.is_(None))
    total = query.count()
    rows = query.order_by(ProjectMemo.updated_at.desc()).offset((page - 1) * per_page).limit(per_page).all()
    items = _serialize(db, rows)
    memo_title.ensure([m["seq"] for m in items if m["ai_pending"]])
    res = page_response(items, total, page, per_page)
    res["types"] = [{"value": k, "label": v, "count": counts.get(k, 0)} for k, v in TYPE_LABELS.items()]
    res["write_enabled"] = write_enabled("project_memos")
    return res


@router.get("/context")
def context_memos(project_id: int | None = None, company_id: int | None = None, db: Session = Depends(get_db)):
    """요청 상세 하단 탭 — 그 요청의 프로젝트에 연결된 메모. 프로젝트가 없는 요청이면 업체의 모든 프로젝트에 연결된 메모."""
    if project_id:
        pids = [project_id]
    elif company_id:
        pids = [p for (p,) in db.query(Project.seq).filter(Project.company_id == company_id)]
    else:
        pids = []
    memos = []
    if pids:
        memos = (db.query(ProjectMemo)
                 .filter(ProjectMemo.seq.in_(db.query(ProjectMemoProject.memo_id).filter(ProjectMemoProject.project_id.in_(pids))))
                 .order_by(ProjectMemo.updated_at.desc()).limit(300).all())
    items = _serialize(db, memos)
    memo_title.ensure([m["seq"] for m in items if m["ai_pending"]])
    return {"items": items, "scope": "project" if project_id else "company",
            "types": [{"value": k, "label": v} for k, v in TYPE_LABELS.items()], "write_enabled": write_enabled("project_memos")}


@router.get("/projects")
def memo_projects(db: Session = Depends(get_db)):
    """메모가 연결된 프로젝트 목록(메모 수) — 목록 화면 왼쪽 프로젝트 색인(초성 필터)."""
    rows = (db.query(ProjectMemoProject.project_id, func.count(ProjectMemoProject.memo_id))
            .group_by(ProjectMemoProject.project_id).all())
    counts = dict(rows)
    projects = db.query(Project).filter(Project.seq.in_(counts)).all() if counts else []
    cids = {p.company_id for p in projects if p.company_id}
    companies = {c.seq: c.name for c in db.query(Company).filter(Company.seq.in_(cids))} if cids else {}
    unlinked = db.query(func.count(ProjectMemo.seq)).filter(~ProjectMemo.seq.in_(db.query(ProjectMemoProject.memo_id))).scalar() or 0
    items = [{"seq": p.seq, "title": p.title or f"#{p.seq}", "company_id": p.company_id, "company_name": companies.get(p.company_id),
              "count": counts.get(p.seq, 0)} for p in projects]
    items.sort(key=lambda x: (x["title"] or ""))
    return {"items": items, "unlinked": unlinked, "total": db.query(func.count(ProjectMemo.seq)).scalar() or 0}


@router.get("/files/{file_id}")
def download_file(file_id: int, request: Request, inline: bool = False, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    f = db.query(ProjectMemoAttachment).filter(ProjectMemoAttachment.seq == file_id).first()
    if f is None:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다.")
    m = _get(db, f.memo_id)
    if m.memo_type in SECRET_TYPES:
        staff_auth.audit(db, request, "project_memo_file_download", user_id=staff.id, target=f"project_memo:{m.seq}", detail=f.filename)
        db.commit()
    resp = file_download_response(f.file_path, f.filename)
    if inline and memo_title.is_image(f.filename):  # 썸네일·새 탭 보기(래스터 이미지만 — svg 는 내려받기)
        resp.headers["Content-Disposition"] = resp.headers["Content-Disposition"].replace("attachment;", "inline;", 1)
    return resp


class ExtractBody(BaseModel):
    extract_summary: str = ""
    extracted_text: str = ""


@router.post("/files/{file_id}/extract", dependencies=[WRITE])
def edit_extract(file_id: int, body: ExtractBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """이미지 분석 결과 직접 수정 — status=edited 는 "AI 다시 분석" 이 덮어쓰지 않는다. 제목은 고친 내용으로 다시 뽑는다."""
    f = db.query(ProjectMemoAttachment).filter(ProjectMemoAttachment.seq == file_id).first()
    if f is None or not memo_title.is_image(f.filename):
        raise HTTPException(status_code=404, detail="이미지 첨부를 찾을 수 없습니다.")
    m = _get(db, f.memo_id)
    if m.memo_type in SECRET_TYPES:
        raise HTTPException(status_code=400, detail="credential 메모의 이미지는 분석 내용을 두지 않습니다.")
    f.extract_summary = body.extract_summary.strip()[:500] or None
    f.extracted_text = body.extracted_text.strip()[:memo_title.EXTRACT_TEXT_MAX] or None
    f.extract_status = "edited"
    db.query(ProjectMemo).filter(ProjectMemo.seq == m.seq).update(
        {ProjectMemo.title_status: "pending", ProjectMemo.updated_at: ProjectMemo.updated_at}, synchronize_session=False)
    staff_auth.audit(db, request, "project_memo_extract_edit", user_id=staff.id, target=f"project_memo:{m.seq}", detail=f"attachment={file_id}")
    db.commit()
    memo_title.enqueue(m.seq)
    return {"ok": True}


@router.get("/{seq}")
def get_memo(seq: int, db: Session = Depends(get_db)):
    return _serialize(db, [_get(db, seq)])[0]


@router.post("/{seq}/reveal")
def reveal_memo(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """credential 본문 보기 — 열 때마다 감사 로그."""
    m = _get(db, seq)
    if m.memo_type in SECRET_TYPES:
        staff_auth.audit(db, request, "project_memo_reveal", user_id=staff.id, target=f"project_memo:{seq}")
        db.commit()
    return {"content": m.content}


def _parse_project_ids(db: Session, raw: str) -> list[int]:
    ids = []
    for part in (raw or "").split(","):
        part = part.strip()
        if part.isdigit() and int(part) not in ids:
            ids.append(int(part))
    if ids:
        found = {p for (p,) in db.query(Project.seq).filter(Project.seq.in_(ids))}
        missing = [i for i in ids if i not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"없는 프로젝트입니다: {', '.join(map(str, missing))}")
    return ids


def _apply(db: Session, m: ProjectMemo, memo_type: str, content: str, memo_date: str | None) -> None:
    if memo_type not in TYPE_LABELS:
        raise HTTPException(status_code=400, detail="메모 유형을 확인하세요.")
    m.memo_type = memo_type
    if memo_type != "todo":
        m.done_at = m.done_by_id = None
    m.content = content or ""
    try:
        m.memo_date = date.fromisoformat(memo_date) if memo_date else None
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식을 확인하세요(YYYY-MM-DD).")


def _require_image(db: Session, m: ProjectMemo) -> None:
    """이미지 유형은 이미지 첨부가 하나 이상 있어야 한다(flush 뒤 호출)."""
    if m.memo_type != "image":
        return
    names = [n for (n,) in db.query(ProjectMemoAttachment.filename).filter(ProjectMemoAttachment.memo_id == m.seq)]
    if not any(memo_title.is_image(n) for n in names):
        raise HTTPException(status_code=400, detail="이미지 유형은 이미지 파일(jpg·png·gif·webp·heic 등)을 하나 이상 첨부하세요.")


def _mark_pending(db: Session, m: ProjectMemo) -> None:
    """규칙 제목을 넣고 AI 제목 대기로 둔다(커밋 뒤 memo_title.enqueue)."""
    db.flush()
    names = [n for (n,) in db.query(ProjectMemoAttachment.filename).filter(ProjectMemoAttachment.memo_id == m.seq).order_by(ProjectMemoAttachment.seq)]
    pids = [p for (p,) in db.query(ProjectMemoProject.project_id).filter(ProjectMemoProject.memo_id == m.seq)]
    titles = [t for (t,) in db.query(Project.title).filter(Project.seq.in_(pids)) if t] if pids else []
    m.title = memo_title.fallback_title(m.memo_type, TYPE_LABELS[m.memo_type], m.content, names, titles)
    m.title_status = "pending"


def _set_links(db: Session, memo_id: int, project_ids: list[int]) -> None:
    current = {lk.project_id: lk for lk in db.query(ProjectMemoProject).filter(ProjectMemoProject.memo_id == memo_id)}
    for pid, lk in current.items():
        if pid not in project_ids:
            db.delete(lk)
    for pid in project_ids:
        if pid not in current:
            db.add(ProjectMemoProject(memo_id=memo_id, project_id=pid))


def _save_files(db: Session, memo_id: int, files: list[UploadFile]) -> list[str]:
    saved = []
    try:
        for f in files:
            if f and f.filename:
                path, name = save_upload(f, "project_memo")
                saved.append(path)
                db.add(ProjectMemoAttachment(memo_id=memo_id, file_path=path, filename=name, created_at=datetime.now(),
                                             extract_status="pending" if memo_title.is_image(name) else None))
    except HTTPException:
        for p in saved:
            delete_media(p)
        raise
    return saved


@router.post("", dependencies=[WRITE])
def create_memo(request: Request, memo_type: str = Form(...), content: str = Form(""),
                memo_date: str | None = Form(None), project_ids: str = Form(""), files: list[UploadFile] = File([]),
                staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"첨부는 한 번에 {MAX_FILES}개까지입니다.")
    pids = _parse_project_ids(db, project_ids)
    now = datetime.now()
    m = ProjectMemo(title="", created_by_id=staff.id, updated_by_id=staff.id, created_at=now, updated_at=now)
    _apply(db, m, memo_type, content, memo_date)
    if not (m.content.strip() or any(f and f.filename for f in files) or m.memo_date):
        raise HTTPException(status_code=400, detail="본문이나 첨부파일을 넣으세요(제목은 AI 가 본문에서 뽑습니다).")
    db.add(m)
    db.flush()
    _set_links(db, m.seq, pids)
    saved = _save_files(db, m.seq, files)
    try:
        db.flush()
        _require_image(db, m)
    except HTTPException:
        db.rollback()
        for p in saved:
            delete_media(p)
        raise
    _mark_pending(db, m)
    staff_auth.audit(db, request, "project_memo_create", user_id=staff.id, target=f"project_memo:{m.seq}",
                     detail=f"{memo_type} projects={','.join(map(str, pids))}")
    try:
        db.commit()
    except Exception:
        for p in saved:
            delete_media(p)
        raise
    memo_title.enqueue(m.seq)
    return {"seq": m.seq}


@router.post("/{seq}", dependencies=[WRITE])
def update_memo(seq: int, request: Request, memo_type: str = Form(...), content: str | None = Form(None),
                memo_date: str | None = Form(None), project_ids: str = Form(""), remove_file_ids: str = Form(""),
                files: list[UploadFile] = File([]), staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """content 를 보내지 않으면(None) 본문은 그대로 둔다 — 가려진 credential 을 열지 않고 다른 칸만 고칠 때."""
    m = _get(db, seq)
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"첨부는 한 번에 {MAX_FILES}개까지입니다.")
    pids = _parse_project_ids(db, project_ids)
    before = (m.memo_type, m.content or "", sorted(p for (p,) in db.query(ProjectMemoProject.project_id).filter(ProjectMemoProject.memo_id == seq)))
    _apply(db, m, memo_type, m.content if content is None else content, memo_date)
    m.updated_by_id = staff.id
    m.updated_at = datetime.now()
    _set_links(db, seq, pids)
    remove_ids = [int(x) for x in remove_file_ids.split(",") if x.strip().isdigit()]
    removed = []
    if remove_ids:
        for f in db.query(ProjectMemoAttachment).filter(ProjectMemoAttachment.memo_id == seq, ProjectMemoAttachment.seq.in_(remove_ids)):
            removed.append(f.file_path)
            db.delete(f)
    saved = _save_files(db, seq, files)
    db.flush()
    if not ((m.content or "").strip() or m.memo_date or db.query(ProjectMemoAttachment.seq).filter(ProjectMemoAttachment.memo_id == seq).first()):
        db.rollback()
        for p in saved:
            delete_media(p)
        raise HTTPException(status_code=400, detail="본문이나 첨부파일을 넣으세요(제목은 AI 가 본문에서 뽑습니다).")
    try:
        _require_image(db, m)
    except HTTPException:
        db.rollback()
        for p in saved:
            delete_media(p)
        raise
    # 유형·본문·첨부·연결이 바뀌었을 때만 제목을 다시 뽑는다
    retitle = before != (m.memo_type, m.content or "", sorted(pids)) or bool(removed) or bool(saved)
    if retitle:
        _mark_pending(db, m)
    staff_auth.audit(db, request, "project_memo_update", user_id=staff.id, target=f"project_memo:{seq}",
                     detail=f"{memo_type} projects={','.join(map(str, pids))}")
    try:
        db.commit()
    except Exception:
        for p in saved:
            delete_media(p)
        raise
    for p in removed:
        delete_media(p)
    if retitle:
        memo_title.enqueue(seq)
    return {"ok": True}


class DoneBody(BaseModel):
    done: bool


@router.post("/{seq}/done", dependencies=[WRITE])
def set_done(seq: int, body: DoneBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """해야할일 완료 체크(목록 순서가 바뀌지 않게 updated_at 은 그대로)."""
    m = _get(db, seq)
    if m.memo_type != "todo":
        raise HTTPException(status_code=400, detail="해야할일 메모만 완료 체크할 수 있습니다.")
    values = {ProjectMemo.done_at: datetime.now() if body.done else None, ProjectMemo.done_by_id: staff.id if body.done else None,
              ProjectMemo.updated_at: ProjectMemo.updated_at}
    db.query(ProjectMemo).filter(ProjectMemo.seq == seq).update(values, synchronize_session=False)
    staff_auth.audit(db, request, "project_memo_done" if body.done else "project_memo_undone", user_id=staff.id, target=f"project_memo:{seq}")
    db.commit()
    return {"ok": True}


@router.post("/{seq}/retitle", dependencies=[WRITE])
def retitle_memo(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    """AI 다시 분석 — 이미지 첨부 분석 + 제목(목록 순서가 바뀌지 않게 updated_at 은 그대로)."""
    _get(db, seq)
    for f in db.query(ProjectMemoAttachment).filter(ProjectMemoAttachment.memo_id == seq):
        if memo_title.is_image(f.filename) and f.extract_status != "edited":  # 직접 고친 결과는 그대로
            f.extract_status = "pending"
    db.query(ProjectMemo).filter(ProjectMemo.seq == seq).update(
        {ProjectMemo.title_status: "pending", ProjectMemo.updated_at: ProjectMemo.updated_at}, synchronize_session=False)
    staff_auth.audit(db, request, "project_memo_retitle", user_id=staff.id, target=f"project_memo:{seq}")
    db.commit()
    memo_title.enqueue(seq)
    return {"ok": True}


@router.post("/{seq}/delete", dependencies=[WRITE])
def delete_memo(seq: int, request: Request, staff: CustomAuthUser = Depends(get_current_staff), db: Session = Depends(get_db)):
    m = _get(db, seq)
    paths = [f.file_path for f in db.query(ProjectMemoAttachment).filter(ProjectMemoAttachment.memo_id == seq)]
    db.query(ProjectMemoAttachment).filter(ProjectMemoAttachment.memo_id == seq).delete(synchronize_session=False)
    db.query(ProjectMemoProject).filter(ProjectMemoProject.memo_id == seq).delete(synchronize_session=False)
    db.delete(m)
    staff_auth.audit(db, request, "project_memo_delete", user_id=staff.id, target=f"project_memo:{seq}", detail=m.title[:200])
    db.commit()
    for p in paths:
        delete_media(p)
    return {"ok": True}
