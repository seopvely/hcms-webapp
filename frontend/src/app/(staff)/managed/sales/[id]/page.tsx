"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Paperclip, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate, fmtDateTime, selectClass } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl, useLookupCompanies } from "@/lib/staff-maintenance";
import { type SalesChoices, useSalesMutation, useStaffLead, useStaffLeads, useStaffList } from "@/lib/staff-sales";
import { useStaffMe } from "@/lib/staff-hooks";

const DRAFT_KEY = "managed_sales_draft";
const opts = (m?: Record<string, string>): [string, string][] => Object.entries(m ?? {});

function leadFields(choices: SalesChoices | undefined, companies: [string, string][], staff: [string, string][]): FieldSpec[] {
  return [
    { key: "title", label: "건명 *", wide: true },
    { key: "source", label: "유입 채널", type: "select", options: opts(choices?.source) },
    { key: "priority", label: "우선순위", type: "select", options: opts(choices?.priority) },
    { key: "company_id", label: "기존 업체", type: "select", options: companies },
    { key: "manager_id", label: "영업 담당자", type: "select", options: staff },
    { key: "client_company", label: "고객사명" }, { key: "client_name", label: "담당자명" },
    { key: "client_phone", label: "연락처" }, { key: "client_email", label: "이메일" }, { key: "client_position", label: "직책" },
    { key: "expected_amount", label: "예상금액(원)", type: "number" },
    { key: "expected_close_date", label: "예상 수주일", type: "date" },
    { key: "description", label: "요청내용", type: "textarea" },
    { key: "notes", label: "내부 메모", type: "textarea" },
  ];
}

export default function StaffLeadPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffLead(isNew ? null : Number(id));
  useEffect(() => {
    setPageTitle(isNew ? "영업접수 등록" : "영업접수");
  }, [setPageTitle, isNew]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return isNew ? <LeadForm lead={null} onDone={() => undefined} /> : <LeadView lead={data!} />;
}

