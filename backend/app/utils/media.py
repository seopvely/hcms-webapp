"""첨부 파일 경로 해석 + 인증 다운로드 응답.

DB 의 파일 경로 표기가 섞여 있다(SPEC 09 §6.5):
  1) MEDIA_ROOT 상대경로 (upload_file/..., maintenance_files/YYYY/MM/DD/...)
  2) /home/pacms 상대경로 (bank_files/... 등)
  3) 앞에 'media/' 가 붙은 잘못된 경로
세 가지를 순서대로 찾는다. 허용 루트 밖으로 나가는 경로(../ 등)는 거부한다.
"""
import mimetypes
import os
from urllib.parse import quote

from fastapi import HTTPException
from fastapi.responses import FileResponse

MEDIA_ROOT = "/home/pacms/media"
PACMS_ROOT = "/home/pacms"
_ALLOWED_ROOTS = [os.path.realpath(MEDIA_ROOT), os.path.realpath(PACMS_ROOT)]


def _inside_allowed(path: str) -> bool:
    real = os.path.realpath(path)
    return any(real == root or real.startswith(root + os.sep) for root in _ALLOWED_ROOTS)


def resolve_media_path(stored: str | None) -> str | None:
    if not stored:
        return None
    stored = stored.strip()
    if os.path.isabs(stored):
        candidates = [stored]
    else:
        rel = stored.lstrip("/")
        candidates = [os.path.join(MEDIA_ROOT, rel), os.path.join(PACMS_ROOT, rel)]
        if rel.startswith("media/"):
            candidates.append(os.path.join(MEDIA_ROOT, rel[len("media/"):]))
    for path in candidates:
        if _inside_allowed(path) and os.path.isfile(path):
            return path
    return None


def file_download_response(stored: str | None, filename: str | None = None) -> FileResponse:
    path = resolve_media_path(stored)
    if path is None:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    name = filename or os.path.basename(path)
    content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return FileResponse(
        path=path,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"},
    )


ALLOWED_UPLOAD_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx", "txt", "csv",
    "zip", "rar", "7z", "mp4", "mov",
}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def save_upload(upload, purpose: str) -> tuple[str, str]:
    """업로드 파일을 MEDIA_ROOT/<purpose>/YYYY/MM/<uuid>.<ext> 에 저장하고 (DB 저장용 상대경로, 원본 파일명) 을 돌려준다."""
    import uuid
    from datetime import datetime

    original = os.path.basename(upload.filename or "file")
    ext = os.path.splitext(original)[1].lower().lstrip(".")
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"허용되지 않는 파일 형식입니다: {original}")
    data = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail=f"파일이 너무 큽니다(최대 50MB): {original}")
    now = datetime.now()
    rel_dir = f"{purpose}/{now:%Y}/{now:%m}"
    os.makedirs(os.path.join(MEDIA_ROOT, rel_dir), exist_ok=True)
    rel_path = f"{rel_dir}/{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(MEDIA_ROOT, rel_path), "wb") as f:
        f.write(data)
    return rel_path, original[:255]


def delete_media(stored: str | None) -> None:
    """첨부 실파일 삭제(cms 의 file.delete 와 같은 효과). 경로가 허용 범위 밖이거나 없으면 조용히 넘어간다."""
    path = resolve_media_path(stored)
    if path:
        try:
            os.remove(path)
        except OSError:
            pass
