"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate } from "@/components/managed/field";
import { won } from "@/components/managed/billing-ui";
import { cn } from "@/lib/utils";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffDashboard, useStaffMe } from "@/lib/staff-hooks";
import { useStaffGet } from "@/lib/staff-ops";

type QItem = { id: number; title: string | null; company?: string | null; date?: string | null; time?: string | null; due?: string | null; status?: string; overdue?: boolean; priority?: string };
type Queues = { new_requests: QItem[]; inquiries: QItem[]; meetings: QItem[]; todos: QItem[] };

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function ManagedDashboardPage() {
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);
  const { data: me } = useStaffMe();
  const { data: stats } = useStaffDashboard();
  const { data: q } = useStaffGet<Queues>(["dashboard", "queues"], "/dashboard/queues");
  const { data: fin } = useStaffGet<Record<string, number>>(["billing", "summary"], me?.is_admin ? "/billing/summary" : null);

  useEffect(() => {
    setPageTitle("대시보드");
  }, [setPageTitle]);

  if (!me) return null;
  const now = new Date();

  const tiles: { label: string; value?: number; sub?: string; icon: LucideIcon; href: string; tone?: string }[] = [
    { label: "새 유지보수 요청", value: stats?.maintenance_new, sub: `처리중 ${stats?.maintenance_in_progress ?? "-"}건`, icon: Wrench, href: "/managed/maintenance", tone: stats?.maintenance_new ? "text-indigo-600" : "" },
    { label: "답변 대기 문의", value: stats?.inquiries_waiting, sub: "대기·답변중", icon: MessageSquare, href: "/managed/inquiries", tone: stats?.inquiries_waiting ? "text-amber-600" : "" },
    { label: "유지보수 전환 대기", value: stats?.maint_renewal_pending, sub: "고객 응답 대기", icon: RefreshCw, href: "/managed/maint-renewal" },
    { label: "진행중 프로젝트", value: stats?.projects_in_progress, sub: `전체 ${stats?.projects_total ?? "-"}개`, icon: FolderKanban, href: "/managed/projects?phase=active" },
    { label: "활성 고객", value: stats?.active_customers, sub: "프로젝트 1개 이상", icon: Users, href: "/managed/accounts" },
    { label: "완료(최근 30일)", value: stats?.completed_30d, sub: "유지보수·건별작업", icon: CheckCircle2, href: "/managed/maintenance" },
  ];

  return (
    <PageTransition>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground">{now.getMonth() + 1}월 {now.getDate()}일 ({WEEK[now.getDay()]})</p>
            <h1 className="text-xl font-bold">{me.name || me.username}님, 안녕하세요</h1>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">메뉴는 <kbd className="rounded border bg-muted px-1">⌘K</kbd> 로 바로 찾을 수 있습니다</p>
        </div>

        {!me.two_factor_enabled && (
          <Link href="/managed/mfa-setup" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="flex-1">2단계 인증이 꺼져 있습니다. 등록해야 직원 계정 관리와 wealthreach SSO 를 쓸 수 있습니다.</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        {/* 지표 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href}>
              <Card className="h-full rounded-2xl transition-shadow hover:shadow-md">
                <CardContent className="space-y-1 p-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    {t.label}
                    <t.icon className="h-4 w-4" />
                  </div>
                  {t.value === undefined ? <Skeleton className="h-7 w-12" /> : <p className={cn("text-2xl font-bold tabular-nums", t.tone)}>{t.value.toLocaleString()}</p>}
                  <p className="text-[11px] text-muted-foreground">{t.sub}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* 처리할 일 */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Queue title="새 유지보수 요청" icon={Wrench} more="/managed/maintenance" items={q?.new_requests} empty="새 요청이 없습니다."
            render={(i) => ({ href: `/managed/maintenance/${i.id}`, title: i.title, sub: [i.company, fmtDate(i.date)].filter(Boolean).join(" · ") })} />
          <Queue title="답변 대기 문의" icon={MessageSquare} more="/managed/inquiries" items={q?.inquiries} empty="대기중인 문의가 없습니다."
            render={(i) => ({ href: `/managed/inquiries/${i.id}`, title: i.title, sub: [i.company, fmtDate(i.date)].filter(Boolean).join(" · "), badge: i.status === "2" ? "답변중" : "대기" })} />
          <Queue title="다가오는 미팅(7일)" icon={CalendarDays} more="/managed/meetings/calendar" items={q?.meetings} empty="7일 안에 잡힌 미팅이 없습니다."
            render={(i) => ({ href: `/managed/meetings/${i.id}`, title: i.title, sub: `${fmtDate(i.date)}${i.time ? ` ${i.time}` : ""}`, badge: i.date?.slice(0, 10) === isoToday() ? "오늘" : undefined })} />
          <Queue title="내 할일" icon={ListTodo} more="/managed/todos" items={q?.todos} empty="맡은 할일이 없습니다."
            render={(i) => ({ href: `/managed/todos/${i.id}`, title: i.title, sub: i.due ? `마감 ${fmtDate(i.due)}` : "마감일 없음", badge: i.overdue ? "기한 초과" : undefined, alert: i.overdue })} />
        </div>

        {/* 재무(관리자) */}
        {fin && (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {([
              ["이번 달 매출(입금확인)", fin.sales_total, `${fin.sales_count}건`, "/managed/billing/revenue", "text-emerald-600"],
              ["미수금", fin.receivable_vat, `${fin.receivable_count}건 · 6개월 초과 ${won(fin.receivable_excluded_vat)} 별도`, "/managed/billing/payments", "text-red-600"],
              ["이번 달 매입", fin.purchase_total, `${fin.purchase_count}건`, "/managed/billing/alarms", ""],
              ["이번 달 외주비", fin.outsourcing_total, `${fin.outsourcing_count}건`, "/managed/billing/alarms", ""],
            ] as const).map(([label, value, sub, href, color]) => (
              <Link key={label} href={href}>
                <Card className="h-full rounded-2xl transition-shadow hover:shadow-md">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={cn("text-xl font-bold tabular-nums", color)}>{won(value)}</p>
                    <p className="text-[11px] text-muted-foreground">{sub}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Queue({ title, icon: Icon, more, items, empty, render }: {
  title: string;
  icon: LucideIcon;
  more: string;
  items?: QItem[];
  empty: string;
  render: (i: QItem) => { href: string; title: string | null; sub?: string; badge?: string; alert?: boolean };
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{title}</h2>
          {items && <span className="text-xs text-muted-foreground">{items.length}{items.length >= 6 ? "+" : ""}</span>}
          <Link href={more} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">전체 <ArrowRight className="h-3 w-3" /></Link>
        </div>
        {!items ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {items.map((i) => {
              const r = render(i);
              return (
                <li key={i.id}>
                  <Link href={r.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title || "(제목 없음)"}</span>
                      {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                    </span>
                    {r.badge && (
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", r.alert ? "bg-red-100 text-red-700" : "bg-indigo-50 text-indigo-700")}>{r.badge}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
