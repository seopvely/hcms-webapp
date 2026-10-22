"""HCMS 데스크탑 앱(macOS) 설치·업데이트 파일 제공 — 로그인 없이 연다.

- GET /api/public/desktop/releases: /desktop/download 페이지가 부르는 최신 DMG 목록(Apple 칩·Intel 칩 각 1개, 없으면 null)
- GET /api/public/desktop/files/<이름>: DESKTOP_RELEASE_DIR 의 DMG·zip·blockmap·latest-mac.yml.
  자동 업데이트(electron-updater generic)의 HCMS_UPDATE_URL 도 이 주소(/api/public/desktop/files)를 쓴다.
파일은 서버에 직접 복사해 올린다(업로드 API 없음). 파일 이름 규칙 밖이거나 폴더 밖은 열지 않는다.
"""
import os
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import settings

router = APIRouter(prefix="/public/desktop", tags=["desktop-releases"])

_NAME = re.compile(r"^(latest-mac\.yml|HCMS-[0-9A-Za-z.\-]+\.(dmg|zip|zip\.blockmap|dmg\.blockmap))$")
_DMG = re.compile(r"^HCMS-(?P<version>\d+(?:\.\d+)*)(?:[-.][0-9A-Za-z.]+)?-(?P<arch>arm64|x64)(?:-[0-9A-Za-z.]+)?\.dmg$")
_MEDIA_TYPES = {".dmg": "application/x-apple-diskimage", ".zip": "application/zip", ".yml": "text/yaml",
                ".blockmap": "application/octet-stream"}


def _version_key(version: str) -> tuple[int, ...]:
    return tuple(int(p) for p in version.split("."))


@router.get("/releases")
def releases():
    """칩별 최신 DMG. 브라우저는 칩 종류를 정확히 알려주지 않아 페이지가 두 버튼을 다 보여 준다."""
    latest: dict[str, dict] = {}
    try:
        names = os.listdir(settings.DESKTOP_RELEASE_DIR)
    except FileNotFoundError:
        names = []
    for name in names:
        m = _DMG.match(name)
        if not m:
            continue
        cur = latest.get(m["arch"])
        if cur and _version_key(cur["version"]) >= _version_key(m["version"]):
            continue
        path = os.path.join(settings.DESKTOP_RELEASE_DIR, name)
        latest[m["arch"]] = {"name": name, "version": m["version"], "size": os.path.getsize(path),
                             "url": f"/api/public/desktop/files/{name}"}
    return {"arm64": latest.get("arm64"), "x64": latest.get("x64")}


@router.get("/files/{name}")
def file(name: str):
    if not _NAME.match(name):
        raise HTTPException(404, "파일이 없습니다.")
    root = os.path.realpath(settings.DESKTOP_RELEASE_DIR)
    path = os.path.realpath(os.path.join(root, name))
    if os.path.dirname(path) != root or not os.path.isfile(path):
        raise HTTPException(404, "파일이 없습니다.")
    ext = ".blockmap" if name.endswith(".blockmap") else os.path.splitext(name)[1]
    # latest-mac.yml 은 바뀌므로 캐시하지 않는다(업데이트 확인이 옛 버전을 보지 않도록)
    headers = {"Cache-Control": "no-cache"} if name == "latest-mac.yml" else None
    return FileResponse(path, media_type=_MEDIA_TYPES[ext], headers=headers,
                        filename=name if ext == ".dmg" else None)
