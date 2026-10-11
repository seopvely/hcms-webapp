"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { SimpleEditor } from "@/components/common/simple-editor";
import { StatusBadge } from "@/components/common/status-badge";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDate, fmtDateTime, selectClass } from "@/components/managed/field";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { SafeHtml } from "@/components/managed/safe-html";
import { StepUpDialog } from "@/components/managed/step-up-dialog";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { TASK_STATUSES } from "@/components/managed/task-options";
import { SalesActivityPanel } from "@/components/managed/sales-activity-panel";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useStaffTask, useTaskMutation } from "@/lib/staff-support";

export default function StaffTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const seq = Number(id);
  const router = useRouter();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data, isLoading, error } = useStaffTask(seq);
  const mutate = useTaskMutation();
  const [content, setContent] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setPageTitle("건별작업 상세");
  }, [setPageTitle]);

  if (error) return <LoadFailed error={error} />;

  if (isLoading || !data) return <DetailSkeleton />;

  const addComment = async () => {
    try {
      await mutate.mutateAsync({ method: "post", url: `/${seq}/comments`, body: { content, status: status || null } });
      toast("success", "코멘트를 등록했습니다.");
      setContent("");
      setEditorKey((k) => k + 1);
      setStatus("");
    } catch (err) {
      toast("error", apiErrorDetail(err, "등록에 실패했습니다."));
    }
  };

  const remove = async (password: string) => {
    try {
      await mutate.mutateAsync({ method: "post", url: `/${seq}/delete`, body: { password } });
      toast("success", "삭제했습니다.");
      router.replace("/managed/tasks");
    } catch (err) {
      toast("error", apiErrorDetail(err, "삭제에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild>
            <Link href="/managed/tasks"><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link>
          </Button>
          <div className="flex-1" />
          {data.write_enabled && (
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" /> 삭제
            </Button>
          )}
        </div>
        {!data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/inditask_detail/${seq}`} />}
        <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 p-5 text-white">
          <p className="text-sm text-white/80">#{data.seq} · {data.company_name} · {data.project_title || "프로젝트 없음"} · {data.task_type_label}</p>
          <h1 className="mt-1 text-lg font-bold">{data.title}</h1>
        </div>
        <Card className="rounded-2xl">
          <CardContent className="grid gap-3 pt-5 pb-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div><p className="text-xs text-muted-foreground">상태</p><StatusBadge status={data.status ?? ""} type="task" /></div>
            <div><p className="text-xs text-muted-foreground">요청자</p>{data.writer_name || "-"}</div>
            <div><p className="text-xs text-muted-foreground">요청일 / 마감</p>{fmtDate(data.request_date)} / {fmtDate(data.deadline)}</div>
            <div><p className="text-xs text-muted-foreground">작업일</p>{fmtDate(data.work_date)}</div>
            <div><p className="text-xs text-muted-foreground">예상 / 실제</p>{data.estimated_hours ?? "-"}h / {data.actual_hours ?? 0}h{data.work_started_at && " (진행중)"}</div>
            <div><p className="text-xs text-muted-foreground">예산</p>{data.budget ? `${data.budget.toLocaleString()}원` : "-"}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 pt-5 pb-5">
            <SafeHtml html={data.content} />
            {data.file_name && (
              <a href={staffFileUrl(`/tasks/${seq}/file`)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
                <Paperclip className="h-3 w-3" /> {data.file_name}
              </a>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="space-y-2 pt-5 pb-5">
            <h2 className="font-semibold">코멘트 ({data.comments.length})</h2>
            {data.comments.map((c) => (
              <div key={c.seq} className="rounded-xl bg-muted/40 px-3 py-3">
                <p className="mb-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{c.writer_name}</span> · {fmtDateTime(c.created_at)}</p>
                <SafeHtml html={c.content} />
              </div>
            ))}
          </CardContent>
        </Card>
        {data.write_enabled && (
          <Card className="rounded-2xl">
            <CardContent className="space-y-3 pt-5 pb-5">
              <h2 className="font-semibold">코멘트 작성</h2>
              <SimpleEditor key={editorKey} value={content} onChange={setContent} />
              <div className="flex items-end gap-3">
                <Field label="상태 변경" className="w-48">
                  <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">변경 안 함</option>
                    {TASK_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <div className="flex-1" />
                <Button className="rounded-xl" onClick={addComment} disabled={mutate.isPending}>등록</Button>
              </div>
            </CardContent>
          </Card>
        )}
        <SalesActivityPanel companyId={data.company_id} />
      </div>
      <StepUpDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="건별작업 삭제" description="코멘트와 함께 삭제됩니다. 본인 비밀번호를 입력하세요." confirmText="삭제" pending={mutate.isPending} onConfirm={remove} />
    </PageTransition>
  );
}
