"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarPlus, MapPin, Plus, Power, Search, Send, Trash2, X } from "lucide-react";
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
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useStaffMe } from "@/lib/staff-hooks";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import staffApi from "@/lib/staff-api";

type Dict = Record<string, unknown>;
type Options = { types: Record<string, string>; agents: { id: number; name: string }[]; place_search: boolean };
type Place = { name: string; address: string; lat: number; lng: number };
const FIELDS = ["title", "meeting_type", "meeting_date", "meeting_time", "start_place", "start_address", "start_lat", "start_lng", "end_place", "end_address",
  "end_lat", "end_lng", "video_meeting_url", "memo", "valid_status", "sales_lead_id"] as const;

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["meetings", "detail", id], isNew ? null : `/meetings/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "미팅 등록" : "미팅약속");
  }, [setPageTitle, isNew]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return <PageTransition><Editor key={id} id={id} data={isNew ? null : data!} /></PageTransition>;
}

function Editor({ id, data }: { id: string; data: Dict | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: o } = useStaffGet<Options>(["meetings", "options"], "/meetings/options");
  const write = useStaffWrite(["meetings"]);
  const canWrite = data ? Boolean(data.write_enabled) : !!me?.write_areas.includes("meetings");
  const [v, setV] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of FIELDS) out[k] = data?.[k] == null ? "" : String(data[k]);
    out.meeting_type ||= "offline";
    out.valid_status ||= "valid";
    return out;
  });
  const [alarms, setAlarms] = useState<string[]>(() => {
    const list = ((data?.alarms as Dict[] | undefined) ?? []).map((a) => String(a.alarm_datetime).slice(0, 16));
    return list.length ? list : [""];
  });
  const [recipients, setRecipients] = useState<number[]>(((data?.recipients as Dict[] | undefined) ?? []).map((r) => r.id as number));
  const [files, setFiles] = useState<File[]>([]);
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  const [leadQ, setLeadQ] = useState("");
  const [leads, setLeads] = useState<Dict[]>([]);
  const [places, setPlaces] = useState<{ side: string; items: Place[] } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [result, setResult] = useState("");
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
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
  const searchLeads = async () => setLeads((await staffApi.get("/managed/meetings/sales-search", { params: { q: leadQ } })).data);
  const searchPlace = async (side: string) => {
    try {
      const items = (await staffApi.post("/managed/meetings/place-search", { query: v[`${side}_place`] })).data as Place[];
      setPlaces({ side, items });
    } catch (err) {
      toast("warning", apiErrorDetail(err, "장소검색에 실패했습니다."));
    }
  };
  const placeInputs = (side: "start" | "end", label: string) => (
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
      <Field label={label}><Input className="rounded-xl" disabled={!canWrite} value={v[`${side}_place`]} onChange={(e) => set(`${side}_place`, e.target.value)} /></Field>
      <Field label="주소" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v[`${side}_address`]} onChange={(e) => set(`${side}_address`, e.target.value)} /></Field>
      <div className="flex items-end gap-1">
        <Input className="rounded-xl" placeholder="위도" disabled={!canWrite} value={v[`${side}_lat`]} onChange={(e) => set(`${side}_lat`, e.target.value)} />
        <Input className="rounded-xl" placeholder="경도" disabled={!canWrite} value={v[`${side}_lng`]} onChange={(e) => set(`${side}_lng`, e.target.value)} />
        {canWrite && o?.place_search && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => searchPlace(side)}><Search className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/meetings"><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link></Button>
        <div className="flex-1" />
        {data && (
          <>
            {Boolean(data.map_url) && <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={data.map_url as string} target="_blank" rel="noopener noreferrer"><MapPin className="mr-1 h-4 w-4" /> 네이버지도</a></Button>}
            <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={staffFileUrl(`/meetings/${id}/ics`)}><CalendarPlus className="mr-1 h-4 w-4" /> ICS</a></Button>
            <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={data.google_calendar_url as string} target="_blank" rel="noopener noreferrer">구글 캘린더</a></Button>
          </>
        )}
        {data && canWrite && (
          <>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => call(`/meetings/${id}/toggle`, undefined, "상태를 바꿨습니다.")}><Power className="mr-1 h-4 w-4" /> 유효/무효</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => call(`/meetings/${id}/test-send`, undefined, "테스트 메일을 보냈습니다.")}><Send className="mr-1 h-4 w-4" /> 테스트</Button>
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /></Button>
          </>
        )}
      </div>
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
          <Field label="약속날짜 *"><Input className="rounded-xl" type="date" disabled={!canWrite} value={v.meeting_date} onChange={(e) => set("meeting_date", e.target.value)} /></Field>
          <Field label="약속시간"><Input className="rounded-xl" type="time" disabled={!canWrite} value={v.meeting_time} onChange={(e) => set("meeting_time", e.target.value)} /></Field>
          {offline && placeInputs("start", "출발지")}
          {offline && placeInputs("end", "약속장소 *")}
          {v.meeting_type === "video" && <Field label="화상미팅 링크 *" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v.video_meeting_url} onChange={(e) => set("video_meeting_url", e.target.value)} /></Field>}
        </div>
        {offline && !o?.place_search && canWrite && <p className="text-xs text-muted-foreground">장소검색 키가 설정되지 않아 주소(필요하면 좌표)를 직접 입력합니다. 좌표가 없으면 네이버 지도는 주소 검색으로 열립니다.</p>}
        {places && (
          <div className="rounded-xl border p-2 text-xs">
            {places.items.length === 0 && <p>검색 결과가 없습니다.</p>}
            {places.items.map((p, i) => (
              <button key={i} className="block w-full rounded px-2 py-1 text-left hover:bg-muted" onClick={() => {
                setV((x) => ({ ...x, [`${places.side}_place`]: p.name, [`${places.side}_address`]: p.address, [`${places.side}_lat`]: String(p.lat), [`${places.side}_lng`]: String(p.lng) }));
                setPlaces(null);
              }}>{p.name} · {p.address}</button>
            ))}
          </div>
        )}
        <Field label="메모"><Textarea className="rounded-xl" disabled={!canWrite} value={v.memo} onChange={(e) => set("memo", e.target.value)} /></Field>
        <div className="space-y-1 text-sm">
          <p className="font-semibold">연결 영업접수 {v.sales_lead_id ? `#${v.sales_lead_id}` : ""}{data?.sales_lead ? ` · ${data.sales_lead}` : ""}</p>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Input className="max-w-xs rounded-xl" placeholder="영업접수 검색" value={leadQ} onChange={(e) => setLeadQ(e.target.value)} />
              <Button size="sm" variant="outline" className="rounded-xl" onClick={searchLeads}>검색</Button>
              {v.sales_lead_id && <Button size="sm" variant="ghost" onClick={() => set("sales_lead_id", "")}>연결 해제</Button>}
            </div>
          )}
          {leads.map((l) => <button key={l.seq as number} className="block text-xs underline" onClick={() => { set("sales_lead_id", String(l.seq)); setLeads([]); }}>#{l.seq as number} {l.client_company as string} · {l.title as string}</button>)}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">알람일시 *</p>
          {alarms.map((a, i) => {
            const st = ((data?.alarms as Dict[] | undefined) ?? []).find((x) => String(x.alarm_datetime).slice(0, 16) === a);
            return (
              <div key={i} className="flex items-center gap-2">
                <Input className="max-w-xs rounded-xl" type="datetime-local" step={600} disabled={!canWrite || Boolean(st?.notified)} value={a} onChange={(e) => setAlarms(alarms.map((x, j) => (j === i ? e.target.value : x)))} />
                {st && <span className="text-xs text-muted-foreground">{st.status_label as string}</span>}
                {canWrite && !st?.notified && <Button variant="ghost" size="sm" onClick={() => setAlarms(alarms.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
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
