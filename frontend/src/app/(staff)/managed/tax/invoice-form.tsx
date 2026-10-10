"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { useToast } from "@/components/common/app-toast";
import { Field, apiErrorDetail, selectClass } from "@/components/managed/field";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useStaffMe } from "@/lib/staff-hooks";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { useTaxOptions } from "./tax-ui";

type Dict = Record<string, unknown>;
type Kind = "purchases" | "sales";
const KEYS: Record<Kind, string[]> = {
  purchases: ["issue_date", "supplier_name", "supplier_no", "client_id", "item", "supply_amount", "tax_amount", "expense_category", "deduction_status", "payment_method", "memo"],
  sales: ["issue_date", "buyer_name", "buyer_no", "client_id", "item", "supply_amount", "tax_amount", "issue_status", "payment_status", "payment_date", "memo"],
};

// 매입/매출 계산서 등록·수정 공용 폼. 합계를 넣으면 공급가 = round(합계/1.1), 세액 = 합계 − 공급가.
export function InvoiceForm({ kind, id, data }: { kind: Kind; id: string; data: Dict | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: o } = useTaxOptions();
  const { data: prefill } = useStaffGet<Dict[]>(["tax", "sales-prefill"], kind === "sales" && !data ? "/tax/sales/prefill-histories" : null);
  const write = useStaffWrite(["tax"]);
  const canWrite = !!me?.write_areas.includes("tax");
  const purchase = kind === "purchases";
  const [v, setV] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of KEYS[kind]) out[k] = data?.[k] == null ? "" : String(data[k]);
    if (!data) Object.assign(out, purchase ? { deduction_status: "review" } : { issue_status: "issued", payment_status: "unpaid" }, { issue_date: new Date().toISOString().slice(0, 10) });
    return out;
  });
  const [source, setSource] = useState("");
  const [total, setTotal] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const nameKey = purchase ? "supplier_name" : "buyer_name";
  const noKey = purchase ? "supplier_no" : "buyer_no";
  const save = async () => {
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => { if (val !== "") fd.append(k, val); });
    if (source) fd.append("source_payment_history_id", source);
    files.forEach((f) => fd.append("attachments", f));
    try {
      if (!data) {
        const r = await write.mutateAsync({ url: `/tax/${kind}`, body: fd });
        (r.budget_warnings ?? []).forEach((w: string) => toast("warning", w));
        toast("success", "등록했습니다.");
        router.replace(`/managed/tax/${kind}/${r.id}`);
      } else {
        const r = await write.mutateAsync({ url: `/tax/${kind}/${id}/update`, body: fd });
        (r.budget_warnings ?? []).forEach((w: string) => toast("warning", w));
        setFiles([]);
        toast("success", "저장했습니다.");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const input = (k: string, label: string, type = "text", list?: string) => (
    <Field label={label}><Input className="rounded-xl" type={type} list={list} disabled={!canWrite} value={v[k]} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  const select = (k: string, label: string, opts: [string, string][], empty?: string) => (
    <Field label={label}>
      <select className={selectClass} disabled={!canWrite} value={v[k]} onChange={(e) => set(k, e.target.value)}>
        {empty !== undefined && <option value="">{empty}</option>}{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}
      </select>
    </Field>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href={`/managed/tax/${kind}`}><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link></Button>
        <div className="flex-1" />
        {data && canWrite && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /></Button>}
      </div>
      <Card className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5">
        {!purchase && !data && canWrite && (
          <Field label="납부내역에서 가져오기(선택)">
            <select className={selectClass} value={source} onChange={(e) => {
              setSource(e.target.value);
              const h = prefill?.find((x) => String(x.history_id) === e.target.value);
              if (h) setV((x) => ({ ...x, buyer_name: h.buyer_name as string, buyer_no: h.buyer_no as string, client_id: h.client_id ? String(h.client_id) : "",
                item: h.item as string, supply_amount: String(h.supply_amount), tax_amount: String(h.tax_amount), issue_date: (h.date_candidate as string) || x.issue_date }));
            }}>
              <option value="">직접 입력</option>
              {prefill?.map((h) => <option key={h.history_id as number} value={h.history_id as number}>#{h.history_id as number} · {h.buyer_name as string} · {h.item as string} · {Number(h.invoice_amount).toLocaleString()}원 · {(h.date_candidate as string) ?? "-"}</option>)}
            </select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {input("issue_date", "작성일자 *", "date")}
          {input(nameKey, purchase ? "공급자 상호 *" : "공급받는자 상호 *", "text", purchase ? "supplier-list" : undefined)}
          {input(noKey, "사업자등록번호")}
          {select("client_id", "거래처(업체)", (o?.clients ?? []).map((c) => [String(c.seq), c.name]), "없음")}
          <Field label="품목 *" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v.item} onChange={(e) => set("item", e.target.value)} /></Field>
          <Field label="합계로 계산"><Input className="rounded-xl" placeholder="부가세 포함 합계" disabled={!canWrite} value={total} onChange={(e) => {
            setTotal(e.target.value);
            const t = Number(e.target.value.replace(/,/g, ""));
            if (t > 0) { const s = Math.round(t / 1.1); setV((x) => ({ ...x, supply_amount: String(s), tax_amount: String(t - s) })); }
          }} /></Field>
          {input("supply_amount", "공급가액")}{input("tax_amount", "세액")}
          {purchase ? (
            <>
              {select("expense_category", "비용분류 *", (o?.categories ?? []).map((c) => [c, c]), "선택")}
              {select("deduction_status", "공제", Object.entries(o?.deduction ?? {}))}
              {select("payment_method", "결제수단", Object.entries(o?.payment_methods ?? {}), "없음")}
            </>
          ) : (
            <>
              {select("issue_status", "발행상태", Object.entries(o?.issue_status ?? {}))}
              {select("payment_status", "입금상태", Object.entries(o?.payment_status ?? {}))}
              {input("payment_date", "입금일", "date")}
            </>
          )}
        </div>
        <datalist id="supplier-list">{[...(o?.suppliers ?? []), ...(o?.vendors ?? [])].map((s, i) => <option key={i} value={s.name}>{s.business_number}</option>)}</datalist>
        <Field label="메모"><Textarea className="rounded-xl" disabled={!canWrite} value={v.memo} onChange={(e) => set("memo", e.target.value)} /></Field>
        <div className="space-y-1 text-sm">
          <p className="font-semibold">첨부</p>
          {((data?.attachments as Dict[] | undefined) ?? []).map((a) => (
            <div key={a.id as number} className="flex items-center gap-2 text-xs">
              <a className="underline" href={staffFileUrl(`/tax/attachments/${a.id}`)}>{a.name as string}</a>
              {canWrite && <button className="text-red-600" onClick={async () => { if (!window.confirm("첨부를 삭제할까요?")) return; try { await write.mutateAsync({ url: `/tax/attachments/${a.id}/delete` }); toast("success", "삭제했습니다."); } catch (err) { toast("error", apiErrorDetail(err, "삭제에 실패했습니다.")); } }}>삭제</button>}
            </div>
          ))}
          {canWrite && <input type="file" multiple className="text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />}
        </div>
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="세금계산서 삭제" description="목록에서 숨깁니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { try { await write.mutateAsync({ url: `/tax/${kind}/${id}/delete` }); toast("success", "삭제했습니다."); router.replace(`/managed/tax/${kind}`); } catch (err) { toast("error", apiErrorDetail(err, "삭제에 실패했습니다.")); } }} />
    </div>
  );
}
