"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FileDown, FileSignature, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { ESTIMATE_STATUS_COLORS } from "@/components/managed/estimate-status";
import { Field, apiErrorDetail, fmtDateTime, selectClass } from "@/components/managed/field";
import { EstimateEditor } from "@/components/managed/estimate-editor";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { SafeHtml } from "@/components/managed/safe-html";
import { StepUpDialog } from "@/components/managed/step-up-dialog";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import staffApi from "@/lib/staff-api";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { type EstimateDetail, type EstimateItemRow, useSalesMutation, useStaffEstimate } from "@/lib/staff-sales";
import { useStaffMe } from "@/lib/staff-hooks";

export default function StaffEstimatePage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffEstimate(isNew ? null : Number(id));
  useEffect(() => {
    setPageTitle(isNew ? "새 견적" : data?.estimate_title || data?.estimate_number || "견적서");
  }, [setPageTitle, isNew, data?.estimate_title, data?.estimate_number]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return isNew ? <EstimateEditor detail={null} onDone={() => undefined} /> : <EstimateView detail={data!} />;
}

function EstimateView({ detail }: { detail: EstimateDetail }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const mutate = useSalesMutation();
  const [editing, setEditing] = useState(false);
  const [itemEdit, setItemEdit] = useState<EstimateItemRow | "new" | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canWrite = detail.write_enabled;
  const canConvert = !!me?.write_areas.includes("conversion");
  const editable = canWrite && detail.status !== "5";
  const a = detail.amounts;

  const call = async (url: string, body: Record<string, unknown> = {}, ok = "처리했습니다.") => {
    try {
      const res = await mutate.mutateAsync({ url, body });
      toast("success", ok);
      return res;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
      return null;
    }
  };

  const move = (index: number, delta: number) => {
    const ids = detail.items.map((i) => i.seq);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    call(`/estimates/${detail.seq}/items/reorder`, { item_ids: ids }, "순서를 바꿨습니다.");
  };

  if (editing) return <PageTransition><EstimateEditor detail={detail} onDone={() => setEditing(false)} /></PageTransition>;

  return (
    <PageTransition>
      <div className="space-y-4">
        <PageActions>
          <Button size="sm" variant="outline" className="rounded-xl" asChild><a href={staffFileUrl(`/estimates/${detail.seq}/pdf`)} target="_blank" rel="noopener noreferrer"><FileDown className="mr-1 h-4 w-4" /> PDF</a></Button>
          {editable && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(true)}><Pencil className="mr-1 h-4 w-4" /> 수정</Button>}
          {canWrite && ["1", "2", "4"].includes(detail.status) && <Button size="sm" className="rounded-xl" onClick={() => setSendOpen(true)}><Send className="mr-1 h-4 w-4" /> 고객 발송</Button>}
          {detail.status === "3" && <Button size="sm" variant="outline" className="rounded-xl" asChild><Link href={`/managed/contracts/new?estimate=${detail.seq}`}><FileSignature className="mr-1 h-4 w-4" /> 계약서 작성</Link></Button>}
          {canConvert && detail.status !== "5" && !detail.converted_project_id && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setConvertOpen(true)}>계약전환</Button>}
          {editable && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>}
        </PageActions>
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/estimate/${detail.seq}/`} />}

        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-4 text-white">
          <p className="text-sm text-white/80">{detail.estimate_number} · {detail.company_name} · 담당 {detail.manager_name || "-"}</p>
          <h1 className="mt-1 text-lg font-bold">{detail.estimate_title}</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Card className="rounded-2xl">
              <CardContent className="space-y-3 pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">항목 ({detail.items.length})</h2>
                  {editable && <Button size="sm" className="rounded-xl" onClick={() => setItemEdit("new")}><Plus className="mr-1 h-4 w-4" /> 항목 추가</Button>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                    <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="py-2 text-left">분류</th><th className="text-left">항목</th><th className="text-left">규격</th><th>수량</th><th>단위</th><th className="text-right">단가</th><th className="text-right">금액</th><th /></tr></thead>
                    <tbody>
                      {detail.items.map((i, idx) => (
                        <tr key={i.seq} className="border-b">
                          <td className="py-2">{i.category}</td><td>{i.item_name}</td><td className="max-w-48 truncate text-xs text-muted-foreground" title={i.specification ?? undefined}>{i.specification}</td>
                          <td className="text-center">{i.quantity}</td><td className="text-center">{i.unit}</td>
                          <td className="text-right">{i.unit_price.toLocaleString()}</td>
                          <td className="text-right">{i.is_separate ? <Badge variant="outline">별도</Badge> : i.total.toLocaleString()}</td>
                          <td className="whitespace-nowrap text-right">
                            {editable && (<>
                              <button className="p-1" onClick={() => move(idx, -1)}><ArrowUp className="h-3 w-3" /></button>
                              <button className="p-1" onClick={() => move(idx, 1)}><ArrowDown className="h-3 w-3" /></button>
                              <button className="p-1" onClick={() => setItemEdit(i)}><Pencil className="h-3 w-3" /></button>
                              <button className="p-1 text-red-600" onClick={() => window.confirm("항목을 삭제할까요?") && call(`/estimates/items/${i.seq}/delete`, {}, "삭제했습니다.")}><Trash2 className="h-3 w-3" /></button>
                            </>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ml-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between"><span>소계</span><span>{a.subtotal.toLocaleString()}</span></div>
                  {a.discount > 0 && <div className="flex justify-between text-red-600"><span>할인</span><span>-{a.discount.toLocaleString()}</span></div>}
                  <div className="flex justify-between"><span>부가세</span><span>{a.tax.toLocaleString()}</span></div>
                  <div className="flex justify-between font-bold"><span>총액</span><span>{a.total.toLocaleString()}원</span></div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="grid gap-3 pt-5 pb-5 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">지불조건</p><p className="whitespace-pre-wrap">{(detail.payment_terms as string) || "-"}</p></div>
                <div><p className="text-xs text-muted-foreground">납품조건</p><p className="whitespace-pre-wrap">{(detail.delivery_terms as string) || "-"}</p></div>
                <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">내용</p><SafeHtml html={detail.estimate_content as string} /></div>
              </CardContent>
            </Card>

            {detail.revisions.length > 0 && (
              <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5 text-sm"><h2 className="font-semibold">고객 수정요청</h2>
                {detail.revisions.map((r) => (
                  <div key={r.seq} className="rounded-xl bg-muted/40 px-3 py-2">
                    <p className="font-medium">{r.title} <span className="text-xs text-muted-foreground">{r.requester_name} · {fmtDateTime(r.created_at)}</span></p>
                    <p className="whitespace-pre-wrap text-sm">{r.content}</p>
                    {r.is_resolved ? <p className="text-xs text-emerald-700">처리 완료 {r.resolved_comment}</p> : canWrite && (
                      <Button size="sm" variant="outline" className="mt-1 h-7 rounded-lg" onClick={() => { const c = window.prompt("처리 내용(선택)"); if (c !== null) call(`/estimates/revisions/${r.seq}/resolve`, { comment: c }, "처리 완료로 표시했습니다."); }}>처리 완료</Button>
                    )}
                  </div>
                ))}
              </CardContent></Card>
            )}
          </div>

          <div className="order-first h-fit space-y-4 lg:sticky lg:top-20 lg:order-last">
            <Card className="rounded-2xl">
              <CardContent className="space-y-4 pt-5 pb-5">
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">상태</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                      <Badge className={ESTIMATE_STATUS_COLORS[detail.status] ?? ""}>{detail.status_label}</Badge>
                      {detail.withdrawn && <Badge className="bg-orange-100 text-orange-700">계약철회</Badge>}
                    </dd>
                  </div>
                  <div><dt className="text-xs text-muted-foreground">총액</dt><dd className="mt-0.5 text-sm font-semibold">{a.total.toLocaleString()}원</dd></div>
                  {detail.customer_email_sent && <div><dt className="text-xs text-muted-foreground">고객 발송</dt><dd className="mt-0.5 break-all text-sm">{detail.customer_email_sent}</dd></div>}
                  {detail.converted_project_id && <div><dt className="text-xs text-muted-foreground">전환 프로젝트</dt><dd className="mt-0.5 text-sm">#{detail.converted_project_id}</dd></div>}
                </dl>
                {canWrite && detail.status !== "5" && (
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-xs text-muted-foreground">상태 변경</p>
                    <div className="flex flex-wrap gap-2">
                      {[["1", "작성중"], ["2", "발송"], ["3", "승인"], ["4", "거절"]].filter(([v]) => v !== detail.status).map(([v, l]) => (
                        <Button key={v} size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => {
                          const reason = window.prompt(`'${l}'(으)로 변경 사유(선택)`) ?? null;
                          if (reason !== null) call(`/estimates/${detail.seq}/status`, { status: v, reason }, `${l}(으)로 변경했습니다.`);
                        }}>{l}</Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {detail.contracts.length > 0 && (
              <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm"><h2 className="font-semibold">계약서</h2>
                {detail.contracts.map((c) => <Link key={c.seq} href={`/managed/contracts/${c.seq}`} className="flex justify-between hover:underline"><span>{c.contract_number}</span><span>{c.status_label}</span></Link>)}
              </CardContent></Card>
            )}

            <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm"><h2 className="font-semibold">상태 이력</h2>
              {detail.histories.map((h, i) => <p key={i} className="text-muted-foreground">{fmtDateTime(h.created_at)} · {h.previous_status ?? "-"}→{h.new_status} · {h.by} · {h.reason}</p>)}
            </CardContent></Card>
          </div>
        </div>
      </div>

      {itemEdit && <ItemDialog estimateId={detail.seq} item={itemEdit === "new" ? null : itemEdit} onClose={() => setItemEdit(null)} />}
      {sendOpen && <SendDialog detail={detail} onClose={() => setSendOpen(false)} />}
      {convertOpen && <ConvertDialog detail={detail} onClose={() => setConvertOpen(false)} />}
      <StepUpDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="견적서 삭제" description="항목·이력·수정요청이 함께 삭제됩니다." confirmText="삭제"
        onConfirm={async (password) => { if (await call(`/estimates/${detail.seq}/delete`, { password }, "삭제했습니다.")) router.replace("/managed/estimates"); }} />
    </PageTransition>
  );
}

function ItemDialog({ estimateId, item, onClose }: { estimateId: number; item: EstimateItemRow | null; onClose: () => void }) {
  const { toast } = useToast();
  const mutate = useSalesMutation();
  const [v, setV] = useState({
    category: item?.category ?? "", item_name: item?.item_name ?? "", specification: item?.specification ?? "",
    quantity: String(item?.quantity ?? 1), unit: item?.unit ?? "식", unit_price: String(item?.unit_price ?? 0), remarks: item?.remarks ?? "",
  });
  const [separate, setSeparate] = useState(item?.is_separate ?? false);
  const save = async () => {
    const body = { ...v, quantity: Number(v.quantity) || 0, unit_price: Number(v.unit_price.replace(/,/g, "")) || 0, is_separate: separate };
    try {
      if (item) await mutate.mutateAsync({ method: "patch", url: `/estimates/items/${item.seq}`, body });
      else await mutate.mutateAsync({ url: `/estimates/${estimateId}/items`, body });
      toast("success", "저장했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader><DialogTitle>{item ? "항목 수정" : "항목 추가"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["category", "분류"], ["item_name", "항목명 *"], ["quantity", "수량"], ["unit", "단위"], ["unit_price", "단가"], ["specification", "규격"], ["remarks", "비고"]] as const).map(([k, l]) => (
            <Field key={k} label={l}><Input className="rounded-xl" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>
          ))}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={separate} onCheckedChange={(c) => setSeparate(c === true)} /> 금액 별도(합계 제외)</label>
        </div>
        <DialogFooter><Button className="rounded-xl" onClick={save} disabled={!v.item_name.trim() || mutate.isPending}>저장</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendDialog({ detail, onClose }: { detail: EstimateDetail; onClose: () => void }) {
  const { toast } = useToast();
  const mutate = useSalesMutation();
  const [email, setEmail] = useState(detail.recipients[0]?.email ?? detail.customer_email_sent ?? "");
  const send = async () => {
    try {
      await mutate.mutateAsync({ url: `/estimates/${detail.seq}/send`, body: { email } });
      toast("success", `${email} 로 발송했습니다.`);
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "발송에 실패했습니다."));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader><DialogTitle>견적서 고객 발송</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">PDF·승인·수정요청·거절 링크(24시간)가 담긴 메일이 발송되고, 이전 링크는 무효가 됩니다.</p>
        {detail.recipients.length > 0 && (
          <select className={selectClass} value={email} onChange={(e) => setEmail(e.target.value)}>
            {detail.recipients.map((r) => <option key={r.seq} value={r.email}>{r.name} ({r.email})</option>)}
          </select>
        )}
        <Input className="rounded-xl" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="받는 사람 이메일" />
        <DialogFooter><Button className="rounded-xl" onClick={send} disabled={!email.includes("@") || mutate.isPending}>발송</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConvertDialog({ detail, onClose }: { detail: EstimateDetail; onClose: () => void }) {
  const { toast } = useToast();
  const mutate = useSalesMutation();
  const [leads, setLeads] = useState<{ seq: number; title: string; client_company: string; linked: boolean }[]>([]);
  const [lead, setLead] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    staffApi.get(`/managed/estimates/${detail.seq}/convert-options`).then((r) => {
      setLeads(r.data.leads);
      const linked = r.data.leads.find((l: { linked: boolean }) => l.linked);
      if (linked) setLead(String(linked.seq));
    });
  }, [detail.seq]);
  const run = async () => {
    try {
      const res = await mutate.mutateAsync({ url: `/estimates/${detail.seq}/convert`, body: { password, sales_lead_id: lead ? Number(lead) : null } });
      toast("success", `계약전환 완료 — 프로젝트 "${res.project_title}"(#${res.project_id})`);
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "전환에 실패했습니다."));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader><DialogTitle>계약전환</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">프로젝트·납부(지불조건 비율별)·계약 포인트를 만들고 견적을 계약전환 상태로 바꿉니다. 영업접수를 고르면 수주로 바뀝니다.</p>
        <Field label="연결할 영업접수(선택)">
          <select className={selectClass} value={lead} onChange={(e) => setLead(e.target.value)}>
            <option value="">연결 안 함</option>
            {leads.map((l) => <option key={l.seq} value={l.seq}>{l.title} · {l.client_company}{l.linked ? " (이 견적)" : ""}</option>)}
          </select>
        </Field>
        <Input type="password" autoComplete="current-password" className="rounded-xl" placeholder="본인 비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        <DialogFooter><Button className="rounded-xl" onClick={run} disabled={!password || mutate.isPending}>전환</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
