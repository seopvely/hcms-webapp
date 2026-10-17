"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemoCard, MemoDialog, MemoTypeChips } from "@/components/managed/project-memo-ui";
import { SalesActivityPanel, useCompanySalesActivities } from "@/components/managed/sales-activity-panel";
import { type ProjectMemo, useMemoContext } from "@/lib/staff-memos";

const PAGE = 10;

// 요청 내용 하단 탭 — 영업 활동 | 프로젝트 메모 (유지보수 요청·건별작업·프로젝트구축진행 상세 공용).
// 프로젝트 메모는 그 요청의 프로젝트에 연결된 것만, 프로젝트가 없는 요청이면 업체의 모든 프로젝트에 연결된 것을 보여 준다.
export function ProjectContextTabs({ companyId, projectId }: { companyId: number | null | undefined; projectId: number | null | undefined }) {
  const { data: sales } = useCompanySalesActivities(companyId);
  const { data: memos } = useMemoContext(projectId, companyId);
  const salesCount = sales?.items.reduce((n, it) => n + it.activities.length, 0) ?? 0;
  const memoCount = memos?.items.length ?? 0;
  const [tab, setTab] = useState<string | null>(null);
  // 기본 탭: 메모가 있으면 메모, 없고 영업 활동만 있으면 영업 활동
  const current = tab ?? (memoCount === 0 && salesCount > 0 ? "sales" : "memos");

  return (
    <Card className="min-w-0 rounded-2xl">
      <CardContent className="min-w-0 pt-4 pb-5">
        <Tabs value={current} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="sales" className="px-3">영업 활동 <span className="tabular-nums opacity-60">{salesCount}</span></TabsTrigger>
            <TabsTrigger value="memos" className="px-3">프로젝트 메모 <span className="tabular-nums opacity-60">{memoCount}</span></TabsTrigger>
          </TabsList>
          <TabsContent value="sales" className="pt-2">
            <SalesActivityPanel companyId={companyId} bare />
          </TabsContent>
          <TabsContent value="memos" className="pt-2">
            <MemoTab projectId={projectId} companyId={companyId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function MemoTab({ projectId, companyId }: { projectId: number | null | undefined; companyId: number | null | undefined }) {
  const { data } = useMemoContext(projectId, companyId);
  const [type, setType] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState<ProjectMemo | "new" | null>(null);
  if (!data) return <p className="py-2 text-xs text-muted-foreground">{projectId || companyId ? "불러오는 중…" : "연결된 프로젝트가 없습니다."}</p>;

  const types = data.types.map((t) => ({ ...t, count: data.items.filter((m) => m.memo_type === t.value).length }));
  const doneCount = data.items.filter((m) => m.is_done).length;
  const list = (type ? data.items.filter((m) => m.memo_type === type) : data.items).filter((m) => !(hideDone && m.is_done));
  return (
    <div className="min-w-0 space-y-3 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          {data.items.length > 0 && <MemoTypeChips types={types} value={type} onChange={(v) => { setType(v); setLimit(PAGE); }} total={data.items.length} />}
        </div>
        {data.write_enabled && projectId && (
          <Button size="sm" variant="outline" className="h-7 rounded-xl text-xs" onClick={() => setEditing("new")}><Plus className="mr-1 h-3.5 w-3.5" /> 메모</Button>
        )}
        <Link href={projectId ? `/managed/project-memos?project_id=${projectId}` : `/managed/project-memos?company_id=${companyId ?? ""}`}
          className="pt-1 text-xs text-muted-foreground hover:underline">전체 보기</Link>
      </div>
      {doneCount > 0 && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={hideDone} onCheckedChange={(c) => setHideDone(c === true)} /> 완료된 해야할일 숨기기 ({doneCount})
        </label>
      )}
      {data.scope === "company" && <p className="text-xs text-muted-foreground">이 요청에 프로젝트가 없어 업체의 모든 프로젝트 메모를 보여 줍니다.</p>}
      {list.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">{type ? "이 유형의 메모가 없습니다." : "연결된 프로젝트 메모가 없습니다."}</p>
      ) : (
        <div className="space-y-1.5">
          {list.slice(0, limit).map((m) => (
            <MemoCard key={m.seq} memo={m} showProjects={data.scope === "company"} onEdit={data.write_enabled ? () => setEditing(m) : undefined} />
          ))}
          {list.length > limit && (
            <button type="button" className="w-full rounded-lg py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => setLimit(limit + PAGE * 2)}>
              더 보기 ({list.length - limit}건 남음)
            </button>
          )}
        </div>
      )}
      {editing && (
        <MemoDialog memo={editing === "new" ? null : editing} types={data.types} defaultProjectIds={projectId ? [projectId] : []} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
