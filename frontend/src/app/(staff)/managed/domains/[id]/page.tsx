"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDate, fmtDateTime, selectClass } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useLookupCompanies } from "@/lib/staff-maintenance";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { useStaffMe } from "@/lib/staff-hooks";

type Dict = Record<string, unknown>;
const ST: [string, string][] = [["A", "활성"], ["I", "비활성"], ["E", "만료"]];

export default function StaffDomainPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["domains", "detail", id], isNew ? null : `/domains/${id}`);
  useEffect(() => {
    const firstUrl = (data?.urls as string[] | undefined)?.[0];
    setPageTitle(isNew ? "도메인 등록" : firstUrl || "도메인");
  }, [setPageTitle, isNew, data?.urls]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return <DomainEditor key={id} id={id} data={isNew ? null : data!} />;
}

function DomainEditor({ id, data }: { id: string; data: Dict | null }) {
  const isNew = !data;
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: companies } = useLookupCompanies();
  const write = useStaffWrite(["domains", "projects"]);
  const fields: FieldSpec[] = useMemo(() => [
    { key: "company_id", label: "업체 *", type: "select", search: true, options: (companies?.items ?? []).map((c) => [String(c.id), c.name]) },
    { key: "domain_status", label: "도메인 상태", type: "select", options: ST },
    { key: "domain_start_date", label: "도메인 시작", type: "date" }, { key: "domain_end_date", label: "도메인 만료", type: "date" },
    { key: "domain_ssl_tf", label: "SSL", type: "select", options: [["Y", "사용"]] },
    { key: "domain_ssl_status", label: "SSL 상태", type: "select", options: ST },
    { key: "domain_ssl_start_date", label: "SSL 시작", type: "date" }, { key: "domain_ssl_end_date", label: "SSL 만료", type: "date" },
    { key: "hosting_type", label: "호스팅", type: "select", options: [["I", "한결랩"], ["E", "외부"]] },
    { key: "hosting_provider", label: "호스팅 업체" },
    { key: "hosting_start_date", label: "호스팅 시작", type: "date" }, { key: "hosting_end_date", label: "호스팅 만료", type: "date" },
    { key: "domain_remarks", label: "도메인 메모", type: "textarea" },
  ], [companies]);
  const [v, setV] = useState<Record<string, string>>(() => (data ? toValues(fields, data) : { domain_status: "A" }));
  const [u, setU] = useState(() => ((data?.urls as string[] | undefined) ?? []).join("\n"));
  const [ext, setExt] = useState({ type: "D", months: "12", remarks: "" });
  const canWrite = isNew ? !!me?.write_areas.includes("domains") : Boolean(data?.write_enabled);

  const save = async () => {
    const body = { ...toPayload(fields, v), urls: u.split(/\n|,/).map((x) => x.trim()).filter(Boolean) };
    try {
      if (isNew) {
        const res = await write.mutateAsync({ url: "/domains", body });
        toast("success", "등록했습니다.");
        router.replace(`/managed/domains/${res.seq}`);
      } else {
        await write.mutateAsync({ method: "patch", url: `/domains/${id}`, body });
        toast("success", "저장했습니다.");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/domain`} />}
        <div className={data ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]" : ""}>
          <div className="min-w-0 space-y-4">
            <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
              <Field label="도메인 주소(줄마다 하나)">
                <textarea className="min-h-20 w-full rounded-xl border bg-background px-3 py-2 text-sm" disabled={!canWrite} value={u} onChange={(e) => setU(e.target.value)} />
              </Field>
              <FormGrid fields={fields} values={v} disabled={!canWrite} onChange={(k, val) => setV((s) => ({ ...s, [k]: val }))} />
              {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
            </CardContent></Card>
          </div>
          <div className="h-fit space-y-4 lg:sticky lg:top-20">
            {data && (
              <>
                {canWrite && (
                  <Card className="rounded-2xl"><CardContent className="flex flex-wrap items-end gap-2 pt-5 pb-5">
                    <Field label="연장" className="w-32"><select className={selectClass} value={ext.type} onChange={(e) => setExt({ ...ext, type: e.target.value })}><option value="D">도메인</option><option value="S">SSL</option><option value="H">호스팅</option></select></Field>
                    <Field label="개월" className="w-24"><Input className="rounded-xl" type="number" value={ext.months} onChange={(e) => setExt({ ...ext, months: e.target.value })} /></Field>
                    <Field label="메모" className="flex-1"><Input className="rounded-xl" value={ext.remarks} onChange={(e) => setExt({ ...ext, remarks: e.target.value })} /></Field>
                    <Button className="rounded-xl" onClick={async () => {
                      try {
                        const r = await write.mutateAsync({ url: `/domains/${id}/extend`, body: { extension_type: ext.type, months: Number(ext.months), remarks: ext.remarks } });
                        toast("success", `연장했습니다(새 만료일 ${r.new_end_date}). 새로고침하면 반영됩니다.`);
                      } catch (err) { toast("error", apiErrorDetail(err, "연장에 실패했습니다.")); }
                    }}><CalendarPlus className="mr-1 h-4 w-4" /> 연장</Button>
                  </CardContent></Card>
                )}
                <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm">
                  <h2 className="font-semibold">연결 프로젝트</h2>
                  {(data.projects as Dict[]).map((p) => <Link key={p.seq as number} className="block hover:underline" href={`/managed/projects/${p.seq}`}>#{p.seq as number} {p.title as string}</Link>)}
                  <h2 className="pt-2 font-semibold">연장 이력</h2>
                  {(data.histories as Dict[]).map((h, i) => <p key={i} className="text-muted-foreground">{fmtDateTime(h.created_at as string)} · {({ D: "도메인", S: "SSL", H: "호스팅" } as Record<string, string>)[h.type as string]} {h.months as number}개월 · {fmtDate(h.previous_end_date as string)} → {fmtDate(h.new_end_date as string)} · {h.by as string} {h.remarks as string}</p>)}
                </CardContent></Card>
              </>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
