"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { SimpleEditor } from "@/components/common/simple-editor";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, selectClass } from "@/components/managed/field";
import { SafeHtml } from "@/components/managed/safe-html";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl, useLookupCompanies } from "@/lib/staff-maintenance";
import { type NewsItem, useNewsMutation, useStaffNewsDetail } from "@/lib/staff-content";
import { useStaffMe } from "@/lib/staff-hooks";

// 최신소식 보기·수정·등록(id=new). 대상 회사를 고르지 않으면 전체 공개.
export default function StaffNewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data: me } = useStaffMe();
  const { data, isLoading, error } = useStaffNewsDetail(isNew ? null : Number(id));
  useEffect(() => {
    setPageTitle(isNew ? "소식 등록" : data?.title || "최신소식");
  }, [setPageTitle, isNew, data?.title]);

  if (!isNew && error) return <LoadFailed error={error} />;

  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  const canWrite = isNew ? !!me?.write_areas.includes("news") : !!data?.write_enabled;
  return <NewsEditor key={id} news={isNew ? null : data!} canWrite={canWrite} />;
}

function NewsEditor({ news, canWrite }: { news: NewsItem | null; canWrite: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const mutate = useNewsMutation();
  const { data: companies } = useLookupCompanies();
  const [title, setTitle] = useState(news?.title ?? "");
  const [content, setContent] = useState(news?.content ?? "");
  const [category, setCategory] = useState(news?.category ?? "general");
  const [published, setPublished] = useState(news?.is_published ?? true);
  const [targets, setTargets] = useState<number[]>(news?.company_ids ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    const form = new FormData();
    form.append("title", title);
    form.append("content", content);
    form.append("category", category);
    form.append("is_published", String(published));
    form.append("company_ids", targets.join(","));
    if (file) form.append("attachment", file);
    try {
      const res = await mutate.mutateAsync({ url: news ? `/${news.seq}` : "", body: form });
      toast("success", "저장했습니다.");
      if (!news) router.replace(`/managed/news/${res.seq}`);
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };

  const remove = async () => {
    try {
      await mutate.mutateAsync({ url: `/${news!.seq}/delete`, body: {} });
      toast("success", "삭제했습니다.");
      router.replace("/managed/news");
    } catch (err) {
      toast("error", apiErrorDetail(err, "삭제에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {canWrite && news && (
          <PageActions>
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1 h-4 w-4" /> 삭제
            </Button>
          </PageActions>
        )}
        {!canWrite && news ? (
          <Card className="rounded-2xl">
            <CardContent className="space-y-3 pt-5 pb-5">
              <h1 className="text-lg font-bold">{news.title}</h1>
              <p className="text-xs text-muted-foreground">{news.category_label} · {news.company_names.length ? news.company_names.join(", ") : "전체 공개"}</p>
              <SafeHtml html={news.content} />
              {news.has_attachment && <a href={staffFileUrl(`/news/${news.seq}/file`)} className="inline-flex items-center gap-1 text-xs text-blue-600"><Paperclip className="h-3 w-3" /> 첨부</a>}
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="space-y-4 pt-5 pb-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="제목" className="sm:col-span-2"><Input className="rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <Field label="분류">
                  <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="general">일반</option><option value="maintenance">유지보수</option><option value="notice">공지</option><option value="update">업데이트</option>
                  </select>
                </Field>
              </div>
              <SimpleEditor value={content} onChange={setContent} />
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">공개 대상 (선택하지 않으면 전체 공개)</p>
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border p-2">
                  {companies?.items.map((c) => (
                    <label key={c.id} className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
                      <Checkbox checked={targets.includes(c.id)} onCheckedChange={() => setTargets((t) => (t.includes(c.id) ? t.filter((x) => x !== c.id) : [...t, c.id]))} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2"><Checkbox checked={published} onCheckedChange={(v) => setPublished(v === true)} /> 게시 (게시로 바뀌면 대상 고객에게 푸시)</label>
                <Input type="file" className="max-w-xs rounded-xl" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {news?.has_attachment && <a href={staffFileUrl(`/news/${news.seq}/file`)} className="text-xs text-blue-600">현재 첨부</a>}
              </div>
              <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={mutate.isPending}>저장</Button></div>
            </CardContent>
          </Card>
        )}
      </div>
      <AppAlertDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="소식 삭제" description="삭제하면 되돌릴 수 없습니다." confirmText="삭제" variant="destructive" onConfirm={remove} />
    </PageTransition>
  );
}
