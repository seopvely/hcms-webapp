"use client";
import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/common/app-toast";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import { type CommentTemplate, useCommentTemplates, useDeleteCommentTemplate, useSaveCommentTemplate } from "@/lib/staff-maintenance";

type Draft = { seq?: number; name: string; content: string };

// 처리내역 템플릿 — 유지보수 처리내역(댓글) 작성 때 불러오는 문구(SPEC 06 §9). 쓰기는 유지보수 영역이 켜졌을 때.
export default function CommentTemplatesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading } = useCommentTemplates();
  const [editing, setEditing] = useState<Draft | null>(null);
  useEffect(() => {
    setPageTitle("처리내역 템플릿");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center">
          <p className="text-sm text-muted-foreground">사용 횟수 순. 유지보수 상세의 처리내역 작성란에서 불러옵니다.</p>
          <div className="flex-1" />
          <Button className="rounded-xl" onClick={() => setEditing({ name: "", content: "" })}><Plus className="mr-1 h-4 w-4" /> 새 템플릿</Button>
        </div>
        {editing && <TemplateEditor key={editing.seq ?? "new"} draft={editing} onDone={() => setEditing(null)} />}
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={FileText} title="템플릿이 없습니다" />
        ) : (
          data.items.map((t: CommentTemplate) => (
            <Card key={t.seq} className="rounded-2xl"><CardContent className="space-y-1 pt-4 pb-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t.name}</span>
                <span className="text-xs text-muted-foreground">사용 {t.usage_count}회</span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing({ seq: t.seq, name: t.name, content: t.content })}>수정</Button>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{t.content.replace(/<[^>]+>/g, " ")}</p>
            </CardContent></Card>
          ))
        )}
      </div>
    </PageTransition>
  );
}

function TemplateEditor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const { toast } = useToast();
  const save = useSaveCommentTemplate();
  const remove = useDeleteCommentTemplate();
  const [name, setName] = useState(draft.name);
  const [content, setContent] = useState(draft.content);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    try {
      await action();
      toast("success", ok);
      onDone();
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리하지 못했습니다."));
    }
  };

  return (
    <Card className="rounded-2xl border-indigo-200"><CardContent className="space-y-3 pt-4 pb-4">
      <Input className="rounded-xl" placeholder="템플릿 이름" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea className="min-h-32 rounded-xl" placeholder="처리내역 문구" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="flex gap-2">
        {draft.seq && (
          <Button variant="outline" className="rounded-xl text-red-600" disabled={remove.isPending}
            onClick={() => confirm("이 템플릿을 삭제할까요?") && run(() => remove.mutateAsync(draft.seq!), "삭제했습니다.")}>삭제</Button>
        )}
        <div className="flex-1" />
        <Button variant="outline" className="rounded-xl" onClick={onDone}>취소</Button>
        <Button className="rounded-xl" disabled={!name.trim() || !content.trim() || save.isPending}
          onClick={() => run(() => save.mutateAsync({ seq: draft.seq, name: name.trim(), content }), "저장했습니다.")}>저장</Button>
      </div>
    </CardContent></Card>
  );
}
