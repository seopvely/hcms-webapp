"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, RotateCcw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/app-toast";
import { Field, apiErrorDetail, selectClass } from "@/components/managed/field";
import { MoneyInput } from "@/components/managed/form-kit";
import { cn } from "@/lib/utils";
import staffApi from "@/lib/staff-api";
import { useStaffGet } from "@/lib/staff-ops";

type PromptOpt = { seq: number; name: string; is_default: boolean; model: string };
type Options = { enabled: boolean; can_save_prompts?: boolean; models: [string, string][]; prompts: PromptOpt[]; contract_prompts?: PromptOpt[] };
type Job<T> = { status: "running" | "done" | "error"; elapsed: number; model: string; data?: T; error?: string; raw?: string };

export function useAiOptions() {
  return useStaffGet<Options>(["ai-options"], "/ai/options");
}

/**
 * AI 작업 실행 — 시작(POST)하면 작업 ID 를 받고 2초마다 결과를 조회한다(서버 실행 15~60초).
 * 화면을 닫으면 조회를 멈춘다(서버 작업은 끝까지 돌고 버려진다).
 */
export function useAiJob<T>() {
  const [job, setJob] = useState<Job<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const poll = (id: string, onDone?: (data: T) => void, failures = 0) => {
    timer.current = setTimeout(async () => {
      try {
        const j: Job<T> = (await staffApi.get(`/managed/ai/jobs/${id}`)).data;
        if (!alive.current) return;
        setJob(j);
        if (j.status === "running") poll(id, onDone);
        else if (j.status === "done" && j.data !== undefined) onDone?.(j.data);
        else if (j.status === "error") setError(j.error ?? "AI 분석에 실패했습니다.");
      } catch (err) {
        if (!alive.current) return;
        // 404(작업 없음) 외의 일시 오류(서버 재시작·네트워크)는 몇 번 더 조회해 본다
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status !== 404 && failures < 4) poll(id, onDone, failures + 1);
        else {
          setJob((j) => (j ? { ...j, status: "error" } : null)); // 진행 표시·버튼 잠금 해제
          setError(apiErrorDetail(err, "결과를 가져오지 못했습니다."));
        }
      }
    }, 2000);
  };

  const start = async (url: string, body: Record<string, unknown>, onDone?: (data: T) => void) => {
    if (timer.current) clearTimeout(timer.current);
    setError(null);
    setJob({ status: "running", elapsed: 0, model: String(body.model ?? "") });
    try {
      const r = (await staffApi.post(`/managed${url}`, body)).data as { job_id: string; model: string };
      setJob({ status: "running", elapsed: 0, model: r.model });
      poll(r.job_id, onDone);
    } catch (err) {
      setJob(null);
      setError(apiErrorDetail(err, "AI 작업을 시작하지 못했습니다."));
    }
  };
  const running = job?.status === "running";
  return { job, error, running, start, reset: () => { setJob(null); setError(null); } };
}

/** 진행 표시 — 몇 초째인지 보여 줘서 멈춘 게 아님을 알린다. */
export function AiProgress({ running, elapsed, model, label = "AI 가 작성하는 중…", hint = "보통 15~40초" }: {
  running: boolean; elapsed: number; model?: string; label?: string; hint?: string;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { clearInterval(t); setTick(0); };
  }, [running]);
  if (!running) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-indigo-700">
      <Loader2 className="h-4 w-4 animate-spin" /> {label} {Math.max(elapsed, tick)}초
      <span className="text-xs text-muted-foreground">({model || "sonnet"} · {hint})</span>
    </p>
  );
}

/**
 * 실행 전 프롬프트 — 템플릿 원문({변수} 포함)을 고치고, 서버가 화면 값으로 채운 결과를 옆에서 확인한다.
 * 고친 경우에만 원문을 보낸다(prompt_template) — 변수는 실행할 때 서버가 그때 화면 값으로 채운다.
 */
