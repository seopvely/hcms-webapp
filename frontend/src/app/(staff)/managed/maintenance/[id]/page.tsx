"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Coins, CornerDownRight, Paperclip, Pencil, Reply, Trash2, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { SalesActivityPanel } from "@/components/managed/sales-activity-panel";
import { useNavigationStore } from "@/store/navigation-store";
import staffApi from "@/lib/staff-api";
import {
  type MaintComment,
  type MaintDetail,
  staffFileUrl,
  useAddStaffComment,
  useCommentTemplates,
  useExecutePoints,
  useMaintenanceAction,
  useStaffMaintenanceDetail,
} from "@/lib/staff-maintenance";
import { useQueryClient } from "@tanstack/react-query";

type StepUp = { kind: "execute"; commentId: number; point: number } | { kind: "delete-comment"; commentId: number } | { kind: "delete-request" } | { kind: "request-type"; value: string | null };

function FileLinks({ files, base, legacy }: { files: { id: number; filename: string }[]; base: string; legacy?: string | null }) {
  if (!files.length && !legacy) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <a key={f.id} href={staffFileUrl(`${base}/${f.id}`)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
          <Paperclip className="h-3 w-3" /> {f.filename}
        </a>
      ))}
      {legacy && (
        <a href={legacy} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
          <Paperclip className="h-3 w-3" /> 기존 첨부
        </a>
      )}
    </div>
  );
}

