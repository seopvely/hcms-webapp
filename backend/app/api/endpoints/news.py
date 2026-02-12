import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.manager import Manager
from app.models.customer import News, news_companies

router = APIRouter(prefix="/news", tags=["news"])


@router.get("")
def list_news(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query("", description="Search in title"),
    category: str = Query("", description="Filter by category"),
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    # News visible to this company:
    # is_published=True AND (no companies assigned OR company in assigned list)
    news_with_company = (
        db.query(News.seq)
        .join(news_companies, news_companies.c.news_id == News.seq)
        .filter(
            News.is_published == True,
            news_companies.c.company_id == company_id,
        )
    )
    news_no_company = (
        db.query(News.seq)
        .outerjoin(news_companies, news_companies.c.news_id == News.seq)
        .filter(
            News.is_published == True,
            news_companies.c.news_id == None,
        )
    )
    visible_ids_subq = news_with_company.union(news_no_company).subquery()

    query = db.query(News).filter(News.seq.in_(db.query(visible_ids_subq)))

    if search:
        query = query.filter(News.title.ilike(f"%{search}%"))

    if category:
        query = query.filter(News.category == category)

    total = query.count()
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    items_db = (
        query.options(joinedload(News.writer))
        .order_by(News.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    items = []
    for n in items_db:
        items.append(
            {
                "id": n.seq,
                "title": n.title,
                "category": n.category,
                "writer_name": n.writer.name if n.writer else None,
                "views": n.views or 0,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
        )

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@router.get("/{news_id}")
def get_news_detail(
    news_id: int,
    current_user: Manager = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id

    # Verify the news is visible to this company
    news_with_company = (
        db.query(News.seq)
        .join(news_companies, news_companies.c.news_id == News.seq)
        .filter(
            News.seq == news_id,
            News.is_published == True,
            news_companies.c.company_id == company_id,
        )
    )
    news_no_company = (
        db.query(News.seq)
        .outerjoin(news_companies, news_companies.c.news_id == News.seq)
        .filter(
            News.seq == news_id,
            News.is_published == True,
            news_companies.c.news_id == None,
        )
    )
    visible = news_with_company.union(news_no_company).first()

    if not visible:
        raise HTTPException(status_code=404, detail="News not found")

    item = (
        db.query(News)
        .options(joinedload(News.writer))
        .filter(News.seq == news_id)
        .first()
    )

    # Increment views
    item.views = (item.views or 0) + 1
    db.commit()
    db.refresh(item)

    return {
        "id": item.seq,
        "title": item.title,
        "content": item.content,
        "category": item.category,
        "writer_name": item.writer.name if item.writer else None,
        "views": item.views,
        "attachment": item.attachment,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }
