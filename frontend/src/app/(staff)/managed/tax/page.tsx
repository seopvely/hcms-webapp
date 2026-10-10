"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate } from "@/components/managed/field";
import { won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";
import { TaxShell } from "./tax-ui";

type Dict = Record<string, unknown>;

export default function TaxDashboardPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data } = useStaffGet<Dict>(["tax", "dashboard"], "/tax/dashboard");
  useEffect(() => {
    setPageTitle("세금계산서");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <TaxShell cmsPath="/managed/tax/">
        {!data ? <CardSkeleton /> : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[["이번 달 매출 공급가", data.sales_supply, `세액 ${won(data.sales_tax)}`], ["이번 달 매입 공급가", data.purchase_supply, `세액 ${won(data.purchase_tax)}`],
                ["부가세 예상(매출세액−매입세액)", data.vat_estimate, `${data.year}년 ${data.month}월`],
                ["확인 필요", null, `공제 검토 ${data.review_count}건 · 미입금 ${data.unpaid_count}건 · 미발행 ${data.pending_issue}건`]].map(([l, val, sub]) => (
                <Card key={l as string} className="rounded-2xl"><CardContent className="pt-4 pb-4">
                  <p className="text-xs text-muted-foreground">{l as string}</p>
                  {val !== null && <p className="text-xl font-bold">{won(val)}</p>}
                  <p className="text-xs text-muted-foreground">{sub as string}</p>
                </CardContent></Card>
              ))}
            </div>
            {((data.budget as Dict[]) ?? []).length > 0 && (
              <Card className="rounded-2xl"><CardContent className="space-y-1 pt-4 pb-4 text-xs">
                <p className="text-sm font-semibold">이번 달 매입 예산 집행</p>
                {(data.budget as Dict[]).map((b) => (
                  <p key={b.category as string} className={b.level === "over" ? "text-red-600" : b.level === "warn" ? "text-amber-600" : ""}>
                    {b.label as string}: {b.rate as number}% (목표 {won(b.target)} / 실적 {won(b.actual)})
                  </p>
                ))}
              </CardContent></Card>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {[["최근 매입", "recent_purchases", "purchases", "supplier_name"], ["최근 매출", "recent_sales", "sales", "buyer_name"]].map(([title, key, path, name]) => (
                <Card key={key} className="rounded-2xl"><CardContent className="divide-y p-0">
                  <p className="px-4 py-3 text-sm font-semibold">{title}</p>
                  {((data[key] as Dict[]) ?? []).map((r) => (
                    <Link key={r.id as number} href={`/managed/tax/${path}/${r.id}`} className="flex gap-3 px-4 py-2 text-xs hover:bg-muted/40">
                      <span className="w-20">{fmtDate(r.issue_date as string)}</span><span className="min-w-0 flex-1 truncate">{r[name] as string} · {r.item as string}</span><span>{won(r.total_amount)}</span>
                    </Link>
                  ))}
                </CardContent></Card>
              ))}
            </div>
          </>
        )}
      </TaxShell>
    </PageTransition>
  );
}
