// frontend/src/app/(staff)/managed/security-bans/page.tsx
"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Search, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, selectCls } from "@/components/managed/field";
import { AiProgress, useAiJob } from "@/components/managed/ai-assist";
import { useNavigationStore } from "@/store/navigation-store";
import staffApi from "@/lib/staff-api";

type Options = { jails: string[]; reasons: { code: string; label: string }[] };
type Summary = {
  total: number;
  by_reason: { reason: string; label: string; count: number }[];
  by_date: { date: string; reason: string; count: number }[];
  by_hour: number[];
  by_jail: { jail: string; count: number }[];
  top_sites: { site: string; count: number }[];
  top_ips: { ip: string; count: number }[];
};
type Ban = {
  id: number; banned_at: string; unbanned_at: string | null; jail: string; ip: string;
  reason: string; reason_label: string; reason_detail: string; site: string | null; request_count: number;
};
type BanList = { items: Ban[]; total: number; page: number; per_page: number; total_pages: number };
type Evidence = { logged_at: string; source_file: string; line: string };
type Review = { review_id: number; result_md: string };
type Form = { date_from: string; date_to: string; hour_from: string; hour_to: string; jails: string[]; reasons: string[]; site: string; ip: string };
type Params = Record<string, string | number>;

const ymd = (d: Date) => d.toLocaleDateString("sv-SE");
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const dt = (s: string) => s.replace("T", " ").slice(0, 19);
const COLORS = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500", "bg-lime-500", "bg-emerald-500",
  "bg-cyan-500", "bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-pink-500", "bg-slate-400"];
const EMPTY_TEXT = "차단 기록이 없어 평가하지 않았습니다.";

function toParams(f: Form): Params {
  const p: Params = { date_from: f.date_from, date_to: f.date_to };
  if (f.hour_from !== "" && f.hour_to !== "") { p.hour_from = Number(f.hour_from); p.hour_to = Number(f.hour_to); }
  if (f.jails.length) p.jails = f.jails.join(",");
  if (f.reasons.length) p.reasons = f.reasons.join(",");
  if (f.site.trim()) p.site = f.site.trim();
  if (f.ip.trim()) p.ip = f.ip.trim();
  return p;
}

function Bar({ label, count, max, color = "bg-primary" }: { label: string; count: number; max: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate" title={label}>{label}</span>
      <div className="h-3 flex-1 rounded bg-muted"><div className={`h-3 rounded ${color}`} style={{ width: `${max ? (count / max) * 100 : 0}%` }} /></div>
      <span className="w-10 text-right tabular-nums">{count}</span>
    </div>
  );
}

