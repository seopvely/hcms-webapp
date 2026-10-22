"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Copy, ExternalLink, MapPin, Plus, Power, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDateTime, selectClass } from "@/components/managed/field";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { PageActions } from "@/components/managed/page-actions";
import { AiProgress, useAiJob } from "@/components/managed/ai-assist";
import { type SearchItem, SearchSelect } from "@/components/managed/search-select";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useStaffMe } from "@/lib/staff-hooks";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import staffApi from "@/lib/staff-api";

type Dict = Record<string, unknown>;
type Lead = { seq: number; title: string | null; client_company: string | null; client_name: string | null; status_label: string };
type Options = { types: Record<string, string>; agents: { id: number; name: string }[]; place_search: boolean; ai_place_search?: boolean };
/** 카카오 검색 또는 AI 찾기 후보 — AI 는 좌표를 못 구하면 lat/lng 가 null(주소만 채운다). */
type Place = {
  name: string; address: string; lat: number | null; lng: number | null; phone?: string | null;
  approx?: boolean; source?: string; source_url?: string; snippet?: string; category?: string;
};
const FIELDS = ["title", "meeting_type", "meeting_date", "meeting_time", "start_place", "start_address", "start_lat", "start_lng", "end_place", "end_address",
  "end_lat", "end_lng", "video_meeting_url", "memo", "valid_status", "sales_lead_id"] as const;

