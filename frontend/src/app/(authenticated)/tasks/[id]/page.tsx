"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Paperclip, MessageSquare, HardHat } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { useNavigationStore } from "@/store/navigation-store";
import { StatusBadge, LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useTaskDetail } from "@/lib/api-hooks";
import { formatDate, formatDateTime } from "@/lib/utils";

const taskTypeColors: Record<string, string> = {
  "계약": "bg-gray-100 text-gray-700",
  "기획": "bg-blue-100 text-blue-700",
  "디자인": "bg-pink-100 text-pink-700",
  "프론트엔드": "bg-cyan-100 text-cyan-700",
  "백엔드": "bg-orange-100 text-orange-700",
  "유지보수": "bg-green-100 text-green-700",
  "기타": "bg-slate-100 text-slate-700",
};

export default function TaskDetailPage() {
  const { setPageTitle } = useNavigationStore();
  const params = useParams();
  const id = Number(params.id);
  const { data, isLoading } = useTaskDetail(id);

  useEffect(() => { setPageTitle("건별작업 상세"); }, [setPageTitle]);

  if (isLoading || !data) {
    return <PageTransition><LoadingState message="작업 정보를 불러오는 중..." /></PageTransition>;
  }

  return (
    <PageTransition>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">대시보드</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/tasks">건별작업</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>상세보기</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="rounded-2xl overflow-hidden border-0 animate-slide-in-right">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={`text-[10px] px-1.5 py-0 rounded-md border-0 ${taskTypeColors[data.task_type_label] || ""}`}>{data.task_type_label}</Badge>
                </div>
                <h1 className="text-lg font-bold">{data.title}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/80">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(data.created_at)}</span>
                  {data.worker_name && <span className="flex items-center gap-1"><HardHat className="h-3.5 w-3.5" />{data.worker_name}</span>}
                </div>
              </div>
              <StatusBadge status={data.status} type="task" />
            </div>
          </div>
          <div className="px-4 py-2 bg-emerald-50 border-b flex items-center justify-between">
            <span className="text-xs text-muted-foreground">마감일: {data.deadline || "-"}</span>
            {data.budget && <Badge variant="secondary" className="rounded-lg font-bold">{data.budget}원</Badge>}
          </div>
        </Card>

        <Card className="rounded-2xl"><CardHeader className="pb-2"><h2 className="text-sm font-semibold">작업 내용</h2></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{data.content}</p></CardContent>
        </Card>

        {data.attachments && data.attachments.length > 0 && (
          <Card className="rounded-2xl"><CardHeader className="pb-2"><h2 className="text-sm font-semibold flex items-center gap-1.5"><Paperclip className="h-4 w-4" />첨부파일 ({data.attachments.length})</h2></CardHeader>
            <CardContent><div className="space-y-2">{data.attachments.map((file, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl hover:bg-muted/80 transition-colors"><span className="text-sm truncate">{file.name}</span><span className="text-xs text-muted-foreground ml-2">{file.size}</span></div>
            ))}</div></CardContent>
          </Card>
        )}

        <Card className="rounded-2xl"><CardHeader className="pb-2"><h2 className="text-sm font-semibold flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />댓글 ({data.comments?.length ?? 0})</h2></CardHeader>
          <CardContent className="space-y-3">
            {data.comments && data.comments.length > 0 ? (
              <div className="animate-stagger">{data.comments.map((comment) => (
                <div key={comment.id} className={`p-3 rounded-xl mb-3 ${comment.role === "customer" ? "bg-blue-50 border border-blue-100 ml-4" : "bg-muted/50 mr-4"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium">{comment.author}</span>
                      {comment.role === "manager" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-md">담당자</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateTime(comment.created_at)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{comment.content}</p>
                </div>
              ))}</div>
            ) : <p className="text-sm text-muted-foreground text-center py-4">댓글이 없습니다.</p>}
          </CardContent>
        </Card>

        <div className="flex justify-end"><Link href="/tasks"><Button variant="outline" className="rounded-xl"><ArrowLeft className="h-4 w-4 mr-1" />목록으로</Button></Link></div>
      </div>
    </PageTransition>
  );
}
