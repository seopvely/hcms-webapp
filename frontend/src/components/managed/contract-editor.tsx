"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/common/app-toast";
import { AiProgress, useAiJob } from "@/components/managed/ai-assist";
import { Field, apiErrorDetail } from "@/components/managed/field";
import { type FieldSpec, toPayload, toValues } from "@/components/managed/form-grid";
import { FormSection, MoneyInput, SummaryRow, useUnsavedGuard } from "@/components/managed/form-kit";
import { PageActions } from "@/components/managed/page-actions";
import { cn } from "@/lib/utils";
import { useSalesMutation } from "@/lib/staff-sales";

const FIELDS: FieldSpec[] = [
  { key: "contract_title", label: "계약명" },
  { key: "contract_amount", label: "계약금액", type: "number" },
  { key: "contract_date", label: "계약일", type: "date" },
  { key: "contract_start_date", label: "시작일", type: "date" },
  { key: "contract_end_date", label: "종료일", type: "date" },
  { key: "contract_period", label: "계약기간" },
  { key: "maintenance_point", label: "유지보수 포인트", type: "number" },
  { key: "free_maint_months", label: "무상 유지보수 개월", type: "number" },
  { key: "free_maint_scope", label: "무상 유지보수 범위" },
  { key: "party_a_name", label: "갑 상호" }, { key: "party_a_ceo", label: "갑 대표자" },
  { key: "party_a_business_number", label: "갑 사업자번호" }, { key: "party_a_email", label: "갑 이메일" },
  { key: "party_a_address", label: "갑 주소" },
  { key: "party_b_name", label: "을 상호" }, { key: "party_b_ceo", label: "을 대표자" },
  { key: "party_b_business_number", label: "을 사업자번호" }, { key: "party_b_email", label: "을 이메일" },
  { key: "party_b_address", label: "을 주소" },
  { key: "project_description", label: "프로젝트 설명", type: "textarea" },
  { key: "service_scope", label: "서비스 범위", type: "textarea" },
  { key: "payment_terms", label: "지불조건", type: "textarea" },
  { key: "special_terms", label: "특약", type: "textarea" },
];

const PARTY = [["name", "상호"], ["ceo", "대표자"], ["business_number", "사업자번호"], ["email", "이메일"], ["address", "주소"]] as const;

