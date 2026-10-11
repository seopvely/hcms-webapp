"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 달력 일정. start/end 는 'YYYY-MM-DD'(end 포함). end 가 없으면 하루짜리. */
export interface CalEvent {
  key: string | number;
  start: string;
  end?: string;
  time?: string | null;
  title: string;
  sub?: string;
  href: string;
  color: string; // tailwind bg-* 클래스
  muted?: boolean; // 무효·완료 등 흐리게
  alert?: boolean; // 기한 초과 등 빨간 테두리
}

export interface LegendItem {
  label: string;
  color: string;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_CHIPS = 3;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * 직원 화면 공용 월간 달력.
 * - 데스크톱: 7열 그리드(칸마다 최대 3건 + "+N"), 오른쪽에 선택한 날의 전체 일정
 * - 모바일: 가로 스크롤 없이 날짜·건수 점만, 아래에 선택한 날 목록
 */
export function MonthCalendar({
  year, month, onChange, events, legend, toolbar, loading,
}: {
  year: number;
  month: number; // 1~12
  onChange: (y: number, m: number) => void;
  events: CalEvent[];
  legend?: LegendItem[];
  toolbar?: React.ReactNode;
  loading?: boolean;
}) {
  const today = iso(new Date());
  // 6주(42칸) 고정 — 앞뒤 달 날짜도 흐리게 보여 준다
  const days = useMemo(() => {
    const lead = new Date(year, month - 1, 1).getDay();
    return Array.from({ length: 42 }, (_, i) => new Date(year, month - 1, 1 - lead + i));
  }, [year, month]);

  const byDay = useMemo(() => {
    const out: Record<string, CalEvent[]> = {};
    const lo = iso(days[0]);
    const hi = iso(days[41]);
    for (const e of events) {
      const s = e.start < lo ? lo : e.start;
      const end = e.end && e.end > e.start ? e.end : e.start;
      const t = end > hi ? hi : end;
      for (let d = new Date(s + "T00:00:00"); iso(d) <= t; d.setDate(d.getDate() + 1)) (out[iso(d)] ??= []).push(e);
    }
    for (const k in out) out[k].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
    return out;
  }, [events, days]);

  const inMonth = (d: Date) => d.getMonth() === month - 1;
  const defaultSel = today.startsWith(`${year}-${pad(month)}`) ? today : `${year}-${pad(month)}-01`;
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked && picked.startsWith(`${year}-${pad(month)}`) ? picked : defaultSel;
  const monthTotal = useMemo(() => new Set(Object.entries(byDay).filter(([k]) => k.startsWith(`${year}-${pad(month)}`)).flatMap(([, v]) => v.map((e) => e.key))).size, [byDay, year, month]);

  const move = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(d.getFullYear(), d.getMonth() + 1);
  };
  const goToday = () => {
    const d = new Date();
    onChange(d.getFullYear(), d.getMonth() + 1);
    setPicked(today);
  };
  const dayColor = (d: Date) => (d.getDay() === 0 ? "text-red-500" : d.getDay() === 6 ? "text-blue-500" : "");
  const selEvents = byDay[selected] ?? [];
  const selDate = new Date(selected + "T00:00:00");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={() => move(-1)} aria-label="이전 달"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-28 text-center text-lg font-bold">{year}년 {month}월</span>
          <Button size="icon" variant="outline" className="h-9 w-9 rounded-xl" onClick={() => move(1)} aria-label="다음 달"><ChevronRight className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" className="ml-1 h-9 rounded-xl" onClick={goToday}>오늘</Button>
        </div>
        <span className="text-xs text-muted-foreground">{loading ? "불러오는 중…" : `이번 달 ${monthTotal}건`}</span>
        <div className="flex-1" />
        {legend && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-full", l.color)} />{l.label}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        <Card className="rounded-2xl"><CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-7 border-b pb-1 text-center text-xs font-medium">
            {WEEK.map((w, i) => <span key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const k = iso(d);
              const list = byDay[k] ?? [];
              const isToday = k === today;
              const isSel = k === selected;
              return (
                <div
                  key={k}
                  role="button"
                  tabIndex={0}
                  onClick={() => setPicked(k)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPicked(k)}
                  className={cn(
                    "min-h-14 cursor-pointer border-b border-r p-1 text-left transition-colors hover:bg-muted/40 sm:min-h-28 [&:nth-child(7n)]:border-r-0",
                    !inMonth(d) && "bg-muted/20",
                    isSel && "bg-indigo-50 hover:bg-indigo-50 dark:bg-indigo-950/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      dayColor(d), !inMonth(d) && "opacity-40", isToday && "bg-indigo-600 text-white",
                    )}>{d.getDate()}</span>
                    {list.length > 0 && <span className="text-[10px] text-muted-foreground sm:hidden">{list.length}</span>}
                  </div>
                  {/* 모바일: 점만 */}
                  <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {list.slice(0, 4).map((e, i) => <span key={i} className={cn("h-1.5 w-1.5 rounded-full", e.color, e.muted && "opacity-40")} />)}
                  </div>
                  {/* 데스크톱: 일정 칩 */}
                  <div className="mt-0.5 hidden space-y-0.5 sm:block">
                    {list.slice(0, MAX_CHIPS).map((e) => (
                      <Link
                        key={e.key}
                        href={e.href}
                        onClick={(ev) => ev.stopPropagation()}
                        title={[e.time, e.title, e.sub].filter(Boolean).join(" · ")}
                        className={cn(
                          "block truncate rounded px-1.5 py-0.5 text-[11px] leading-tight text-white hover:brightness-110",
                          e.color, e.muted && "opacity-50", e.alert && "ring-2 ring-red-500 ring-offset-1",
                          !inMonth(d) && "opacity-50",
                        )}
                      >
                        {e.time && <span className="mr-1 font-semibold">{e.time}</span>}{e.title}
                      </Link>
                    ))}
                    {list.length > MAX_CHIPS && (
                      <span className="block px-1 text-[11px] font-medium text-indigo-600">+{list.length - MAX_CHIPS}건 더보기</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent></Card>

        <Card className="h-fit rounded-2xl lg:sticky lg:top-4"><CardContent className="space-y-2 pt-4 pb-4">
          <p className={cn("font-semibold", dayColor(selDate))}>
            {selDate.getMonth() + 1}월 {selDate.getDate()}일 ({WEEK[selDate.getDay()]})
            {selected === today && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">오늘</span>}
          </p>
          {selEvents.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> 일정이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {selEvents.map((e) => (
                <li key={e.key}>
                  <Link href={e.href} className={cn("flex gap-2 rounded-xl border p-2 text-sm hover:bg-muted/40", e.muted && "opacity-60", e.alert && "border-red-300")}>
                    <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", e.color)} />
                    <span className="min-w-0">
                      <span className="block font-medium">{e.time && <span className="mr-1 text-indigo-600">{e.time}</span>}{e.title}</span>
                      {e.sub && <span className="block text-xs text-muted-foreground">{e.sub}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}

/** 달력에 보이는 42칸의 첫날·마지막 날(API 조회 범위용). */
export function gridRange(year: number, month: number): { start: string; end: string } {
  const lead = new Date(year, month - 1, 1).getDay();
  return { start: iso(new Date(year, month - 1, 1 - lead)), end: iso(new Date(year, month - 1, 1 - lead + 41)) };
}

/** 'YYYY-MM-DD…' 의 하루 전(배타적 종료일 → 포함 종료일). */
export function dayBefore(s: string): string {
  const d = new Date(s.slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return iso(d);
}
