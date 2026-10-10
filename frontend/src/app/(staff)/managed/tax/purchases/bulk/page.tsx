"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate, selectClass } from "@/components/managed/field";
import { won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import staffApi from "@/lib/staff-api";
import { TaxShell, useTaxOptions } from "../../tax-ui";

type Row = Record<string, string | number> & { history_id: number };

// 매입/외주 결제알람 납부내역 → 매입 세금계산서 일괄등록 (1단계 선택·프리필 → 2단계 확인·저장)
export default function TaxPurchaseBulkPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const router = useRouter();
  const { toast } = useToast();
  const { data: o } = useTaxOptions();
  const [page, setPage] = useState(1);
  const { data } = useStaffGet<ListResult>(["billing", "history", "purchase-bulk"], "/billing/payment-history", { type: "purchase", page, per_page: 50 });
  const write = useStaffWrite(["tax"]);
  const [selected, setSelected] = useState<number[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    setPageTitle("매입 계산서 일괄등록");
  }, [setPageTitle]);
  const candidates = (data?.items ?? []).filter((h) => !h.has_purchase_invoice);
  const prefill = async () => {
    try {
      const r = (await staffApi.post("/managed/tax/purchases/bulk-prefill", { history_ids: selected })).data;
      if (!r.rows.length) toast("warning", "등록 가능한 납부내역이 없습니다(이미 매입처리된 건일 수 있습니다).");
      setRows(r.rows);
    } catch (err) {
      toast("error", apiErrorDetail(err, "불러오기에 실패했습니다."));
    }
  };
  const confirm = async () => {
    try {
      const r = await write.mutateAsync({ url: "/tax/purchases/bulk-create", body: { rows } });
      (r.budget_warnings ?? []).forEach((w: string) => toast("warning", w));
      toast("success", `${r.created}건 등록${r.skipped.length ? ` (${r.skipped.length}건은 이미 등록되었거나 필수값 누락으로 제외)` : ""}`);
      router.replace("/managed/tax/purchases");
    } catch (err) {
      toast("error", apiErrorDetail(err, "등록에 실패했습니다."));
    }
  };
  const setRow = (i: number, k: string, val: string) => setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  return (
    <PageTransition>
      <TaxShell cmsPath="/managed/paymenthistory?type=purchase">
        <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/tax/purchases"><ArrowLeft className="mr-1 h-4 w-4" /> 매입 목록</Link></Button>
        {!rows ? (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              <p className="px-4 py-3 text-sm font-semibold">매입·외주비 납부내역(계산서 미연결 {candidates.length}건, 이 페이지)</p>
              {candidates.map((h) => (
                <label key={h.seq as number} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <input type="checkbox" checked={selected.includes(h.seq as number)} onChange={(e) => setSelected(e.target.checked ? [...selected, h.seq as number] : selected.filter((x) => x !== h.seq))} />
                  <span className="w-20">{fmtDate((h.balance_date ?? h.deposit_date ?? h.created_at) as string)}</span>
                  <span className="min-w-0 flex-1 truncate">{h.alarm_title as string}</span>
                  <span>{won(((h.deposit_amount as number) || 0) + ((h.progress_amount as number) || 0) + ((h.balance_amount as number) || 0))}</span>
                </label>
              ))}
            </CardContent></Card>
            <div className="flex items-center gap-2">
              {data && data.total_pages > 1 && <><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</Button><Button size="sm" variant="outline" disabled={page >= data.total_pages} onClick={() => setPage(page + 1)}>다음</Button></>}
              <div className="flex-1" />
              <Button className="rounded-xl" disabled={!selected.length} onClick={prefill}>선택 {selected.length}건 불러오기</Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {rows.map((r, i) => (
                <Card key={r.history_id} className="rounded-2xl"><CardContent className="grid grid-cols-2 gap-2 pt-3 pb-3 text-xs sm:grid-cols-4 lg:grid-cols-8">
                  <Input type="date" className="rounded-xl" value={String(r.issue_date ?? "")} onChange={(e) => setRow(i, "issue_date", e.target.value)} />
                  <Input className="rounded-xl" placeholder="공급자" value={String(r.supplier_name)} onChange={(e) => setRow(i, "supplier_name", e.target.value)} />
                  <Input className="rounded-xl" placeholder="사업자번호" value={String(r.supplier_no)} onChange={(e) => setRow(i, "supplier_no", e.target.value)} />
                  <Input className="rounded-xl" placeholder="품목" value={String(r.item)} onChange={(e) => setRow(i, "item", e.target.value)} />
                  <Input className="rounded-xl" value={String(r.supply_amount)} onChange={(e) => setRow(i, "supply_amount", e.target.value)} />
                  <Input className="rounded-xl" value={String(r.tax_amount)} onChange={(e) => setRow(i, "tax_amount", e.target.value)} />
                  <select className={selectClass} value={String(r.expense_category)} onChange={(e) => setRow(i, "expense_category", e.target.value)}>{o?.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  <select className={selectClass} value={String(r.payment_method)} onChange={(e) => setRow(i, "payment_method", e.target.value)}>
                    <option value="">결제수단</option>{Object.entries(o?.payment_methods ?? {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
                  </select>
                </CardContent></Card>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setRows(null)}>다시 선택</Button>
              <Button className="rounded-xl" disabled={!rows.length || write.isPending} onClick={confirm}>{rows.length}건 등록</Button>
            </div>
          </>
        )}
      </TaxShell>
    </PageTransition>
  );
}