export function usePromptDraft(previewUrl: string) {
  const [template, setTemplate] = useState("");
  const [filled, setFilled] = useState("");
  const [edited, setEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchPreview = async (body: Record<string, unknown>) => (await staffApi.post(`/managed${previewUrl}`, body)).data as { prompt: string; template: string };
  /** 저장된 템플릿에서 원문·채운 결과를 (다시) 불러온다 */
  const load = async (body: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchPreview(body);
      setTemplate(r.template);
      setFilled(r.prompt);
      setEdited(false);
    } catch (err) {
      setError(apiErrorDetail(err, "프롬프트를 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };
  /** 고친 원문으로 채운 결과만 새로 받는다 */
  const preview = async (body: Record<string, unknown>) => {
    try {
      setFilled((await fetchPreview(body)).prompt);
    } catch {
      /* 미리보기 실패는 무시 — 실행에는 영향 없음 */
    }
  };
  return {
    template, filled, edited, loading, error, load, preview,
    edit: (t: string) => { setTemplate(t); setEdited(true); },
    clear: () => { setTemplate(""); setFilled(""); setEdited(false); },
    /** 저장 직후 — 지금 원문이 저장된 템플릿과 같아졌다 */
    markSaved: () => setEdited(false),
    /** 실행 body 에 붙일 값 */
    payload: () => (edited && template.trim() ? { prompt_template: template } : {}),
  };
}

type PromptDraft = ReturnType<typeof usePromptDraft>;

/** 템플릿 고르기 — 고친 원문이 있으면 버릴지 묻고, 열려 있던 프롬프트는 새 템플릿으로 다시 불러온다. */
export function changeTemplate(draft: PromptDraft, next: string, setId: (v: string) => void, reload: (id: string) => void) {
  if (draft.edited && !confirm("고친 프롬프트를 버리고 이 템플릿으로 바꿀까요?")) return;
  setId(next);
  if (draft.template) reload(next);
  else draft.clear();
}

/** 템플릿 변수와 설명 — 서버 ai.py _estimate_prompt/_contract_prompt 가 채우는 값과 같아야 한다 */
export const ESTIMATE_VAR_INFO: [string, string][] = [
  ["requirements", "요구사항 칸"], ["estimateTitle", "견적 제목"], ["companyName", "업체명"], ["estimateType", "견적 유형"],
  ["projectTypeName", "프로젝트 유형명(웹사이트·유지보수 등)"],
  // cms 견적 모달에서 쓰던 이름 — 기본 견적 템플릿이 이쪽을 쓴다
  ["requirementsInput", "= {requirements} (cms 이름)"], ["contextTitle", "= {estimateTitle} (cms 이름)"],
  ["contextCompany", "= {companyName} (cms 이름)"], ["contextType", "= {estimateType} (cms 이름)"],
];
export const CONTRACT_VAR_INFO: [string, string][] = [
  ["contractTitle", "계약명"], ["projectTypeName", "계약 유형명(웹사이트·유지보수 등)"], ["projectType", "계약 유형 코드(1~16)"],
  ["projectDescription", "프로젝트 설명 칸"], ["companyName", "갑 상호"], ["contractAmount", "계약금액(콤마 포함 숫자)"], ["contractPeriod", "계약기간(표기)"],
  ["maintenancePoint", "월 유지보수 포인트"], ["freeMaintenance", "무상 유지보수 '3개월 (범위)' — 없으면 '없음'. 이 변수가 없으면 무상 조건 안내 문장이 끝에 자동으로 붙음"],
  ["estimateContent", "연결 견적서 내용·요구사항(최대 4천 자)"], ["itemsDescription", "연결 견적 항목 목록(최대 60개)"],
];
/** 견적 템플릿에서도 채워지지만 목록엔 안 보이는 이름(계약 모달 호환) */
const ESTIMATE_COMPAT_VARS = ["contractTitle", "estimateContent"];
export const ESTIMATE_VARS = ESTIMATE_VAR_INFO.map(([k]) => k);
export const CONTRACT_VARS = CONTRACT_VAR_INFO.map(([k]) => k);
const VAR_LABEL = Object.fromEntries([...ESTIMATE_VAR_INFO, ...CONTRACT_VAR_INFO]);

/** 템플릿 종류 — AI 화면과 같은 규칙(이름에 '계약' → 계약, '설명' → 어느 화면에도 안 나옴, 그 외 견적) */
export function promptKind(name: string): "contract" | "estimate" | "other" {
  if (name.includes("계약")) return "contract";
  if (name.includes("설명")) return "other";
  return "estimate";
}

/** 원문에서 알 수 없는 {변수} — 채워지지 않고 그대로 전송된다 */
export function unknownVars(content: string, kind: "contract" | "estimate"): string[] {
  const known = new Set(kind === "contract" ? CONTRACT_VARS : [...ESTIMATE_VARS, ...ESTIMATE_COMPAT_VARS]);
  return [...new Set([...content.matchAll(/\{([A-Za-z_]\w*)\}/g)].map((m) => m[1]))].filter((v) => !known.has(v));
}

type SaveTarget = { kind: "estimate" | "contract"; templateId: string; templateName: string; model: string; onSaved: (seq: number) => void };

export function PromptEditor({
  draft, variables, onReload, onPreview, disabled, save,
}: {
  draft: PromptDraft;
  variables: string[];
  onReload: () => void;
  /** 고친 원문 → 채운 결과 다시 받기 */
  onPreview: (template: string) => void;
  disabled?: boolean;
  /** 템플릿 저장(ai_prompts 쓰기 영역이 켜져 있을 때만) */
  save?: SaveTarget | null;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const toggle = () => {
    if (!open && !draft.template && !draft.loading) onReload();
    setOpen(!open);
  };
  // 원문을 고치면 0.6초 뒤 채운 결과를 새로 받는다
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  useEffect(() => {
    if (!draft.edited) return;
    const t = setTimeout(() => previewRef.current(draft.template), 600);
    return () => clearTimeout(t);
  }, [draft.template, draft.edited]);

  const doSave = async (asNew: boolean) => {
    if (!save) return;
    if (!asNew && !confirm(`'${save.templateName}' 템플릿을 지금 원문으로 덮어씁니다. 이 템플릿을 쓰는 모든 사람에게 적용됩니다. 진행할까요?`)) return;
    if (asNew && !(newName ?? "").trim()) return;
    setSaving(true);
    try {
      const r = (await staffApi.post("/managed/ai-prompts/from-draft", {
        kind: save.kind, prompt_content: draft.template, model: save.model, ...(asNew ? { name: newName } : { seq: Number(save.templateId) }),
      })).data as { seq: number; name: string };
      await qc.invalidateQueries({ queryKey: ["ai-options"] });
      draft.markSaved();
      setNewName(null);
      save.onSaved(r.seq);
      toast("success", asNew ? `'${r.name}' 템플릿으로 저장했습니다.` : "템플릿을 덮어썼습니다.");
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };
  const builtin = !save?.templateId;

  return (
    <div className="rounded-xl border">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium" onClick={toggle}>
        <ChevronDown className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")} /> 프롬프트 보기·수정
        {draft.edited && <span className="rounded bg-amber-100 px-1.5 text-xs font-normal text-amber-800">수정함 — 이번 실행에 사용</span>}
        {draft.loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </button>
      {open && (
        <div className="space-y-2 border-t p-3">
          {draft.error && <p className="text-xs text-red-600">{draft.error}</p>}
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold">템플릿 원문 <span className="font-normal text-muted-foreground">— 고칠 수 있음</span></p>
              <Textarea className="min-h-72 rounded-xl font-mono text-xs leading-relaxed" value={draft.template} disabled={disabled || draft.loading}
                onChange={(e) => draft.edit(e.target.value)} placeholder="불러오는 중…" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold">채운 결과 <span className="font-normal text-muted-foreground">— 지금 화면 값으로 실제 전송될 글</span></p>
              <div className="min-h-72 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-muted/40 p-3 font-mono text-xs leading-relaxed">{draft.filled}</div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            변수: {variables.map((v) => <code key={v} className="mr-1 rounded bg-muted px-1" title={VAR_LABEL[v]}>{`{${v}}`}</code>)}
            — 실행할 때 화면 값으로 채워집니다. 고친 내용은 저장하지 않으면 이번 실행에만 쓰입니다.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg px-2 text-xs" disabled={disabled || draft.loading}
              onClick={() => (!draft.edited || confirm("고친 내용을 버리고 템플릿에서 다시 불러올까요?")) && onReload()}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> 템플릿에서 다시 불러오기
            </Button>
            {save && (
              <>
                <span className="flex-1" />
                {newName === null ? (
                  <>
                    <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={disabled || saving || !draft.template.trim()} onClick={() => setNewName("")}>
                      <Save className="mr-1 h-3.5 w-3.5" /> 새 템플릿으로 저장
                    </Button>
                    {!builtin && (
                      <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-xs" disabled={disabled || saving || !draft.edited} onClick={() => doSave(false)}
                        title={draft.edited ? "" : "고친 내용이 없습니다"}>
                        {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />} &apos;{save.templateName}&apos;에 덮어쓰기
                      </Button>
                    )}
                  </>
                ) : (
                  <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); doSave(true); }}>
                    <Input autoFocus className="h-8 w-56 rounded-lg text-xs" placeholder={save.kind === "contract" ? "이름(계약 템플릿)" : "이름(견적 템플릿)"} value={newName}
                      onChange={(e) => setNewName(e.target.value)} maxLength={100} />
                    <Button type="submit" size="sm" className="h-8 rounded-lg text-xs" disabled={saving || !newName.trim()}>
                      {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}저장
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-xs" onClick={() => setNewName(null)}>취소</Button>
                  </form>
                )}
              </>
            )}
          </div>
          {save?.kind === "contract" && newName !== null && (
            <p className="text-[11px] text-amber-700">계약 템플릿은 이름에 &apos;계약&apos;이 들어가야 목록에 나옵니다(없으면 앞에 [계약]을 붙입니다). 가장 최근에 저장한 계약 템플릿이 기본이 됩니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

export type AiItem = { category: string; item_name: string; specification: string; quantity: number; unit: string; unit_price: number };

/**
 * 견적 항목 AI 제안 — 요구사항(+템플릿·모델) → 항목 초안 표 → 고른 항목을 견적 표에 추가/대체.
 * 저장은 하지 않는다(견적 화면의 저장 버튼으로).
 */
export function EstimateAiDialog({
  open, onClose, context, onApply,
}: {
  open: boolean;
  onClose: () => void;
  context: { requirements: string; estimate_title: string; company_name: string; estimate_type: string; project_type: string };
  onApply: (items: AiItem[], mode: "append" | "replace", requirements: string) => void;
}) {
  const { data: opts } = useAiOptions();
  const ai = useAiJob<AiItem[]>();
  const [req, setReq] = useState(context.requirements);
  const [promptId, setPromptId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [rows, setRows] = useState<(AiItem & { on: boolean })[]>([]);
  const def = opts?.prompts.find((p) => p.is_default) ?? opts?.prompts[0];
  const pid = promptId || (def ? String(def.seq) : "");
  const mdl = model || opts?.prompts.find((p) => String(p.seq) === pid)?.model || "sonnet";
  const draft = usePromptDraft("/ai/estimate-items/preview");
  const ctx = (id: string) => ({ ...context, requirements: req, prompt_id: id ? Number(id) : null });

  const run = () => {
    setRows([]);
    ai.start("/ai/estimate-items", { ...ctx(pid), model: mdl, ...draft.payload() },
      (items) => setRows(items.map((r) => ({ ...r, on: true }))));
  };
  const picked = rows.filter((r) => r.on);
  const total = picked.reduce((s, r) => s + r.quantity * r.unit_price, 0);
  const setRow = (i: number, patch: Partial<AiItem & { on: boolean }>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const apply = (mode: "append" | "replace") => {
    onApply(picked.map((r) => ({ category: r.category, item_name: r.item_name, specification: r.specification, quantity: r.quantity, unit: r.unit, unit_price: r.unit_price })), mode, req);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !ai.running && onClose()}>
      <DialogContent className="max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto rounded-2xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-600" /> AI 견적 항목 제안</DialogTitle>
          <DialogDescription>요구사항을 바탕으로 AI 가 항목·단가 초안을 만듭니다. 확인 후 표에 넣고, 저장은 견적 화면에서 합니다.</DialogDescription>
        </DialogHeader>
        {opts && !opts.enabled && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">AI 기능이 꺼져 있습니다(서버 AI_ENABLED).</p>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Field label="요구사항">
            <Textarea className="min-h-36 rounded-xl" value={req} onChange={(e) => setReq(e.target.value)} disabled={ai.running}
              placeholder={"예:\n- 기업 홈페이지 리뉴얼(반응형)\n- 메인 + 소개·서비스·포트폴리오·문의\n- 관리자(게시판·문의·통계), SEO"} />
          </Field>
          <div className="space-y-3">
            <Field label="프롬프트 템플릿">
              <select className={selectClass} value={pid} onChange={(e) => changeTemplate(draft, e.target.value, setPromptId, (id) => draft.load(ctx(id)))} disabled={ai.running}>
                {!opts?.prompts.length && <option value="">내장 기본 프롬프트</option>}
                {opts?.prompts.map((p) => <option key={p.seq} value={p.seq}>{p.name}{p.is_default ? " (기본)" : ""}</option>)}
              </select>
            </Field>
            <Field label="모델">
              <select className={selectClass} value={mdl} onChange={(e) => setModel(e.target.value)} disabled={ai.running}>
                {(opts?.models ?? [["sonnet", "Sonnet"]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Button className="w-full rounded-xl" onClick={run} disabled={ai.running || (!req.trim() && !draft.edited) || opts?.enabled === false}>
              {ai.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              {rows.length ? "다시 분석" : "분석"}
            </Button>
          </div>
        </div>
        <PromptEditor draft={draft} variables={ESTIMATE_VARS} onReload={() => draft.load(ctx(pid))} onPreview={(t) => draft.preview({ ...ctx(pid), prompt_template: t })}
          disabled={ai.running} save={opts?.can_save_prompts ? {
            kind: "estimate", templateId: pid, templateName: opts.prompts.find((p) => String(p.seq) === pid)?.name ?? "", model: mdl, onSaved: (seq) => setPromptId(String(seq)),
          } : null} />
        <AiProgress running={ai.running} elapsed={ai.job?.elapsed ?? 0} model={ai.job?.model} />
        {ai.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{ai.error}{/시간이 초과/.test(ai.error) && " — Haiku 모델이 더 빠릅니다."}</p>}

        {rows.length > 0 && (
          <div className="min-w-0 space-y-2">
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-[680px] table-fixed text-sm">
                <colgroup><col className="w-8" /><col className="w-24" /><col /><col className="w-16" /><col className="w-20" /><col className="w-28" /><col className="w-28" /></colgroup>
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2"><Checkbox checked={picked.length === rows.length} onCheckedChange={(c) => setRows((rs) => rs.map((r) => ({ ...r, on: c === true })))} aria-label="전체 선택" /></th>
                    <th className="py-2 pr-2 text-left font-medium">분류</th>
                    <th className="py-2 pr-2 text-left font-medium">항목명 / 규격</th>
                    <th className="py-2 pr-2 text-right font-medium">수량</th>
                    <th className="py-2 pr-2 text-left font-medium">단위</th>
                    <th className="py-2 pr-2 text-right font-medium">단가</th>
                    <th className="py-2 text-right font-medium">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i} className={cn("align-top", !r.on && "opacity-40")}>
                      <td className="py-2 pt-3"><Checkbox checked={r.on} onCheckedChange={(c) => setRow(i, { on: c === true })} aria-label="선택" /></td>
                      <td className="py-1.5 pr-2"><Input className="h-8 rounded-lg text-xs" value={r.category} onChange={(e) => setRow(i, { category: e.target.value })} /></td>
                      <td className="space-y-1 py-1.5 pr-2">
                        <Input className="h-8 rounded-lg" value={r.item_name} onChange={(e) => setRow(i, { item_name: e.target.value })} />
                        <p className="line-clamp-2 px-1 text-xs text-muted-foreground" title={r.specification}>{r.specification}</p>
                      </td>
                      <td className="py-1.5 pr-2"><Input inputMode="numeric" className="h-8 rounded-lg text-right" value={String(r.quantity)} onChange={(e) => setRow(i, { quantity: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} /></td>
                      <td className="py-1.5 pr-2"><Input className="h-8 rounded-lg" value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} /></td>
                      <td className="py-1.5 pr-2"><MoneyInput className="h-8 rounded-lg" suffix="" value={String(r.unit_price)} onChange={(d) => setRow(i, { unit_price: Number(d) || 0 })} /></td>
                      <td className="py-2 pt-3 text-right tabular-nums">{(r.quantity * r.unit_price).toLocaleString("ko-KR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-right text-sm">선택 {picked.length}개 · 합계 <b className="tabular-nums">{total.toLocaleString("ko-KR")}원</b> <span className="text-xs text-muted-foreground">(부가세 별도)</span></p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={ai.running}>닫기</Button>
          {rows.length > 0 && (
            <>
              <Button variant="outline" className="rounded-xl" onClick={() => confirm("견적 표의 기존 항목을 모두 지우고 선택한 항목으로 바꿀까요?") && apply("replace")} disabled={!picked.length}>기존 항목 대체</Button>
              <Button className="rounded-xl" onClick={() => apply("append")} disabled={!picked.length}>표에 추가 ({picked.length})</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type ContractDraft = Record<"project_description" | "service_scope" | "payment_terms" | "special_terms", string>;
const CONTRACT_PARTS: [keyof ContractDraft, string][] = [
  ["project_description", "프로젝트 설명"], ["service_scope", "서비스 범위"], ["payment_terms", "지불조건"], ["special_terms", "특약"],
];

/**
 * 계약 내용 AI 초안 — 템플릿·모델 선택, 최종 프롬프트 확인·수정 → 4칸 초안 → 확인 후 계약서 화면에 넣기(저장은 화면에서).
 */
export function ContractAiDialog({
  open, onClose, context, overwrite, onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** 계약 화면 값(contract_seq·estimate_id·계약명·금액 등) */
  context: Record<string, unknown>;
  /** 계약 내용 칸에 이미 글이 있는지 — 넣을 때 덮어쓴다고 알린다 */
  overwrite: boolean;
  onApply: (d: ContractDraft) => void;
}) {
  const { data: opts } = useAiOptions();
  const ai = useAiJob<ContractDraft>();
  const draft = usePromptDraft("/ai/contract-draft/preview");
  const [promptId, setPromptId] = useState("");
  const [model, setModel] = useState("");
  const [result, setResult] = useState<ContractDraft | null>(null);
  const list = opts?.contract_prompts ?? [];
  const pid = promptId || (list[0] ? String(list[0].seq) : "");
  const mdl = model || list.find((p) => String(p.seq) === pid)?.model || "sonnet";
  const ctx = (id: string) => ({ ...context, prompt_id: id ? Number(id) : null });

  const run = () => {
    setResult(null);
    ai.start("/ai/contract-draft", { ...ctx(pid), model: mdl, ...draft.payload() }, setResult);
  };
  const apply = () => {
    if (!result) return;
    onApply(result);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !ai.running && onClose()}>
      <DialogContent className="max-h-[92vh] grid-cols-[minmax(0,1fr)] overflow-y-auto rounded-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-600" /> AI 계약 내용 초안</DialogTitle>
          <DialogDescription>계약 정보(+연결 견적)로 프로젝트 설명·서비스 범위·지불조건·특약 초안을 만듭니다. 확인 후 넣고, 저장은 계약서 화면에서 합니다.</DialogDescription>
        </DialogHeader>
        {opts && !opts.enabled && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">AI 기능이 꺼져 있습니다(서버 AI_ENABLED).</p>}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end">
          <Field label="프롬프트 템플릿">
            <select className={selectClass} value={pid} onChange={(e) => changeTemplate(draft, e.target.value, setPromptId, (id) => draft.load(ctx(id)))} disabled={ai.running}>
              {!list.length && <option value="">내장 기본 프롬프트</option>}
              {list.map((p) => <option key={p.seq} value={p.seq}>{p.name}{p.is_default ? " (기본)" : ""}</option>)}
            </select>
          </Field>
          <Field label="모델">
            <select className={selectClass} value={mdl} onChange={(e) => setModel(e.target.value)} disabled={ai.running}>
              {(opts?.models ?? [["sonnet", "Sonnet"]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Button className="rounded-xl" onClick={run} disabled={ai.running || opts?.enabled === false}>
            {ai.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            {result ? "다시 작성" : "초안 작성"}
          </Button>
        </div>
        <PromptEditor draft={draft} variables={CONTRACT_VARS} onReload={() => draft.load(ctx(pid))} onPreview={(t) => draft.preview({ ...ctx(pid), prompt_template: t })}
          disabled={ai.running} save={opts?.can_save_prompts ? {
            kind: "contract", templateId: pid, templateName: list.find((p) => String(p.seq) === pid)?.name ?? "", model: mdl, onSaved: (seq) => setPromptId(String(seq)),
          } : null} />
        <AiProgress running={ai.running} elapsed={ai.job?.elapsed ?? 0} model={ai.job?.model} />
        {ai.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{ai.error}</p>}
        {result && (
          <div className="space-y-2">
            {CONTRACT_PARTS.map(([k, label]) => (
              <div key={k} className="rounded-xl bg-muted/50 p-3">
                <p className="pb-1 text-xs font-semibold text-muted-foreground">{label}</p>
                <p className="whitespace-pre-wrap text-sm">{result[k] || <span className="text-muted-foreground">(비어 있음)</span>}</p>
              </div>
            ))}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={ai.running}>닫기</Button>
          {result && (
            <Button className="rounded-xl" onClick={apply}>
              계약 내용에 넣기{overwrite ? " (기존 4칸 덮어쓰기)" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
