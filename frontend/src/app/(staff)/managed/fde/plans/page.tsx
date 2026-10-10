"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDateTime, selectClass } from "@/components/managed/field";
import { useStaffMe } from "@/lib/staff-hooks";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Plan = Record<string, unknown> & { plan_id: string; name_ko: string; kind: string; price_status: string };

// FDE 요금제 카탈로그 — 제안가(draft) → 확정가(confirmed) 전환 시 확정일·확정자 기록. 수정은 관리자만.
export default function FdePlansPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data } = useStaffGet<{ items: Plan[] }>(["fde", "plans"], "/fde/plans");
  const { data: me } = useStaffMe();
  useEffect(() => {
    setPageTitle("FDE 요금제");
  }, [setPageTitle]);
  const canEdit = !!me?.is_admin && !!me?.write_areas.includes("fde");
  return (
    <PageTransition>
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/fde"><ArrowLeft className="mr-1 h-4 w-4" /> FDE 계약</Link></Button>
        <p className="text-xs text-muted-foreground">금액은 공급가(VAT 별도). 모든 요금제는 비공개이며, 대표 검토 전 제안가입니다.</p>
        {data?.items.map((p) => <PlanCard key={p.plan_id} p={p} canEdit={canEdit} />)}
      </div>
    </PageTransition>
  );
}

function PlanCard({ p, canEdit }: { p: Plan; canEdit: boolean }) {
  const { toast } = useToast();
  const write = useStaffWrite(["fde"]);
  const [v, setV] = useState({
    name_ko: p.name_ko, name_en: (p.name_en as string) ?? "", list_price_supply: p.list_price_supply == null ? "" : String(p.list_price_supply),
    price_is_from: Boolean(p.price_is_from), price_status: p.price_status, min_months: p.min_months == null ? "" : String(p.min_months),
    notice_days: p.notice_days == null ? "" : String(p.notice_days), is_public: Boolean(p.is_public), description: (p.description as string) ?? "",
    linked_dev_plan: (p.linked_dev_plan as string) ?? "",
  });
  const n = (x: string) => (x.trim() === "" ? null : Number(x.replace(/,/g, "")));
  const save = async () => {
    try {
      await write.mutateAsync({ method: "patch", url: `/fde/plans/${p.plan_id}`, body: { ...v, list_price_supply: n(v.list_price_supply), min_months: n(v.min_months), notice_days: n(v.notice_days), linked_dev_plan: v.linked_dev_plan || null } });
      toast("success", "저장했습니다.");
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <Card className="rounded-2xl"><CardContent className="grid gap-2 pt-4 pb-4 text-sm sm:grid-cols-4">
      <div className="sm:col-span-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{p.plan_id}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{p.kind === "plan" ? "요금제" : "옵션"} · {p.billing_kind_label as string}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${p.price_status === "confirmed" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{p.price_status === "confirmed" ? `확정가 ${fmtDateTime(p.price_confirmed_at as string)}` : "제안가"}</span>
        {(p.applies_to as string[]).length > 0 && <span className="text-xs text-muted-foreground">적용: {(p.applies_to as string[]).join(", ")}</span>}
      </div>
      <Input className="rounded-xl" disabled={!canEdit} value={v.name_ko} onChange={(e) => setV({ ...v, name_ko: e.target.value })} />
      <Input className="rounded-xl" disabled={!canEdit} placeholder="공급가" value={v.list_price_supply} onChange={(e) => setV({ ...v, list_price_supply: e.target.value })} />
      <select className={selectClass} disabled={!canEdit} value={v.price_status} onChange={(e) => setV({ ...v, price_status: e.target.value })}>
        <option value="draft">제안가</option><option value="confirmed">확정가</option>
      </select>
      <label className="flex items-center gap-2"><input type="checkbox" disabled={!canEdit} checked={v.price_is_from} onChange={(e) => setV({ ...v, price_is_from: e.target.checked })} /> &quot;~&quot;(최저가)</label>
      {p.plan_id === "fde-resident" && (
        <>
          <Input className="rounded-xl" disabled={!canEdit} placeholder="최소 개월" value={v.min_months} onChange={(e) => setV({ ...v, min_months: e.target.value })} />
          <Input className="rounded-xl" disabled={!canEdit} placeholder="종료 통보(일)" value={v.notice_days} onChange={(e) => setV({ ...v, notice_days: e.target.value })} />
        </>
      )}
      {p.plan_id === "fde-addon-ops" && (
        <select className={selectClass} disabled={!canEdit} value={v.linked_dev_plan} onChange={(e) => setV({ ...v, linked_dev_plan: e.target.value })}>
          <option value="">연결 개발구독 플랜(미정)</option><option value="starter">STARTER</option><option value="growth">GROWTH</option><option value="scale">SCALE</option>
        </select>
      )}
      <Textarea className="rounded-xl sm:col-span-4" disabled={!canEdit} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      {canEdit && <div className="flex justify-end sm:col-span-4"><Button size="sm" className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
    </CardContent></Card>
  );
}
