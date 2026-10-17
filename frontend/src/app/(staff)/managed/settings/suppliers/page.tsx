"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Pencil, Plus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/common/app-toast";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDateTime } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffMe } from "@/lib/staff-hooks";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Supplier = { id: number; name: string; business_number: string; use_count: number; created_at: string | null; updated_at: string | null };
type Data = { items: Supplier[]; write_enabled: boolean };
type Draft = { id?: number; name: string; business_number: string };

// 매입 공급자 — 매입 세금계산서 폼의 "공급자 선택" 후보(purchase_supplier). 매입을 저장할 때도 자동으로 쌓인다.
// 계산서에는 상호·번호가 글자로 저장되므로 여기서 고치거나 지워도 기존 계산서는 바뀌지 않는다. 세금계산서처럼 관리자 전용.
export default function SuppliersPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data: me, isLoading: meLoading } = useStaffMe();
  const [q, setQ] = useState("");
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<Data>(["tax", "suppliers"], me?.is_admin ? "/tax/suppliers" : null, { q });
  const [editing, setEditing] = useState<Draft | null>(null);
  useEffect(() => {
    setPageTitle("매입 공급자");
  }, [setPageTitle]);

  if (meLoading) return null;
  if (!me?.is_admin) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground">
        <ShieldAlert className="h-10 w-10" /><p className="font-semibold text-foreground">관리자 전용 메뉴입니다</p>
      </div>
    );
  }
  const canWrite = !!data?.write_enabled;
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex max-w-sm flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQ(keyword.trim()); }}>
            <Input className="rounded-xl" placeholder="상호·사업자등록번호" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" variant="outline" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          <div className="flex-1" />
          {canWrite && <Button className="rounded-xl" onClick={() => setEditing({ name: "", business_number: "" })}><Plus className="mr-1 h-4 w-4" /> 공급자 추가</Button>}
        </div>
        <p className="text-xs text-muted-foreground">
          <Link href="/managed/tax/purchases/new" className="underline">매입 세금계산서 등록</Link>의 &quot;공급자 선택&quot;에 사용 횟수 순으로 나옵니다.
          매입을 저장하면 새 공급자는 자동으로 추가됩니다. 고치거나 지워도 이미 등록한 계산서는 바뀌지 않습니다.
        </p>
        {editing && <SupplierEditor key={editing.id ?? "new"} draft={editing} onDone={() => setEditing(null)} />}
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Building2} title={q ? "검색 결과가 없습니다" : "등록된 공급자가 없습니다"} /> : (
          <Card className="rounded-2xl"><CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">상호</th>
                    <th className="px-4 py-2 text-left font-medium">사업자등록번호</th>
                    <th className="px-4 py-2 text-right font-medium">사용</th>
                    <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">최근 사용·수정</th>
                    {canWrite && <th className="w-24 px-4 py-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.items.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{s.business_number || "-"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.use_count}회</td>
                      <td className="hidden px-4 py-2 text-xs text-muted-foreground sm:table-cell">{fmtDateTime(s.updated_at)}</td>
                      {canWrite && (
                        <td className="px-4 py-1 text-right">
                          <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0" title="수정" aria-label="수정"
                            onClick={() => setEditing({ id: s.id, name: s.name, business_number: s.business_number })}><Pencil className="h-4 w-4" /></Button>
                          <DeleteButton s={s} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent></Card>
        )}
      </div>
    </PageTransition>
  );
}

function DeleteButton({ s }: { s: Supplier }) {
  const { toast } = useToast();
  const write = useStaffWrite(["tax"]);
  return (
    <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0 text-red-600" title="삭제" aria-label="삭제" disabled={write.isPending}
      onClick={async () => {
        if (!confirm(`'${s.name}' 공급자를 목록에서 지울까요? (등록된 계산서는 그대로입니다)`)) return;
        try {
          await write.mutateAsync({ url: `/tax/suppliers/${s.id}/delete` });
          toast("success", "삭제했습니다.");
        } catch (err) {
          toast("error", apiErrorDetail(err, "삭제하지 못했습니다."));
        }
      }}><Trash2 className="h-4 w-4" /></Button>
  );
}

function SupplierEditor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const { toast } = useToast();
  const write = useStaffWrite(["tax"]);
  const [name, setName] = useState(draft.name);
  const [no, setNo] = useState(draft.business_number);
  const save = async () => {
    try {
      await write.mutateAsync({ url: draft.id ? `/tax/suppliers/${draft.id}/update` : "/tax/suppliers", body: { name: name.trim(), business_number: no.trim() } });
      toast("success", "저장했습니다.");
      onDone();
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장하지 못했습니다."));
    }
  };
  return (
    <Card className="rounded-2xl border-indigo-200"><CardContent className="pt-4 pb-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="min-w-48 flex-1 space-y-1 text-xs font-medium">공급자 상호 *
          <Input autoFocus className="rounded-xl" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="w-48 space-y-1 text-xs font-medium">사업자등록번호
          <Input className="rounded-xl" placeholder="000-00-00000" value={no} maxLength={20} onChange={(e) => setNo(e.target.value)} />
        </label>
        <Button type="button" variant="outline" className="rounded-xl" onClick={onDone}>취소</Button>
        <Button type="submit" className="rounded-xl" disabled={!name.trim() || write.isPending}>{draft.id ? "저장" : "추가"}</Button>
      </form>
    </CardContent></Card>
  );
}
