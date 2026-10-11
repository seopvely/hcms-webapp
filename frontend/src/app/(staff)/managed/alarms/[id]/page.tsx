"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Power, Send, Trash2, X } from "lucide-react";
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

type Dict = Record<string, unknown>;
type Options = { when: Record<string, string>; cycles: Record<string, string>; templates: Record<string, string[]>; agents: { id: number; name: string }[] };

export default function AlarmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["alarms", "detail", id], isNew ? null : `/alarms/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "알람 등록" : "알람");
  }, [setPageTitle, isNew]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return <PageTransition><Editor key={id} id={id} data={isNew ? null : data!} /></PageTransition>;
}

const toLocal = (v: string) => v.slice(0, 16);

function Editor({ id, data }: { id: string; data: Dict | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: o } = useStaffGet<Options>(["alarms", "options"], "/alarms/options");
  const write = useStaffWrite(["alarms"]);
  const canWrite = data ? Boolean(data.write_enabled) : !!me?.write_areas.includes("alarms");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const s = (k: string, d = "") => (data?.[k] == null ? d : String(data[k]));
  const [v, setV] = useState({
    title: s("title"), content: s("content"), when_to_notify: s("when_to_notify", "week"), custom_days: s("custom_days"), cycle_type: s("cycle_type", "none"),
    cycle_days: s("cycle_days"), cycle_end_date: s("cycle_end_date"), alarm_time: s("alarm_time"),
  });
  const notifiedDates = ((data?.event_dates as Dict[] | undefined) ?? []).filter((e) => e.notified);
  const [dates, setDates] = useState<string[]>(() => {
    const pending = ((data?.event_dates as Dict[] | undefined) ?? []).filter((e) => !e.notified).map((e) => toLocal(e.event_date as string));
    return pending.length ? pending : [""];
  });
  const [allAgents, setAllAgents] = useState<boolean>(data ? Boolean(data.send_to_all_agents) : true);
  const [recipients, setRecipients] = useState<number[]>((data?.recipient_ids as number[] | undefined) ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [deleteIds, setDeleteIds] = useState<number[]>([]);
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));

  const save = async () => {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => { if (val !== "") fd.append(k, val); });
    fd.append("send_to_all_agents", String(allAgents));
    if (!allAgents) recipients.forEach((r) => fd.append("recipients", String(r)));
    [...notifiedDates.map((e) => toLocal(e.event_date as string)), ...dates].filter(Boolean).forEach((d) => fd.append("event_dates", d));
    files.forEach((f) => fd.append("attach_files", f));
    if (image) fd.append("image", image);
    deleteIds.forEach((d) => fd.append("delete_attachment_ids", String(d)));
    try {
      if (!data) {
        const r = await write.mutateAsync({ url: "/alarms", body: fd });
        toast("success", "등록했습니다.");
        router.replace(`/managed/alarms/${r.seq}`);
      } else {
        await write.mutateAsync({ url: `/alarms/${id}/update`, body: fd });
        toast("success", "저장했습니다.");
        setFiles([]);
        setImage(null);
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const act = async (url: string, ok: string) => {
    try {
      await write.mutateAsync({ url });
      toast("success", ok);
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/alarms"><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link></Button>
        {data && <span className={`rounded-full px-2 py-0.5 text-xs ${data.valid_status === "valid" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{data.valid_status === "valid" ? "유효" : "무효"}</span>}
        <div className="flex-1" />
        {data && canWrite && (
          <>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act(`/alarms/${id}/toggle`, "상태를 바꿨습니다.")}><Power className="mr-1 h-4 w-4" /> 유효/무효</Button>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act(`/alarms/${id}/test-send`, "테스트 메일을 보냈습니다.")}><Send className="mr-1 h-4 w-4" /> 테스트 발송</Button>
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /></Button>
          </>
        )}
      </div>
      {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/alarm/${data ? `${id}/` : "create/"}`} />}
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="제목 *" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="알람 시점">
            <select className={selectClass} disabled={!canWrite} value={v.when_to_notify} onChange={(e) => set("when_to_notify", e.target.value)}>
              {Object.entries(o?.when ?? {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          </Field>
          {v.when_to_notify === "custom" && <Field label="며칠 전(0=당일)"><Input className="rounded-xl" type="number" disabled={!canWrite} value={v.custom_days} onChange={(e) => set("custom_days", e.target.value)} /></Field>}
          <Field label="반복">
            <select className={selectClass} disabled={!canWrite} value={v.cycle_type} onChange={(e) => set("cycle_type", e.target.value)}>
              {Object.entries(o?.cycles ?? {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          </Field>
          {v.cycle_type === "custom" && <Field label="N일마다"><Input className="rounded-xl" type="number" disabled={!canWrite} value={v.cycle_days} onChange={(e) => set("cycle_days", e.target.value)} /></Field>}
          {v.cycle_type !== "none" && <Field label="반복 종료일"><Input className="rounded-xl" type="date" disabled={!canWrite} value={v.cycle_end_date} onChange={(e) => set("cycle_end_date", e.target.value)} /></Field>}
          <Field label="발송 시각(비우면 09:00)"><Input className="rounded-xl" type="time" disabled={!canWrite} value={v.alarm_time} onChange={(e) => set("alarm_time", e.target.value)} /></Field>
        </div>
        <Field label="내용 *">
          {canWrite && (
            <select className={`${selectClass} mb-2`} value="" onChange={(e) => e.target.value && set("content", e.target.value)}>
              <option value="">템플릿 문구 선택</option>
              {Object.entries(o?.templates ?? {}).map(([g, items]) => <optgroup key={g} label={g}>{items.map((t) => <option key={t} value={t}>{t.slice(0, 40)}…</option>)}</optgroup>)}
            </select>
          )}
          <Textarea className="min-h-28 rounded-xl" disabled={!canWrite} value={v.content} onChange={(e) => set("content", e.target.value)} />
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-semibold">이벤트 일시</p>
          {notifiedDates.map((e) => <p key={e.id as number} className="text-xs text-muted-foreground">{fmtDateTime(e.event_date as string)} · 발송완료 {fmtDateTime(e.notified_at as string)}</p>)}
          {dates.map((d, i) => (
            <div key={i} className="flex gap-2">
              <Input className="max-w-xs rounded-xl" type="datetime-local" step={600} disabled={!canWrite} value={d} onChange={(e) => setDates(dates.map((x, j) => (j === i ? e.target.value : x)))} />
              {canWrite && <Button variant="ghost" size="sm" onClick={() => setDates(dates.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
            </div>
          ))}
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setDates([...dates, ""])}><Plus className="mr-1 h-4 w-4" /> 일시 추가</Button>}
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canWrite} checked={allAgents} onChange={(e) => setAllAgents(e.target.checked)} /> 모든 에이전트에게 발송</label>
          {!allAgents && (
            <div className="flex flex-wrap gap-3">
              {o?.agents.map((a) => (
                <label key={a.id} className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!canWrite} checked={recipients.includes(a.id)}
                  onChange={(e) => setRecipients(e.target.checked ? [...recipients, a.id] : recipients.filter((x) => x !== a.id))} />{a.name}</label>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">첨부</p>
          {data?.image ? <a className="text-xs underline" href={staffFileUrl(`/alarms/${id}/files/image`)}>이미지: {(data.image as Dict).name as string}</a> : null}
          {((data?.files as Dict[] | undefined) ?? []).map((f) => (
            <div key={f.id as string} className="flex items-center gap-2 text-xs">
              <a className={`underline ${deleteIds.includes(Number(String(f.id).replace("att-", ""))) ? "line-through" : ""}`} href={staffFileUrl(`/alarms/${id}/files/${f.id}`)}>{f.name as string}</a>
              {canWrite && String(f.id).startsWith("att-") && <button className="text-red-600" onClick={() => setDeleteIds([...deleteIds, Number(String(f.id).replace("att-", ""))])}>삭제</button>}
            </div>
          ))}
          {canWrite && (
            <div className="flex flex-wrap gap-3 text-xs">
              <label>이미지 <input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></label>
              <label>파일 <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
            </div>
          )}
        </div>
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      {data && (
        <Card className="rounded-2xl"><CardContent className="divide-y p-0">
          <p className="px-4 py-3 text-sm font-semibold">최근 발송 이력</p>
          {((data.histories as Dict[]) ?? []).map((h) => (
            <div key={h.seq as number} className="flex gap-3 px-4 py-2 text-xs">
              <span className="w-32">{fmtDateTime(h.sent_at as string)}</span><span>{h.status_label as string}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.recipients as string}{h.error_message ? ` · ${h.error_message}` : ""}</span>
            </div>
          ))}
        </CardContent></Card>
      )}
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="알람 삭제" description="이벤트 일시·발송 이력·첨부까지 삭제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { try { await write.mutateAsync({ url: `/alarms/${id}/delete` }); toast("success", "삭제했습니다."); router.replace("/managed/alarms"); } catch (err) { toast("error", apiErrorDetail(err, "삭제에 실패했습니다.")); } }} />
    </div>
  );
}
