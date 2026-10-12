"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { SimpleEditor } from "@/components/common/simple-editor";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDateTime, selectClass } from "@/components/managed/field";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { SafeHtml } from "@/components/managed/safe-html";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useAnswerInquiry, useStaffInquiry } from "@/lib/staff-support";

export default function StaffInquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const seq = Number(id);
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data, isLoading, error } = useStaffInquiry(seq);
  const answer = useAnswerInquiry(seq);
  const [content, setContent] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState("3");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    setPageTitle(data?.title || "고객문의 상세");
  }, [data?.title, setPageTitle]);

  if (error) return <LoadFailed error={error} />;

  if (isLoading || !data) return <DetailSkeleton />;

  const submit = async () => {
    const form = new FormData();
    form.append("content", content);
    form.append("status", status);
    if (file) form.append("answer_file", file);
    try {
      await answer.mutateAsync(form);
      toast("success", "답변을 등록했습니다. 고객에게 메일·푸시가 발송됩니다.");
      setContent("");
      setEditorKey((k) => k + 1);
      setFile(null);
    } catch (err) {
      toast("error", apiErrorDetail(err, "등록에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {!data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/inquiry_detail/${seq}`} />}
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-4 text-white">
          <p className="text-sm text-white/80">#{data.seq} · {data.company_name}</p>
          <h1 className="mt-1 text-lg font-bold">{data.title}</h1>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Card className="rounded-2xl">
              <CardContent className="space-y-3 pt-5 pb-5">
                <SafeHtml html={data.contents} />
                <div className="flex flex-wrap gap-2">
                  {data.attachments.map((a) => (
                    <a key={a.id} href={staffFileUrl(`/inquiries/files/attachment/${a.id}`)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
                      <Paperclip className="h-3 w-3" /> {a.filename}
                    </a>
                  ))}
                  {data.has_legacy_file && (
                    <a href={staffFileUrl(`/inquiries/files/legacy/${seq}`)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted">
                      <Paperclip className="h-3 w-3" /> 기존 첨부
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardContent className="space-y-2 pt-5 pb-5">
                <h2 className="font-semibold">답변 ({data.answers.length})</h2>
                {data.answers.map((a) => (
                  <div key={a.seq} className={`rounded-xl px-3 py-3 ${a.is_staff ? "bg-muted/40" : "bg-blue-50/60"} ${a.parent_answer_id ? "ml-4" : ""}`}>
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{a.writer_name || (a.is_staff ? "직원" : "고객")}</span>
                      <Badge variant="outline">{a.is_staff ? "관리자" : "고객"}</Badge>
                      <span>{fmtDateTime(a.created_at)}</span>
                    </div>
                    <SafeHtml html={a.content} />
                    {a.has_file && (
                      <a href={staffFileUrl(`/inquiries/files/answer/${a.seq}`)} className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600">
                        <Paperclip className="h-3 w-3" /> 첨부
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            {data.write_enabled && (
              <Card className="rounded-2xl">
                <CardContent className="space-y-3 pt-5 pb-5">
                  <h2 className="font-semibold">답변 작성</h2>
                  <SimpleEditor imageUpload="staff" key={editorKey} value={content} onChange={setContent} placeholder="답변 내용" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="문의 상태">
                      <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="1">대기중</option>
                        <option value="2">진행중</option>
                        <option value="3">답변완료</option>
                      </select>
                    </Field>
                    <Field label="첨부(1개)">
                      <Input type="file" className="rounded-xl" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </Field>
                  </div>
                  <div className="flex justify-end">
                    <Button className="rounded-xl" onClick={submit} disabled={answer.isPending}>등록</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          <div className="order-first h-fit space-y-4 lg:sticky lg:top-20 lg:order-last">
            <Card className="rounded-2xl">
              <CardContent className="pt-5 pb-5">
                <dl className="space-y-3">
                  <Info label="상태"><Badge variant="outline">{data.status_label}</Badge></Info>
                  <Info label="문의 유형">{data.inquiry_type_label || "-"}</Info>
                  <Info label="업체">{data.company_name || "-"}</Info>
                  <Info label="작성자">{data.writer_name || "-"}</Info>
                  <Info label="문의일">{fmtDateTime(data.created_at)}</Info>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
