"""견적·계약 AI 초안 + 미팅 장소 찾기 (/api/managed/ai) — 서버 claude CLI 실행(services/claude_cli). D18 = 로컬 CLI(10-12 결정).

- 실행이 15~60초 걸려 외부 nginx 타임아웃을 피하려고 작업을 시작(POST)하고 결과를 조회(GET /ai/jobs/{id})한다.
  uvicorn 단일 워커라 작업 상태는 메모리에 둔다(재시작하면 사라짐 — 다시 실행하면 됨).
- DB 에는 쓰지 않는다: 결과는 화면의 작성 표·칸에 채워지고, 저장은 기존 저장 버튼(쓰기 영역 스위치)으로 한다.
  예외로 템플릿 사용횟수는 ai_prompts 쓰기 영역이 켜져 있을 때만 올린다.
- 감사 로그에는 모델·소요시간 등만 남기고 프롬프트·응답(고객 정보)은 남기지 않는다.
"""
import re
import threading
import time
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.endpoints.managed.common import write_enabled
from app.api.endpoints.managed.estimates import PROJECT_TYPES
from app.core.config import settings
from app.core.deps import get_current_staff
from app.db.session import SessionLocal, get_db
from app.models.customer import CustomAuthUser, Estimate, EstimateContract, EstimateItem
from app.models.worktools import AIPromptTemplate
from app.services import claude_cli, place_geo
from app.services.staff_auth import audit

router = APIRouter(prefix="/ai", tags=["managed-ai"])

MAX_RUNNING = 2          # 동시에 도는 CLI 수
JOB_TTL = 15 * 60        # 끝난 작업을 들고 있는 시간(초)
RUN_TIMEOUT = 150        # CLI 1회 제한(초)
PROMPT_TEXT_MAX = 40000  # 화면에서 고친 템플릿 원문 최대 길이
NO_TOOLS = "\n\n(도구를 사용하지 말고 바로 답하세요.)"
_jobs: dict[str, dict] = {}
_lock = threading.Lock()
_slots = threading.BoundedSemaphore(MAX_RUNNING)

DEFAULT_ESTIMATE_PROMPT = """당신은 IT 프로젝트 견적 전문가입니다. 아래 요구사항을 분석하여 견적 항목을 JSON 배열로 생성해주세요.

프로젝트 정보:
- 견적 제목: {estimateTitle}
- 업체명: {companyName}
- 견적 유형: {estimateType}

요구사항:
{requirements}

반드시 아래 JSON 형식으로만 응답해주세요. 다른 텍스트는 포함하지 마세요.
[{"category": "분류명", "item_name": "항목명", "specification": "상세 규격", "quantity": 숫자, "unit": "식|페이지|개월|시간|일|개|건|회|년", "unit_price": 숫자(원)}]

주의사항:
1. 단가는 한국 IT 업계 시장 평균 기준으로 현실적인 금액을 제시하세요
2. 분류를 명확하게 구분하세요 (기획/디자인/퍼블리싱/프론트엔드/백엔드/인프라/유지보수 등)
3. 항목은 가능한 세분화하여 구체적으로 작성하세요
4. JSON 형식만 반환하세요"""

DEFAULT_CONTRACT_PROMPT = """당신은 IT 프로젝트 계약서 작성 전문가입니다. 아래 계약 정보를 바탕으로 계약서 조항을 작성해주세요.

[계약 정보]
- 계약명: {contractTitle}
- 프로젝트 유형: {projectTypeName}
- 프로젝트 내용: {projectDescription}
- 고객사(갑): {companyName}
- 계약금액: {contractAmount}원
- 계약기간: {contractPeriod}
- 유지보수 포인트: {maintenancePoint}P/월
- 무상 유지보수: {freeMaintenance}
- 견적 내용: {estimateContent}
- 견적 항목: {itemsDescription}

[작성 규칙]
- 4개 항목을 || 로 구분: 프로젝트 내용 || 서비스 범위 || 대금 지급 조건 || 특약사항
- 마크다운·번호 제목 없이 순수 텍스트. 특약에 특별한 사항이 없으면 "해당 없음".
- 무상 유지보수가 있으면 특약에 기간·범위, 무상 기간 중 포인트 미차감, 범위 밖 작업은 별도 협의를 넣으세요.

[출력 형식]
프로젝트 내용 텍스트||서비스 범위 텍스트||대금 지급 조건 텍스트||특약사항 텍스트"""

