"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NotebookPen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { MemoProjectIndex } from "@/components/managed/memo-project-index";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { MemoCard, MemoDialog, MemoTypeChips } from "@/components/managed/project-memo-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { cn } from "@/lib/utils";
import { useLookupCompanies } from "@/lib/staff-maintenance";
import { type ProjectMemo, useMemoList, useMemoProjects } from "@/lib/staff-memos";

// 프로젝트 메모 — 직원이 프로젝트에 수동으로 연결하는 메모(정보·연락처·credential·회의록·첨부 등).
// 왼쪽 프로젝트 색인(초성 칩·초성 검색)으로 프로젝트를 고르고, 유형 칩·검색어로 메모를 거른다. 제목은 AI(haiku)가 뽑는다.
export default function ProjectMemosPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <KeyedMemoListPage />
    </Suspense>
  );
}

// 같은 화면에서 ⌘K 로 다른 메모를 고르면 주소만 바뀌므로, 주소가 바뀌면 다시 그린다
function KeyedMemoListPage() {
  const search = useSearchParams();
  return <MemoListPage key={search.toString()} />;
}

function MemoListPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const search = useSearchParams();
  // 요청 상세 탭의 "전체 보기"가 project_id 또는 company_id 로 연다
  const [companyId, setCompanyId] = useState(search.get("company_id") ?? "");
  const [scope, setScope] = useState(search.get("project_id") ?? ""); // "" 전체 · "unlinked" · 프로젝트 seq
  const [memoType, setMemoType] = useState("");
  const [hideDone, setHideDone] = useState(false);
  // ⌘K 메모 검색에서 열 때: ?q=검색어&memo=메모번호 — 그 검색 결과를 보여 주고 해당 메모를 강조한다
  const [q, setQ] = useState(search.get("q") ?? "");
  const [query, setQuery] = useState(search.get("q") ?? "");
  const focusMemo = Number(search.get("memo")) || null;
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProjectMemo | "new" | null>(null);
  useEffect(() => {
    setPageTitle("프로젝트 메모");
  }, [setPageTitle]);

  const { data: index } = useMemoProjects();
  const { data: companies } = useLookupCompanies();
  const projectId = scope && scope !== "unlinked" ? scope : "";
  const params = {
    project_id: projectId || undefined, company_id: !scope && companyId ? companyId : undefined,
    unlinked: scope === "unlinked" ? true : undefined, memo_type: memoType || undefined, q: query || undefined,
    hide_done: hideDone || undefined, page,
  };
  const { data, isLoading } = useMemoList(params);
  const reset = (fn: () => void) => { fn(); setPage(1); };
  const typeTotal = data?.types.reduce((n, t) => n + (t.count ?? 0), 0) ?? 0;
  const hasFocus = !!focusMemo && !!data?.items.some((m) => m.seq === focusMemo);
  useEffect(() => {
    if (hasFocus) document.getElementById(`memo-${focusMemo}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hasFocus, focusMemo]);
  const companyName = companyId ? companies?.items.find((c) => String(c.id) === companyId)?.name : null;

  return (
    <PageTransition>
      <PageActions>
        {data?.write_enabled && <Button size="sm" className="rounded-xl" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" /> 등록</Button>}
      </PageActions>
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <MemoProjectIndex projects={index?.items ?? []} unlinked={index?.unlinked ?? 0} total={index?.total ?? 0} value={scope}
          onChange={(v) => reset(() => { setScope(v); setCompanyId(""); })} />
        <div className="min-w-0 space-y-3">
          <Card className="rounded-2xl">
            <CardContent className="flex flex-wrap items-center gap-2 px-4 py-3">
              <form className="min-w-48 flex-1" onSubmit={(e) => { e.preventDefault(); reset(() => setQuery(q.trim())); }}>
                <Input className="rounded-xl" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·본문 검색 (Enter)" />
              </form>
              <label className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={hideDone} onCheckedChange={(c) => reset(() => setHideDone(c === true))} /> 완료된 해야할일 숨기기
              </label>
              {companyName && !scope && (
                <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs">
                  업체: {companyName}
                  <button type="button" onClick={() => reset(() => setCompanyId(""))}><X className="h-3 w-3" /></button>
                </span>
              )}
            </CardContent>
          </Card>
          {data && typeTotal > 0 && <MemoTypeChips types={data.types} value={memoType} onChange={(v) => reset(() => setMemoType(v))} total={typeTotal} />}
          {isLoading ? (
            <TableSkeleton />
          ) : !data?.items.length ? (
            <EmptyState icon={NotebookPen} title="프로젝트 메모가 없습니다" description="등록 버튼으로 메모를 만들고 프로젝트에 연결하세요." />
          ) : (
            <>
              <div className="grid gap-2 xl:grid-cols-2">
                {data.items.map((m) => (
                  <div key={m.seq} id={`memo-${m.seq}`} className="min-w-0 scroll-mt-24">
                    <MemoCard memo={m} className={cn("border bg-card px-4 py-3 text-sm", m.seq === focusMemo && "ring-2 ring-indigo-400")}
                      onEdit={data.write_enabled ? () => setEditing(m) : undefined} />
                  </div>
                ))}
              </div>
              <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
            </>
          )}
        </div>
      </div>
      {editing && data && (
        <MemoDialog memo={editing === "new" ? null : editing} types={data.types} defaultProjectIds={projectId ? [Number(projectId)] : []} onClose={() => setEditing(null)} />
      )}
    </PageTransition>
  );
}
