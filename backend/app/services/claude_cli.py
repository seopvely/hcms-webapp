"""서버의 `claude -p` CLI 실행 — 견적·계약 AI 초안(cms managed/claude_cli.py 를 줄여 옮김).

- 인증은 hcms 계정의 claude.ai 구독 로그인(~/.claude/.credentials.json)을 그대로 쓴다. 만료되면
  서버에서 hcms 계정으로 `claude` 를 한 번 실행해 다시 로그인해야 한다.
- 격리: 도구 없음(`--tools ""`), MCP·설정 파일 미사용, 세션 저장 안 함, 빈 작업 디렉터리(CLAUDE.md 를 줍지 않게).
- 프롬프트는 stdin 으로만 넘긴다(명령행 인자 금지). 명령행에 들어가는 모델·system 은 정규화·정리 후 쓴다.
- 예외를 밖으로 던지지 않고 결과 dict 를 돌려준다.
"""
import json
import logging
import os
import subprocess
import tempfile
import time

from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL_ALIASES = ("opus", "sonnet", "haiku")
DEFAULT_MODEL = "sonnet"
SYSTEM_PROMPT_MAX = 8000
_CWD = os.path.join(tempfile.gettempdir(), "hcms-ai-cwd")


def normalize_model(model: str | None) -> str:
    """'claude-haiku-4-5' → 'haiku', 모르면 sonnet."""
    text = (model or "").strip().lower()
    return next((a for a in MODEL_ALIASES if a in text), DEFAULT_MODEL)


def sanitize_system_prompt(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = "".join(ch for ch in str(text) if ch in "\n\t" or (ord(ch) >= 32 and ord(ch) != 127)).strip()[:SYSTEM_PROMPT_MAX]
    if not cleaned:
        return None
    return " " + cleaned if cleaned.startswith("-") else cleaned  # 옵션으로 오인되지 않게


def _env() -> dict:
    home = os.path.expanduser("~")
    return {"HOME": home, "PATH": f"{home}/.local/bin:/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8", "DISABLE_AUTOUPDATER": "1"}


def _error(message: str, elapsed_ms: int = 0, auth: bool = False) -> dict:
    return {"ok": False, "result": "", "error": message, "auth_error": auth, "duration_ms": elapsed_ms, "num_turns": 0, "cost_usd": 0.0}


def _is_auth_error(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ("login", "log in", "oauth", "authenticat", "credential", "api key", "401"))


def run_claude(prompt: str, *, model: str | None = None, system_prompt: str | None = None, timeout: int = 150) -> dict:
    """`claude -p` 1회 실행. 반환: {ok, result, error, auth_error, duration_ms, num_turns, cost_usd}"""
    argv = [settings.AI_CLI_BIN, "-p", "--output-format", "json", "--model", normalize_model(model),
            "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"]
    system_text = sanitize_system_prompt(system_prompt)
    if system_text:
        argv += ["--system-prompt", system_text]
    os.makedirs(_CWD, mode=0o700, exist_ok=True)

    started = time.monotonic()
    try:
        proc = subprocess.run(argv, input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=timeout, cwd=_CWD, env=_env())
    except FileNotFoundError:
        return _error("서버에 claude CLI 가 없습니다.")
    except subprocess.TimeoutExpired:
        return _error(f"AI 응답 시간이 초과되었습니다({timeout}초).", int((time.monotonic() - started) * 1000))
    except Exception as e:  # noqa: BLE001
        logger.warning("claude CLI 실행 예외: %s", e)
        return _error("AI 실행 중 오류가 발생했습니다.")
    elapsed_ms = int((time.monotonic() - started) * 1000)

    try:
        payload = json.loads(proc.stdout or "")
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        detail = ((proc.stderr or "") + (proc.stdout or "")).strip()[-500:]
        logger.warning("claude CLI 응답 해석 실패(exit=%s): %s", proc.returncode, detail[:300])
        return _error(detail or "AI 응답을 해석할 수 없습니다.", elapsed_ms, _is_auth_error(detail))

    result = payload.get("result") or ""
    ok = proc.returncode == 0 and not payload.get("is_error") and (payload.get("subtype") or "success") == "success"
    out = {"ok": ok, "result": result if ok else "", "error": "", "auth_error": False,
           "duration_ms": int(payload.get("duration_ms") or elapsed_ms), "num_turns": int(payload.get("num_turns") or 0),
           "cost_usd": float(payload.get("total_cost_usd") or 0.0)}
    if not ok:
        detail = (result or proc.stderr or "").strip()[-500:]
        out["error"] = detail or f"AI 실행 실패(exit={proc.returncode})"
        out["auth_error"] = _is_auth_error(detail)
        logger.warning("claude CLI 오류 응답(exit=%s): %s", proc.returncode, out["error"][:300])
    return out


def _strip_fences(text: str) -> str:
    return str(text or "").replace("```json", "").replace("```", "").strip()


def extract_json_array(text: str) -> list:
    """응답에서 첫 JSON 배열. 잘린 응답이면 마지막 완성 객체까지 살린다. 실패 시 []."""
    cleaned = _strip_fences(text)
    start = cleaned.find("[")
    if start == -1:
        return []
    try:
        data, _ = json.JSONDecoder().raw_decode(cleaned[start:])
        return data if isinstance(data, list) else []
    except ValueError:
        pass  # 잘린 응답 — 아래에서 복구
    depth, json_str = 0, None
    for i in range(start, len(cleaned)):
        if cleaned[i] == "[":
            depth += 1
        elif cleaned[i] == "]":
            depth -= 1
        if depth == 0:
            json_str = cleaned[start:i + 1]
            break
    if json_str is None:
        partial = cleaned[start:]
        last = partial.rfind("}")
        if last == -1:
            return []
        json_str = partial[:last + 1] + "]"
    try:
        data = json.loads(json_str)
    except ValueError:
        return []
    return data if isinstance(data, list) else []


def extract_json_object(text: str) -> dict:
    """응답에서 첫 JSON 객체(문자열 안의 중괄호는 건너뜀). 실패 시 {}."""
    cleaned = _strip_fences(text)
    start = cleaned.find("{")
    if start == -1:
        return {}
    try:
        data, _ = json.JSONDecoder().raw_decode(cleaned[start:])
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}