CONTRACT_KEYS = ("project_description", "service_scope", "payment_terms", "special_terms")
# 모델이 각 칸 앞에 붙이는 머리말("프로젝트 내용:", "1. 서비스 범위 -" 등)
_HEAD = re.compile(r"^\s*(?:\d+[.)]\s*)?\[?(?:프로젝트\s*내용|서비스\s*범위|대금\s*지급\s*조건|지불\s*조건|특약\s*사항|특약)\]?\s*[:：\-]\s*")


def _fill(template: str, values: dict[str, str]) -> str:
    """{변수} 치환 — 템플릿의 JSON 예시 중괄호가 깨지지 않게 str.format 을 쓰지 않는다."""
    for k, val in values.items():
        template = template.replace("{" + k + "}", val)
    return template


def _won(v) -> str:
    try:
        return f"{int(v):,}"
    except (TypeError, ValueError):
        return str(v or "미정")


def _template(db: Session, prompt_id: int | None, kind: str) -> AIPromptTemplate | None:
    q = db.query(AIPromptTemplate).filter(AIPromptTemplate.is_active == True)  # noqa: E712
    if prompt_id:
        return q.filter(AIPromptTemplate.seq == prompt_id).first()
    if kind == "estimate":
        return q.filter(AIPromptTemplate.is_default == True).first()  # noqa: E712
    # 계약: 이름에 '계약' 이 들어간 최신 템플릿(cms 계약서 AI 자동완성)
    return q.filter(AIPromptTemplate.name.like("%계약%")).order_by(AIPromptTemplate.updated_at.desc()).first()


def _preview(prompt: str, source: str, tpl: AIPromptTemplate | None, fallback_model: str | None = None) -> dict:
    return {"prompt": prompt, "template": source, "prompt_id": tpl.seq if tpl else None, "prompt_name": tpl.name if tpl else "내장 기본 프롬프트",
            "model": claude_cli.normalize_model(tpl.claude_model if tpl else fallback_model)}


def _edited(text: str | None) -> str:
    """화면에서 고친 템플릿 원문(앞뒤 공백 정리). 없으면 ''."""
    return (text or "").strip()


def _prompt_name(tpl: AIPromptTemplate | None, edited: str) -> str:
    return (tpl.name if tpl else "내장 기본 프롬프트") + (" (수정함)" if edited else "")


def _gc() -> None:
    now = time.time()
    for k in [k for k, j in _jobs.items() if j["status"] != "running" and now - j["finished"] > JOB_TTL]:
        _jobs.pop(k, None)


