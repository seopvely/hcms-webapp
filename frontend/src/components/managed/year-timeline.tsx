"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LegendItem } from "@/components/managed/month-calendar";

export interface TimelineBar {
  start: string; // YYYY-MM-DD
  end: string;
  color: string; // tailwind bg-*
  label: string; // 막대 툴팁·안쪽 글자
}

export interface TimelineRow {
  key: string | number;
  label: string;
  sub?: string;
  href: string;
  bars: TimelineBar[];
}

const DAY = 86400000;

/**
 * 직원 화면 공용 연간 기간 막대(계약·외주).
 * 이름 열 고정, 월 구분선·분기 음영, 오늘 세로선, 검색, 막대 안 기간 표기.
 */
export function YearTimeline({
  year, onYearChange, rows, legend, loading, emptyText = "이 해에 해당하는 항목이 없습니다.",
}: {
  year: number;
  onYearChange: (y: number) => void;
  rows: TimelineRow[];
  legend?: LegendItem[];
  loading?: boolean;
  emptyText?: string;
}) {
  const [q, setQ] = useState("");
  const ys = new Date(year, 0, 1).getTime();
  const ye = new Date(year + 1, 0, 1).getTime();
  const span = ye - ys;
  const [now] = useState(() => Date.now());
  const todayPct = now >= ys && now < ye ? ((now - ys) / span) * 100 : null;
  const t = (s: string) => new Date(s + "T00:00:00").getTime();

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows
      .map((r) => ({ ...r, bars: r.bars.filter((b) => t(b.start) < ye && t(b.end) + DAY > ys) }))
      .filter((r) => r.bars.length && (!kw || `${r.label} ${r.sub ?? ""}`.toLowerCase().includes(kw)))
      .sort((a, b) => Math.min(...a.bars.map((x) => t(x.start))) - Math.min(...b.bars.map((x) => t(x.start))));
  }, [rows, q, ys, ye]);

  const pos = (b: TimelineBar) => {
    const a = Math.max(t(b.start), ys);
    const z = Math.min(t(b.end) + DAY, ye);
    return { left: `${((a - ys) / span) * 100}%`, width: `${Math.max(((z - a) / span) * 100, 0.8)}%` };
  };
  const fmt = (s: string) => s.slice(2).replace(/-/g, ".");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={() => onYearChange(year - 1)} aria-label="이전 해"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-20 text-center text-lg font-bold">{year}년</span>
          <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={() => onYearChange(year + 1)} aria-label="다음 해"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" className="ml-1 h-9 rounded-xl" onClick={() => onYearChange(new Date().getFullYear())}>올해</Button>
        </div>
        <div className="relative w-full max-w-xs sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className="h-9 rounded-xl pl-9" />
        </div>
        <span className="text-xs text-muted-foreground">{loading ? "불러오는 중…" : `${visible.length}건`}</span>
        <div className="flex-1" />
        {legend && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {legend.map((l) => <span key={l.label} className="flex items-center gap-1"><span className={cn("h-2.5 w-4 rounded-sm", l.color)} />{l.label}</span>)}
          </div>
        )}
      </div>

      <Card className="rounded-2xl"><CardContent className="overflow-x-auto p-0">
        <div className="min-w-[820px]">
          {/* 머리: 월 */}
          <div className="sticky top-0 z-10 flex border-b bg-background text-xs font-medium text-muted-foreground">
            <div className="sticky left-0 z-20 w-40 shrink-0 border-r bg-background px-3 py-2 sm:w-56">이름</div>
            <div className="grid flex-1 grid-cols-12">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className={cn("border-r py-2 text-center last:border-r-0", Math.floor(i / 3) % 2 === 1 && "bg-muted/30",
                  todayPct !== null && new Date().getMonth() === i && "font-bold text-indigo-600")}>{i + 1}월</span>
              ))}
            </div>
          </div>
          {visible.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted-foreground">{loading ? "불러오는 중…" : emptyText}</p>}
          {visible.map((r) => (
            <div key={r.key} className="group flex border-b last:border-b-0 hover:bg-muted/30">
              <Link href={r.href} className="sticky left-0 z-10 w-40 shrink-0 border-r bg-background px-3 py-2 group-hover:bg-muted/30 sm:w-56" title={[r.label, r.sub].filter(Boolean).join(" · ")}>
                <span className="block truncate text-sm font-medium hover:underline">{r.label}</span>
                {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
              </Link>
              <div className="relative flex-1">
                {/* 월 구분선·분기 음영 */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-12">
                  {Array.from({ length: 12 }, (_, i) => <span key={i} className={cn("border-r last:border-r-0", Math.floor(i / 3) % 2 === 1 && "bg-muted/20")} />)}
                </div>
                {todayPct !== null && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-red-500/70" style={{ left: `${todayPct}%` }} />}
                <div className="relative space-y-1 py-2">
                  {r.bars.map((b, i) => (
                    <div key={i} className="relative h-6">
                      <Link
                        href={r.href}
                        title={`${b.label} ${b.start} ~ ${b.end}`}
                        className={cn("absolute flex h-6 items-center overflow-hidden whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium text-white shadow-sm hover:brightness-110", b.color)}
                        style={pos(b)}
                      >
                        {b.label} {fmt(b.start)}~{fmt(b.end)}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>
      {todayPct !== null && <p className="text-xs text-muted-foreground"><span className="mr-1 inline-block h-3 w-0.5 bg-red-500 align-middle" />빨간 세로선 = 오늘</p>}
    </div>
  );
}
