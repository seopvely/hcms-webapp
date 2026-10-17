"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FileText, Paperclip, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate, fmtDateTime, selectCls } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { type SearchItem, SearchSelect } from "@/components/managed/search-select";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl, useLookupCompanies, useLookupProjects } from "@/lib/staff-maintenance";
import { type SalesChoices, useSalesMutation, useStaffLead, useStaffLeads, useStaffList } from "@/lib/staff-sales";
import { useStaffMe } from "@/lib/staff-hooks";

const DRAFT_KEY = "managed_sales_draft";
const opts = (m?: Record<string, string>): [string, string][] => Object.entries(m ?? {});

function leadFields(choices: SalesChoices | undefined, companies: [string, string][], staff: [string, string][]): FieldSpec[] {
  return [
    { key: "title", label: "건명 *", wide: true },
    { key: "source", label: "유입 채널", type: "select", options: opts(choices?.source) },
    { key: "priority", label: "우선순위", type: "select", options: opts(choices?.priority) },
    { key: "company_id", label: "기존 업체", type: "select", search: true, options: companies },
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
    setPageTitle(isNew ? "영업접수 등록" : data?.title || "영업접수");
  }, [setPageTitle, isNew, data?.title]);
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
  const [edit, setEdit] = useState<{ seq: number; type: string; content: string; removed: number[]; added: FileList | null } | null>(null);
  const canWrite = lead.write_enabled;
  const { data: allProjects } = useLookupProjects();
  const { data: companies } = useLookupCompanies();
  // 연결 후보 — 이미 연결된 것은 빼고, 이 영업접수의 기존 업체 프로젝트를 앞에. 이름(초성)·번호·업체명으로 검색
  const projectItems = useMemo((): SearchItem[] => {
    const leadCompany = Number(lead.company_id) || 0;
    const linked = new Set(lead.projects.map((p) => p.seq));
    const companyName = new Map((companies?.items ?? []).map((c) => [c.id, c.name]));
    const items = (allProjects?.items ?? []).filter((p) => !linked.has(p.id)).map((p) => {
      const cid = p.company_id ?? 0;
      const own = !!leadCompany && cid === leadCompany;
      return { value: String(p.id), label: p.name, sub: `#${p.id}${companyName.get(cid) ? ` · ${companyName.get(cid)}` : ""}`,
        group: leadCompany ? (own ? "기존 업체 프로젝트" : "다른 프로젝트") : undefined, rank: own ? 1 : 0 };
    });
    return items.sort((a, b) => b.rank - a.rank);
  }, [allProjects, companies, lead.company_id, lead.projects]);

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
        <PageActions>
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> 수정</Button>}
          {lead.estimate ? (
            <Button size="sm" variant="outline" className="rounded-xl" asChild><Link href={`/managed/estimates/${lead.estimate.seq}`}><FileText className="mr-1 h-4 w-4" /> 견적 {lead.estimate.number}</Link></Button>
          ) : me?.write_areas.includes("sales") && (
            <Button size="sm" className="rounded-xl" onClick={async () => { const r = await call(`/sales/${lead.seq}/to-estimate`, {}, "견적서를 만들었습니다."); if (r && typeof r === "object") router.push(`/managed/estimates/${(r as { estimate_id: number }).estimate_id}`); }}><FileText className="mr-1 h-4 w-4" /> 견적 전환</Button>
          )}
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>}
        </PageActions>
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/sales/${lead.seq}/`} />}
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-4 text-white">
          <p className="text-sm text-white/80">{lead.client_company} · {lead.client_name} {lead.client_position} · {lead.source_label} · 우선순위 {lead.priority_label}</p>
          <h1 className="mt-1 text-lg font-bold">{lead.title}{lead.is_draft ? " (예전 임시저장)" : ""}</h1>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Card className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5 text-sm">
              <div><p className="text-xs text-muted-foreground">요청내용</p><p className="whitespace-pre-wrap">{lead.description || "-"}</p></div>
              <div><p className="text-xs text-muted-foreground">내부 메모</p><p className="whitespace-pre-wrap">{lead.notes || "-"}</p></div>
            </CardContent></Card>
            {canWrite && (
              <Card className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5">
                <div className="flex gap-2">
                  <select className={selectCls("w-36")} value={type} onChange={(e) => setType(e.target.value)}>
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
                    {/* 본인 기록(관리자는 전체)·사용자 활동 유형만 — 백엔드 _own_activity 와 같은 기준 */}
                    {canWrite && (a.by_id === me?.id || me?.is_admin) && a.type in lead.choices.activity && edit?.seq !== a.seq && (
                      <>
                        <button className="ml-2 text-blue-600" onClick={() => setEdit({ seq: a.seq, type: a.type, content: a.content ?? "", removed: [], added: null })}>수정</button>
                        <button className="ml-2 text-red-600" onClick={() => window.confirm("활동을 삭제할까요?") && call(`/sales/activities/${a.seq}/delete`, {}, "삭제했습니다.")}>삭제</button>
                      </>
                    )}
                  </p>
                  {edit?.seq === a.seq ? (
                    <div className="mt-2 space-y-2">
                      <select className={selectCls("w-36")} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                        {opts(lead.choices.activity).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <Textarea className="min-h-20 rounded-xl bg-background" value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} />
                      {a.attachments.length > 0 && (
                        <ul className="space-y-1 text-xs">
                          {a.attachments.map((f) => {
                            const gone = edit.removed.includes(f.id);
                            return (
                              <li key={f.id} className="flex items-center gap-2">
                                <Paperclip className="h-3 w-3 shrink-0" />
                                <span className={gone ? "text-muted-foreground line-through" : ""}>{f.filename}</span>
                                <button type="button" className={gone ? "text-blue-600" : "text-red-600"}
                                  onClick={() => setEdit({ ...edit, removed: gone ? edit.removed.filter((x) => x !== f.id) : [...edit.removed, f.id] })}>
                                  {gone ? "되돌리기" : <X className="h-3 w-3" aria-label="첨부 삭제" />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <Input type="file" multiple className="rounded-xl bg-background" onChange={(e) => setEdit({ ...edit, added: e.target.files })} />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEdit(null)}>취소</Button>
                        <Button size="sm" className="rounded-xl" disabled={!edit.content.trim() || mutate.isPending} onClick={async () => {
                          try {
                            await mutate.mutateAsync({ method: "patch", url: `/sales/activities/${a.seq}`, body: { content: edit.content, activity_type: edit.type } });
                            for (const id of edit.removed) await mutate.mutateAsync({ url: `/sales/activities/${a.seq}/attachments/${id}/delete` });
                            if (edit.added?.length) {
                              const form = new FormData();
                              Array.from(edit.added).forEach((f) => form.append("attachments", f));
                              await mutate.mutateAsync({ url: `/sales/activities/${a.seq}/attachments`, body: form });
                            }
                            toast("success", "수정했습니다.");
                            setEdit(null);
                          } catch (err) {
                            toast("error", apiErrorDetail(err, "수정에 실패했습니다."));
                          }
                        }}>저장</Button>
                      </div>
                    </div>
                  ) : <p className="whitespace-pre-wrap">{a.content}</p>}
                  {a.attachments.map((f) => <a key={f.id} href={staffFileUrl(`/sales/files/${f.id}`)} className="mr-2 inline-flex items-center gap-1 text-xs text-blue-600"><Paperclip className="h-3 w-3" /> {f.filename}</a>)}
                </div>
              ))}
            </CardContent></Card>
          </div>
          <div className="order-first h-fit space-y-4 lg:sticky lg:top-20 lg:order-last">
            <Card className="rounded-2xl"><CardContent className="pt-5 pb-5">
              <dl className="space-y-3">
                <Info label="상태">
                  {canWrite ? (
                    <select className="h-8 rounded-lg border bg-background px-2 text-xs" value={lead.status} onChange={(e) => call(`/sales/${lead.seq}/status`, { status: e.target.value }, "상태를 변경했습니다.")}>
                      {opts(lead.choices.status).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : <Badge variant="outline">{lead.status_label}</Badge>}
                </Info>
                <Info label="예상금액 · 수주일">{lead.expected_amount.toLocaleString()}원 · {fmtDate(lead.expected_close_date)}</Info>
                <Info label="담당">{lead.manager_name || "-"}</Info>
                <Info label="연락처">{lead.client_phone || "-"}</Info>
                <Info label="이메일"><span className="break-all">{lead.client_email || "-"}</span></Info>
                <Info label="기존 업체">{lead.company_name || "-"}</Info>
                <Info label="연결 프로젝트">
                  <div className="flex flex-wrap items-center gap-1">
                    {lead.projects.map((p) => (
                      <span key={p.seq} className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">#{p.seq} {p.title}
                        {canWrite && <button className="text-red-600" onClick={() => call(`/sales/${lead.seq}/projects/${p.seq}/unlink`, {}, "연결을 해제했습니다.")}>×</button>}
                      </span>
                    ))}
                    {!canWrite && lead.projects.length === 0 && "-"}
                  </div>
                  {canWrite && (
                    <span className="mt-1 flex w-full max-w-md gap-1">
                      <SearchSelect className="h-8 min-w-0 flex-1 rounded-lg text-xs" items={projectItems} value={projectId} placeholder="연결할 프로젝트 선택"
                        searchPlaceholder="프로젝트명·번호·업체명 (초성 가능)" onChange={setProjectId} />
                      <Button size="sm" variant="outline" className="h-8 rounded-lg" disabled={!projectId || mutate.isPending} onClick={async () => { if (await call(`/sales/${lead.seq}/projects`, { project_id: Number(projectId) }, "연결했습니다.")) setProjectId(""); }}>연결</Button>
                    </span>
                  )}
                </Info>
              </dl>
            </CardContent></Card>
          </div>
        </div>
      </div>
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="영업접수 삭제" description="활동·첨부가 함께 삭제되고 프로젝트·미팅 연결은 해제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { if (await call(`/sales/${lead.seq}/delete`, {}, "삭제했습니다.")) router.replace("/managed/sales"); }} />
    </PageTransition>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
