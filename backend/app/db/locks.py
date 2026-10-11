"""MySQL 이름 잠금(GET_LOCK)으로 '번호 생성 → INSERT → 커밋'을 직렬화한다.

번호 컬럼에 DB UNIQUE 가 없어서(pacms 마이그레이션 인계) 동시 생성 시 같은 번호가 나올 수 있다.
잠금은 세션과 다른 전용 연결에 잡고, 세션 트랜잭션이 끝나면(커밋·롤백·close) 푼다.
"""
from fastapi import HTTPException
from sqlalchemy import event, text
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, engine

_KEY = "hcms_named_locks"


def hold_lock(db: Session, name: str, timeout: int = 10) -> None:
    held = db.info.setdefault(_KEY, {})
    if name in held:
        return
    db.connection()  # 세션 트랜잭션을 먼저 시작해 둬야 끝날 때 _release 가 불린다
    conn = engine.connect()
    try:
        got = conn.execute(text("SELECT GET_LOCK(:n, :t)"), {"n": name, "t": timeout}).scalar()
    except Exception:
        conn.close()
        raise
    if not got:
        conn.close()
        raise HTTPException(status_code=503, detail="다른 작업이 번호를 만드는 중입니다. 잠시 후 다시 시도해 주세요.")
    held[name] = conn


@event.listens_for(SessionLocal, "after_transaction_end")
def _release(session: Session, transaction) -> None:
    if transaction.parent is not None:
        return
    for name, conn in session.info.pop(_KEY, {}).items():
        try:
            conn.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": name})
        finally:
            conn.close()
