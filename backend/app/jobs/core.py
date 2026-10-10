"""job 공통 — 실행 문맥(dry-run), 발송 선점(job_claim), 메일 발송."""
import logging
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.jobs import JobClaim

logger = logging.getLogger("hcms.jobs")


@dataclass
class JobContext:
    db: Session
    now: datetime
    dry_run: bool = False
    lines: list[str] = field(default_factory=list)

    def log(self, msg: str) -> None:
        self.lines.append(msg)
        logger.info(msg)

    def claim(self, job: str, key: str) -> bool:
        """처음 선점한 실행만 True. dry-run 은 선점 여부만 확인하고 쓰지 않는다."""
        db = self.db
        if self.dry_run:
            return not db.query(JobClaim.id).filter(JobClaim.job == job, JobClaim.claim_key == key[:191]).first()
        sp = db.begin_nested()
        try:
            db.add(JobClaim(job=job, claim_key=key[:191], created_at=datetime.now()))
            db.flush()
            sp.commit()
            return True
        except IntegrityError:
            sp.rollback()
            return False

    def mark(self, job: str, key: str, result: str) -> None:
        if not self.dry_run:
            self.db.query(JobClaim).filter(JobClaim.job == job, JobClaim.claim_key == key[:191]).update({JobClaim.result: result[:20]})

    def send(self, to: list[str], subject: str, html: str, attachments: list[str] | None = None) -> None:
        """실발송(dry-run 이면 기록만). 실패는 예외 — 호출자가 상태를 기록한다."""
        if self.dry_run:
            self.log(f"  (dry-run) 메일 {subject} → {len(to)}명")
            return
        if not attachments:
            from app.services.email import send_email_sync
            send_email_sync(to, subject, html)
            return
        import smtplib
        from email.mime.application import MIMEApplication
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        from app.services.email import FROM_EMAIL, FROM_NAME, SMTP_HOST, SMTP_PORT
        msg = MIMEMultipart()
        msg["From"], msg["To"], msg["Subject"] = f"{FROM_NAME} <{FROM_EMAIL}>", ", ".join(to), subject
        msg.attach(MIMEText(html, "html", "utf-8"))
        for p in attachments:
            with open(p, "rb") as fh:
                part = MIMEApplication(fh.read())
            part.add_header("Content-Disposition", "attachment", filename=("utf-8", "", p.rsplit("/", 1)[-1]))
            msg.attach(part)
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as s:
            s.sendmail(FROM_EMAIL, to, msg.as_string())


def pre(text: str) -> str:
    """평문 본문을 HTML 메일로(줄바꿈 보존)."""
    from html import escape
    return "<pre style=\"font-family:'Malgun Gothic',sans-serif;white-space:pre-wrap\">" + escape(text) + "</pre>"