export default function StaffMaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const seq = Number(id);
  const router = useRouter();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data, isLoading, error } = useStaffMaintenanceDetail(seq);
  const action = useMaintenanceAction();
  const execute = useExecutePoints();
  const [stepUp, setStepUp] = useState<StepUp | null>(null);
  const [replyTo, setReplyTo] = useState<MaintComment | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setPageTitle("유지보수 요청 상세");
  }, [setPageTitle]);

  const tree = useMemo(() => {
    const children = new Map<number | null, MaintComment[]>();
    const ids = new Set(data?.comments.map((c) => c.seq));
    for (const c of data?.comments ?? []) {
      const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
      children.set(key, [...(children.get(key) ?? []), c]);
    }
    return children;
  }, [data]);

  if (error) return <LoadFailed error={error} />;

  if (isLoading || !data) return <DetailSkeleton />;
  const canWrite = data.write_enabled;

  const runStepUp = async (password: string) => {
    if (!stepUp) return;
    try {
      if (stepUp.kind === "execute") {
        const res = await execute.mutateAsync({ comment_ids: [stepUp.commentId], password });
        toast(res.executed.length ? "success" : "info", res.executed.length ? `${stepUp.point}P 실행했습니다.` : "이미 실행된 포인트입니다.");
      } else if (stepUp.kind === "delete-comment") {
        await action.mutateAsync({ url: `/comments/${stepUp.commentId}/delete`, body: { password } });
        toast("success", "댓글을 삭제했습니다.");
      } else if (stepUp.kind === "request-type") {
        await action.mutateAsync({ url: `/${seq}/request-type`, body: { request_type: stepUp.value, password } });
        toast("success", "요청 유형을 변경했습니다.");
      } else {
        await action.mutateAsync({ url: `/${seq}/delete`, body: { password } });
        toast("success", "요청을 삭제했습니다.");
        router.replace("/managed/maintenance");
      }
      setStepUp(null);
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };

  const toggleComplete = async (c: MaintComment) => {
    try {
      await action.mutateAsync({ url: `/comments/${c.seq}/complete` });
      toast("success", c.status === "4" ? "완료를 취소했습니다." : "완료 처리했습니다.");
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };

  const renderComments = (parent: number | null, depth: number): React.ReactNode =>
    (tree.get(parent) ?? []).map((c) => (
      <div key={c.seq} className={depth ? "ml-4 border-l pl-3" : ""}>
        <div className={`rounded-xl px-3 py-3 ${c.is_customer ? "bg-blue-50/60" : "bg-muted/40"}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {depth > 0 && <CornerDownRight className="h-3 w-3" />}
            <span className="font-semibold text-foreground">{c.writer_name}</span>
            {c.worker_type_label && <Badge variant="outline">{c.worker_type_label}</Badge>}
            {c.status && <StatusBadge status={c.status} type="maintenance" />}
            <span>{fmtDateTime(c.created_at)}</span>
            {c.completion_date && <span>완료예상 {fmtDate(c.completion_date)}</span>}
            {c.point > 0 && (
              <Badge className={c.point_executed ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-700"}>
                {c.point_executed ? `실행완료 ${c.point}P` : `책정 ${c.point}P`}
              </Badge>
            )}
          </div>
          <SafeHtml html={c.content} />
          <FileLinks files={c.attachments} base="/maintenance/files/comment" legacy={c.legacy_file ? staffFileUrl(`/maintenance/files/comment-legacy/${c.seq}`) : null} />
          {canWrite && (
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs" onClick={() => setReplyTo(c)}>
                <Reply className="mr-1 h-3 w-3" /> 답글
              </Button>
              {c.point > 0 && !c.point_executed && (
                <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs" onClick={() => setStepUp({ kind: "execute", commentId: c.seq, point: c.point })}>
                  <Coins className="mr-1 h-3 w-3" /> 포인트 실행
                </Button>
              )}
              {!c.is_customer && (
                <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs" onClick={() => toggleComplete(c)}>
                  <CheckCircle2 className="mr-1 h-3 w-3" /> {c.status === "4" ? "완료 취소" : "완료 처리"}
                </Button>
              )}
              {!c.point_executed && (
                <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs text-red-600" onClick={() => setStepUp({ kind: "delete-comment", commentId: c.seq })}>
                  <Trash2 className="mr-1 h-3 w-3" /> 삭제
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="mt-2 space-y-2">{renderComments(c.seq, depth + 1)}</div>
      </div>
    ));

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild>
            <Link href="/managed/maintenance">
              <ArrowLeft className="mr-1 h-4 w-4" /> 목록
            </Link>
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="rounded-xl" asChild>
            <Link href={`/managed/todos/new?managelist=${seq}`}><ListTodo className="mr-1 h-4 w-4" /> 할일 등록</Link>
          </Button>
          {canWrite && data.status === "1" && (
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" /> 수정
            </Button>
          )}
          {canWrite && (
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setStepUp({ kind: "delete-request" })}>
              <Trash2 className="mr-1 h-4 w-4" /> 삭제
            </Button>
          )}
        </div>

        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/managelist_detail/${seq}`} />}

        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
          <p className="text-sm text-white/80">
            #{data.seq} · {data.company_name} · {data.project_title || "프로젝트 없음"}
          </p>
          <h1 className="mt-1 text-lg font-bold">
            {data.title}
            {data.is_free_maint && <Badge className="ml-2 bg-white/20">무상 유지보수</Badge>}
          </h1>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="grid gap-3 pt-5 pb-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="상태" value={<StatusBadge status={data.status ?? ""} type="maintenance" />} />
            <Info label="요청자" value={`${data.writer_name || "-"}${data.writer_email ? ` (${data.writer_email})` : ""}`} />
            <Info label="요청일" value={fmtDateTime(data.request_date)} />
            <Info label="완료예정 / 완료" value={`${fmtDate(data.completion_date)} / ${fmtDate(data.complete_date)}`} />
            <Info
              label="요청 유형"
              value={
                <span className="flex items-center gap-2">
                  {data.request_type_label}
                  {canWrite && (
                    <select
                      className="h-7 rounded-lg border px-1 text-xs"
                      value={data.request_type ?? ""}
                      onChange={(e) => setStepUp({ kind: "request-type", value: e.target.value || null })}
                    >
                      <option value="">미분류</option>
                      <option value="maint">유지보수</option>
                      <option value="dev">개발</option>
                    </select>
                  )}
                </span>
              }
            />
            <Info
              label="사용 포인트"
              value={`${data.points_used}P${data.points_used_ledger !== data.points_used ? ` (장부 ${data.points_used_ledger}P)` : ""}`}
            />
            <Info label="남은 포인트(현재 주기)" value={data.remaining_points === null ? "-" : `${data.remaining_points}P`} />
            <Info label="월 포인트" value={data.monthly_point ? `${data.monthly_point}P` : "-"} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-3 pt-5 pb-5">
            <SafeHtml html={data.contents} />
            <FileLinks files={data.attachments} base="/maintenance/files/request" legacy={data.legacy_file ? staffFileUrl(`/maintenance/files/request-legacy/${seq}`) : null} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-3 pt-5 pb-5">
            <h2 className="font-semibold">처리 내역 ({data.comments.length})</h2>
            {data.comments.length === 0 ? <p className="text-sm text-muted-foreground">아직 처리 내역이 없습니다.</p> : <div className="space-y-2">{renderComments(null, 0)}</div>}
          </CardContent>
        </Card>

        {canWrite && <CommentForm detail={data} replyTo={replyTo} onClearReply={() => setReplyTo(null)} />}

        {data.point_histories.length > 0 && (
          <Card className="rounded-2xl">
            <CardContent className="space-y-2 pt-5 pb-5 text-sm">
              <h2 className="font-semibold">포인트 장부</h2>
              {data.point_histories.map((h) => (
                <div key={h.seq} className="flex justify-between text-muted-foreground">
                  <span>
                    {fmtDateTime(h.created_at)} · {h.point_type_label}/{h.status_label}
                  </span>
                  <span className="font-medium text-foreground">{h.point}P</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <SalesActivityPanel companyId={data.company_id} />
      </div>

      <StepUpDialog
        open={!!stepUp}
        onOpenChange={(o) => !o && setStepUp(null)}
        title={
          stepUp?.kind === "execute" ? "포인트 실행" : stepUp?.kind === "request-type" ? "요청 유형 변경" : stepUp?.kind === "delete-request" ? "요청 삭제" : "댓글 삭제"
        }
        description={
          stepUp?.kind === "execute"
            ? `${stepUp.point}P 를 실행(차감)합니다.`
            : stepUp?.kind === "delete-request"
              ? "요청과 처리 내역·첨부가 삭제되고 삭제 로그가 남습니다. 포인트가 실행된 요청은 삭제할 수 없습니다."
              : "본인 비밀번호를 입력하세요."
        }
        pending={action.isPending || execute.isPending}
        onConfirm={runStepUp}
      />
      {editOpen && <EditRequestDialog detail={data} onClose={() => setEditOpen(false)} />}
    </PageTransition>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function CommentForm({ detail, replyTo, onClearReply }: { detail: MaintDetail; replyTo: MaintComment | null; onClearReply: () => void }) {
  const { toast } = useToast();
  const add = useAddStaffComment(detail.seq);
  const { data: templates } = useCommentTemplates();
  const [content, setContent] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState("");
  const [point, setPoint] = useState("");
  const [requestType, setRequestType] = useState("maint");
  const [expected, setExpected] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  const applyTemplate = (seq: string) => {
    const t = templates?.items.find((x) => String(x.seq) === seq);
    if (!t) return;
    setContent(t.content);
    setEditorKey((k) => k + 1);
    staffApi.post(`/managed/comment-templates/${t.seq}/use`).catch(() => undefined);
  };

  const submit = async () => {
    const form = new FormData();
    form.append("content", content);
    form.append("status", status);
    form.append("point", point || "0");
    if (!detail.request_type) form.append("request_type", requestType);
    if (status === "3" && expected) form.append("expected_date", expected);
    if (replyTo) form.append("parent_id", String(replyTo.seq));
    Array.from(files ?? []).forEach((f) => form.append("attachments", f));
    try {
      await add.mutateAsync(form);
      toast("success", "처리 내역을 등록했습니다. 고객에게 메일·푸시가 발송됩니다.");
      setContent("");
      setEditorKey((k) => k + 1);
      setStatus("");
      setPoint("");
      setExpected("");
      setFiles(null);
      onClearReply();
    } catch (err) {
      toast("error", apiErrorDetail(err, "등록에 실패했습니다."));
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 pt-5 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">처리 내역 작성</h2>
          {templates && templates.items.length > 0 && (
            <select className="h-9 rounded-xl border px-2 text-sm" value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">템플릿 불러오기</option>
              {templates.items.map((t) => (
                <option key={t.seq} value={t.seq}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {replyTo && (
          <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs">
            <span>{replyTo.writer_name} 님 댓글에 답글</span>
            <button onClick={onClearReply} className="text-muted-foreground hover:text-foreground">
              취소
            </button>
          </div>
        )}
        <SimpleEditor key={editorKey} value={content} onChange={setContent} placeholder="처리 내용을 입력하세요" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="상태">
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">상태 유지</option>
              <option value="2">알림</option>
              <option value="3">처리중</option>
              <option value="4">완료</option>
            </select>
          </Field>
          <Field label={detail.is_free_maint ? "포인트(무상 — 책정 안 함)" : "책정 포인트"}>
            <Input type="number" min={0} className="rounded-xl" disabled={detail.is_free_maint} value={point} onChange={(e) => setPoint(e.target.value)} />
          </Field>
          {!detail.request_type && (
            <Field label="요청 유형">
              <select className={selectClass} value={requestType} onChange={(e) => setRequestType(e.target.value)}>
                <option value="maint">유지보수</option>
                <option value="dev">개발</option>
              </select>
            </Field>
          )}
          {status === "3" && (
            <Field label="완료 예상일">
              <Input type="date" className="rounded-xl" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </Field>
          )}
        </div>
        <Input type="file" multiple className="rounded-xl" onChange={(e) => setFiles(e.target.files)} />
        <div className="flex justify-end">
          <Button className="rounded-xl" onClick={submit} disabled={add.isPending}>
            등록
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditRequestDialog({ detail, onClose }: { detail: MaintDetail; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(detail.title ?? "");
  const [contents, setContents] = useState(detail.contents);
  const [completion, setCompletion] = useState(detail.completion_date?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await staffApi.patch(`/managed/maintenance/${detail.seq}`, { title, contents, completion_date: completion || null });
      await queryClient.invalidateQueries({ queryKey: ["staff", "maintenance"] });
      toast("success", "수정했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "수정에 실패했습니다."));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>요청 수정</DialogTitle>
        </DialogHeader>
        <Field label="제목">
          <Input className="rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="완료 예정일">
          <Input type="date" className="rounded-xl" value={completion} onChange={(e) => setCompletion(e.target.value)} />
        </Field>
        <SimpleEditor value={contents} onChange={setContents} />
        <DialogFooter>
          <Button className="rounded-xl" onClick={save} disabled={saving}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
