"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileDown, Pencil, Send, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailSkeleton, PageSpinner } from "@/components/common";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { CONTRACT_STATUS_COLORS } from "@/components/managed/contract-status";
import { Field, apiErrorDetail, fmtDateTime, selectClass } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { StepUpDialog } from "@/components/managed/step-up-dialog";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useContractPrefill, useSalesMutation, useStaffContract, useWithdrawInfo } from "@/lib/staff-sales";
import { useStaffMe } from "@/lib/staff-hooks";

const FIELDS: FieldSpec[] = [
  { key: "contract_title", label: "계약명 *", wide: true },
  { key: "contract_amount", label: "계약금액(원)", type: "number" },
  { key: "contract_date", label: "계약일", type: "date" },
  { key: "contract_start_date", label: "시작일", type: "date" },
  { key: "contract_end_date", label: "종료일", type: "date" },
  { key: "contract_period", label: "계약기간" },
  { key: "maintenance_point", label: "유지보수 포인트", type: "number" },
  { key: "free_maint_months", label: "무상 유지보수 개월", type: "number" },
  { key: "free_maint_scope", label: "무상 유지보수 범위" },
  { key: "party_a_name", label: "갑 상호" }, { key: "party_a_ceo", label: "갑 대표자" },
  { key: "party_a_business_number", label: "갑 사업자번호" }, { key: "party_a_email", label: "갑 이메일" },
  { key: "party_a_address", label: "갑 주소", wide: true },
  { key: "party_b_name", label: "을 상호" }, { key: "party_b_ceo", label: "을 대표자" },
  { key: "party_b_business_number", label: "을 사업자번호" }, { key: "party_b_email", label: "을 이메일" },
  { key: "party_b_address", label: "을 주소", wide: true },
  { key: "project_description", label: "프로젝트 설명", type: "textarea" },
  { key: "service_scope", label: "서비스 범위", type: "textarea" },
  { key: "payment_terms", label: "지불조건", type: "textarea" },
  { key: "special_terms", label: "특약", type: "textarea" },
];

export default function StaffContractPage() {
  return <Suspense fallback={<PageSpinner />}><ContractPageInner /></Suspense>;
}

function ContractPageInner() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  useEffect(() => {
    setPageTitle(isNew ? "계약서 작성" : "계약서");
  }, [setPageTitle, isNew]);
  return isNew ? <NewContract /> : <ContractView seq={Number(id)} />;
}

function NewContract() {
  const params = useSearchParams();
  const estimateId = Number(params.get("estimate")) || null;
  const { data } = useContractPrefill(estimateId);
  if (!estimateId) return <p className="text-sm text-muted-foreground">견적서 상세에서 &quot;계약서 작성&quot;으로 들어와 주세요.</p>;
  if (!data) return <DetailSkeleton />;
  return <ContractForm initial={data} estimateId={estimateId} seq={null} onDone={() => undefined} />;
}

