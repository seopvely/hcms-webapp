"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, apiErrorDetail, selectClass } from "@/components/managed/field";
import { MoneyInput } from "@/components/managed/form-kit";
import { cn } from "@/lib/utils";
import staffApi from "@/lib/staff-api";
import { useStaffGet } from "@/lib/staff-ops";

type Options = { enabled: boolean; models: [string, string][]; prompts: { seq: number; name: string; is_default: boolean; model: string }[] };
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

  const poll = (id: string, onDone?: (data: T) => void) => {
    timer.current = setTimeout(async () => {
      try {
        const j: Job<T> = (await staffApi.get(`/managed/ai/jobs/${id}`)).data;
        if (!alive.current) return;
        setJob(j);
        if (j.status === "running") poll(id, onDone);
        else if (j.status === "done" && j.data !== undefined) onDone?.(j.data);
        else if (j.status === "error") setError(j.error ?? "AI 분석에 실패했습니다.");
      } catch (err) {
        if (alive.current) setError(apiErrorDetail(err, "결과를 가져오지 못했습니다."));
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
export function AiProgress({ running, elapsed, model }: { running: boolean; elapsed: number; model?: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => { clearInterval(t); setTick(0); };
  }, [running]);
  if (!running) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-indigo-700">
      <Loader2 className="h-4 w-4 animate-spin" /> AI 가 작성하는 중… {Math.max(elapsed, tick)}초
      <span className="text-xs text-muted-foreground">({model || "sonnet"} · 보통 15~40초)</span>
    </p>
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

  const run = () => {
    setRows([]);
    ai.start("/ai/estimate-items", { ...context, requirements: req, prompt_id: pid ? Number(pid) : null, model: mdl },
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
              <select className={selectClass} value={pid} onChange={(e) => setPromptId(e.target.value)} disabled={ai.running}>
                {!opts?.prompts.length && <option value="">내장 기본 프롬프트</option>}
                {opts?.prompts.map((p) => <option key={p.seq} value={p.seq}>{p.name}{p.is_default ? " (기본)" : ""}</option>)}
              </select>
            </Field>
            <Field label="모델">
              <select className={selectClass} value={mdl} onChange={(e) => setModel(e.target.value)} disabled={ai.running}>
                {(opts?.models ?? [["sonnet", "Sonnet"]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Button className="w-full rounded-xl" onClick={run} disabled={ai.running || !req.trim() || opts?.enabled === false}>
              {ai.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              {rows.length ? "다시 분석" : "분석"}
            </Button>
          </div>
        </div>
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