function Chips({ all, selected, onChange, label }: { all: { code: string; label: string }[]; selected: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {all.map((o) => {
          const on = selected.includes(o.code);
          return (
            <button key={o.code} type="button" onClick={() => onChange(on ? selected.filter((x) => x !== o.code) : [...selected, o.code])}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SecurityBansPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [opts, setOpts] = useState<Options | null>(null);
  const [form, setForm] = useState<Form>({ date_from: daysAgo(6), date_to: daysAgo(0), hour_from: "", hour_to: "", jails: [], reasons: [], site: "", ip: "" });
  const [applied, setApplied] = useState<Params | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [list, setList] = useState<BanList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [evidence, setEvidence] = useState<Record<number, Evidence[]>>({});
  const [review, setReview] = useState<Review | null>(null);
  const [reviewNote, setReviewNote] = useState<string | null>(null);
  const ai = useAiJob<Review>();

  useEffect(() => { setPageTitle("차단 분석(Fail2Ban)"); }, [setPageTitle]);
  useEffect(() => { staffApi.get("/managed/f2b/options").then((r) => setOpts(r.data)).catch(() => setOpts({ jails: [], reasons: [] })); }, []);

  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    (opts?.reasons ?? []).forEach((r, i) => { m[r.code] = COLORS[i % COLORS.length]; });
    return (code: string) => m[code] ?? "bg-slate-400";
  }, [opts]);
  const labelOf = (code: string) => opts?.reasons.find((r) => r.code === code)?.label ?? code;

  const startReview = async (params: Params, force: boolean) => {
    ai.reset(); setReview(null); setReviewNote(null);
    if (!force) {
      try { setReview((await staffApi.get("/managed/f2b/ai-review/cached", { params })).data); return; } catch { /* 404 → 새로 평가 */ }
    }
    ai.start("/f2b/ai-review", params, (d) => setReview(d));
  };

  const loadPage = async (params: Params, page: number) => {
    const r = await staffApi.get("/managed/f2b/bans", { params: { ...params, page } });
    setList(r.data);
  };

  const runSearch = async (f: Form) => {
    const params = toParams(f);
    setApplied(params); setLoading(true); setError(null); setOpen(null);
    let total = 0;
    try {
      const [s] = await Promise.all([staffApi.get("/managed/f2b/summary", { params }), loadPage(params, 1)]);
      setSummary(s.data); total = s.data.total;
    } catch (e) {
      setError(apiErrorDetail(e, "조회에 실패했습니다.")); setSummary(null); setList(null);
      setLoading(false);
      return;
    }
    setLoading(false);
    if (total === 0) { ai.reset(); setReview(null); setReviewNote(EMPTY_TEXT); return; }
    startReview(params, false);
  };

  const toggleRow = async (id: number) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!evidence[id]) {
      try { const r = await staffApi.get(`/managed/f2b/bans/${id}`); setEvidence((m) => ({ ...m, [id]: r.data.evidence })); }
      catch { setEvidence((m) => ({ ...m, [id]: [] })); }
    }
  };

  const byDate = useMemo(() => {
    const m = new Map<string, { reason: string; count: number }[]>();
    (summary?.by_date ?? []).forEach((r) => { m.set(r.date, [...(m.get(r.date) ?? []), { reason: r.reason, count: r.count }]); });
    return [...m.entries()];
  }, [summary]);
  const maxDay = Math.max(1, ...byDate.map(([, rs]) => rs.reduce((a, b) => a + b.count, 0)));
  const maxHour = Math.max(1, ...(summary?.by_hour ?? [0]));
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <PageTransition>
      <div className="space-y-4">
        <form className="space-y-3 rounded-2xl border p-4" onSubmit={(e) => { e.preventDefault(); runSearch(form); }}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">시작일<Input type="date" className="rounded-xl" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} /></label>
            <label className="text-xs">종료일<Input type="date" className="rounded-xl" value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })} /></label>
            {[["오늘", 0, 0], ["어제", 1, 1], ["7일", 6, 0], ["30일", 29, 0]].map(([l, a, b]) => (
              <Button key={l as string} type="button" variant="outline" size="sm" className="rounded-xl"
                onClick={() => setForm({ ...form, date_from: daysAgo(a as number), date_to: daysAgo(b as number) })}>{l}</Button>
            ))}
            <label className="text-xs">시간대
              <div className="flex items-center gap-1">
                <select className={selectCls("w-auto")} value={form.hour_from} onChange={(e) => setForm({ ...form, hour_from: e.target.value })}>
                  <option value="">전체</option>{hours.map((h) => <option key={h} value={h}>{h}시</option>)}
                </select>~
                <select className={selectCls("w-auto")} value={form.hour_to} onChange={(e) => setForm({ ...form, hour_to: e.target.value })}>
                  <option value="">전체</option>{hours.map((h) => <option key={h} value={h}>{h}시</option>)}
                </select>
              </div>
            </label>
            <label className="text-xs">사이트<Input className="rounded-xl" placeholder="예: hankyeul.com" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} /></label>
            <label className="text-xs">IP<Input className="rounded-xl" placeholder="부분 일치" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} /></label>
          </div>
          <Chips label="jail" all={(opts?.jails ?? []).map((j) => ({ code: j, label: j }))} selected={form.jails} onChange={(v) => setForm({ ...form, jails: v })} />
          <Chips label="이유" all={opts?.reasons ?? []} selected={form.reasons} onChange={(v) => setForm({ ...form, reasons: v })} />
          <div className="flex gap-2">
            <Button type="submit" className="rounded-xl" disabled={loading}><Search className="mr-1 h-4 w-4" /> 검색</Button>
            <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setForm({ ...form, hour_from: "", hour_to: "", jails: [], reasons: [], site: "", ip: "" })}>조건 초기화</Button>
          </div>
          {form.hour_from !== "" && form.hour_to !== "" && Number(form.hour_from) > Number(form.hour_to) && (
            <p className="text-xs text-muted-foreground">자정을 넘는 시간대입니다({form.hour_from}시~다음날 {form.hour_to}시).</p>
          )}
        </form>

        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {!applied && <p className="text-sm text-muted-foreground">조건을 고른 뒤 [검색]을 누르면 차단 기록과 AI 평가가 표시됩니다.</p>}

        {summary && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">전체</p><p className="text-2xl font-semibold">{summary.total}</p></div>
              {summary.by_reason.map((r) => (
                <button key={r.reason} type="button" className="rounded-2xl border p-3 text-left hover:bg-muted"
                  onClick={() => { const f = { ...form, reasons: [r.reason] }; setForm(f); runSearch(f); }}>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${colorOf(r.reason)}`} />{r.label}</p>
                  <p className="text-2xl font-semibold">{r.count}<span className="ml-1 text-xs text-muted-foreground">{summary.total ? Math.round((r.count / summary.total) * 100) : 0}%</span></p>
                </button>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-1 rounded-2xl border p-4">
                <h3 className="mb-2 text-sm font-medium">날짜별</h3>
                {byDate.map(([d, rs]) => {
                  const sum = rs.reduce((a, b) => a + b.count, 0);
                  return (
                    <div key={d} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0">{d.slice(5)}</span>
                      <div className="flex h-3 flex-1 overflow-hidden rounded bg-muted" style={{ maxWidth: `${(sum / maxDay) * 100}%` }}>
                        {rs.map((r) => <div key={r.reason} className={colorOf(r.reason)} style={{ width: `${(r.count / sum) * 100}%` }} title={`${labelOf(r.reason)} ${r.count}`} />)}
                      </div>
                      <span className="w-10 text-right tabular-nums">{sum}</span>
                    </div>
                  );
                })}
              </section>
              <section className="rounded-2xl border p-4">
                <h3 className="mb-2 text-sm font-medium">시간대별</h3>
                <div className="flex h-32 items-end gap-0.5">
                  {summary.by_hour.map((c, h) => (
                    <div key={h} className="flex flex-1 flex-col items-center justify-end" title={`${h}시 ${c}건`}>
                      <div className="w-full rounded-t bg-primary" style={{ height: `${(c / maxHour) * 100}%` }} />
                      <span className="text-[10px] text-muted-foreground">{h % 3 === 0 ? h : ""}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="space-y-1 rounded-2xl border p-4">
                <h3 className="mb-2 text-sm font-medium">jail 별</h3>
                {summary.by_jail.map((j) => <Bar key={j.jail} label={j.jail} count={j.count} max={summary.by_jail[0]?.count ?? 1} />)}
              </section>
              <section className="space-y-1 rounded-2xl border p-4">
                <h3 className="mb-2 text-sm font-medium">사이트 상위 10</h3>
                {summary.top_sites.length ? summary.top_sites.map((s) => <Bar key={s.site} label={s.site} count={s.count} max={summary.top_sites[0].count} />)
                  : <p className="text-xs text-muted-foreground">사이트 정보 없음(메일·SSH 차단)</p>}
              </section>
            </div>

            <section className="space-y-2 rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1 text-sm font-medium"><Sparkles className="h-4 w-4" /> AI 평가</h3>
                {applied && summary.total > 0 && (
                  <Button size="sm" variant="outline" className="rounded-xl" disabled={ai.running} onClick={() => startReview(applied, true)}>
                    <RotateCcw className="mr-1 h-4 w-4" /> 다시 평가
                  </Button>
                )}
              </div>
              {reviewNote && <p className="text-sm text-muted-foreground">{reviewNote}</p>}
              <AiProgress running={ai.running} elapsed={ai.job?.elapsed ?? 0} model={ai.job?.model} label="AI 가 차단 기록을 평가하는 중…" hint="보통 30~90초" />
              {ai.error && <p className="text-sm text-destructive">{ai.error}</p>}
              {review && <div className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm leading-relaxed">{review.result_md}</div>}
            </section>

            <section className="rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr><th className="w-6" /><th className="p-2 text-left">차단 시각</th><th className="p-2 text-left">jail</th><th className="p-2 text-left">IP</th>
                    <th className="p-2 text-left">이유</th><th className="hidden p-2 text-left md:table-cell">사이트</th><th className="hidden p-2 text-right md:table-cell">요청</th><th className="hidden p-2 text-left md:table-cell">해제</th></tr>
                </thead>
                <tbody>
                  {(list?.items ?? []).map((b) => (
                    <Fragment key={b.id}>
                      <tr className="cursor-pointer border-b hover:bg-muted/50" onClick={() => toggleRow(b.id)}>
                        <td className="pl-2">{open === b.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="whitespace-nowrap p-2">{dt(b.banned_at)}</td>
                        <td className="p-2">{b.jail}</td>
                        <td className="p-2 font-mono">{b.ip}</td>
                        <td className="p-2"><span className={`mr-1 inline-block h-2 w-2 rounded-full ${colorOf(b.reason)}`} />{b.reason_label}
                          <p className="max-w-xs truncate text-xs text-muted-foreground">{b.reason_detail}</p></td>
                        <td className="hidden p-2 md:table-cell">{b.site ?? "-"}</td>
                        <td className="hidden p-2 text-right md:table-cell">{b.request_count}</td>
                        <td className="hidden whitespace-nowrap p-2 text-xs md:table-cell">{b.unbanned_at ? dt(b.unbanned_at) : "차단 중"}</td>
                      </tr>
                      {open === b.id && (
                        <tr className="border-b bg-muted/30"><td colSpan={8} className="p-2">
                          {!evidence[b.id] ? <p className="text-xs">불러오는 중…</p> : !evidence[b.id].length ? <p className="text-xs text-muted-foreground">근거 로그 없음</p> : (
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px]">
                              {evidence[b.id].map((e) => `${dt(e.logged_at)}  ${e.source_file}\n  ${e.line}`).join("\n")}
                            </pre>
                          )}
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {list && !list.items.length && <p className="flex items-center gap-1 p-4 text-sm text-muted-foreground"><ShieldAlert className="h-4 w-4" /> 차단 기록이 없습니다</p>}
              {list && list.total_pages > 1 && applied && (
                <div className="flex items-center justify-end gap-2 p-2 text-xs">
                  <Button size="sm" variant="outline" disabled={list.page <= 1} onClick={() => loadPage(applied, list.page - 1)}>이전</Button>
                  <span>{list.page} / {list.total_pages} (총 {list.total}건)</span>
                  <Button size="sm" variant="outline" disabled={list.page >= list.total_pages} onClick={() => loadPage(applied, list.page + 1)}>다음</Button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PageTransition>
  );
}
