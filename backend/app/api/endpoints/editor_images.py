"""에디터 본문 이미지 — 업로드(고객·직원)와 공개 제공.

- 업로드: 고객 POST /api/editor-images, 직원 POST /api/managed/editor-images. 20MB 이하 JPEG·PNG·GIF·WEBP·HEIC.
  HEIC/HEIF(아이폰 사진)는 브라우저가 못 보여 줘서 JPEG 로 바꿔 저장한다(pillow-heif).
  Pillow 로 실제 이미지인지 확인하고, GIF 외에는 다시 인코딩한다(EXIF·위치정보 제거, 이미지로 위장한 파일 무력화).
  긴 변이 2400px 를 넘으면 줄인다.
- 제공: GET /api/public/editor-images/YYYY/MM/<uuid>.<ext> — 본문 <img> 는 인증 헤더를 못 보내고 cms·앱에서도
  보여야 해서 공개 경로다. 파일명은 추측할 수 없는 uuid4 이고 이 폴더 밖은 열지 않는다.
- 본문에는 PUBLIC_BASE_URL 로 시작하는 절대 주소가 들어간다(cms·앱에서 같은 HTML 을 보여 주므로).
"""
import io
import os
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.core.config import settings
from app.core.deps import get_current_staff, get_current_user
from app.utils.media import MEDIA_ROOT

PURPOSE = "editor_images"
MAX_BYTES = 20 * 1024 * 1024  # 아이폰 HEIC·고해상도 사진
MAX_SIDE = 2400
_FORMATS = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"), "GIF": ("gif", "image/gif"), "WEBP": ("webp", "image/webp")}
_MEDIA_TYPES = {ext: mt for ext, mt in _FORMATS.values()}
_NAME = re.compile(r"^[0-9a-f]{32}\.(jpg|png|gif|webp)$")

router = APIRouter(tags=["editor-images"])
staff_router = APIRouter(tags=["managed-editor-images"])  # /api/managed 아래(직원 인증은 managed 라우터가 건다)

Image.MAX_IMAGE_PIXELS = 50_000_000  # 압축 폭탄 방지
register_heif_opener()  # Image.open 이 HEIC/HEIF 를 읽게


def save_editor_image(upload: UploadFile) -> dict:
    data = upload.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "이미지가 너무 큽니다(최대 20MB).")
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        img = Image.open(io.BytesIO(data))
        fmt = img.format
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError):
        raise HTTPException(400, "이미지 파일이 아닙니다(JPG·PNG·GIF·WEBP·HEIC).")
    if fmt in ("HEIF", "HEIC"):
        fmt = "JPEG"  # 저장 형식 — 아래에서 다시 인코딩한다
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
    if fmt not in _FORMATS:
        raise HTTPException(400, f"지원하지 않는 이미지 형식입니다({fmt}). JPG·PNG·GIF·WEBP·HEIC 로 올려 주세요.")
    ext, _ = _FORMATS[fmt]

    if fmt == "GIF":
        out = data  # 움직이는 GIF 는 그대로(검증만)
    else:
        img = ImageOps.exif_transpose(img)  # 회전 정보 반영 후 EXIF 를 버린다
        if max(img.size) > MAX_SIDE:
            img.thumbnail((MAX_SIDE, MAX_SIDE))
        if fmt == "JPEG" and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        opts = {"JPEG": {"quality": 85, "optimize": True}, "PNG": {"optimize": True}, "WEBP": {"quality": 85}}[fmt]
        img.save(buf, fmt, **opts)
        out = buf.getvalue()

    now = datetime.now()
    rel_dir = f"{PURPOSE}/{now:%Y}/{now:%m}"
    os.makedirs(os.path.join(MEDIA_ROOT, rel_dir), exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(MEDIA_ROOT, rel_dir, name), "wb") as f:
        f.write(out)
    w, h = Image.open(io.BytesIO(out)).size
    return {"url": f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/public/editor-images/{now:%Y}/{now:%m}/{name}", "width": w, "height": h}


@router.post("/editor-images")
def upload_customer(file: UploadFile = File(...), user=Depends(get_current_user)):
    return save_editor_image(file)


@staff_router.post("/editor-images")
def upload_staff(file: UploadFile = File(...), staff=Depends(get_current_staff)):
    return save_editor_image(file)


@router.get("/public/editor-images/{year}/{month}/{name}")
def serve(year: str, month: str, name: str):
    if not (re.fullmatch(r"\d{4}", year) and re.fullmatch(r"\d{2}", month) and _NAME.fullmatch(name)):
        raise HTTPException(404, "이미지가 없습니다.")
    path = os.path.join(MEDIA_ROOT, PURPOSE, year, month, name)
    if not os.path.isfile(path):
        raise HTTPException(404, "이미지가 없습니다.")
    return FileResponse(path, media_type=_MEDIA_TYPES[name.rsplit(".", 1)[1]],
                        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