function LeadForm({ lead, onDone }: { lead: Record<string, unknown> | null; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const mutate = useSalesMutation();
  const { data: list } = useStaffLeads({ page: 1 });
  const { data: companies } = useLookupCompanies();
  const { data: staff } = useStaffList();
  const fields = useMemo(() => leadFields(list?.choices, (companies?.items ?? []).map((c) => [String(c.id), c.name]),
    (staff?.items ?? []).map((u) => [String(u.id), u.name || u.username])), [list, companies, staff]);
  // 임시저장은 이 브라우저에만(서버 draft 행을 만들지 않는다)
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (lead) return toValues(leadFields(undefined, [], []), lead);
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "") as Record<string, string>;
    } catch {
      return { source: "other", priority: "medium" };
    }
  });
  useEffect(() => {
    if (lead) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      } catch {
        // 저장 공간 없음 — 무시
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [values, lead]);

  const save = async () => {
    const body = toPayload(fields, values);
    try {
      if (lead) {
        await mutate.mutateAsync({ method: "patch", url: `/sales/${lead.seq}`, body });
        toast("success", "저장했습니다.");
        onDone();
      } else {
        const res = await mutate.mutateAsync({ url: "/sales", body });
        localStorage.removeItem(DRAFT_KEY);
        toast("success", "등록했습니다.");
        router.replace(`/managed/sales/${res.seq}`);
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <PageTransition>
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        {!lead && <p className="text-xs text-muted-foreground">입력 내용은 이 브라우저에 자동으로 임시 저장됩니다.</p>}
        <FormGrid fields={fields} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
        <div className="flex justify-end gap-2">
          {lead && <Button variant="outline" className="rounded-xl" onClick={onDone}>취소</Button>}
          {!lead && <Button variant="outline" className="rounded-xl" onClick={() => { localStorage.removeItem(DRAFT_KEY); setValues({ source: "other", priority: "medium" }); }}>비우기</Button>}
          <Button className="rounded-xl" onClick={save} disabled={!values.title?.trim() || mutate.isPending}>{lead?.is_draft ? "확정 저장" : "저장"}</Button>
        </div>
      </CardContent></Card>
    </PageTransition>
  );
}

type Lead = NonNullable<ReturnType<typeof useStaffLead>["data"]>;

function LeadView({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const mutate = useSalesMutation();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [filter, setFilter] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const canWrite = lead.write_enabled;

  const call = async (url: string, body: Record<string, unknown> | FormData = {}, ok = "처리했습니다.") => {
    try {
      const res = await mutate.mutateAsync({ url, body });
      toast("success", ok);
      return res ?? true;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
      return null;
    }
  };

  if (editing) return <LeadForm lead={lead} onDone={() => setEditing(false)} />;
  const activities = lead.activities.filter((a) => !filter || a.type === filter);

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/sales"><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link></Button>
          <div className="flex-1" />
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> 수정</Button>}
          {lead.estimate ? (
            <Button size="sm" variant="outline" className="rounded-xl" asChild><Link href={`/managed/estimates/${lead.estimate.seq}`}><FileText className="mr-1 h-4 w-4" /> 견적 {lead.estimate.number}</Link></Button>
          ) : me?.write_areas.includes("sales") && (
            <Button size="sm" className="rounded-xl" onClick={async () => { const r = await call(`/sales/${lead.seq}/to-estimate`, {}, "견적서를 만들었습니다."); if (r && typeof r === "object") router.push(`/managed/estimates/${(r as { estimate_id: number }).estimate_id}`); }}><FileText className="mr-1 h-4 w-4" /> 견적 전환</Button>
          )}
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/sales/${lead.seq}/`} />}
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
          <p className="text-sm text-white/80">{lead.client_company} · {lead.client_name} {lead.client_position} · {lead.source_label} · 우선순위 {lead.priority_label}</p>
          <h1 className="mt-1 text-lg font-bold">{lead.title}{lead.is_draft ? " (예전 임시저장)" : ""}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {canWrite ? (
              <select className="h-7 rounded-lg px-1 text-xs text-slate-900" value={lead.status} onChange={(e) => call(`/sales/${lead.seq}/status`, { status: e.target.value }, "상태를 변경했습니다.")}>
                {opts(lead.choices.status).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : <Badge className="bg-white/20">{lead.status_label}</Badge>}
            <span>예상 {lead.expected_amount.toLocaleString()}원 · {fmtDate(lead.expected_close_date)}</span>
            <span>담당 {lead.manager_name || "-"}</span>
          </div>
        </div>
        <Card className="rounded-2xl"><CardContent className="grid gap-3 pt-5 pb-5 text-sm sm:grid-cols-2">
          <p>연락처 {lead.client_phone || "-"} · {lead.client_email || "-"}</p>
          <p>기존 업체 {lead.company_name || "-"}</p>
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">요청내용</p><p className="whitespace-pre-wrap">{lead.description || "-"}</p></div>
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">내부 메모</p><p className="whitespace-pre-wrap">{lead.notes || "-"}</p></div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">연결 프로젝트</p>
            {lead.projects.map((p) => (
              <span key={p.seq} className="mr-2 inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">#{p.seq} {p.title}
                {canWrite && <button className="text-red-600" onClick={() => call(`/sales/${lead.seq}/projects/${p.seq}/unlink`, {}, "연결을 해제했습니다.")}>×</button>}
              </span>
            ))}
            {canWrite && (
              <span className="inline-flex gap-1">
                <Input className="h-7 w-28 rounded-lg text-xs" placeholder="프로젝트 번호" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
                <Button size="sm" variant="outline" className="h-7 rounded-lg" disabled={!projectId} onClick={async () => { if (await call(`/sales/${lead.seq}/projects`, { project_id: Number(projectId) }, "연결했습니다.")) setProjectId(""); }}>연결</Button>
              </span>
            )}
          </div>
        </CardContent></Card>
        {canWrite && (
          <Card className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5">
            <div className="flex gap-2">
              <select className={`${selectClass} w-36`} value={type} onChange={(e) => setType(e.target.value)}>
                {opts(lead.choices.activity).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <Input type="file" multiple className="rounded-xl" onChange={(e) => setFiles(e.target.files)} />
            </div>
            <Textarea className="min-h-20 rounded-xl" placeholder="활동 내용" value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="flex justify-end"><Button className="rounded-xl" disabled={!content.trim()} onClick={async () => {
              const form = new FormData();
              form.append("activity_type", type);
              form.append("content", content);
              Array.from(files ?? []).forEach((f) => form.append("attachments", f));
              if (await call(`/sales/${lead.seq}/activities`, form, "기록했습니다.")) { setContent(""); setFiles(null); }
            }}>기록</Button></div>
          </CardContent></Card>
        )}
        <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">활동 ({lead.activities.length})</h2>
            <select className="h-8 rounded-lg border px-2 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">전체</option>
              {[...new Set(lead.activities.map((a) => a.type))].map((t) => <option key={t} value={t}>{lead.activities.find((a) => a.type === t)?.type_label}</option>)}
            </select>
          </div>
          {activities.map((a) => (
            <div key={a.seq} className="rounded-xl bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground"><Badge variant="outline">{a.type_label}</Badge> {a.by || "-"} · {fmtDateTime(a.created_at)}
                {canWrite && a.by_id === me?.id && !["auto", "status_change", "notification"].includes(a.type) && (
                  <button className="ml-2 text-red-600" onClick={() => window.confirm("활동을 삭제할까요?") && call(`/sales/activities/${a.seq}/delete`, {}, "삭제했습니다.")}>삭제</button>
                )}
              </p>
              <p className="whitespace-pre-wrap">{a.content}</p>
              {a.attachments.map((f) => <a key={f.id} href={staffFileUrl(`/sales/files/${f.id}`)} className="mr-2 inline-flex items-center gap-1 text-xs text-blue-600"><Paperclip className="h-3 w-3" /> {f.filename}</a>)}
            </div>
          ))}
        </CardContent></Card>
      </div>
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="영업접수 삭제" description="활동·첨부가 함께 삭제되고 프로젝트·미팅 연결은 해제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { if (await call(`/sales/${lead.seq}/delete`, {}, "삭제했습니다.")) router.replace("/managed/sales"); }} />
    </PageTransition>
  );
}
