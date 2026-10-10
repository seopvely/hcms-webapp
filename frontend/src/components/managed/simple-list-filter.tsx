"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/managed/field";
import { useLookupCompanies } from "@/lib/staff-maintenance";

// 업체·상태·키워드 공용 필터(고객문의·건별작업)
export function SimpleListFilter({
  statusOptions,
  value,
  onChange,
  extra,
}: {
  statusOptions: [string, string][];
  value: { company_id?: number; status?: string; q?: string };
  onChange: (patch: { company_id?: number; status?: string; q?: string }) => void;
  extra?: React.ReactNode;
}) {
  const { data: companies } = useLookupCompanies();
  const [keyword, setKeyword] = useState(value.q ?? "");
  return (
    <Card className="rounded-2xl">
      <CardContent className="grid gap-3 pt-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="업체">
          <select className={selectClass} value={value.company_id ?? ""} onChange={(e) => onChange({ company_id: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">전체</option>
            {companies?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="상태">
          <select className={selectClass} value={value.status ?? ""} onChange={(e) => onChange({ status: e.target.value || undefined })}>
            <option value="">전체</option>
            {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {extra}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); onChange({ q: keyword.trim() || undefined }); }}>
          <Field label="키워드" className="flex-1">
            <Input className="rounded-xl" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </Field>
          <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
        </form>
      </CardContent>
    </Card>
  );
}
