"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import { SearchSelect, toCompanyItems } from "@/components/managed/search-select";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { staffFileUrl, useLookupCompanies } from "@/lib/staff-maintenance";
import { useStaffMe } from "@/lib/staff-hooks";
import { useStaffList } from "@/lib/staff-sales";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { TODO_PRIORITY, TODO_STATUS } from "../todo-ui";

type Dict = Record<string, unknown>;
const KEYS = ["title", "content", "assignee_id", "priority", "status", "start_date", "due_date", "tags_text", "folder_name", "md_content", "company_id", "project_id"] as const;

export default function TodoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const search = useSearchParams();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["todos", "detail", id], isNew ? null : `/todos/${id}`);
  const ml = search.get("managelist");
  const it = search.get("inditask");
  const { data: prefill, isLoading: preLoading } = useStaffGet<Dict>(["todos", "prefill", ml, it], isNew && (ml || it) ? "/todos/prefill" : null, { managelist: ml, inditask: it });
  useEffect(() => {
    setPageTitle(isNew ? "할일 등록" : (data?.title as string | undefined) || "할일");
  }, [setPageTitle, isNew, data?.title]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  if (isNew && (ml || it) && preLoading) return <DetailSkeleton />;
  const init = isNew ? { ...(prefill ?? {}), tags_text: (prefill?.tags as string) ?? "" } : data!;
  return <PageTransition><Editor key={id} id={id} data={isNew ? null : data!} init={init} /></PageTransition>;
}

function Editor({ id, data, init }: { id: string; data: Dict | null; init: Dict }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: companies } = useLookupCompanies();
  const companyItems = useMemo(() => toCompanyItems(companies?.items), [companies]);
  const { data: staff } = useStaffList();
  const write = useStaffWrite(["todos"]);
  const canWrite = data ? Boolean(data.write_enabled) : !!me?.write_areas.includes("todos");
  const [v, setV] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of KEYS) out[k] = init[k] == null ? "" : String(init[k]).slice(0, k.endsWith("_date") ? 10 : undefined);
    out.priority ||= "normal";
    out.status ||= "pending";
    return out;
  });
  const { data: projects } = useStaffGet<{ seq: number; title: string }[]>(["billing", "projects", v.company_id], v.company_id ? "/billing/options/projects" : null, { company_id: v.company_id });
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const save = async () => {
    const fd = new FormData();
    for (const k of KEYS) {
      const key = k === "tags_text" ? "tags" : k;
      if (v[k] !== "") fd.append(key, v[k]);
    }
    files.forEach((f) => fd.append("files", f));
    try {
      if (!data) {
        const r = await write.mutateAsync({ url: "/todos", body: fd });
        toast("success", "등록했습니다.");
        router.replace(`/managed/todos/${r.seq}`);
      } else {
        await write.mutateAsync({ url: `/todos/${id}/update`, body: fd });
        setFiles([]);
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
  const input = (k: string, label: string, type = "text") => <Field label={label}><Input className="rounded-xl" type={type} disabled={!canWrite} value={v[k]} onChange={(e) => set(k, e.target.value)} /></Field>;
  return (
    <div className="space-y-4">
      {data && canWrite && (
        <PageActions>
          <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} title="삭제" aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>
        </PageActions>
      )}
      {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/todo/${data ? `${id}/` : "create/"}`} />}
      <Card className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="제목 *" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="담당자">
            <select className={selectClass} disabled={!canWrite} value={v.assignee_id} onChange={(e) => set("assignee_id", e.target.value)}>
              <option value="">없음</option>{staff?.items.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
            </select>
          </Field>
          <Field label="우선순위">
            <select className={selectClass} disabled={!canWrite} value={v.priority} onChange={(e) => set("priority", e.target.value)}>
              {Object.entries(TODO_PRIORITY).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          </Field>
          <Field label="상태">
            <select className={selectClass} disabled={!canWrite} value={v.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(TODO_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          </Field>
          {input("start_date", "시작일", "date")}{input("due_date", "마감일", "date")}{input("tags_text", "태그(쉼표 구분)")}
          <Field label="업체">
            <SearchSelect items={companyItems} value={v.company_id} emptyOption="없음" disabled={!canWrite} searchPlaceholder="업체명·사업자번호 (초성 가능)"
              onChange={(id) => setV((x) => ({ ...x, company_id: id, project_id: "" }))} />
          </Field>
          <Field label="프로젝트">
            <SearchSelect items={(projects ?? []).map((p) => ({ value: String(p.seq), label: p.title }))} value={v.project_id} emptyOption="없음" disabled={!canWrite || !v.company_id} searchPlaceholder="프로젝트명 (초성 가능)"
              onChange={(id) => set("project_id", id)} />
          </Field>
          {input("folder_name", "폴더명(기록용)")}
        </div>
        <Field label="내용"><Textarea className="min-h-28 rounded-xl" disabled={!canWrite} value={v.content} onChange={(e) => set("content", e.target.value)} /></Field>
        <Field label="MD 문서(요구사항 — DB 에만 저장)"><Textarea className="min-h-24 rounded-xl font-mono text-xs" disabled={!canWrite} value={v.md_content} onChange={(e) => set("md_content", e.target.value)} /></Field>
        <div className="space-y-1 text-sm">
          <p className="font-semibold">첨부</p>
          {((data?.files as Dict[] | undefined) ?? []).map((f) => (
            <div key={f.seq as number} className="flex items-center gap-2 text-xs">
              <a className="underline" href={staffFileUrl(`/todos/${id}/files/${f.seq}`)}>{f.filename as string}</a>
              {canWrite && <button className="text-red-600" onClick={() => window.confirm("첨부를 삭제할까요?") && call(`/todos/${id}/files/${f.seq}/delete`, undefined, "삭제했습니다.")}>삭제</button>}
            </div>
          ))}
          {canWrite && <input type="file" multiple className="text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />}
        </div>
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      {data && (
        <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5">
          <p className="text-sm font-semibold">댓글</p>
          {((data.comments as Dict[]) ?? []).map((c) => (
            <div key={c.seq as number} className="rounded-xl bg-muted/40 p-2 text-sm"><p className="text-xs text-muted-foreground">{c.user as string} · {fmtDateTime(c.created_at as string)}</p><p className="whitespace-pre-wrap">{c.comment as string}</p></div>
          ))}
          {canWrite && (
            <div className="flex gap-2">
              <Input className="rounded-xl" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="댓글" />
              <Button className="rounded-xl" disabled={!comment.trim()} onClick={async () => { if (await call(`/todos/${id}/comments`, { comment }, "등록했습니다.")) setComment(""); }}>등록</Button>
            </div>
          )}
        </CardContent></Card>
      )}
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="할일 삭제" description="목록에서 숨깁니다(복구 가능한 삭제)." confirmText="삭제" variant="destructive"
        onConfirm={async () => { if (await call(`/todos/${id}/delete`, { hard: false }, "삭제했습니다.")) router.replace("/managed/todos"); }} />
    </div>
  );
}