/** 약속일시 3시간 전(10분 단위 내림)을 datetime-local 값으로 — 시간이 비면 그날 0시 기준. */
function threeHoursBefore(date: string, time: string): string {
  if (!date) return "";
  const d = new Date(`${date}T${time || "00:00"}`);
  if (Number.isNaN(d.getTime())) return "";
  d.setHours(d.getHours() - 3);
  d.setMinutes(Math.floor(d.getMinutes() / 10) * 10, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 휴대폰·태블릿(iPadOS 는 Mac 으로 보이므로 터치 지점 수로 구분) */
function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const copyId = useSearchParams().get("copy");
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["meetings", "detail", id], isNew ? null : `/meetings/${id}`);
  // ?copy=<seq> — 기존 약속을 복사해 새로 등록(일정만 조정)
  const { data: src, isLoading: srcLoading } = useStaffGet<Dict>(["meetings", "detail", copyId], isNew && copyId ? `/meetings/${copyId}` : null);
  useEffect(() => {
    setPageTitle(isNew ? (copyId ? "미팅 복사 등록" : "미팅 등록") : (data?.title as string | undefined) || "미팅약속");
  }, [setPageTitle, isNew, copyId, data?.title]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  if (isNew && copyId && srcLoading) return <DetailSkeleton />;
  return <PageTransition><Editor key={`${id}-${copyId ?? ""}`} id={id} data={isNew ? null : data!} copy={isNew ? src ?? null : null} /></PageTransition>;
}

function Editor({ id, data, copy }: { id: string; data: Dict | null; copy?: Dict | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: o } = useStaffGet<Options>(["meetings", "options"], "/meetings/options");
  const write = useStaffWrite(["meetings"]);
  const canWrite = data ? Boolean(data.write_enabled) : !!me?.write_areas.includes("meetings");
  const [v, setV] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    const base = data ?? copy;
    for (const k of FIELDS) out[k] = base?.[k] == null ? "" : String(base[k]);
    if (!data && copy) out.valid_status = "valid";
    out.meeting_type ||= "offline";
    out.valid_status ||= "valid";
    return out;
  });
  const [alarms, setAlarms] = useState<string[]>(() => {
    if (!data && copy) return [threeHoursBefore(String(copy.meeting_date ?? ""), String(copy.meeting_time ?? ""))];
    const list = ((data?.alarms as Dict[] | undefined) ?? []).map((a) => String(a.alarm_datetime).slice(0, 16));
    return list.length ? list : [""];
  });
  const [recipients, setRecipients] = useState<number[]>((((data ?? copy)?.recipients as Dict[] | undefined) ?? []).map((r) => r.id as number));
  const [files, setFiles] = useState<File[]>([]);
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  const { data: leads } = useStaffGet<Lead[]>(["meetings", "sales-search"], canWrite ? "/meetings/sales-search" : null);
  // 영업접수 연결 후보 — 고객사·제목(초성 가능)·담당자명·번호로 검색
  const leadItems = useMemo((): SearchItem[] => (leads ?? []).map((l) => ({
    value: String(l.seq), label: [l.client_company, l.title].filter(Boolean).join(" · ") || `#${l.seq}`,
    sub: [`#${l.seq}`, l.client_name, l.status_label].filter(Boolean).join(" · "),
  })), [leads]);
  const [places, setPlaces] = useState<{ side: string; items: Place[]; ai?: boolean } | null>(null);
  const ai = useAiJob<Place[]>();
  const [aiSide, setAiSide] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [result, setResult] = useState("");
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  // 신규 등록 — 알람을 직접 고치기 전까지 첫 알람을 약속일시 3시간 전으로 맞춘다
  const [alarmTouched, setAlarmTouched] = useState(false);
  const setWhen = (k: "meeting_date" | "meeting_time", val: string) => {
    set(k, val);
    if (data || alarmTouched) return;
    const next = { ...v, [k]: val };
    setAlarms((xs) => [threeHoursBefore(next.meeting_date, next.meeting_time), ...xs.slice(1)]);
  };
  const offline = v.meeting_type === "offline";

  const save = async () => {
    const fd = new FormData();
    FIELDS.forEach((k) => { if (v[k] !== "") fd.append(k, v[k]); });
    recipients.forEach((r) => fd.append("recipients", String(r)));
    alarms.filter(Boolean).forEach((a) => fd.append("alarm_datetimes", a));
    files.forEach((f) => fd.append("attachments", f));
    deleteIds.forEach((d) => fd.append("delete_attachment_ids", String(d)));
    try {
      if (!data) {
        const r = await write.mutateAsync({ url: "/meetings", body: fd });
        toast("success", "등록했습니다(연결 영업접수에 활동이 기록됩니다).");
        router.replace(`/managed/meetings/${r.seq}`);
      } else {
        await write.mutateAsync({ url: `/meetings/${id}/update`, body: fd });
        setFiles([]);
        setDeleteIds([]);
        toast("success", "저장했습니다.");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const call = async (url: string, body: Dict | undefined, ok: string) => {
    try {
      await write.mutateAsync({ url, body });
      toast("success", ok);
      return true;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
      return false;
    }
  };
  const searchPlace = async (side: string) => {
    try {
      const items = (await staffApi.post("/managed/meetings/place-search", { query: v[`${side}_place`] })).data as Place[];
      setPlaces({ side, items });
    } catch (err) {
      toast("warning", apiErrorDetail(err, "장소검색에 실패했습니다."));
    }
  };
  const aiPlace = (side: string) => {
    const query = (v[`${side}_place`] || v[`${side}_address`]).trim();
    if (!query) {
      toast("warning", "장소명이나 주소를 먼저 입력해주세요.");
      return;
    }
    setPlaces(null);
    setAiSide(side);
    ai.start("/ai/place-search", { query, address: v[`${side}_place`].trim() ? v[`${side}_address`] : "" }, (items) => setPlaces({ side, items, ai: true }));
  };
  const placeInputs = (side: "start" | "end", label: string) => (
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
      <Field label={label}><Input className="rounded-xl" disabled={!canWrite} value={v[`${side}_place`]} onChange={(e) => set(`${side}_place`, e.target.value)} /></Field>
      <Field label="주소" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v[`${side}_address`]} onChange={(e) => set(`${side}_address`, e.target.value)} /></Field>
      <div className="flex items-end gap-1">
        <Input className="rounded-xl" placeholder="위도" disabled={!canWrite} value={v[`${side}_lat`]} onChange={(e) => set(`${side}_lat`, e.target.value)} />
        <Input className="rounded-xl" placeholder="경도" disabled={!canWrite} value={v[`${side}_lng`]} onChange={(e) => set(`${side}_lng`, e.target.value)} />
        {canWrite && o?.place_search && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => searchPlace(side)} title="장소검색" aria-label="장소검색"><Search className="h-4 w-4" /></Button>}
        {canWrite && o?.ai_place_search && (
          <Button size="sm" variant="outline" className="rounded-xl text-indigo-700" disabled={ai.running} onClick={() => aiPlace(side)} title="AI 로 주소·좌표 찾기" aria-label="AI 로 주소·좌표 찾기">
            <Sparkles className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <PageActions>
        {data && (
          <>
            {Boolean(data.map_url) && <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={data.map_url as string} target="_blank" rel="noopener noreferrer"><MapPin className="mr-1 h-4 w-4" /> 네이버지도</a></Button>}
            <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={staffFileUrl(`/meetings/${id}/ics`)}><CalendarPlus className="mr-1 h-4 w-4" /> ICS</a></Button>
            <Button size="sm" variant="outline" className="rounded-xl" asChild>
              {/* PC 는 파일(.html)을 내려받아 실행, 휴대폰은 받은 파일을 다시 열기 번거로워 추가 화면 링크를 바로 연다 */}
              <a href={staffFileUrl(`/meetings/${id}/google-calendar`)} title="구글 캘린더 일정 추가 화면을 엽니다(PC 는 파일로 내려받아 실행)"
                onClick={(e) => {
                  if (isMobileDevice()) {
                    e.preventDefault();
                    window.open(data.google_calendar_url as string, "_blank", "noopener,noreferrer");
                  }
                }}>
                <CalendarPlus className="mr-1 h-4 w-4" /> 구글 캘린더
              </a>
            </Button>
          </>
        )}
        {data && me?.write_areas.includes("meetings") && (
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => router.push(`/managed/meetings/new?copy=${id}`)} title="복사해서 새 일정 등록"><Copy className="mr-1 h-4 w-4" /> 복사</Button>
        )}
        {data && canWrite && (
          <>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => call(`/meetings/${id}/toggle`, undefined, "상태를 바꿨습니다.")}><Power className="mr-1 h-4 w-4" /> 유효/무효</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => call(`/meetings/${id}/test-send`, undefined, "테스트 메일을 보냈습니다.")}><Send className="mr-1 h-4 w-4" /> 테스트</Button>
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} title="삭제" aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>
          </>
        )}
      </PageActions>
      {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/meeting/${data ? `${id}/` : "create/"}`} />}
      <Card className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="제목 *" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="유형">
            <select className={selectClass} disabled={!canWrite} value={v.meeting_type} onChange={(e) => set("meeting_type", e.target.value)}>
              {Object.entries(o?.types ?? { offline: "오프라인", video: "화상미팅", phone: "전화" }).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          </Field>
          <Field label="상태">
            <select className={selectClass} disabled={!canWrite} value={v.valid_status} onChange={(e) => set("valid_status", e.target.value)}>
              <option value="valid">유효</option><option value="invalid">무효</option>
            </select>
          </Field>
          <Field label="약속날짜 *"><Input className="rounded-xl" type="date" disabled={!canWrite} value={v.meeting_date} onChange={(e) => setWhen("meeting_date", e.target.value)} /></Field>
          <Field label="약속시간"><Input className="rounded-xl" type="time" disabled={!canWrite} value={v.meeting_time} onChange={(e) => setWhen("meeting_time", e.target.value)} /></Field>
          {offline && placeInputs("start", "출발지")}
          {offline && placeInputs("end", "약속장소 *")}
          {v.meeting_type === "video" && <Field label="화상미팅 링크 *" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v.video_meeting_url} onChange={(e) => set("video_meeting_url", e.target.value)} /></Field>}
        </div>
        {offline && canWrite && (
          <p className="text-xs text-muted-foreground">
            {o?.ai_place_search ? "장소명을 쓰고 ✨(AI 찾기, 웹검색으로 주소·위도·경도)를 누르거나 " : ""}
            {o?.place_search ? "🔍(장소검색)을 누르거나 " : ""}주소(필요하면 좌표)를 직접 입력합니다. 좌표가 없으면 네이버 지도는 주소 검색으로 열립니다.
          </p>
        )}
        {offline && aiSide && (
          <>
            <AiProgress running={ai.running} elapsed={ai.job?.elapsed ?? 0} model={ai.job?.model} label={`AI 가 ${aiSide === "start" ? "출발지" : "약속장소"}를 찾는 중…`} hint="웹검색 · 보통 15~60초" />
            {ai.error && <p className="text-xs text-red-600">{ai.error}</p>}
          </>
        )}
        {places && (
          <div className="rounded-xl border p-2 text-xs">
            <div className="mb-1 flex items-center justify-between px-2 text-muted-foreground">
              <span>{places.side === "start" ? "출발지" : "약속장소"} 후보{places.ai ? " — 선택 전에 주소를 확인하세요" : ""}</span>
              <button className="hover:text-foreground" onClick={() => setPlaces(null)} aria-label="닫기"><X className="h-3.5 w-3.5" /></button>
            </div>
            {places.items.length === 0 && <p className="px-2">검색 결과가 없습니다.</p>}
            {places.items.map((p, i) => (
              <div key={i} className="flex items-start gap-1 rounded hover:bg-muted">
                <button className="min-w-0 flex-1 px-2 py-1 text-left" onClick={() => {
                  setV((x) => ({
                    ...x, [`${places.side}_place`]: p.name || x[`${places.side}_place`], [`${places.side}_address`]: p.address,
                    [`${places.side}_lat`]: p.lat == null ? "" : String(p.lat), [`${places.side}_lng`]: p.lng == null ? "" : String(p.lng),
                  }));
                  setPlaces(null);
                }}>
                  {p.source === "naver" && <span className="mr-1 rounded bg-green-100 px-1 text-green-800">네이버</span>}
                  {p.source?.startsWith("claude") && <span className="mr-1 rounded bg-indigo-100 px-1 text-indigo-800">AI</span>}
                  <span className="font-medium">{p.name}</span> · {p.address}
                  {p.lat == null ? <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">좌표 없음</span>
                    : p.approx && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">근사 좌표</span>}
                  {p.snippet && <span className="block truncate text-muted-foreground">{p.snippet}</span>}
                </button>
                {p.source_url && (
                  <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground" title="출처" aria-label="출처">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <Field label="메모"><Textarea className="rounded-xl" disabled={!canWrite} value={v.memo} onChange={(e) => set("memo", e.target.value)} /></Field>
        <div className="space-y-1 text-sm">
          <p className="font-semibold">연결 영업접수 {v.sales_lead_id ? `#${v.sales_lead_id}` : ""}{data?.sales_lead ? ` · ${data.sales_lead}` : ""}</p>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <SearchSelect className="max-w-md" items={leadItems} value={v.sales_lead_id} emptyOption="연결 안 함" placeholder="영업접수 선택"
                searchPlaceholder="고객사·제목·담당자·번호 (초성 가능)" onChange={(id) => set("sales_lead_id", id)} />
              {v.sales_lead_id && <Button size="sm" variant="ghost" onClick={() => set("sales_lead_id", "")}>연결 해제</Button>}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">알람일시 *</p>
          {alarms.map((a, i) => {
            const st = ((data?.alarms as Dict[] | undefined) ?? []).find((x) => String(x.alarm_datetime).slice(0, 16) === a);
            return (
              <div key={i} className="flex items-center gap-2">
                <Input className="max-w-xs rounded-xl" type="datetime-local" step={600} disabled={!canWrite || Boolean(st?.notified)} value={a} onChange={(e) => { setAlarmTouched(true); setAlarms(alarms.map((x, j) => (j === i ? e.target.value : x))); }} />
                {st && <span className="text-xs text-muted-foreground">{st.status_label as string}</span>}
                {canWrite && !st?.notified && <Button variant="ghost" size="sm" onClick={() => { if (i === 0) setAlarmTouched(true); setAlarms(alarms.filter((_, j) => j !== i)); }}><X className="h-4 w-4" /></Button>}
              </div>
            );
          })}
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setAlarms([...alarms, ""])}><Plus className="mr-1 h-4 w-4" /> 알람 추가</Button>}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">알람 수신자(비우면 등록자)</p>
          <div className="flex flex-wrap gap-3">
            {o?.agents.map((a) => (
              <label key={a.id} className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!canWrite} checked={recipients.includes(a.id)}
                onChange={(e) => setRecipients(e.target.checked ? [...recipients, a.id] : recipients.filter((x) => x !== a.id))} />{a.name}</label>
            ))}
          </div>
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-semibold">첨부</p>
          {((data?.attachments as Dict[] | undefined) ?? []).map((f) => (
            <div key={f.id as number} className="flex items-center gap-2 text-xs">
              <a className={`underline ${deleteIds.includes(f.id as number) ? "line-through" : ""}`} href={staffFileUrl(`/meetings/${id}/attachments/${f.id}`)}>{f.name as string}</a>
              {canWrite && <button className="text-red-600" onClick={() => setDeleteIds([...deleteIds, f.id as number])}>삭제</button>}
            </div>
          ))}
          {canWrite && <input type="file" multiple className="text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />}
        </div>
        {data && <p className="text-xs text-muted-foreground">등록자 {data.created_by as string} · 다음 알람 {fmtDateTime(data.next_alarm as string)}</p>}
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      {data && Boolean(data.sales_lead_id) && canWrite && (
        <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5">
          <p className="text-sm font-semibold">결과 기록(영업접수 활동이력)</p>
          <Textarea className="rounded-xl" value={result} onChange={(e) => setResult(e.target.value)} />
          <div className="flex justify-end"><Button size="sm" className="rounded-xl" disabled={!result.trim()} onClick={async () => { if (await call(`/meetings/${id}/record-result`, { content: result }, "영업접수에 기록했습니다.")) setResult(""); }}>기록</Button></div>
        </CardContent></Card>
      )}
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="미팅약속 삭제" description="알람·첨부까지 삭제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { if (await call(`/meetings/${id}/delete`, undefined, "삭제했습니다.")) router.replace("/managed/meetings"); }} />
    </div>
  );
}
