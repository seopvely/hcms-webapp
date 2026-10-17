"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl, useLookupCompanies } from "@/lib/staff-maintenance";
import { useStaffList } from "@/lib/staff-sales";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { useStaffMe } from "@/lib/staff-hooks";

type Dict = Record<string, unknown>;
const TYPES: [string, string][] = [["1", "웹사이트"], ["2", "모바일앱"], ["3", "웹앱"], ["4", "웹+앱"], ["5", "도메인"], ["6", "보안서버"], ["7", "쇼핑몰"], ["8", "운영"], ["9", "유지보수"], ["10", "서버관리"], ["11", "서버마이그레이션"], ["12", "호스팅"], ["13", "개발구독"], ["15", "유지보수구독"], ["16", "FDE"]];
const ROLES: [string, string][] = [["contract", "계약"], ["planning", "기획"], ["design", "디자인"], ["frontend", "프론트엔드"], ["backend", "백엔드"], ["maintenance", "유지보수"]];

function useFields(): FieldSpec[] {
  const { data: companies } = useLookupCompanies();
  const { data: staff } = useStaffList();
  return useMemo(() => {
    const staffOpts: [string, string][] = (staff?.items ?? []).map((u) => [String(u.id), u.name || u.username]);
    return [
      { key: "company_id", label: "업체 *", type: "select", search: true, options: (companies?.items ?? []).map((c) => [String(c.id), c.name]) },
      { key: "title", label: "프로젝트명 *", wide: true },
      { key: "project_type", label: "유형", type: "select", options: TYPES },
      { key: "project_status", label: "상태", type: "select", options: [["1", "진행중"], ["2", "완료"], ["3", "중지"]] },
      { key: "contract_date", label: "계약일", type: "date" },
      { key: "contract_termination_date", label: "계약종료일(바꾸면 연장 처리)", type: "date" },
      { key: "contract_period_range", label: "계약기간" },
      { key: "contract_deposit", label: "계약금", type: "number" },
      { key: "point", label: "월 포인트", type: "number" },
      { key: "free_maint_months", label: "무상 유지보수 개월", type: "number" },
      { key: "free_maint_start_date", label: "무상 시작(직접 지정)", type: "date" },
      { key: "free_maint_end_date", label: "무상 종료(직접 지정)", type: "date" },
      { key: "free_maint_scope", label: "무상 유지보수 범위", wide: true },
      ...ROLES.map(([r, l]) => ({ key: `manager_${r}_id`, label: `담당 ${l}`, type: "select" as const, options: staffOpts })),
      { key: "contract_remarks", label: "비고", type: "textarea" },
    ];
  }, [companies, staff]);
}