def _start(staff: CustomAuthUser, kind: str, target: str, prompt: str, model: str | None, parse, prompt_id: int | None, ip_request: Request,
           tools: list[str] | None = None, timeout: int = RUN_TIMEOUT, prepare=None) -> dict:
    """prepare(): 작업 스레드에서 CLI 전에 한 번 — (바로 끝낼 결과 | None, 프롬프트에 덧붙일 문맥) 을 돌려준다."""
    if not settings.AI_ENABLED:
        raise HTTPException(503, "AI 기능이 꺼져 있습니다(AI_ENABLED).")
    if not _slots.acquire(blocking=False):
        raise HTTPException(429, "다른 AI 작업이 진행 중입니다. 잠시 후 다시 시도하세요.")
    job_id = uuid.uuid4().hex
    m = claude_cli.normalize_model(model)
    with _lock:
        _gc()
        _jobs[job_id] = {"staff_id": staff.id, "kind": kind, "status": "running", "model": m, "started": time.time(), "finished": 0.0}
    ip = ip_request  # 감사 로그의 IP·UA (요청이 끝난 뒤에도 헤더는 읽힌다)

    def work():
        try:
            t0 = time.monotonic()
            early, extra = prepare() if prepare else (None, "")
            if early:
                r = {"duration_ms": int((time.monotonic() - t0) * 1000), "num_turns": 0, "cost_usd": 0.0}
                out: dict = {"status": "done", "data": early, "duration_ms": r["duration_ms"]}
            else:
                r = claude_cli.run_claude(prompt + extra, model=m, timeout=timeout, tools=tools)
                out = {"status": "error", "duration_ms": r["duration_ms"]}
                if not r["ok"]:
                    out["error"] = ("서버의 claude 로그인이 만료됐거나 인증에 실패했습니다. 관리자에게 알려 주세요."
                                    if r["auth_error"] else (r["error"] or "AI 분석에 실패했습니다.")[-300:])
                else:
                    try:
                        data = parse(r["result"])
                        out.update(status="done", data=data, raw=r["result"][-20000:])
                    except ValueError as e:
                        out.update(error=str(e), raw=r["result"][-2000:])
            db = SessionLocal()
            try:
                audit(db, ip, f"ai.{kind}", staff.id, target=target,
                      detail=f"model={'-' if early else m} ok={out['status'] == 'done'} ms={r['duration_ms']} turns={r['num_turns']} cost={r['cost_usd']:.4f}")
                if prompt_id and out["status"] == "done" and write_enabled("ai_prompts"):
                    db.query(AIPromptTemplate).filter(AIPromptTemplate.seq == prompt_id).update(
                        {AIPromptTemplate.usage_count: AIPromptTemplate.usage_count + 1}, synchronize_session=False)
                db.commit()
            except Exception:  # noqa: BLE001 — 감사 실패가 결과를 막지 않게
                db.rollback()
            finally:
                db.close()
        except Exception as e:  # noqa: BLE001
            out = {"status": "error", "error": f"AI 작업 오류: {e}"[:300]}
        finally:
            _slots.release()
        with _lock:
            _jobs[job_id].update(out, finished=time.time())

    threading.Thread(target=work, daemon=True, name=f"ai-{kind}").start()
    return {"job_id": job_id, "model": m}


# ── 견적 항목 ──────────────────────────────────────────────

class EstimateItemsBody(BaseModel):
    requirements: str = Field("", max_length=20000)
    estimate_title: str = ""
    company_name: str = ""
    estimate_type: str = ""
    project_type: str = ""
    prompt_id: int | None = None
    model: str | None = None
    prompt_template: str | None = Field(None, max_length=PROMPT_TEXT_MAX)  # 화면에서 고친 템플릿 원문({변수} 포함) — 있으면 저장된 템플릿 대신


def _int(v, default: int, lo: int = 0) -> int:
    try:
        return max(int(float(str(v).replace(",", ""))), lo)
    except (TypeError, ValueError):
        return default


def _parse_items(text: str) -> list[dict]:
    rows = claude_cli.extract_json_array(text)
    items = []
    for r in rows:
        if not isinstance(r, dict) or not str(r.get("item_name") or "").strip():
            continue
        items.append({
            "category": str(r.get("category") or "")[:50],
            "item_name": str(r.get("item_name")).strip()[:200],
            "specification": str(r.get("specification") or "")[:500],
            "quantity": _int(r.get("quantity"), 1, 1),
            "unit": str(r.get("unit") or "식")[:20],
            "unit_price": _int(r.get("unit_price"), 0),
        })
    if not items:
        raise ValueError("AI 응답에서 견적 항목을 찾지 못했습니다. 요구사항을 더 구체적으로 쓰거나 다시 시도하세요.")
    return items


def _estimate_prompt(db: Session, body: EstimateItemsBody) -> tuple[str, str, AIPromptTemplate | None]:
    """(최종 프롬프트, 템플릿 원문, 템플릿). 원문: 화면에서 고친 것 → prompt_id → 기본 → 내장."""
    tpl = _template(db, body.prompt_id, "estimate")
    source = _edited(body.prompt_template) or (tpl.prompt_content if tpl else DEFAULT_ESTIMATE_PROMPT)
    type_name = PROJECT_TYPES.get(body.project_type, "") or body.estimate_type
    req = body.requirements.strip()
    prompt = _fill(source, {
        # cms 화면 변수 + 호환 변수(견적 분석 모달·계약서 모달)
        "requirements": req, "estimateTitle": body.estimate_title, "companyName": body.company_name, "estimateType": body.estimate_type,
        "contextTitle": body.estimate_title, "contextCompany": body.company_name, "contextType": body.estimate_type, "requirementsInput": req,
        "contractTitle": body.estimate_title, "projectTypeName": type_name, "estimateContent": req,
    })
    return prompt, source, tpl


