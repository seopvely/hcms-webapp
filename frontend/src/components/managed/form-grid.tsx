"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectClass } from "@/components/managed/field";
import { SearchSelect, toPairItems } from "@/components/managed/search-select";

export type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select";
  options?: [string, string][];
  /** select 를 초성 검색 상자로(업체·프로젝트처럼 항목이 많은 목록) */
  search?: boolean;
  wide?: boolean;
};

// 단순 폼 렌더러 — 값은 문자열로 다루고 저장 직전에 형 변환한다.
export function FormGrid({
  fields, values, onChange, disabled,
}: {
  fields: FieldSpec[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map((f) => (
        <Field key={f.key} label={f.label} className={f.wide || f.type === "textarea" ? "sm:col-span-2 lg:col-span-4" : ""}>
          {f.type === "textarea" ? (
            <Textarea className="min-h-24 rounded-xl" disabled={disabled} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />
          ) : f.type === "select" && f.search ? (
            <SearchSelect items={toPairItems(f.options)} value={values[f.key] ?? ""} emptyOption="선택 안 함" disabled={disabled}
              onChange={(v) => onChange(f.key, v)} />
          ) : f.type === "select" ? (
            <select className={selectClass} disabled={disabled} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)}>
              <option value="">선택 안 함</option>
              {f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ) : (
            <Input className="rounded-xl" type={f.type ?? "text"} disabled={disabled} value={values[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} />
          )}
        </Field>
      ))}
    </div>
  );
}

/** 폼 문자열 값 → API 값(숫자·빈 값 null) */
export function toPayload(fields: FieldSpec[], values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim();
    if (f.type === "number") out[f.key] = v === "" ? null : Number(v.replace(/,/g, ""));
    else out[f.key] = v === "" ? null : v;
  }
  return out;
}

/** API 값 → 폼 문자열 값 */
export function toValues(fields: FieldSpec[], data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = data[f.key];
    if (v === null || v === undefined) out[f.key] = "";
    else if (f.type === "date") out[f.key] = String(v).slice(0, 10);
    else if (f.type === "datetime-local") out[f.key] = String(v).slice(0, 16);
    else out[f.key] = String(v);
  }
  return out;
}
