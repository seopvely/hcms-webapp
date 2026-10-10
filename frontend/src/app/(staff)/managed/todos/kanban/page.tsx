"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { TODO_STATUS, TodoTabs } from "../todo-ui";

type Item = { seq: number; title: string; assignee: string; due_date: string | null; overdue_days: number; priority: string };
type Data = { columns: { key: string; label: string; items: Item[] }[]; write_enabled: boolean };

// 칸반 — 카드를 다른 열로 끌어 놓으면 상태가 바뀐다
export default function TodoKanbanPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data } = useStaffGet<Data>(["todos", "kanban"], "/todos/kanban");
  const write = useStaffWrite(["todos"]);
  useEffect(() => {
    setPageTitle("할일 칸반");
  }, [setPageTitle]);
  const move = async (seq: number, status: string) => {
    try {
      await write.mutateAsync({ url: `/todos/${seq}/status`, body: { status } });
    } catch (err) {
      toast("error", apiErrorDetail(err, "상태 변경에 실패했습니다."));
    }
  };
  return (
    <PageTransition>
      <div className="space-y-4">
        <TodoTabs />
        <div className="grid gap-3 md:grid-cols-4">
          {data?.columns.map((col) => (
            <div key={col.key} className="space-y-2 rounded-2xl bg-muted/40 p-2"
              onDragOver={(e) => data.write_enabled && e.preventDefault()}
              onDrop={(e) => { const seq = Number(e.dataTransfer.getData("text/plain")); if (seq) move(seq, col.key); }}>
              <p className="px-1 text-sm font-semibold">{col.label} <span className="text-muted-foreground">{col.items.length}</span></p>
              {col.items.map((t) => (
                <Card key={t.seq} draggable={data.write_enabled} onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.seq))} className="rounded-xl">
                  <CardContent className="space-y-1 p-3 text-xs">
                    <Link href={`/managed/todos/${t.seq}`} className="block text-sm font-semibold hover:underline">{t.priority === "high" && <span className="mr-1 text-red-600">●</span>}{t.title}</Link>
                    <p className="text-muted-foreground">{t.assignee || "담당 없음"} · 마감 {fmtDate(t.due_date)}{t.overdue_days > 0 && <span className="text-red-600"> · {t.overdue_days}일 지연</span>}</p>
                    {data.write_enabled && (
                      <select className="w-full rounded-md border bg-background px-1 py-0.5 md:hidden" value={col.key} onChange={(e) => move(t.seq, e.target.value)}>
                        {Object.entries(TODO_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
                      </select>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