@router.post("/estimate-items/preview")
def estimate_items_preview(body: EstimateItemsBody, db: Session = Depends(get_db)):
    """실행 전에 보여 줄 템플릿 원문(고칠 수 있음)과 화면 값을 채운 결과."""
    prompt, source, tpl = _estimate_prompt(db, body)
    return _preview(prompt, source, tpl)


@router.post("/estimate-items")
def estimate_items(body: EstimateItemsBody, request: Request, db: Session = Depends(get_db), staff: CustomAuthUser = Depends(get_current_staff)):
    """요구사항 → 견적 항목 초안(JSON 배열). 템플릿: 화면에서 고친 원문, prompt_id, 기본 템플릿, 내장 순."""
    prompt, _, tpl = _estimate_prompt(db, body)
    edited = _edited(body.prompt_template)
    if not edited and not body.requirements.strip():
        raise HTTPException(400, "요구사항을 입력해주세요.")
    model = body.model or (tpl.claude_model if tpl else None)
    return _start(staff, "estimate_items", "estimate-items", prompt + NO_TOOLS, model, _parse_items,
                  tpl.seq if tpl else None, request) | {"prompt_name": _prompt_name(tpl, edited)}


# ── 계약 내용 ──────────────────────────────────────────────

class ContractDraftBody(BaseModel):
    contract_seq: int | None = None
    estimate_id: int | None = None
    contract_title: str = ""
    company_name: str = ""
    contract_amount: str = ""
    contract_period: str = ""
    maintenance_point: str = ""
    free_maint_months: str = ""
    free_maint_scope: str = ""
    project_type: str = ""  # 화면에서 고른 계약 유형(직접 등록·수정 중) — 저장된 계약·견적 값보다 우선
    project_description: str = Field("", max_length=20000)
    prompt_id: int | None = None
    model: str | None = None
    prompt_template: str | None = Field(None, max_length=PROMPT_TEXT_MAX)


def _parse_contract(text: str) -> dict:
    body = text.strip().replace("|||", "||")
    parts = [p.strip() for p in body.split("||")]
    if len(parts) < 4:
        obj = claude_cli.extract_json_object(text)  # 템플릿을 JSON 으로 바꾼 경우
        if all(k in obj for k in CONTRACT_KEYS):
            return {k: str(obj[k]).strip() for k in CONTRACT_KEYS}
        raise ValueError("AI 응답 형식이 맞지 않습니다(|| 로 나뉜 4개 항목). 다시 시도하세요.")
    head = parts[:3] + ["||".join(parts[3:])]
    return {k: _HEAD.sub("", p, count=1).strip() for k, p in zip(CONTRACT_KEYS, head)}


