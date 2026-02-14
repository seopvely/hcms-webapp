"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Calendar,
  Send,
  Download,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useNavigationStore } from "@/store/navigation-store";
import { LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useInquiryDetail, useCreateInquiryAnswer } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

function getStatusBadgeVariant(status: number) {
  switch (status) {
    case 0: // 대기중
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case 1: // 진행중
      return "bg-blue-100 text-blue-700 border-blue-200";
    case 2: // 답변완료
      return "bg-green-100 text-green-700 border-green-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export default function InquiryDetailPage() {
  const { setPageTitle } = useNavigationStore();
  const params = useParams();
  const id = Number(params.id);
  const [newAnswer, setNewAnswer] = useState("");

  const { data, isLoading } = useInquiryDetail(id);
  const answerMutation = useCreateInquiryAnswer(id);

  useEffect(() => {
    setPageTitle("고객문의 상세");
  }, [setPageTitle]);

  const handleSubmitAnswer = () => {
    if (!newAnswer.trim()) return;

    const formData = new FormData();
    formData.append("content", newAnswer);

    answerMutation.mutate(formData, {
      onSuccess: () => {
        setNewAnswer("");
      },
    });
  };

  const handleDownload = async (attachmentId: number, filename: string) => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(
        `/api/inquiries/attachments/${attachmentId}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("파일 다운로드에 실패했습니다.");
    }
  };

  if (isLoading || !data) {
    return (
      <PageTransition>
        <LoadingState message="상세 정보를 불러오는 중..." />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">대시보드</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/inquiries">고객문의</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>상세보기</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header Card */}
        <Card className="rounded-2xl overflow-hidden border-0 animate-slide-in-right">
          <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold">{data.title}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/80">
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {data.writer_name || "작성자"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(data.created_at)}
                  </span>
                </div>
              </div>
              <Badge
                className={`${getStatusBadgeVariant(
                  data.status
                )} border rounded-lg px-2.5 py-0.5 text-xs font-medium`}
              >
                {data.status_label}
              </Badge>
            </div>
            {/* Inquiry Type Badge */}
            <div className="mt-3">
              <Badge
                variant="outline"
                className="bg-white/20 text-white border-white/30 rounded-lg"
              >
                {data.inquiry_type_label}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Content Card */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold">문의 내용</h2>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: data.content }}
            />
          </CardContent>
        </Card>

        {/* Attachments */}
        {data.attachments && data.attachments.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Download className="h-4 w-4" />
                첨부파일 ({data.attachments.length})
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.attachments.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => handleDownload(file.id, file.name)}
                    className="w-full flex items-center justify-between p-3 bg-muted/50 rounded-xl hover:bg-muted/80 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2 text-sm truncate">
                      <Download className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {file.name}
                    </span>
                    <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Answers Section */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              답변 ({data.answers?.length ?? 0})
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.answers && data.answers.length > 0 ? (
              <div className="space-y-3 animate-stagger">
                {data.answers.map((answer) => (
                  <div
                    key={answer.id}
                    className={`p-3 rounded-xl ${
                      answer.role === "admin"
                        ? "bg-blue-50 border border-blue-100"
                        : "bg-gray-50 border border-gray-100 ml-auto max-w-[90%]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {answer.author || "작성자"}
                        </span>
                        {answer.role === "admin" && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 rounded-md"
                          >
                            관리자
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(answer.created_at)}
                      </span>
                    </div>
                    <div
                      className="prose prose-sm max-w-none text-sm text-muted-foreground whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: answer.content }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                답변이 없습니다.
              </p>
            )}

            <Separator className="my-3" />

            {/* Reply Form */}
            <div className="space-y-2">
              <Textarea
                placeholder="답변을 입력하세요..."
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSubmitAnswer();
                  }
                }}
                className="rounded-xl resize-none min-h-[80px] !field-sizing-normal"
              />
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  className="rounded-xl gap-1"
                  size="sm"
                  onClick={handleSubmitAnswer}
                  disabled={!newAnswer.trim() || answerMutation.isPending}
                >
                  <Send className="h-3.5 w-3.5" />
                  {answerMutation.isPending ? "등록 중..." : "답변 작성"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="flex justify-end">
          <Link href="/inquiries">
            <Button variant="outline" className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-1" />
              목록으로
            </Button>
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}
