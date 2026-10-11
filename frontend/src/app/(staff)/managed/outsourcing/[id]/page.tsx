"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { useLookupProjects } from "@/lib/staff-maintenance";
import { useStaffList } from "@/lib/staff-sales";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { useStaffMe } from "@/lib/staff-hooks";

type Dict = Record<string, unknown>;
type Pay = { seq?: number; amount: string; paid_date: string; expected_paid_date: string; memo: string };

export default function StaffOutsourcingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["outsourcing", "detail", id], isNew ? null : `/outsourcing/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "외주 등록" : "외주");
  }, [setPageTitle, isNew]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return <Editor key={id} id={id} data={isNew ? null : data!} />;
}

function Editor({ id, data }: { id: string; data: Dict | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: vendors } = useStaffGet<{ items: Dict[] }>(["outsourcing", "vendors"], "/outsourcing/vendors");
  const { data: projects } = useLookupProjects();
  const { data: staff } = useStaffList();
  const write = useStaffWrite(["outsourcing"]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fields: FieldSpec[] = useMemo(() => [
    { key: "vendor_id", label: "외주업체 *", type: "select", options: (vendors?.items ?? []).map((v) => [String(v.seq), v.name as string]) },
    { key: "project_id", label: "프로젝트", type: "select", options: (projects?.items ?? []).map((p) => [String(p.id), p.name]) },
    { key: "work_type", label: "외주 형태 *", type: "select", options: [["planning", "기획"], ["development", "개발"], ["design", "디자인"], ["publishing", "퍼블리싱"], ["frontend", "프론트앤드"], ["backend", "백엔드"]] },
    { key: "status", label: "상태", type: "select", options: [["active", "진행중"], ["completed", "완료"], ["cancelled", "취소"]] },
    { key: "start_date", label: "시작일 *", type: "date" }, { key: "end_date", label: "종료일 *", type: "date" },
    { key: "amount", label: "금액(부가세 포함)", type: "number" },
    { key: "manager_id", label: "담당 직원", type: "select", options: (staff?.items ?? []).map((u) => [String(u.id), u.name || u.username]) },
    { key: "manager_name", label: "담당(직접 입력)" },
    { key: "description", label: "내용", type: "textarea" },
  ], [vendors, projects, staff]);
  const [v, setV] = useState<Record<string, string>>(() => (data ? toValues(fields, data) : { status: "active" }));
  const [pays, setPays] = useState<Pay[]>(() => ((data?.payments as Dict[] | undefined) ?? []).map((p) => ({
    seq: p.seq as number, amount: String(p.amount ?? ""), paid_date: (p.paid_date as string) ?? "", expected_paid_date: (p.expected_paid_date as string) ?? "", memo: (p.memo as string) ?? "",
  })));
  const canWrite = data ? Boolean(data.write_enabled) : !!me?.write_areas.includes("outsourcing");

  const save = async () => {
    const body = { ...toPayload(fields, v) } as Record<string, unknown>;
    try {
      if (!data) {
        const res = await write.mutateAsync({ url: "/outsourcing", body });
        toast("success", "등록했습니다.");
        router.replace(`/managed/outsourcing/${res.seq}`);
      } else {
        body.payments = pays.filter((p) => p.amount && p.paid_date).map((p) => ({ seq: p.seq ?? null, amount: Number(p.amount), paid_date: p.paid_date, expected_paid_date: p.expected_paid_date || null, memo: p.memo }));
        await write.mutateAsync({ method: "patch", url: `/outsourcing/${id}`, body });
        toast("success", "저장했습니다(지급내역이 있으면 결제일알람이 자동 연동됩니다).");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && canWrite && (
          <PageActions>
            <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} title="삭제" aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>
          </PageActions>
        )}
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/outsourcing/`} />}
        <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
          <FormGrid fields={fields} values={v} disabled={!canWrite} onChange={(k, val) => setV((s) => ({ ...s, [k]: val }))} />
          {data && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">지급내역{data.alarm ? ` · 결제일알람 #${(data.alarm as Dict).seq} 연결됨` : ""}</p>
              {pays.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Input className="rounded-xl" placeholder="금액" disabled={!canWrite} value={p.amount} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <Input className="rounded-xl" type="date" disabled={!canWrite} value={p.paid_date} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, paid_date: e.target.value } : x)))} />
                  <Input className="rounded-xl" type="date" title="지급예상일" disabled={!canWrite} value={p.expected_paid_date} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, expected_paid_date: e.target.value } : x)))} />
                  <Input className="rounded-xl" placeholder="메모" disabled={!canWrite} value={p.memo} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, memo: e.target.value } : x)))} />
                  {canWrite && <Button variant="ghost" className="rounded-xl text-red-600" onClick={() => setPays(pays.filter((_, j) => j !== i))}>삭제</Button>}
                </div>
              ))}
              {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setPays([...pays, { amount: "", paid_date: new Date().toISOString().slice(0, 10), expected_paid_date: "", memo: "" }])}><Plus className="mr-1 h-4 w-4" /> 지급 추가</Button>}
            </div>
          )}
          {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
        </CardContent></Card>
      </div>
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="외주 삭제" description="지급내역과 연결된 결제일알람도 함께 삭제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { try { await write.mutateAsync({ url: `/outsourcing/${id}/delete` }); toast("success", "삭제했습니다."); router.replace("/managed/outsourcing"); } catch (err) { toast("error", apiErrorDetail(err, "삭제에 실패했습니다.")); } }} />
    </PageTransition>
  );
}