def _contract_prompt(db: Session, body: ContractDraftBody) -> tuple[str, str, AIPromptTemplate | None, str]:
    """(최종 프롬프트, 템플릿 원문, 템플릿, 감사 target). 원문: 화면에서 고친 것 → prompt_id → 이름에 '계약' 이 든 최신 템플릿 → 내장."""
    project_type, estimate_content, items_desc = body.project_type.strip(), "", ""
    est_id = body.estimate_id
    if body.contract_seq:
        c = db.query(EstimateContract).filter(EstimateContract.seq == body.contract_seq).first()
        if c:
            project_type = project_type or str(c.project_type or "")
            est_id = est_id or c.estimate_id
    if est_id:
        e = db.query(Estimate).filter(Estimate.seq == est_id).first()
        if e:
            project_type = project_type or str(e.project_type or "")
            estimate_content = (e.estimate_content or e.requirements or "")[:4000]
            items = db.query(EstimateItem).filter(EstimateItem.estimate_id == e.seq).order_by(EstimateItem.item_order).limit(60).all()
            items_desc = ", ".join(f"{i.item_name}({i.quantity}{i.unit or ''})" for i in items)
    tpl = _template(db, body.prompt_id, "contract")
    source = _edited(body.prompt_template) or (tpl.prompt_content if tpl else DEFAULT_CONTRACT_PROMPT)
    free = f"{body.free_maint_months}개월 ({body.free_maint_scope or '범위 미정'})" if body.free_maint_months else "없음"
    prompt = _fill(source, {
        "contractTitle": body.contract_title or "미정", "projectTypeName": PROJECT_TYPES.get(project_type, "미정"), "projectType": project_type or "-",
        "projectDescription": body.project_description or "(없음)", "companyName": body.company_name or "미정",
        "contractAmount": _won(body.contract_amount) if body.contract_amount else "미정", "contractPeriod": body.contract_period or "미정",
        "maintenancePoint": body.maintenance_point or "없음", "freeMaintenance": free,
        "estimateContent": estimate_content or "(없음)", "itemsDescription": items_desc or "(없음)",
    })
    if "{freeMaintenance}" not in source and body.free_maint_months:
        prompt += f"\n\n[추가] 무상 유지보수 {free}: 특약에 기간·범위, 무상 기간 중 포인트 미차감, 범위 밖 작업은 별도 협의를 넣으세요."
    target = f"contract:{body.contract_seq}" if body.contract_seq else f"estimate:{est_id or '-'}"
    return prompt, source, tpl, target


@router.post("/contract-draft/preview")
def contract_draft_preview(body: ContractDraftBody, db: Session = Depends(get_db)):
    prompt, source, tpl, _ = _contract_prompt(db, body)
    return _preview(prompt, source, tpl, "sonnet")


@router.post("/contract-draft")
def contract_draft(body: ContractDraftBody, request: Request, db: Session = Depends(get_db), staff: CustomAuthUser = Depends(get_current_staff)):
    """계약 정보(+연결 견적) → 프로젝트 내용·서비스 범위·대금 지급 조건·특약 초안. 템플릿은 화면에서 고친 원문이 우선."""
    prompt, _, tpl, target = _contract_prompt(db, body)
    edited = _edited(body.prompt_template)
    return _start(staff, "contract_draft", target, prompt + NO_TOOLS, body.model or (tpl.claude_model if tpl else "sonnet"),
                  _parse_contract, tpl.seq if tpl else None, request) | {"prompt_name": _prompt_name(tpl, edited)}


# ── 미팅 장소 찾기 ─────────────────────────────────────────

class PlaceSearchBody(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    address: str = Field("", max_length=300)


@router.post("/place-search")
def place_search(body: PlaceSearchBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff)):
    """장소명(+입력된 주소) → 후보 {이름·주소·위도·경도·출처}.
    ① 네이버 통합검색의 플레이스 결과(정확한 주소·좌표)가 있으면 그것으로 끝, ② 없으면 claude 웹검색 — 네이버 검색 결과 본문을
    문맥으로 넘긴다(claude WebSearch 는 한국 지역 업체를 거의 못 찾는다). 좌표가 비면 Nominatim 으로 보완.
    감사 로그 target 에 검색어는 넣지 않는다(고객 정보일 수 있음)."""
    query = body.query.strip()
    if not query:
        raise HTTPException(400, "장소명(또는 주소)을 입력해주세요.")
    return _start(staff, "place_search", "meeting-place", place_geo.build_prompt(query, body.address.strip()), "sonnet",
                  place_geo.parse_places, None, request, tools=place_geo.TOOLS, timeout=RUN_TIMEOUT,
                  prepare=lambda: place_geo.naver_lookup(query))


# ── 환율 조회 ─────────────────────────────────────────────

