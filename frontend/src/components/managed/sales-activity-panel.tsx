"use client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDateTime } from "@/components/managed/field";
import { useStaffGet } from "@/lib/staff-ops";

type Item = {
  lead: { seq: number; title: string | null; status_label: string | null };
  projects: { seq: number; title: string | null }[];
  activities: { id: number; type_label: string; content: string | null; created_by: string | null; created_at: string | null }[];
};

// 업체 프로젝트에 연결된 영업접수 활동 이력(읽기 전용) — 유지보수·건별작업 상세 하단(SPEC 02 §2.5)
export function SalesActivityPanel({ companyId }: { companyId: number | null | undefined }) {
  const { data } = useStaffGet<{ items: Item[] }>(["sales", "company-activities", companyId], companyId ? `/sales/company/${companyId}/activities` : null);
  if (!data?.items.length) return null;
  return (
    <Card className="rounded-2xl">
      <CardContent className="space-y-3 pt-5 pb-5 text-sm">
        <h2 className="font-semibold">영업 활동</h2>
        {data.items.map((it) => (
          <div key={it.lead.seq} className="space-y-1">
            <p className="text-xs text-muted-foreground">
              <Link href={`/managed/sales/${it.lead.seq}`} className="font-medium text-foreground hover:underline">{it.lead.title || `영업접수 #${it.lead.seq}`}</Link>
              {it.lead.status_label && ` · ${it.lead.status_label}`} · {it.projects.map((p) => p.title).join(", ")}
            </p>
            {it.activities.length === 0 ? (
              <p className="text-xs text-muted-foreground">활동 이력 없음</p>
            ) : (
              <ul className="space-y-1">
                {it.activities.slice(0, 10).map((a) => (
                  <li key={a.id} className="rounded-lg bg-muted/40 px-3 py-1.5 text-xs">
                    <span className="font-medium">{a.type_label}</span>
                    <span className="ml-2 text-muted-foreground">{fmtDateTime(a.created_at)}{a.created_by ? ` · ${a.created_by}` : ""}</span>
                    {a.content && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{a.content}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
