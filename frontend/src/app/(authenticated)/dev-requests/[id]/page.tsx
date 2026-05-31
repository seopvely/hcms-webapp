"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Send,
  Paperclip,
  MessageSquare,
  X,
  Download,
  Reply,
  CornerDownRight,
  Code2,
  Coins,
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
import { StatusBadge, LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import {
  useDevRequestDetail,
  useCreateDevRequestComment,
  DevRequestComment,
} from "@/lib/api-hooks";
import { formatDate, formatDateTime } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";

function buildCommentTree(comments: DevRequestComment[]): DevRequestComment[] {
  const map = new Map<number, DevRequestComment>();
  const roots: DevRequestComment[] = [];

  for (const c of comments) {
    map.set(c.id, { ...c, replies: [] });
  }

  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function CommentNode({
  comment,
  depth,
  onReply,
  onDownload,
}: {
  comment: DevRequestComment;
  depth: number;
  onReply: (id: number, author: string) => void;
  onDownload: (type: "comment-attachment" | "comment-file", id: number, filename: string) => void;
}) {
  return (
    <div style={{ marginLeft: depth > 0 ? Math.min(depth * 20, 80) : 0 }}>
      <div
        className={`p-3 rounded-xl mb-3 ${
          depth > 0 ? "border-l-2 border-purple-200 " : ""
        }${
          comment.role === "customer"
            ? "bg-blue-50 border border-blue-100"
            : "bg-muted/50"
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {depth > 0 && (
              <CornerDownRight className="h-3 w-3 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {comment.author}
            </span>
            {comment.role === "manager" && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 rounded-md"
              >
                관리자
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDateTime(comment.created_at)}
          </span>
        </div>
        <div
          className="prose prose-sm max-w-none text-sm text-muted-foreground whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: comment.content }}
        />
        {/* Legacy single attachment */}
        {comment.attachment && (
          <button
            onClick={() =>
              onDownload(
                "comment-file",
                comment.id,
                comment.attachment!.split("/").pop() || "file"
              )
            }
            className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Paperclip className="h-3 w-3" />
            <span className="underline">{comment.attachment.split("/").pop()}</span>
            <Download className="h-3 w-3" />
          </button>
        )}
        {/* Multiple attachments */}
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {comment.attachments.map((att) => (
              <button
                key={att.id}
                onClick={() => onDownload("comment-attachment", att.id, att.name)}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Paperclip className="h-3 w-3" />
                <span className="underline">{att.name}</span>
                <Download className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
        {/* Reply button */}
        <button
          onClick={() => onReply(comment.id, comment.author)}
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Reply className="h-3 w-3" />
          답글
        </button>
      </div>
      {/* Recursive replies */}
      {comment.replies &&
        comment.replies.length > 0 &&
        comment.replies.map((reply) => (
          <CommentNode
            key={reply.id}
            comment={reply}
            depth={depth + 1}
            onReply={onReply}
            onDownload={onDownload}
          />
        ))}
    </div>
  );
}

export default function DevRequestDetailPage() {
  const { setPageTitle } = useNavigationStore();
  const params = useParams();
  const id = Number(params.id);
  const [newComment, setNewComment] = useState("");
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; author: string } | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  const { data, isLoading } = useDevRequestDetail(id);
  const commentMutation = useCreateDevRequestComment(id);

  useEffect(() => {
    setPageTitle("개발 요청 상세");
  }, [setPageTitle]);

  const handleSubmitComment = () => {
    if (!newComment.trim()) return;

    const formData = new FormData();
    formData.append("content", newComment);
    if (replyTo) {
      formData.append("parent_id", String(replyTo.id));
    }
    if (commentFile) {
      formData.append("attachment", commentFile);
    }

    commentMutation.mutate(formData, {
      onSuccess: () => {
        setNewComment("");
        setCommentFile(null);
        setReplyTo(null);
      },
    });
  };

  const handleDownload = async (
    type: "attachment" | "comment-attachment" | "comment-file",
    fileId: number,
    filename: string
  ) => {
    try {
      const token = localStorage.getItem("access_token");
      let endpoint = "";
      if (type === "attachment") {
        endpoint = `/api/dev-requests/attachments/${fileId}/download`;
      } else if (type === "comment-attachment") {
        endpoint = `/api/dev-requests/comments/attachments/${fileId}/download`;
      } else {
        endpoint = `/api/dev-requests/comments/${fileId}/file/download`;
      }
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      await downloadBlob(blob, filename);
    } catch (error) {
      alert(`파일 다운로드에 실패했습니다.\n${error instanceof Error ? error.message : String(error)}`);
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
              <BreadcrumbLink href="/dev-requests">개발 요청</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>상세보기</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Status Header */}
        <Card className="rounded-2xl overflow-hidden border-0 animate-slide-in-right">
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] p-4 text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Code2 className="h-4 w-4 opacity-80" />
                  {data.dev_plan_type && (
                    <span className="text-xs text-white/70">{data.dev_plan_type}</span>
                  )}
                </div>
                <h1 className="text-lg font-bold">{data.title}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/80">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(data.request_date)}
                  </span>
                </div>
              </div>
              <StatusBadge status={data.status} type="dev-request" />
            </div>
          </div>
        </Card>

        {/* Content */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <h2 className="text-sm font-semibold">요청 내용</h2>
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
                <Paperclip className="h-4 w-4" />
                첨부파일 ({data.attachments.length})
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.attachments.map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleDownload("attachment", file.id, file.name)}
                    className="w-full flex items-center justify-between p-3 bg-muted/50 rounded-xl hover:bg-muted/80 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2 text-sm truncate">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      {file.name}
                    </span>
                    <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Point History */}
        {data.point_histories && data.point_histories.length > 0 && (
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Coins className="h-4 w-4 text-amber-500" />
                포인트 사용 내역
              </h2>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {data.point_histories.map((ph) => (
                  <div key={ph.id} className="flex items-start justify-between py-2.5 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-foreground">
                          {ph.content || (ph.point_type === 2 ? "포인트 사용" : ph.point_type === 3 ? "포인트 책정" : "포인트 충전")}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 rounded-md ${ph.point_category === "2" ? "border-purple-300 text-purple-600 bg-purple-50" : "border-blue-300 text-blue-600 bg-blue-50"}`}
                        >
                          {ph.point_category === "2" ? "개발" : "유지보수"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{ph.created_at.slice(0, 10)}</span>
                        {ph.worker_type && <span>· {ph.worker_type}</span>}
                        {ph.status === 1 && (
                          <span className="text-orange-500">· 책정</span>
                        )}
                      </div>
                    </div>
                    <span className={`text-sm font-semibold whitespace-nowrap ${ph.point_type === 2 ? "text-red-500" : "text-green-600"}`}>
                      {ph.point_type === 2 ? "-" : "+"}{ph.point} P
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
              <div className="animate-stagger">
                {buildCommentTree(data.comments).map((comment) => (
                  <CommentNode
                    key={comment.id}
                    comment={comment}
                    depth={0}
                    onReply={(commentId, author) => {
                      setReplyTo({ id: commentId, author });
                      setTimeout(() => {
                        commentInputRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                        commentInputRef.current?.focus();
                      }, 100);
                    }}
                    onDownload={(type, fileId, filename) =>
                      handleDownload(type, fileId, filename)
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                댓글이 없습니다.
              </p>
            )}

            <Separator className="my-3" />

            {/* Reply indicator */}
            {replyTo && (
              <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl">
                <CornerDownRight className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-blue-700">
                  <strong>{replyTo.author || "댓글"}</strong>에 답글 작성 중
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="ml-auto text-blue-400 hover:text-blue-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Comment Input */}
            <div className="space-y-2">
              <Textarea
                ref={commentInputRef}
                placeholder={replyTo ? "답글을 입력하세요..." : "댓글을 입력하세요..."}
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setCommentFile(file);
                      }}
                    />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Paperclip className="h-3.5 w-3.5" />
                      파일 첨부
                    </div>
                  </label>
                  {commentFile && (
                    <div className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-lg">
                      <span className="truncate max-w-[150px]">{commentFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setCommentFile(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  className="rounded-xl gap-1"
                  size="sm"
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || commentMutation.isPending}
                >
                  <Send className="h-3.5 w-3.5" />
                  {commentMutation.isPending
                    ? "등록 중..."
                    : replyTo
                    ? "답글 등록"
                    : "댓글 등록"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="flex justify-end">
          <Link href="/dev-requests">
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