EXCHANGE_PROMPT = (
    "오늘({today}) 기준 미국 달러(USD) → 원화(KRW) 환율을 웹검색으로 찾아 JSON 객체 하나로만 출력하세요.\n"
    "rate 는 1 USD 당 원화 금액(예: 1385.2)입니다. 매매기준율(또는 시장 실시간 환율)을 쓰세요.\n"
    "설명·코드블록 없이 순수 JSON만. 형식: "
    '{{"rate":1385.2,"date":"환율 기준 일시(YYYY-MM-DD 또는 YYYY-MM-DD HH:MM)","source":"출처 사이트명","source_url":"근거 URL"}}\n'
    "단, 시간이 제한되어 있으니 도구 호출은 최소로 하세요: WebSearch 1~2회로 끝내고, "
    "검색 결과 요약만으로 환율이 확인되면 WebFetch 는 생략하세요. 60초 안에 답을 마치세요."
)
RATE_RANGE = (800.0, 2500.0)  # 이 범위 밖이면 잘못 읽은 값으로 본다


def _parse_rate(text: str) -> dict:
    obj = claude_cli.extract_json_object(text)
    try:
        rate = float(str(obj.get("rate", "")).replace(",", ""))
    except ValueError:
        rate = 0.0
    if not RATE_RANGE[0] <= rate <= RATE_RANGE[1]:
        raise ValueError("환율을 확인하지 못했습니다. 다시 시도하세요.")
    return {"rate": round(rate, 2), "date": str(obj.get("date") or "")[:40], "source": str(obj.get("source") or "")[:80],
            "source_url": str(obj.get("source_url") or "")[:500]}


class ExchangeRateBody(BaseModel):
    currency: str = Field("USD", pattern="^USD$")


@router.post("/exchange-rate")
def exchange_rate(body: ExchangeRateBody, request: Request, staff: CustomAuthUser = Depends(get_current_staff)):
    """USD→KRW 현재 환율(claude 웹검색). 결제일 알람 금액을 달러로 넣을 때 원화 환산에 쓴다 — 결과는 화면에만 채운다."""
    return _start(staff, "exchange_rate", "usd-krw", EXCHANGE_PROMPT.format(today=date.today().isoformat()), "sonnet",
                  _parse_rate, None, request, tools=place_geo.TOOLS, timeout=RUN_TIMEOUT)


# ── 공통 ──────────────────────────────────────────────────

@router.get("/jobs/{job_id}")
def job_status(job_id: str, staff: CustomAuthUser = Depends(get_current_staff)):
    with _lock:
        j = _jobs.get(job_id)
        if not j or j["staff_id"] != staff.id:
            raise HTTPException(404, "AI 작업을 찾을 수 없습니다(서버가 재시작됐을 수 있습니다). 다시 실행하세요.")
        out = {k: v for k, v in j.items() if k not in ("staff_id",)}
    out["elapsed"] = int((out["finished"] or time.time()) - out["started"])
    return out


@router.get("/options")
def options(db: Session = Depends(get_db)):
    """화면용 — 사용 여부, 모델 선택지, 견적 항목·계약 내용 템플릿 목록."""
    prompts = db.query(AIPromptTemplate).filter(AIPromptTemplate.is_active == True).order_by(  # noqa: E712
        AIPromptTemplate.is_default.desc(), AIPromptTemplate.usage_count.desc()).all()
    return {
        "enabled": settings.AI_ENABLED,
        "can_save_prompts": write_enabled("ai_prompts"),
        "models": [["sonnet", "Sonnet (균형)"], ["haiku", "Haiku (빠름)"], ["opus", "Opus (정밀·느림)"]],
        "prompts": [{"seq": p.seq, "name": p.name, "is_default": bool(p.is_default), "model": claude_cli.normalize_model(p.claude_model)}
                    for p in prompts if "계약" not in p.name and "설명" not in p.name],
        # 계약 내용 템플릿 — 맨 앞이 기본(_template 의 '계약' 최신 템플릿과 같은 순서)
        "contract_prompts": [{"seq": p.seq, "name": p.name, "is_default": i == 0, "model": claude_cli.normalize_model(p.claude_model)}
                             for i, p in enumerate(sorted((p for p in prompts if "계약" in p.name), key=lambda p: p.updated_at, reverse=True))],
    }
