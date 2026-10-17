"use client";
import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, Loader2, Paperclip, Pencil, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { useToast } from "@/components/common/app-toast";
import { Field, apiErrorDetail, fmtDate, fmtDateTime, selectClass } from "@/components/managed/field";
import { SearchSelect } from "@/components/managed/search-select";
import { cn } from "@/lib/utils";
import { staffFileUrl, useLookupCompanies, useLookupProjects } from "@/lib/staff-maintenance";
import { DATED_TYPES, MONO_TYPES, type MemoFile, type MemoType, type ProjectMemo, useMemoReveal, useMemoWrite } from "@/lib/staff-memos";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/bmp,image/heic,.heic";
const isImageName = (name: string) => /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);

/** 이미지 첨부 — 썸네일 + AI 가 뽑은 설명·글자(글자는 펼쳐 보기·복사). canEdit 이면 결과를 직접 고친다 */
function ImageAttachment({ file, canEdit }: { file: MemoFile; canEdit: boolean }) {
  const { toast } = useToast();
  const write = useMemoWrite();
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState("");
  const [text, setText] = useState("");
  const src = `${staffFileUrl(file.url)}?inline=1`;
  const editable = canEdit && file.extract_status !== "pending" && file.extract_status !== "skipped";
  const startEdit = () => {
    setSummary(file.extract_summary ?? "");
    setText(file.extracted_text ?? "");
    setEditing(true);
  };
  const save = async () => {
    try {
      await write.mutateAsync({ url: `/project-memos/files/${file.id}/extract`, body: { extract_summary: summary, extracted_text: text } });
      toast("success", "분석 내용을 고쳤습니다. 제목을 다시 뽑습니다.");
      setEditing(false);
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  if (editing) {
    return (
      <div className="min-w-0 space-y-1.5 rounded-lg border bg-background p-2 text-[11px] sm:col-span-2">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{file.filename} — 분석 내용 수정</span>
        </div>
        <label className="block text-muted-foreground">설명
          <Textarea className="mt-0.5 min-h-14 rounded-lg text-xs" value={summary} maxLength={500} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label className="block text-muted-foreground">이미지 속 글자
          <Textarea className="mt-0.5 min-h-28 rounded-lg text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="글자가 없는 이미지면 비워 두세요" />
        </label>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs" onClick={() => setEditing(false)} disabled={write.isPending}>취소</Button>
          <Button size="sm" className="h-7 rounded-lg text-xs" onClick={save} disabled={write.isPending}>저장</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 gap-2 rounded-lg border bg-background p-1.5">
      <a href={src} target="_blank" rel="noopener noreferrer" className="shrink-0" title={file.filename}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={file.extract_summary ?? file.filename} loading="lazy" className="h-20 w-20 rounded-md object-cover" />
      </a>
      <div className="min-w-0 flex-1 text-[11px]">
        <div className="flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate font-medium text-foreground">{file.filename}</p>
          {file.extract_status === "edited" && <span className="shrink-0 text-[10px] text-muted-foreground">직접 수정함</span>}
          {editable && (
            <button type="button" title="분석 내용 수정" className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted" onClick={startEdit}>
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
        {file.extract_status === "pending" ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-violet-600"><Loader2 className="h-3 w-3 animate-spin" /> AI 가 이미지를 읽는 중</p>
        ) : file.extract_status === "failed" ? (
          <p className="mt-0.5 text-amber-700">이미지 분석에 실패했습니다(수정 창의 “AI 다시 분석” 또는 연필로 직접 입력).</p>
        ) : file.extract_status === "skipped" ? (
          <p className="mt-0.5 text-muted-foreground">credential 이미지는 AI 로 분석하지 않습니다.</p>
        ) : (
          <>
            {file.extract_summary && <p className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]">{file.extract_summary}</p>}
            {file.extracted_text && (
              <details className="mt-0.5">
                <summary className="cursor-pointer text-blue-700">추출한 글자 보기</summary>
                <div className="mt-1 flex items-start gap-1">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap rounded bg-muted/50 p-1.5 text-foreground [overflow-wrap:anywhere]">{file.extracted_text}</p>
                  <button type="button" title="복사" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => copy(file.extracted_text!, toast)}>
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 새로 고른 이미지 미리보기 */
function LocalPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-8 w-8 rounded object-cover" />;
}

/** 유형 칩(전체 + 유형별 개수). 개수가 0 인 유형은 숨긴다 */
export function MemoTypeChips({ types, value, onChange, total }: { types: MemoType[]; value: string; onChange: (v: string) => void; total: number }) {
  const chip = (val: string, label: string, n: number) => (
    <button key={val || "all"} type="button" onClick={() => onChange(val)}
      className={cn("rounded-full border px-2.5 py-1 text-xs", value === val ? "border-slate-900 bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted")}>
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {chip("", "전체", total)}
      {types.filter((t) => (t.count ?? 0) > 0 || t.value === value).map((t) => chip(t.value, t.label, t.count ?? 0))}
    </div>
  );
}

function copy(text: string, toast: ReturnType<typeof useToast>["toast"]) {
  navigator.clipboard?.writeText(text).then(() => toast("success", "복사했습니다."), () => toast("error", "복사하지 못했습니다."));
}

/** 메모 한 건(목록·요청 상세 탭 공용) */
export function MemoCard({ memo, onEdit, showProjects = true, className }: { memo: ProjectMemo; onEdit?: () => void; showProjects?: boolean; className?: string }) {
  const { toast } = useToast();
  const reveal = useMemoReveal();
  const [secret, setSecret] = useState<string | null>(null);
  const content = memo.masked ? secret : memo.content;
  const write = useMemoWrite();
  const isTodo = memo.memo_type === "todo";
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD(로컬)
  const overdue = isTodo && !memo.is_done && !!memo.memo_date && memo.memo_date.slice(0, 10) < today;
  const toggleDone = async (done: boolean) => {
    try {
      await write.mutateAsync({ url: `/project-memos/${memo.seq}/done`, body: { done } });
    } catch (err) {
      toast("error", apiErrorDetail(err, "완료 체크에 실패했습니다."));
    }
  };
  const open = async () => {
    try {
      setSecret(await reveal.mutateAsync(memo.seq));
    } catch (err) {
      toast("error", apiErrorDetail(err, "열지 못했습니다."));
    }
  };
  return (
    <div className={cn("min-w-0 rounded-xl bg-muted/40 px-3 py-2 text-xs", memo.is_done && "opacity-60", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {isTodo && (
          <Checkbox checked={memo.is_done} disabled={!onEdit || write.isPending} aria-label="완료"
            title={memo.is_done ? "완료 취소" : "완료로 표시"} onCheckedChange={(c) => toggleDone(c === true)} />
        )}
        <Badge variant="outline" className="shrink-0">{memo.type_label}</Badge>
        <span className={cn("min-w-0 font-semibold [overflow-wrap:anywhere]", memo.title_status === "pending" ? "text-muted-foreground" : "text-foreground",
          memo.is_done && "line-through")}>{memo.title}</span>
        {memo.title_status === "pending" && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-violet-600"><Loader2 className="h-3 w-3 animate-spin" /> AI 제목 생성 중</span>
        )}
        {memo.memo_date && (
          <span className={cn("shrink-0 font-medium", overdue ? "text-red-600" : "text-blue-700")}>
            {isTodo && "마감 "}{fmtDate(memo.memo_date)}{overdue && " · 기한 지남"}
          </span>
        )}
        <div className="flex-1" />
        {content && (
          <button type="button" title="본문 복사" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => copy(content, toast)}>
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        {onEdit && (
          <button type="button" title="수정" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {memo.masked && secret === null ? (
        <button type="button" onClick={open} disabled={reveal.isPending}
          className="mt-1 inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-1 text-muted-foreground hover:bg-muted">
          <Eye className="h-3 w-3" /> •••••• 보기 (열람 기록이 남습니다)
        </button>
      ) : (
        content && (
          <div className="mt-1 flex items-start gap-1">
            <p className={cn("min-w-0 flex-1 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]", MONO_TYPES.has(memo.memo_type) && "font-mono")}>{content}</p>
            {memo.masked && (
              <button type="button" title="가리기" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setSecret(null)}>
                <EyeOff className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      )}
      {memo.attachments.some((f) => f.is_image) && (
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {memo.attachments.filter((f) => f.is_image).map((f) => <ImageAttachment key={f.id} file={f} canEdit={!!onEdit} />)}
        </div>
      )}
      {memo.attachments.some((f) => !f.is_image) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {memo.attachments.filter((f) => !f.is_image).map((f) => (
            <a key={f.id} href={staffFileUrl(f.url)} className="inline-flex items-center gap-1 rounded-lg border bg-background px-2 py-0.5 hover:bg-muted">
              <Paperclip className="h-3 w-3" /> {f.filename}
            </a>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {showProjects && memo.projects.length > 0 && <>{memo.projects.map((p) => p.title).join(", ")} · </>}
        {fmtDateTime(memo.updated_at)}{memo.updated_by ? ` · ${memo.updated_by}` : ""}
        {memo.is_done && <span className="text-emerald-700"> · 완료 {fmtDateTime(memo.done_at)}{memo.done_by ? ` ${memo.done_by}` : ""}</span>}
      </p>
    </div>
  );
}

/** 메모 등록·수정. defaultProjectIds 는 새 메모의 연결 프로젝트(요청 상세에서 열 때) */
export function MemoDialog({ memo, types, defaultProjectIds = [], onClose }: {
  memo: ProjectMemo | null; types: MemoType[]; defaultProjectIds?: number[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const write = useMemoWrite();
  const reveal = useMemoReveal();
  const { data: projectData } = useLookupProjects();
  const { data: companyData } = useLookupCompanies();
  const [memoType, setMemoType] = useState(memo?.memo_type ?? "info");
  // 가려진 credential 은 불러오기 전까지 본문을 보내지 않는다(서버가 기존 값 유지)
  const [content, setContent] = useState(memo?.content ?? "");
  const [contentLoaded, setContentLoaded] = useState(!memo?.masked);
  const [memoDate, setMemoDate] = useState(memo?.memo_date ?? "");
  const [projectIds, setProjectIds] = useState<number[]>(memo ? memo.projects.map((p) => p.seq) : defaultProjectIds);
  const [files, setFiles] = useState<File[]>([]);
  const [removeIds, setRemoveIds] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const companyNames = useMemo(() => new Map((companyData?.items ?? []).map((c) => [c.id, c.name])), [companyData]);
  const projectItems = useMemo(
    () => (projectData?.items ?? []).filter((p) => !projectIds.includes(p.id)).map((p) => ({
      value: String(p.id), label: p.name || `#${p.id}`, sub: p.company_id ? companyNames.get(p.company_id) : undefined,
    })),
    [projectData, companyNames, projectIds],
  );
  const projectLabel = (id: number) => {
    const p = projectData?.items.find((x) => x.id === id) ?? memo?.projects.find((x) => x.seq === id);
    const name = p && ("name" in p ? p.name : p.title);
    return name || `#${id}`;
  };

  const loadContent = async () => {
    if (!memo) return;
    try {
      setContent(await reveal.mutateAsync(memo.seq));
      setContentLoaded(true);
    } catch (err) {
      toast("error", apiErrorDetail(err, "불러오지 못했습니다."));
    }
  };

  const pickFiles = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    setFiles((f) => [...f, ...picked]);
    // md 유형에서 본문이 비어 있으면 첫 .md 파일 내용을 본문에 채운다
    const md = picked.find((f) => f.name.toLowerCase().endsWith(".md"));
    if (memoType === "md" && md && contentLoaded && !content.trim()) setContent(await md.text());
  };

  const save = async () => {
    const form = new FormData();
    form.append("memo_type", memoType);
    if (contentLoaded) form.append("content", content);
    if (memoDate) form.append("memo_date", memoDate);
    form.append("project_ids", projectIds.join(","));
    if (removeIds.length) form.append("remove_file_ids", removeIds.join(","));
    files.forEach((f) => form.append("files", f));
    try {
      await write.mutateAsync({ url: memo ? `/project-memos/${memo.seq}` : "/project-memos", body: form });
      toast("success", "저장했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const retitle = async () => {
    if (!memo) return;
    try {
      await write.mutateAsync({ url: `/project-memos/${memo.seq}/retitle`, body: {} });
      toast("info", "이미지와 제목을 다시 분석하고 있습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "요청에 실패했습니다."));
    }
  };
  const remove = async () => {
    if (!memo) return;
    try {
      await write.mutateAsync({ url: `/project-memos/${memo.seq}/delete`, body: {} });
      toast("success", "삭제했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "삭제에 실패했습니다."));
    }
  };

  const keptFiles = (memo?.attachments ?? []).filter((f) => !removeIds.includes(f.id));
  const hasImage = keptFiles.some((f) => f.is_image) || files.some((f) => isImageName(f.name));
  const removedFiles = (memo?.attachments ?? []).filter((f) => removeIds.includes(f.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader><DialogTitle>{memo ? "프로젝트 메모 수정" : "프로젝트 메모 등록"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="유형 *">
            <select className={selectClass} value={memoType} onChange={(e) => setMemoType(e.target.value)}>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="제목">
            {memo ? (
              <div className="flex h-10 items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1 truncate">{memo.title}</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 rounded-lg text-xs" onClick={retitle} disabled={write.isPending || memo.ai_pending} title="이미지 분석과 제목을 다시 합니다. 직접 고친 이미지 분석 내용은 그대로 둡니다.">
                  <RefreshCw className="mr-1 h-3 w-3" /> AI 다시 분석
                </Button>
              </div>
            ) : (
              <p className="flex h-10 items-center gap-1.5 rounded-xl border border-dashed px-3 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-violet-600" /> 저장하면 AI(Haiku)가 본문에서 제목을 뽑습니다.
              </p>
            )}
          </Field>
          {(DATED_TYPES.has(memoType) || memoDate) && (
            <Field label={memoType === "payment_day" ? "결제일" : memoType === "todo" ? "마감일" : "날짜"}>
              <Input type="date" className="rounded-xl" value={memoDate} onChange={(e) => setMemoDate(e.target.value)} />
            </Field>
          )}
          <Field label="연결 프로젝트" className="sm:col-span-2">
            {projectIds.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {projectIds.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs">
                    {projectLabel(id)}
                    <button type="button" onClick={() => setProjectIds((ids) => ids.filter((x) => x !== id))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <SearchSelect items={projectItems} value="" placeholder="프로젝트 추가 (업체명·초성 검색)"
              onChange={(v) => v && setProjectIds((ids) => [...ids, Number(v)])} />
          </Field>
          <Field label={memoType === "md" ? "본문 (Markdown)" : "본문"} className="sm:col-span-2">
            {contentLoaded ? (
              <Textarea className={cn("min-h-40 rounded-xl", MONO_TYPES.has(memoType) && "font-mono text-xs")} value={content} onChange={(e) => setContent(e.target.value)} />
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs text-muted-foreground">
                가려진 본문입니다. 그대로 두면 기존 값을 유지합니다.
                <Button size="sm" variant="outline" className="rounded-xl" onClick={loadContent} disabled={reveal.isPending}><Eye className="mr-1 h-3.5 w-3.5" /> 불러와서 고치기</Button>
              </div>
            )}
          </Field>
          <Field label={memoType === "image" ? "이미지 파일 *" : "첨부파일"} className="sm:col-span-2">
            <Input type="file" multiple accept={memoType === "image" ? IMAGE_ACCEPT : undefined} className="rounded-xl"
              onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }} />
            {(memoType === "image" || files.some((f) => isImageName(f.name))) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {memoType === "credential" ? "credential 이미지는 AI 로 분석하지 않습니다." : "저장하면 AI 가 이미지의 글자를 그대로 옮겨 적고(글자가 없으면 설명을 남기고) 검색에 쓰입니다."}
              </p>
            )}
            {(keptFiles.length > 0 || removedFiles.length > 0 || files.length > 0) && (
              <ul className="mt-1.5 space-y-1 text-xs">
                {keptFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <Paperclip className="h-3 w-3" /> {f.filename}
                    <button type="button" className="text-red-600" onClick={() => setRemoveIds((ids) => [...ids, f.id])}>삭제</button>
                  </li>
                ))}
                {removedFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-muted-foreground line-through">
                    {f.filename}
                    <button type="button" className="no-underline" onClick={() => setRemoveIds((ids) => ids.filter((x) => x !== f.id))}>되돌리기</button>
                  </li>
                ))}
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-blue-700">
                    {isImageName(f.name) && !/\.heic$/i.test(f.name) && <LocalPreview file={f} />}
                    + {f.name}
                    <button type="button" className="text-muted-foreground" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          {memoType === "credential" && (
            <p className="text-xs text-muted-foreground sm:col-span-2">credential 본문은 목록에서 가려지고, 열 때마다 열람 기록이 남습니다. 비밀값을 외부로 보내지 않도록 제목은 AI 없이 “credential · 프로젝트명” 으로 붙습니다.</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          {memo && <Button variant="outline" className="rounded-xl text-red-600" onClick={() => setConfirmDelete(true)} disabled={write.isPending}>삭제</Button>}
          <Button className="rounded-xl" onClick={save} disabled={write.isPending || (!memo && !content.trim() && !files.length && !memoDate) || (memoType === "image" && !hasImage)}>저장</Button>
        </DialogFooter>
      </DialogContent>
      <AppAlertDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="메모 삭제" variant="destructive" confirmText="삭제"
        description={`'${memo?.title ?? ""}' 메모와 첨부파일을 삭제합니다.`} onConfirm={remove} />
    </Dialog>
  );
}
