"""선택 목록(/api/managed/lookup) — 회사·프로젝트·고객 담당자."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.company import Company
from app.models.customer import Project
from app.models.manager import Manager

router = APIRouter(prefix="/lookup", tags=["managed-lookup"])


@router.get("/companies")
def companies(db: Session = Depends(get_db)):
    rows = db.query(Company.seq, Company.name).order_by(Company.name).all()
    return {"items": [{"id": seq, "name": name} for seq, name in rows]}


@router.get("/projects")
def projects(company_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Project.seq, Project.title, Project.company_id)
    if company_id:
        query = query.filter(Project.company_id == company_id)
    rows = query.order_by(Project.seq.desc()).all()
    return {"items": [{"id": seq, "name": title, "company_id": cid} for seq, title, cid in rows]}


@router.get("/managers")
def managers(company_id: int, db: Session = Depends(get_db)):
    rows = db.query(Manager.seq, Manager.name, Manager.login_id).filter(Manager.company_id == company_id).order_by(Manager.seq).all()
    return {"items": [{"id": seq, "name": f"{name or '-'} ({login_id})"} for seq, name, login_id in rows]}
