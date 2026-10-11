"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { apiErrorDetail, meta } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
const FIELDS: FieldSpec[] = [
  { key: "name", label: "업체명 *" }, { key: "ceoname", label: "대표자" }, { key: "business_number", label: "사업자번호" },
  { key: "phone", label: "연락처" }, { key: "email", label: "이메일" }, { key: "tax_email", label: "세금계산서 이메일" },
  { key: "specialization", label: "전문 분야" }, { key: "address", label: "주소", wide: true },
  { key: "bank_account_info", label: "계좌 정보", wide: true }, { key: "notes", label: "메모", type: "textarea" },
];

export default function VendorsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data } = useStaffGet<{ items: Dict[]; write_enabled: boolean }>(["outsourcing", "vendors"], "/outsourcing/vendors");
  const write = useStaffWrite(["outsourcing"]);
  const [edit, setEdit] = useState<Dict | "new" | null>(null);
  useEffect(() => {
    setPageTitle("외주업체");
  }, [setPageTitle]);
  const remove = async (v: Dict) => {
    if (!window.confirm("업체를 삭제할까요?")) return;
    try {
      await write.mutateAsync({ url: `/outsourcing/vendors/${v.seq}/delete` });
      toast("success", "삭제했습니다.");
    } catch (err) {
      toast("error", apiErrorDetail(err, "삭제에 실패했습니다."));
    }
  };
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/outsourcing"><ArrowLeft className="mr-1 h-4 w-4" /> 외주관리</Link></Button>
        </div>
        <PageActions>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" onClick={() => setEdit("new")}><Plus className="mr-1 h-4 w-4" /> 업체 등록</Button>}
        </PageActions>
        {data && (
          <DataTable
            rows={data.items}
            rowKey={(v) => v.seq as number}
            empty={<p className="px-4 py-8 text-center text-sm text-muted-foreground">외주업체가 없습니다.</p>}
            columns={[
              {
                key: "name", header: "업체명", sort: "name", value: (v) => v.name as string, cell: (v) => (
                  <div className="min-w-0 max-w-[320px]">
                    <p className="truncate font-medium">{v.name as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(v.specialization as string)}</p>
                  </div>
                ),
              },
              { key: "ceoname", header: "대표자", sort: "ceoname", value: (v) => (v.ceoname as string) || null, hideOnMobile: true, className: "w-24 whitespace-nowrap", cell: (v) => (v.ceoname as string) || "-" },
              { key: "phone", header: "연락처", hideOnMobile: true, className: "w-32 whitespace-nowrap", cell: (v) => (v.phone as string) || "-" },
              { key: "email", header: "이메일", hideOnMobile: true, cell: (v) => (v.email as string) || "-" },
              { key: "count", header: "외주", sort: "count", value: (v) => v.outsourcing_count as number, align: "right", className: "w-16 whitespace-nowrap", cell: (v) => `${v.outsourcing_count as number}건` },
              { key: "files", header: "첨부", hideOnMobile: true, className: "whitespace-nowrap", cell: (v) => <VendorFiles v={v} /> },
              ...(data.write_enabled ? [{ key: "actions", header: "", align: "right" as const, className: "w-24 whitespace-nowrap", cell: (v: Dict) => <VendorActions onEdit={() => setEdit(v)} onDelete={() => remove(v)} /> }] : []),
            ]}
            mobile={(v) => (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{v.name as string} <span className="text-xs font-normal text-muted-foreground">외주 {v.outsourcing_count as number}건</span></p>
                    <p className="truncate text-xs text-muted-foreground">{(v.ceoname as string) || "-"} · {(v.phone as string) || "-"} · {(v.email as string) || "-"} · {(v.specialization as string) || ""}</p>
                  </div>
                  {data.write_enabled && <VendorActions onEdit={() => setEdit(v)} onDelete={() => remove(v)} />}
                </div>
                <VendorFiles v={v} />
              </div>
            )}
          />
        )}
      </div>
      {edit && <VendorDialog vendor={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </PageTransition>
  );
}

function VendorFiles({ v }: { v: Dict }) {
  if (!v.has_business_file && !v.has_bank_file) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {Boolean(v.has_business_file) && <a className="inline-flex items-center gap-1 text-xs text-blue-600" href={staffFileUrl(`/outsourcing/vendors/${v.seq}/files/business`)}><Paperclip className="h-3 w-3" /> 사업자등록증</a>}
      {Boolean(v.has_bank_file) && <a className="inline-flex items-center gap-1 text-xs text-blue-600" href={staffFileUrl(`/outsourcing/vendors/${v.seq}/files/bank`)}><Paperclip className="h-3 w-3" /> 통장사본</a>}
    </span>
  );
}

function VendorActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="inline-flex gap-2">
      <Button size="sm" variant="outline" className="rounded-xl" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
      <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </span>
  );
}

function VendorDialog({ vendor, onClose }: { vendor: Dict | null; onClose: () => void }) {
  const { toast } = useToast();
  const write = useStaffWrite(["outsourcing"]);
  const [v, setV] = useState(() => (vendor ? toValues(FIELDS, vendor) : {}));
  const save = async () => {
    try {
      if (vendor) await write.mutateAsync({ method: "patch", url: `/outsourcing/vendors/${vendor.seq}`, body: toPayload(FIELDS, v) });
      else await write.mutateAsync({ url: "/outsourcing/vendors", body: toPayload(FIELDS, v) });
      toast("success", "저장했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader><DialogTitle>{vendor ? "외주업체 수정" : "외주업체 등록"}</DialogTitle></DialogHeader>
        <FormGrid fields={FIELDS} values={v} onChange={(k, val) => setV((s) => ({ ...s, [k]: val }))} />
        <DialogFooter><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
