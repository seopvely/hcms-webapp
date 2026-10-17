"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Paperclip, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { SimpleEditor } from "@/components/common/simple-editor";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { BOARD_STATUS_COLORS } from "@/components/managed/board-status";
import { SearchSelect, toCompanyItems } from "@/components/managed/search-select";
import { Field, apiErrorDetail, fmtDateTime } from "@/components/managed/field";
import { SafeHtml } from "@/components/managed/safe-html";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { type BoardFile, type BoardPost, useBoardCategories, useBoardMutation, useBoardProjects, useStaffBoardPost } from "@/lib/staff-content";
import { useStaffMe } from "@/lib/staff-hooks";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function Files({ files }: { files: BoardFile[] }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <a key={f.id} href={staffFileUrl(f.url)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
          <Paperclip className="h-3 w-3" /> {f.filename}
        </a>
      ))}
    </div>
  );
}

// 게시글 상세(id=new 면 새 글). 직원 답글·댓글·상태변경.
export default function StaffBoardDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (id === "new") return <NewPost />;
  return <PostView seq={Number(id)} />;
}

function PostView({ seq }: { seq: number }) {
  const router = useRouter();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data, isLoading, error } = useStaffBoardPost(seq);
  const mutate = useBoardMutation();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setPageTitle(data?.title || "프로젝트구축진행");
  }, [data?.title, setPageTitle]);

  if (error) return <LoadFailed error={error} />;

  if (isLoading || !data) return <DetailSkeleton />;
  const canWrite = data.write_enabled;
  const canManage = (p: { writer_id: number | null }) => canWrite && (p.writer_id === me?.id || !!me?.is_admin);

  const call = async (url: string, body: object | FormData, ok: string) => {
    try {
      await mutate.mutateAsync({ url, body });
      toast("success", ok);
      return true;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (await call(deleteTarget, {}, "삭제했습니다.") && deleteTarget === `/${seq}/delete`) router.replace("/managed/project-board");
    setDeleteTarget(null);
  };

  const renderPost = (p: BoardPost, isRoot: boolean) => (
    <Card key={p.seq} className={`rounded-2xl ${isRoot ? "" : "ml-4"}`}>
      <CardContent className="space-y-3 pt-5 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {!isRoot && <Badge variant="outline">답글</Badge>}
          <span className="font-semibold text-foreground">{p.writer_name}</span>
          <span>{p.is_staff ? "직원" : "고객"}</span>
          <span>{fmtDateTime(p.created_at)}</span>
          {p.categories.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
          <div className="flex-1" />
          {!isRoot && canManage(p) && (
            <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs text-red-600" onClick={() => setDeleteTarget(`/${p.seq}/delete`)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
        {isRoot ? <h1 className="text-lg font-bold">{p.title}</h1> : <p className="font-semibold">{p.title}</p>}
        <SafeHtml html={p.content} />
        <Files files={p.attachments} />
        {p.comments.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            {p.comments.map((c) => (
              <div key={c.seq} className={`rounded-xl px-3 py-2 ${c.is_staff ? "bg-muted/40" : "bg-blue-50/60"} ${c.parent_id ? "ml-4" : ""}`}>
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.writer_name}</span>
                  <span>{fmtDateTime(c.created_at)}</span>
                  <div className="flex-1" />
                  {canManage(c) && (
                    <button className="text-red-600" onClick={() => setDeleteTarget(`/comments/${c.seq}/delete`)}><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
                <SafeHtml html={c.content} />
                <Files files={c.attachments} />
              </div>
            ))}
          </div>
        )}
        {canWrite && <CommentBox onSubmit={(form) => call(`/${p.seq}/comments`, form, "댓글을 등록했습니다.")} />}
      </CardContent>
    </Card>
  );

  return (
    <PageTransition>
      <div className="space-y-4">
        <PageActions>
          {canWrite && data.is_staff && data.writer_id === me?.id && (
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-4 w-4" /> 수정
            </Button>
          )}
          {canManage(data) && (
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteTarget(`/${data.seq}/delete`)}>
              <Trash2 className="mr-1 h-4 w-4" /> 삭제
            </Button>
          )}
        </PageActions>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="order-first h-fit space-y-4 lg:sticky lg:top-20 lg:order-last">
            <Card className="rounded-2xl">
              <CardContent className="pt-5 pb-5">
                <dl className="space-y-3">
                  <Info label="상태">
                    {canWrite ? (
                      <select className="h-7 rounded-lg border px-1 text-xs" value={data.status ?? "1"} onChange={(e) => call(`/${data.seq}/status`, { status: e.target.value }, "상태를 변경했습니다.")}>
                        <option value="1">진행중</option><option value="2">완료</option><option value="3">보류</option>
                      </select>
                    ) : (
                      <Badge className={`min-w-16 justify-center ${BOARD_STATUS_COLORS[data.status ?? ""] ?? "bg-muted"}`}>{data.status_label}</Badge>
                    )}
                  </Info>
                  <Info label="업체">{data.company_name || "-"}</Info>
                  <Info label="프로젝트">{data.project_title || "-"}</Info>
                </dl>
              </CardContent>
            </Card>
          </div>
          <div className="min-w-0 space-y-4">
            {editing ? (
              <EditPost
                post={data}
                projectId={data.project_id}
                onCancel={() => setEditing(false)}
                onSave={async (body) => {
                  try {
                    await mutate.mutateAsync({ method: "patch", url: `/${seq}`, body });
                    toast("success", "수정했습니다.");
                    setEditing(false);
                  } catch (err) {
                    toast("error", apiErrorDetail(err, "수정에 실패했습니다."));
                  }
                }}
              />
            ) : (
              renderPost(data, true)
            )}
            {data.replies.map((r) => renderPost(r, false))}
            {canWrite && (
              <ReplyBox
                onSubmit={async (title, content) => {
                  const form = new FormData();
                  form.append("project_id", String(data.project_id));
                  form.append("parent_id", String(seq));
                  form.append("title", title);
                  form.append("content", content);
                  return call("", form, "답글을 등록했습니다.");
                }}
              />
            )}
          </div>
        </div>
      </div>
      <AppAlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} title="삭제" description="삭제하면 되돌릴 수 없습니다(답글·댓글·첨부 포함)." confirmText="삭제" variant="destructive" onConfirm={confirmDelete} />
    </PageTransition>
  );
}

type PostEdit = { title: string; content: string; category_ids: number[]; is_notice: boolean };

// 직원 본인 글 수정(제목·본문·카테고리·공지). 첨부 변경은 삭제 후 다시 등록.
function EditPost({ post, projectId, onCancel, onSave }: { post: BoardPost; projectId: number; onCancel: () => void; onSave: (b: PostEdit) => Promise<void> }) {
  const { data: categories } = useBoardCategories(projectId);
  const [title, setTitle] = useState(post.title ?? "");
  const [content, setContent] = useState(post.content);
  const [cats, setCats] = useState<number[]>(post.category_ids ?? []);
  const [notice, setNotice] = useState(post.is_notice);
  const [saving, setSaving] = useState(false);
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-4 pt-5 pb-5">
        {!!categories?.items.length && (
          <div className="flex flex-wrap gap-2 text-xs">
            {categories.items.map((c) => (
              <label key={c.id} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1">
                <Checkbox checked={cats.includes(c.id)} onCheckedChange={() => setCats((x) => (x.includes(c.id) ? x.filter((i) => i !== c.id) : [...x, c.id]))} /> {c.name}
              </label>
            ))}
          </div>
        )}
        <Field label="제목 *"><Input className="rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <SimpleEditor imageUpload="staff" value={content} onChange={setContent} />
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={notice} onCheckedChange={(v) => setNotice(v === true)} /> 공지</label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onCancel}>취소</Button>
          <Button className="rounded-xl" disabled={saving || !title.trim()}
            onClick={async () => { setSaving(true); await onSave({ title, content, category_ids: cats, is_notice: notice }); setSaving(false); }}>저장</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CommentBox({ onSubmit }: { onSubmit: (form: FormData) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const submit = async () => {
    const form = new FormData();
    form.append("content", text.replace(/\n/g, "<br>"));
    if (await onSubmit(form)) setText("");
  };
  return (
    <div className="flex gap-2">
      <Input className="rounded-xl" placeholder="댓글" value={text} onChange={(e) => setText(e.target.value)} />
      <Button className="rounded-xl" disabled={!text.trim()} onClick={submit}>등록</Button>
    </div>
  );
}

function ReplyBox({ onSubmit }: { onSubmit: (title: string, content: string) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [key, setKey] = useState(0);
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 pt-5 pb-5">
        <h2 className="font-semibold">답글 작성</h2>
        <Input className="rounded-xl" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
        <SimpleEditor imageUpload="staff" key={key} value={content} onChange={setContent} />
        <div className="flex justify-end">
          <Button className="rounded-xl" disabled={!title.trim()} onClick={async () => { if (await onSubmit(title, content)) { setTitle(""); setContent(""); setKey((k) => k + 1); } }}>등록</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NewPost() {
  const router = useRouter();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const mutate = useBoardMutation();
  const { data: projects } = useBoardProjects();
  const [projectId, setProjectId] = useState<number | undefined>();
  const { data: categories } = useBoardCategories(projectId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [cats, setCats] = useState<number[]>([]);
  const [notice, setNotice] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);

  useEffect(() => {
    setPageTitle("프로젝트구축진행 글쓰기");
  }, [setPageTitle]);

  const submit = async () => {
    if (!projectId) return toast("warning", "프로젝트를 선택하세요.");
    const form = new FormData();
    form.append("project_id", String(projectId));
    form.append("title", title);
    form.append("content", content);
    form.append("category_ids", cats.join(","));
    form.append("is_notice", String(notice));
    Array.from(files ?? []).forEach((f) => form.append("files", f));
    try {
      const res = await mutate.mutateAsync({ url: "", body: form });
      toast("success", "등록했습니다. 고객에게 푸시가 발송됩니다.");
      router.replace(`/managed/project-board/${res.seq}`);
    } catch (err) {
      toast("error", apiErrorDetail(err, "등록에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <Card className="mx-auto max-w-3xl rounded-2xl">
        <CardContent className="space-y-4 pt-5 pb-5">
          <Field label="프로젝트 *">
            <SearchSelect items={toCompanyItems(projects?.items)} value={projectId ? String(projectId) : ""} placeholder="선택" searchPlaceholder="프로젝트명 (초성 가능)"
              onChange={(id) => { setProjectId(id ? Number(id) : undefined); setCats([]); }} />
          </Field>
          {!!categories?.items.length && (
            <div className="flex flex-wrap gap-2 text-xs">
              {categories.items.map((c) => (
                <label key={c.id} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1">
                  <Checkbox checked={cats.includes(c.id)} onCheckedChange={() => setCats((x) => (x.includes(c.id) ? x.filter((i) => i !== c.id) : [...x, c.id]))} /> {c.name}
                </label>
              ))}
            </div>
          )}
          <Field label="제목 *"><Input className="rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <SimpleEditor imageUpload="staff" value={content} onChange={setContent} />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><Checkbox checked={notice} onCheckedChange={(v) => setNotice(v === true)} /> 공지</label>
            <Input type="file" multiple className="max-w-xs rounded-xl" onChange={(e) => setFiles(e.target.files)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => router.back()}>취소</Button>
            <Button className="rounded-xl" onClick={submit} disabled={mutate.isPending}>등록</Button>
          </div>
        </CardContent>
      </Card>
    </PageTransition>
  );
}