function ContractForm({ initial, estimateId, seq, onDone }: { initial: Record<string, unknown>; estimateId: number | null; seq: number | null; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const mutate = useSalesMutation();
  const [values, setValues] = useState(() => toValues(FIELDS, initial));
  const save = async (review: boolean) => {
    const body = { ...toPayload(FIELDS, values), review };
    try {
      if (seq) {
        await mutate.mutateAsync({ method: "patch", url: `/contracts/${seq}`, body });
        toast("success", "저장했습니다.");
        onDone();
      } else {
        const res = await mutate.mutateAsync({ url: "/contracts", body: { ...body, estimate_id: estimateId } });
        toast("success", "계약서를 만들었습니다.");
        router.replace(`/managed/contracts/${res.seq}`);
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <PageTransition>
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        <FormGrid fields={FIELDS} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
        <div className="flex justify-end gap-2">
          {seq && <Button variant="outline" className="rounded-xl" onClick={onDone}>취소</Button>}
          <Button variant="outline" className="rounded-xl" onClick={() => save(false)} disabled={mutate.isPending}>작성중으로 저장</Button>
          <Button className="rounded-xl" onClick={() => save(true)} disabled={mutate.isPending}>검토대기로 저장</Button>
        </div>
      </CardContent></Card>
    </PageTransition>
  );
}

function ContractView({ seq }: { seq: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data, isLoading, error } = useStaffContract(seq);
  const mutate = useSalesMutation();
  const [editing, setEditing] = useState(false);
  const [sendMode, setSendMode] = useState<"send" | "resend" | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  if (error) return <LoadFailed error={error} />;
  if (isLoading || !data) return <DetailSkeleton />;
  if (editing) return <ContractForm initial={data} estimateId={null} seq={seq} onDone={() => setEditing(false)} />;
  const canWrite = data.write_enabled;
  const s = data.status;

  const call = async (url: string, body: Record<string, unknown> = {}, ok = "처리했습니다.") => {
    try {
      const res = await mutate.mutateAsync({ url, body });
      toast("success", ok);
      return res ?? true;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
      return null;
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/contracts"><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link></Button>
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={staffFileUrl(`/contracts/${seq}/pdf`)} target="_blank" rel="noopener noreferrer"><FileDown className="mr-1 h-4 w-4" /> PDF</a></Button>
          {data.has_signed_pdf && <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={staffFileUrl(`/contracts/${seq}/pdf?signed=true`)}><FileDown className="mr-1 h-4 w-4" /> 서명본</a></Button>}
          {canWrite && ["1", "2"].includes(s) && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> 수정</Button>}
          {canWrite && ["1", "2"].includes(s) && <Button size="sm" className="rounded-xl" onClick={() => setSendMode("send")}><Send className="mr-1 h-4 w-4" /> 고객 발송</Button>}
          {canWrite && s === "3" && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setSendMode("resend")}><Send className="mr-1 h-4 w-4" /> 재발송</Button>}
          {canWrite && s === "4" && !data.manager_signed_hash && <Button size="sm" className="rounded-xl" onClick={() => window.confirm("을(한결랩) 서명을 진행할까요?") && call(`/contracts/${seq}/manager-sign`, {}, "을 서명을 완료했습니다.")}><ShieldCheck className="mr-1 h-4 w-4" /> 을 서명</Button>}
          {me?.write_areas.includes("conversion") && data.estimate?.converted_project_id && s !== "5" && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setWithdrawOpen(true)}><Undo2 className="mr-1 h-4 w-4" /> 계약 철회</Button>}
          {canWrite && ["1", "2", "3"].includes(s) && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/contract/${seq}/`} />}
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
          <p className="text-sm text-white/80">{data.contract_number} · {data.party_a_name as string}{data.estimate && <> · 견적 <Link className="underline" href={`/managed/estimates/${data.estimate.seq}`}>{data.estimate.number}</Link></>}</p>
          <h1 className="mt-1 text-lg font-bold">{data.contract_title as string}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge className={CONTRACT_STATUS_COLORS[s] ?? "bg-white/20"}>{data.status_label}</Badge>
            <span>{((data.contract_amount as number) ?? 0).toLocaleString()}원</span>
            {data.sent_to_email ? <span>발송 {data.sent_to_email as string} · 링크 {data.token_valid ? "유효" : "만료"}</span> : null}
          </div>
        </div>
        <Card className="rounded-2xl"><CardContent className="grid gap-2 pt-5 pb-5 text-sm sm:grid-cols-2">
          <p>고객 서명: {data.customer_signed_name ? `${data.customer_signed_name as string} · ${fmtDateTime(data.customer_signed_at as string)}` : "-"}</p>
          <p>을 서명: {data.manager_signed_name ? `${data.manager_signed_name as string} · ${fmtDateTime(data.manager_signed_at as string)}` : "-"}</p>
          {data.customer_signed_hash ? <p className="break-all text-xs text-muted-foreground sm:col-span-2">고객 서명 해시 {data.customer_signed_hash as string}</p> : null}
        </CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm"><h2 className="font-semibold">이력</h2>
          {data.histories.map((h, i) => <p key={i} className="whitespace-pre-wrap text-muted-foreground">{fmtDateTime(h.created_at)} · {h.action} · {h.by || "-"} · {h.description}{h.ip ? ` (${h.ip})` : ""}</p>)}
        </CardContent></Card>
      </div>
      {sendMode && (
        <SendContractDialog mode={sendMode} recipients={data.recipients} defaultEmail={(data.sent_to_email as string) || ""} onClose={() => setSendMode(null)}
          onSend={(email) => call(`/contracts/${seq}/${sendMode}`, { email }, `${email} 로 발송했습니다.`)} />
      )}
      {withdrawOpen && <WithdrawDialog seq={seq} onClose={() => setWithdrawOpen(false)} />}
      <StepUpDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="계약서 삭제" description="이력과 함께 삭제됩니다. 서명된 계약서는 삭제할 수 없습니다." confirmText="삭제"
        onConfirm={async (password) => { if (await call(`/contracts/${seq}/delete`, { password }, "삭제했습니다.")) router.replace("/managed/contracts"); }} />
    </PageTransition>
  );
}

function SendContractDialog({ mode, recipients, defaultEmail, onClose, onSend }: {
  mode: "send" | "resend"; recipients: { seq: number; name: string | null; email: string }[]; defaultEmail: string;
  onClose: () => void; onSend: (email: string) => Promise<unknown>;
}) {
  const [email, setEmail] = useState(defaultEmail || recipients[0]?.email || "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader><DialogTitle>{mode === "send" ? "계약서 고객 발송" : "계약서 재발송"}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{mode === "send" ? "고객이 로그인 없이 열람·서명할 수 있는 링크(24시간)를 보냅니다." : "같은 링크의 유효기간을 24시간 연장해 다시 보냅니다."}</p>
        {recipients.length > 0 && (
          <select className={selectClass} value={email} onChange={(e) => setEmail(e.target.value)}>
            {recipients.map((r) => <option key={r.seq} value={r.email}>{r.name} ({r.email})</option>)}
          </select>
        )}
        <Input className="rounded-xl" value={email} onChange={(e) => setEmail(e.target.value)} />
        <DialogFooter><Button className="rounded-xl" disabled={!email.includes("@")} onClick={async () => { if (await onSend(email)) onClose(); }}>발송</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({ seq, onClose }: { seq: number; onClose: () => void }) {
  const { toast } = useToast();
  const { data } = useWithdrawInfo(seq, true);
  const mutate = useSalesMutation();
  const [reason, setReason] = useState("");
  const [action, setAction] = useState("stop");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const run = async () => {
    try {
      const res = await mutate.mutateAsync({ url: `/contracts/${seq}/withdraw`, body: { password, reason, project_action: action } });
      toast("success", `계약 철회: ${res.done.join(", ")}`);
      if (res.skipped?.length) toast("warning", `결제 완료 항목은 보존: ${res.skipped.join(", ")}`);
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "철회에 실패했습니다."));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader><DialogTitle>계약 철회</DialogTitle></DialogHeader>
        {!data ? <p className="text-sm">불러오는 중…</p> : (
          <div className="space-y-3 text-sm">
            <p>프로젝트 #{data.project_id} {data.project_title}</p>
            <p className="text-muted-foreground">회수: 납부 {data.payment_count}건(결제완료 {data.paid_payment_count}건은 보존) · 충전 포인트 {data.point_count}건 {data.point_total}P · 연결 구독</p>
            {data.blockers && Object.keys(data.blockers).length > 0 && <p className="text-amber-700">연결 데이터: {Object.entries(data.blockers).map(([k, v]) => `${k} ${v}`).join(", ")} — 프로젝트는 중지만 가능</p>}
            <Field label="프로젝트 처리">
              <select className={selectClass} value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="stop">중지 처리</option>
                <option value="delete" disabled={!data.can_delete_project}>삭제</option>
              </select>
            </Field>
            <Input className="rounded-xl" placeholder="철회 사유" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Input type="password" autoComplete="current-password" className="rounded-xl" placeholder="본인 비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="flex items-center gap-2"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} /> 위 내용을 회수·정리합니다</label>
          </div>
        )}
        <DialogFooter><Button className="rounded-xl" variant="destructive" disabled={!agree || !password || mutate.isPending} onClick={run}>철회</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