/** 시작일~종료일(포함) 개월 수 — 남는 날이 있으면 한 달로 올림(예: 10-01~다음해 09-30 = 12개월) */
export function monthsBetween(a: string, b: string): number | null {
  if (!a || !b) return null;
  const s = new Date(`${a}T00:00:00`);
  const e = new Date(`${b}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return null;
  e.setDate(e.getDate() + 1); // 종료일 포함
  let m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) m -= 1;
  const anchor = new Date(s);
  anchor.setMonth(anchor.getMonth() + m);
  return Math.max(anchor < e ? m + 1 : m, 1);
}

/**
 * 계약서 작성·수정 화면. 계약 기본 → 유지보수 → 당사자(갑·을) → 계약 내용.
 * 오른쪽(모바일은 아래)에 요약과 발송 전 확인 목록. 을(한결랩) 정보는 기본값이라 접어 둔다.
 */
export function ContractEditor({
  initial, estimateId, seq, onDone,
}: {
  initial: Record<string, unknown>;
  estimateId: number | null;
  seq: number | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const mutate = useSalesMutation();
  const [v, setV] = useState(() => toValues(FIELDS, initial));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "review">(null);
  const [showErrors, setShowErrors] = useState(false);
  useUnsavedGuard(dirty);

  const set = (k: string, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    setDirty(true);
  };
  // AI 초안 — 계약 정보·연결 견적으로 계약 내용 4칸을 채운다(빈 칸이 아니면 덮어쓸지 묻는다)
  const ai = useAiJob<Record<string, string>>();
  const AI_KEYS = ["project_description", "service_scope", "payment_terms", "special_terms"];
  const runAi = () => {
    if (AI_KEYS.some((k) => (v[k] ?? "").trim()) && !confirm("AI 결과가 나오면 계약 내용 4칸을 덮어씁니다. 진행할까요?")) return;
    ai.start("/ai/contract-draft", {
      contract_seq: seq, estimate_id: estimateId ?? (initial.estimate_id as number | null) ?? null,
      contract_title: v.contract_title ?? "", company_name: v.party_a_name ?? "", contract_amount: v.contract_amount ?? "", contract_period: v.contract_period ?? "",
      maintenance_point: v.maintenance_point ?? "", free_maint_months: v.free_maint_months ?? "", free_maint_scope: v.free_maint_scope ?? "",
      project_description: v.project_description ?? "",
    }, (d) => {
      setV((s) => ({ ...s, ...Object.fromEntries(AI_KEYS.filter((k) => d[k]).map((k) => [k, d[k]])) }));
      setDirty(true);
      toast("success", "AI 초안을 넣었습니다. 내용을 확인하고 저장하세요.");
    });
  };

  const months = monthsBetween(v.contract_start_date ?? "", v.contract_end_date ?? "");
  const linkedEstimate = estimateId ?? (initial.estimate_id as number | null) ?? null;
  const checks = useMemo(() => [
    { ok: !!(v.contract_title ?? "").trim(), label: "계약명", required: true },
    { ok: !!(v.contract_amount ?? "").trim(), label: "계약금액" },
    { ok: !!(v.contract_start_date && v.contract_end_date), label: "계약 시작·종료일" },
    { ok: !!(v.party_a_name && v.party_a_ceo), label: "갑 상호·대표자" },
    { ok: /\S+@\S+/.test(v.party_a_email ?? ""), label: "갑 이메일(발송 받는 주소)" },
    { ok: !!(v.party_b_name && v.party_b_business_number), label: "을 상호·사업자번호" },
  ], [v]);

  const save = async (review: boolean) => {
    setShowErrors(true);
    if (!(v.contract_title ?? "").trim()) {
      toast("warning", "계약명을 입력하세요.");
      return;
    }
    setSaving(review ? "review" : "draft");
    const body = { ...toPayload(FIELDS, v), review };
    try {
      if (seq) {
        await mutate.mutateAsync({ method: "patch", url: `/contracts/${seq}`, body });
        setDirty(false);
        toast("success", "저장했습니다.");
        onDone();
      } else {
        const res = await mutate.mutateAsync({ url: "/contracts", body: { ...body, estimate_id: estimateId } });
        setDirty(false);
        toast("success", "계약서를 만들었습니다.");
        router.replace(`/managed/contracts/${res.seq}`);
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    } finally {
      setSaving(null);
    }
  };
  const cancel = () => {
    if (dirty && !confirm("저장하지 않은 변경이 있습니다. 나갈까요?")) return;
    if (seq) onDone();
    else router.back();
  };

  const party = (side: "a" | "b") => (
    <div className="grid gap-3 sm:grid-cols-2">
      {PARTY.map(([k, label]) => (
        <Field key={k} label={label} className={k === "address" ? "sm:col-span-2" : ""}>
          <Input className="rounded-xl" type={k === "email" ? "email" : "text"} value={v[`party_${side}_${k}`] ?? ""} onChange={(e) => set(`party_${side}_${k}`, e.target.value)} />
        </Field>
      ))}
    </div>
  );
  const area = (k: string, label: string, placeholder: string, rows = 5) => (
    <Field label={label}>
      <Textarea className="rounded-xl" style={{ minHeight: `${rows * 1.5}rem` }} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
      <span className="block text-right text-[11px] text-muted-foreground">{(v[k] ?? "").length.toLocaleString()}자</span>
    </Field>
  );

  return (
    <>
      <PageActions>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={cancel}>취소</Button>
        <Button size="sm" className="rounded-xl" onClick={() => save(true)} disabled={!!saving}>
          {saving === "review" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}검토대기로 저장
        </Button>
      </PageActions>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <FormSection title="계약 기본">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="계약명 *" className="sm:col-span-2 lg:col-span-3">
                <Input className={cn("rounded-xl", showErrors && !(v.contract_title ?? "").trim() && "border-red-400")} value={v.contract_title ?? ""} onChange={(e) => set("contract_title", e.target.value)} />
              </Field>
              <Field label="계약금액(부가세 포함)"><MoneyInput value={v.contract_amount ?? ""} onChange={(d) => set("contract_amount", d)} /></Field>
              <Field label="계약일"><Input type="date" className="rounded-xl" value={v.contract_date ?? ""} onChange={(e) => set("contract_date", e.target.value)} /></Field>
              <div />
              <Field label="시작일"><Input type="date" className="rounded-xl" value={v.contract_start_date ?? ""} onChange={(e) => set("contract_start_date", e.target.value)} /></Field>
              <Field label="종료일"><Input type="date" className="rounded-xl" value={v.contract_end_date ?? ""} onChange={(e) => set("contract_end_date", e.target.value)} /></Field>
              <Field label="계약기간(표기)">
                <div className="flex gap-1">
                  <Input className="rounded-xl" value={v.contract_period ?? ""} onChange={(e) => set("contract_period", e.target.value)} placeholder="예: 12개월" />
                  {months && (
                    <Button type="button" size="sm" variant="outline" className="h-10 shrink-0 rounded-xl px-2 text-xs" onClick={() => set("contract_period", `${months}개월`)} title="시작·종료일로 계산">
                      {months}개월
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection title="유지보수" description="유지보수·호스팅 계약일 때만 채웁니다." collapsible defaultOpen={!!(v.maintenance_point || v.free_maint_months)}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="월 유지보수 포인트"><Input inputMode="numeric" className="rounded-xl text-right" value={v.maintenance_point ?? ""} onChange={(e) => set("maintenance_point", e.target.value.replace(/[^\d]/g, ""))} /></Field>
              <Field label="무상 유지보수(개월)"><Input inputMode="numeric" className="rounded-xl text-right" value={v.free_maint_months ?? ""} onChange={(e) => set("free_maint_months", e.target.value.replace(/[^\d]/g, ""))} /></Field>
              <Field label="무상 유지보수 범위"><Input className="rounded-xl" value={v.free_maint_scope ?? ""} onChange={(e) => set("free_maint_scope", e.target.value)} /></Field>
            </div>
          </FormSection>

          <div className="grid gap-4 xl:grid-cols-2">
            <FormSection title="갑 (고객)" description="계약서 메일은 갑 이메일로 발송됩니다.">{party("a")}</FormSection>
            <FormSection title="을 (한결랩)" description="기본값이 채워져 있습니다." collapsible defaultOpen={false}>{party("b")}</FormSection>
          </div>

          <FormSection
            title="계약 내용"
            description="계약서 본문에 들어갑니다. 고객 서명 후에는 바꿀 수 없습니다."
            aside={
              <Button type="button" size="sm" variant="outline" className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={runAi} disabled={ai.running}>
                {ai.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} AI 초안
              </Button>
            }
          >
            <AiProgress running={ai.running} elapsed={ai.job?.elapsed ?? 0} model={ai.job?.model} />
            {ai.error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{ai.error}</p>}
            <div className="space-y-3">
              {area("project_description", "프로젝트 설명", "무엇을 만드는지 한두 문단으로", 5)}
              {area("service_scope", "서비스 범위", "포함·제외 범위를 항목별로", 6)}
              {area("payment_terms", "지불조건", "예: 착수금 50%(계약 시), 잔금 50%(검수 완료 후)", 3)}
              {area("special_terms", "특약", "추가 합의 사항(없으면 비움)", 3)}
            </div>
          </FormSection>
        </div>

        <div className="h-fit space-y-3 lg:sticky lg:top-20">
          <Card className="rounded-2xl">
            <CardContent className="space-y-2 p-5">
              <h2 className="pb-1 text-sm font-semibold">요약</h2>
              <p className="line-clamp-2 text-sm font-medium">{v.contract_title || <span className="text-muted-foreground">(계약명 없음)</span>}</p>
              <SummaryRow label="계약금액" value={v.contract_amount ? `${Number(v.contract_amount).toLocaleString("ko-KR")}원` : "-"} strong tone="text-indigo-700" />
              <SummaryRow label="기간" value={v.contract_start_date && v.contract_end_date ? `${v.contract_start_date} ~ ${v.contract_end_date}` : "-"} />
              <SummaryRow label="갑" value={v.party_a_name || "-"} />
              {linkedEstimate && (
                <Link href={`/managed/estimates/${linkedEstimate}`} className="flex items-center gap-1 pt-1 text-xs text-indigo-600 hover:underline">
                  <FileText className="h-3.5 w-3.5" /> 연결 견적서 보기
                </Link>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="space-y-2 p-5 text-xs">
              <p className="pb-1 text-sm font-semibold">발송 전 확인</p>
              {checks.map((c) => (
                <p key={c.label} className={cn("flex items-center gap-2", c.ok ? "text-emerald-700" : c.required ? "text-red-600" : "text-amber-700")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", c.ok ? "bg-emerald-500" : c.required ? "bg-red-500" : "bg-amber-500")} /> {c.label}
                </p>
              ))}
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => save(false)} disabled={!!saving}>
              {saving === "draft" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}작성중 저장
            </Button>
            <Button className="rounded-xl" onClick={() => save(true)} disabled={!!saving}>
              {saving === "review" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}검토대기 저장
            </Button>
          </div>
          <Button variant="ghost" className="w-full rounded-xl text-muted-foreground" onClick={cancel}>취소</Button>
          {dirty && <p className="text-center text-[11px] text-amber-700">저장하지 않은 변경이 있습니다</p>}
        </div>
      </div>
    </>
  );
}
