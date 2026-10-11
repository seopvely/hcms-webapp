import uuid
from datetime import datetime

from passlib.hash import django_pbkdf2_sha256
from sqlalchemy.orm import Session

from app.models.manager import Manager


def verify_django_password(plain_password: str, hashed_password: str) -> bool:
    """Django의 pbkdf2_sha256 해시된 비밀번호를 검증합니다."""
    if not hashed_password:
        return False
    return django_pbkdf2_sha256.verify(plain_password, hashed_password)


# Django 기본(870000회)과 같은 강도 — passlib 기본값(29000회)으로 저장하지 않는다(SPEC 12 L8)
PASSWORD_ROUNDS = 870000


def hash_django_password(plain_password: str) -> str:
    """Django의 pbkdf2_sha256 형식으로 비밀번호를 해시합니다."""
    return django_pbkdf2_sha256.using(rounds=PASSWORD_ROUNDS).hash(plain_password)


def _weak_hash(hashed: str) -> bool:
    try:
        return int(hashed.split("$")[1]) < PASSWORD_ROUNDS
    except (IndexError, ValueError):
        return False


def authenticate_manager(db: Session, login_id: str, password: str, company_id: int | None = None) -> Manager | None:
    """Manager를 인증합니다. pacms customer login 로직과 동일."""
    query = db.query(Manager).filter(Manager.login_id == login_id)
    if company_id is not None:
        query = query.filter(Manager.company_id == company_id)
    manager = query.first()
    if not manager:
        return None

    # 로그인 차단 확인
    if manager.login_permit_tf == "2":
        raise PermissionError("로그인이 차단되었습니다. 관리자에게 문의하세요.")

    # 비밀번호 검증
    if not verify_django_password(password, manager.password):
        # 로그인 실패 시 시도 횟수 증가
        manager.login_attempt_count = (manager.login_attempt_count or 0) + 1

        # 5회 이상 실패 시 계정 잠금
        if manager.login_attempt_count >= 5:
            manager.login_permit_tf = "2"
            db.commit()
            raise PermissionError(
                "로그인 시도 5회 실패로 계정이 잠금되었습니다. 관리자에게 문의하세요."
            )

        db.commit()
        raise ValueError("아이디 또는 비밀번호가 일치하지 않습니다.")

    # 로그인 성공: 시도 횟수 초기화. login_permit_tf 는 관리자가 정한 값을 그대로 둔다(SPEC A4/D5)
    manager.login_attempt_count = 0
    if _weak_hash(manager.password):
        manager.password = hash_django_password(password)
    manager.last_login = datetime.now()
    manager.customer_key = uuid.uuid4().hex
    db.commit()
    db.refresh(manager)

    return manager