export default function StaffProjectPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["projects", "detail", id], isNew ? null : `/projects/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "프로젝트 등록" : (data?.title as string) || "프로젝트");
  }, [setPageTitle, isNew, data?.title]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return isNew ? <ProjectForm project={null} onDone={() => undefined} /> : <ProjectView p={data!} />;
}

function ProjectForm({ project, onDone }: { project: Dict | null; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const fields = useFields();
  const write = useStaffWrite(["projects"]);
  const [values, setValues] = useState<Record<string, string>>(() => (project ? toValues(fields, project) : { project_status: "1" }));
  const [enabled, setEnabled] = useState(project ? Boolean(project.maintenance_request_enabled) : true);
  const save = async () => {
    const body = { ...toPayload(fields, values), maintenance_request_enabled: enabled };
    try {
      if (project) {
        const res = await write.mutateAsync({ method: "patch", url: `/projects/${project.seq}`, body });
        toast("success", res.extended ? `저장했습니다. 계약 연장으로 처리했습니다${res.renewals_closed ? `(유지보수 전환 ${res.renewals_closed}건 종료)` : ""}.` : "저장했습니다.");
        onDone();
      } else {
        const res = await write.mutateAsync({ url: "/projects", body });
        toast("success", "등록했습니다.");
        router.replace(`/managed/projects/${res.seq}`);
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <PageTransition>
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        <FormGrid fields={fields} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} /> 고객 유지보수 요청 허용</label>
        <div className="flex justify-end gap-2">
          {project && <Button variant="outline" className="rounded-xl" onClick={onDone}>취소</Button>}
          <Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button>
        </div>
      </CardContent></Card>
    </PageTransition>
  );
}

function ProjectView({ p }: { p: Dict }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const write = useStaffWrite(["projects"]);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const domainOptions = p.domain_options as { domain_id: number; url: string; selected: boolean; primary: boolean; end_date: string | null }[];
  const [selected, setSelected] = useState(() => domainOptions.filter((d) => d.selected).map((d) => `${d.domain_id}|${d.url}`));
  const [primary, setPrimary] = useState(() => { const d = domainOptions.find((x) => x.primary); return d ? `${d.domain_id}|${d.url}` : ""; });
  const canWrite = Boolean(p.write_enabled);

  const call = async (args: Parameters<typeof write.mutateAsync>[0], ok: string) => {
    try {
      const res = await write.mutateAsync(args);
      toast("success", ok);
      return res ?? true;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
      return null;
    }
  };

  if (editing) return <ProjectForm project={p} onDone={() => setEditing(false)} />;
  const docs = p.documents as { no: number; name: string }[];
  const histories = p.contract_histories as { seq: number; extension_number: number; contract_date: string; contract_termination_date: string; point: number | null; memo: string }[];

  return (
    <PageTransition>
      <div className="space-y-4">
        <PageActions>
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> 수정·연장</Button>}
          {canWrite && me?.is_admin && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>}
        </PageActions>
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/project_update/${p.seq}`} />}
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-4 text-white">
          <p className="text-sm text-white/80">#{p.seq as number} · {p.company_name as string} · {(p.project_types as Record<string, string>)[String(p.project_type)] ?? "-"}</p>
          <h1 className="mt-1 text-lg font-bold">{p.title as string}</h1>
          <p className="mt-1 text-xs text-white/80">{p.phase_label as string} · {fmtDate(p.contract_date as string)} ~ {fmtDate(p.contract_termination_date as string)} · 연장 {p.extension_count as number}회 · 납부 {(p.payments_total as number).toLocaleString()}원</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5 text-sm">
              <h2 className="font-semibold">연결 도메인</h2>
              {domainOptions.length === 0 ? <p className="text-muted-foreground">업체 도메인이 없습니다.</p> : domainOptions.map((d) => {
                const key = `${d.domain_id}|${d.url}`;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <Checkbox disabled={!canWrite} checked={selected.includes(key)} onCheckedChange={() => setSelected((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]))} />
                    <Link href={`/managed/domains/${d.domain_id}`} className="hover:underline">{d.url}</Link>
                    <span className="text-xs text-muted-foreground">만료 {fmtDate(d.end_date)}</span>
                    <label className="ml-auto flex items-center gap-1 text-xs"><input type="radio" disabled={!canWrite || !selected.includes(key)} checked={primary === key} onChange={() => setPrimary(key)} /> 대표</label>
                  </div>
                );
              })}
              {canWrite && domainOptions.length > 0 && <div className="flex justify-end"><Button size="sm" className="rounded-xl" onClick={() => call({ method: "put", url: `/projects/${p.seq}/domains`, body: { links: selected.map((k) => { const [id, ...u] = k.split("|"); return { domain_id: Number(id), url: u.join("|"), is_primary: k === primary }; }) } }, "도메인 연결을 저장했습니다.")}>연결 저장</Button></div>}
            </CardContent></Card>

            <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5 text-sm">
              <h2 className="font-semibold">관련 문서</h2>
              {docs.map((d) => (
                <div key={d.no} className="flex items-center gap-2">
                  <a href={staffFileUrl(`/projects/${p.seq}/documents/${d.no}`)} className="inline-flex items-center gap-1 text-blue-600"><Paperclip className="h-3 w-3" /> {d.name}</a>
                  {canWrite && <button className="text-xs text-red-600" onClick={() => window.confirm("문서 연결을 지울까요?") && call({ url: `/projects/${p.seq}/documents/${d.no}/clear` }, "지웠습니다.")}>삭제</button>}
                </div>
              ))}
              {canWrite && docs.length < 9 && (
                <Input type="file" className="max-w-sm rounded-xl" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const used = new Set(docs.map((d) => d.no));
                  const no = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => !used.has(n));
                  const form = new FormData();
                  form.append("file", f);
                  await call({ url: `/projects/${p.seq}/documents/${no}`, body: form }, "업로드했습니다.");
                  e.target.value = "";
                }} />
              )}
            </CardContent></Card>

            {histories.length > 0 && (
              <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm">
                <h2 className="font-semibold">계약 연장 이력</h2>
                {histories.map((h) => (
                  <div key={h.seq} className="flex items-center justify-between text-muted-foreground">
                    <span>{h.extension_number}회차 · {fmtDate(h.contract_date)} ~ {fmtDate(h.contract_termination_date)} · {h.point ?? 0}P · {h.memo}</span>
                    {canWrite && <button className="text-xs text-red-600" onClick={() => window.confirm("이력을 삭제할까요?") && call({ url: `/projects/histories/${h.seq}/delete` }, "삭제했습니다.")}>삭제</button>}
                  </div>
                ))}
              </CardContent></Card>
            )}
          </div>
          <div className="order-first h-fit space-y-4 lg:sticky lg:top-20 lg:order-last">
            <Card className="rounded-2xl"><CardContent className="pt-5 pb-5">
              <dl className="space-y-3">
                <Info label="월 포인트">{(p.point as number) ?? 0}P</Info>
                <Info label="계약금">{((p.contract_deposit as number) ?? 0).toLocaleString()}원</Info>
                <Info label="요청 허용">{p.maintenance_request_enabled ? "예" : "아니오"}</Info>
                <Info label="무상 유지보수">{p.free_maint_months ? `${p.free_maint_months}개월 (${fmtDate(p.free_maint_start_date as string)} ~ ${fmtDate(p.free_maint_end_date as string)})` : "-"}</Info>
                {ROLES.map(([r, l]) => <Info key={r} label={`담당 ${l}`}>{(p[`manager_${r}_name`] as string) || "-"}</Info>)}
                {p.contract_remarks ? <Info label="비고"><span className="whitespace-pre-wrap">{p.contract_remarks as string}</span></Info> : null}
              </dl>
            </CardContent></Card>
            <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">홈페이지 오픈</h2>
                {canWrite && <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => call({ url: `/projects/${p.seq}/open`, body: { opened: !p.is_opened } }, p.is_opened ? "오픈을 취소했습니다." : "오픈으로 표시했습니다.")}>{p.is_opened ? "오픈 취소" : "오픈 확정"}</Button>}
              </div>
              <p className="text-muted-foreground">{p.is_opened ? `오픈 ${fmtDate(p.opened_at as string)} · ${p.opened_by ?? ""}` : "미오픈"}{p.sales_lead ? ` · 영업접수 ${(p.sales_lead as Dict).title}` : ""}</p>
              {(p.open_triggers as Dict[]).map((t, i) => <p key={i} className="text-xs text-muted-foreground">근거: {t.content as string} ({fmtDate(t.created_at as string)})</p>)}
            </CardContent></Card>
            {(p.renewals as Dict[]).length > 0 && (
              <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm">
                <h2 className="font-semibold">유지보수 전환</h2>
                {(p.renewals as Dict[]).map((r) => <Link key={r.seq as number} href={`/managed/maint-renewal/${r.seq}`} className="block hover:underline">기준일 {fmtDate(r.due_date as string)} · <Badge variant="outline">{r.status as string}</Badge></Link>)}
              </CardContent></Card>
            )}
          </div>
        </div>
      </div>
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="프로젝트 삭제" description="연결된 데이터(납부·요청·포인트 등)가 하나라도 있으면 삭제할 수 없습니다. 보통은 상태를 '중지'로 바꾸세요." confirmText="삭제" variant="destructive"
        onConfirm={async () => { if (await call({ url: `/projects/${p.seq}/delete` }, "삭제했습니다.")) router.replace("/managed/projects"); }} />
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
