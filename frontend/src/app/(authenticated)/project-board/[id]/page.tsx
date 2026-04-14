"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Calendar,
  Eye,
  Send,
  Download,
  MessageSquare,
  Reply,
  Trash2,
  Edit3,
  Paperclip,
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
import { AppAlertDialog } from "@/components/common";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import {
  useProjectBoardDetail,
  useCreateBoardComment,
  useDeleteProjectBoard,
  useDeleteBoardComment,
} from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "1": return "bg-blue-100 text-blue-700 border-blue-200";
    case "2": return "bg-green-100 text-green-700 border-green-200";
    case "3": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export default function ProjectBoardDetailPage() {
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);
  const [newComment, setNewComment] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);

  const { data, isLoading } = useProjectBoardDetail(id);
  const commentMutation = useCreateBoardComment(id);
  const deleteBoardMutation = useDeleteProjectBoard();
  const deleteCommentMutation = useDeleteBoardComment(id);

  useEffect(() => {
    setPageTitle("게시글 상세");
  }, [setPageTitle]);

  const handleSubmitComment = () => {
    if (!newComment.trim()) return;
    const formData = new FormData();
    formData.append("content", newComment);
    commentMutation.mutate(formData, {
      onSuccess: () => {
        setNewComment("");
        toast("success", "댓글이 등록되었습니다.");
      },
    });
  };

  const handleDeleteBoard = () => {
    deleteBoardMutation.mutate(id, {
      onSuccess: () => {
        toast("success", "게시글이 삭제되었습니다.");
        router.push("/project-board");
      },
      onError: () => {
        toast("error", "삭제에 실패했습니다.");
      },
    });
  };

  const handleDeleteComment = (commentId: number) => {
    deleteCommentMutation.mutate(commentId, {
      onSuccess: () => {
        setDeleteCommentId(null);
        toast("success", "댓글이 삭제되었습니다.");
      },
    });
  };

  const handleDownload = async (attachmentId: number, filename: string, type: "board" | "comment" = "board") => {
    try {
      const token = localStorage.getItem("access_token");
      const url = type === "board"
        ? `/api/project-board/attachments/${attachmentId}/download`
        : `/api/project-board/comment-attachments/${attachmentId}/download`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      toast("error", "파일 다운로드에 실패했습니다.");
    }
  };

  if (isLoading || !data) {
    return (
      <PageTransition>
        <LoadingState message="게시글을 불러오는 중..." />
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
              <BreadcrumbLink href="/project-board">프로젝트구축진행</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>상세보기</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header Card */}
        <Card className="rounded-2xl overflow-hidden border-0 animate-slide-in-right">
          <div className="bg-gradient-to-r from-indigo-500 to-violet-600 p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {data.is_notice && (
                    <Badge className="bg-white/20 text-white border-white/30 text-[10px]">공지</Badge>
                  )}
                  {data.categories?.map((cat, idx) => (
                    <Badge key={idx} className="bg-white/20 text-white border-white/30 text-[10px]">
                      {cat.name}
                    </Badge>
                  ))}
                </div>
                <h1 className="text-lg font-bold">{data.title}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/80">
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {data.writer_name || "작성자"}
                    <Badge className="bg-white/20 text-white border-0 text-[9px] px-1 py-0 ml-0.5">
                      {data.writer_type === "1" ? "관리자" : "담당자"}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(data.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {data.views}
                  </span>
                </div>
              </div>
              <Badge className={`${getStatusBadgeClass(data.status)} border rounded-lg px-2.5 py-0.5 text-xs font-medium`}>
                {data.status_label}
              </Badge>
            </div>
            {data.project_name && (
              <div className="mt-2">
                <Badge variant="outline" className="bg-white/20 text-white border-white/30 rounded-lg text-xs">
                  {data.project_name}
                </Badge>
              </div>
            )}
          </div>
        </Card>

        {/* Content */}
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <div
              className="prose prose-sm max-w-none text-muted-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: data.content || "" }}
            />
          </CardContent>
        </Card>

        {/* Attachments */}
        {data.attachments && data.attachments.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Paperclip className="h-4 w-4" />
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
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {file.file_size ? `${(file.file_size / 1024).toFixed(1)}KB` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Replies */}
        {data.replies && data.replies.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Reply className="h-4 w-4" />
                답글 ({data.replies.length})
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.replies.map((reply) => (
                <div key={reply.id} className="p-3 rounded-xl bg-muted/50 border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{reply.writer_name}</span>
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${reply.writer_type === "1" ? "text-blue-600 border-blue-200" : "text-emerald-600 border-emerald-200"}`}>
                        {reply.writer_type === "1" ? "관리자" : "담당자"}
                      </Badge>
                      {getStatusBadge(reply.status)}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{formatDate(reply.created_at)}</span>
                  </div>
                  <h4 className="text-sm font-medium mb-1">{reply.title}</h4>
                  <div
                    className="prose prose-sm max-w-none text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: reply.content || "" }}
                  />
                  {reply.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {reply.attachments.map((att) => (
                        <button
                          key={att.id}
                          onClick={() => handleDownload(att.id, att.name)}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                        >
                          <Download className="h-3 w-3" />
                          {att.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Reply button */}
        <div className="flex justify-center">
          <Link href={`/project-board/${id}/reply`}>
            <Button variant="outline" className="rounded-xl gap-1.5">
              <Reply className="h-4 w-4" />
              답글 작성
            </Button>
          </Link>
        </div>

        {/* Comments */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              댓글 ({data.comments?.length ?? 0})
            </h2>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.comments && data.comments.length > 0 ? (
              <div className="space-y-3 animate-stagger">
                {data.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`p-3 rounded-xl ${
                      comment.writer_type === "1"
                        ? "bg-blue-50 border border-blue-100"
                        : "bg-gray-50 border border-gray-100"
                    } ${comment.parent_id ? "ml-6" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{comment.writer_name || "작성자"}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 rounded-md ${comment.writer_type === "1" ? "text-blue-600 border-blue-200" : "text-emerald-600 border-emerald-200"}`}>
                          {comment.writer_type === "1" ? "관리자" : "담당자"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">{formatDate(comment.created_at)}</span>
                        {comment.is_mine && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => setDeleteCommentId(comment.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none text-sm text-muted-foreground whitespace-pre-wrap">
                      {comment.content}
                    </div>
                    {comment.attachments.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {comment.attachments.map((att) => (
                          <button
                            key={att.id}
                            onClick={() => handleDownload(att.id, att.name, "comment")}
                            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                          >
                            <Download className="h-3 w-3" />
                            {att.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">댓글이 없습니다.</p>
            )}

            <Separator className="my-3" />

            {/* Comment Form */}
            <div className="space-y-2">
              <Textarea
                placeholder="댓글을 입력하세요..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
                className="rounded-xl resize-none min-h-[80px] !field-sizing-normal"
              />
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  className="rounded-xl gap-1"
                  size="sm"
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || commentMutation.isPending}
                >
                  <Send className="h-3.5 w-3.5" />
                  {commentMutation.isPending ? "등록 중..." : "댓글 작성"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <div className="flex gap-2">
            {data.is_mine && (
              <>
                <Link href={`/project-board/${id}/edit`}>
                  <Button variant="outline" className="rounded-xl gap-1" size="sm">
                    <Edit3 className="h-3.5 w-3.5" />
                    수정
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="rounded-xl gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  삭제
                </Button>
              </>
            )}
          </div>
          <Link href="/project-board">
            <Button variant="outline" className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-1" />
              목록으로
            </Button>
          </Link>
        </div>
      </div>

      {/* Delete Board Dialog */}
      <AppAlertDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="게시글 삭제"
        description="이 게시글을 삭제하시겠습니까? 답글과 댓글도 함께 삭제됩니다."
        confirmText="삭제"
        variant="destructive"
        onConfirm={handleDeleteBoard}
      />

      {/* Delete Comment Dialog */}
      <AppAlertDialog
        open={deleteCommentId !== null}
        onOpenChange={(open) => !open && setDeleteCommentId(null)}
        title="댓글 삭제"
        description="이 댓글을 삭제하시겠습니까?"
        confirmText="삭제"
        variant="destructive"
        onConfirm={() => deleteCommentId && handleDeleteComment(deleteCommentId)}
      />
    </PageTransition>
  );
}

function getStatusBadge(status: string) {
  const labels: Record<string, string> = { "1": "진행중", "2": "완료", "3": "보류" };
  return (
    <Badge variant="outline" className={`${getStatusBadgeClass(status)} text-[10px] px-1.5 py-0`}>
      {labels[status] || ""}
    </Badge>
  );
}
