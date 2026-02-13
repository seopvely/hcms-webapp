import logging

import firebase_admin
from firebase_admin import credentials, messaging

from app.core.config import settings

logger = logging.getLogger(__name__)

_firebase_app = None


def init_firebase():
    """Firebase Admin SDK 초기화. FIREBASE_CREDENTIALS_PATH가 비어있으면 스킵."""
    global _firebase_app
    if _firebase_app:
        return _firebase_app

    if not settings.FIREBASE_CREDENTIALS_PATH:
        logger.warning("FIREBASE_CREDENTIALS_PATH not set. Push notifications disabled.")
        return None

    try:
        cred = credentials.Certificate(settings.FIREBASE_CREDENTIALS_PATH)
        _firebase_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully.")
        return _firebase_app
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {e}")
        return None


def send_push(tokens: list[str], title: str, body: str, data: dict | None = None) -> int:
    """FCM 메시지 전송. 성공한 메시지 수를 반환."""
    if not _firebase_app:
        logger.warning("Firebase not initialized. Skipping push notification.")
        return 0

    if not tokens:
        return 0

    notification = messaging.Notification(title=title, body=body)
    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=notification,
        data={k: str(v) for k, v in data.items()} if data else None,
    )

    try:
        response = messaging.send_each_for_multicast(message)
        logger.info(f"Push sent: {response.success_count} success, {response.failure_count} failure")
        return response.success_count
    except Exception as e:
        logger.error(f"Failed to send push notification: {e}")
        return 0
