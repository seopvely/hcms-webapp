"""job 공통 — 실행 문맥(dry-run), 발송 선점(job_claim), 메일 발송."""
import logging
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.jobs import JobClaim

logger = logging.getLogger("hcms.jobs")

# 발송 실패한 선점을 다시 잡는 최대 횟수(5분 tick 기준 약 15분)
MAX_SEND_ATTEMPTS = 3


def _failures(result: str | None) -> int:
    if result and result.startswith("failed:"):
        try:
            return int(result.split(":", 1)[1])
        except ValueError:
            return 0
    return 0


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
        """처음 선점한 실행만 True. 발송 실패로 남은 선점은 MAX_SEND_ATTEMPTS 회까지 다시 잡을 수 있다.
        dry-run 은 선점 여부만 확인하고 쓰지 않는다."""
        db, key = self.db, key[:191]
        if self.dry_run:
            row = db.query(JobClaim.result).filter(JobClaim.job == job, JobClaim.claim_key == key).first()
            return row is None or 0 < _failures(row.result) < MAX_SEND_ATTEMPTS
        sp = db.begin_nested()
        try:
            db.add(JobClaim(job=job, claim_key=key, created_at=datetime.now()))
            db.flush()
            sp.commit()
            return True
        except IntegrityError:
            sp.rollback()
        row = db.query(JobClaim.result).filter(JobClaim.job == job, JobClaim.claim_key == key).first()
        n = _failures(row.result) if row else 0
        if not 0 < n < MAX_SEND_ATTEMPTS:
            return False
        # 조건부 UPDATE — 동시에 두 실행이 다시 잡지 못하게
        return db.query(JobClaim).filter(JobClaim.job == job, JobClaim.claim_key == key, JobClaim.result == row.result).update(
            {JobClaim.result: f"retry:{n}"}, synchronize_session=False) == 1

    def mark(self, job: str, key: str, result: str) -> None:
        """선점 결과 기록. 'failed' 는 실패 횟수를 붙여(failed:n) 다음 실행이 다시 보낼 수 있게 하고 바로 커밋한다."""
        if self.dry_run:
            return
        db, key = self.db, key[:191]
        if result == "failed":
            row = db.query(JobClaim.result).filter(JobClaim.job == job, JobClaim.claim_key == key).first()
            prev = row.result if row else None
            n = int(prev.split(":", 1)[1]) if prev and prev.startswith("retry:") else 0
            result = f"failed:{n + 1}"
        db.query(JobClaim).filter(JobClaim.job == job, JobClaim.claim_key == key).update({JobClaim.result: result[:20]},
                                                                                       synchronize_session=False)
        db.commit()

    def send(self, to: list[str], subject: str, html: str, attachments: list[str] | None = None) -> None:
        """실발송(dry-run 이면 기록만). 실패는 예외 — 호출자가 상태를 기록한다."""
        if self.dry_run:
            self.log(f"  (dry-run) 메일 {subject} → {len(to)}명")
            return
        if not attachments:
            from app.services.email import send_email_sync
            send_email_sync(to, subject, html)
            self.db.commit()  # 보낸 건의 선점·기록은 바로 남긴다(뒤에서 예외가 나도 재발송하지 않게)
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
        self.db.commit()  # 보낸 건의 선점·기록은 바로 남긴다


def pre(text: str) -> str:
    """평문 본문을 HTML 메일로(줄바꿈 보존)."""
    from html import escape
    return "<pre style=\"font-family:'Malgun Gothic',sans-serif;white-space:pre-wrap\">" + escape(text) + "</pre>"
