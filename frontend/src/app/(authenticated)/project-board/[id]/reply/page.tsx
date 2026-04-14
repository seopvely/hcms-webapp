"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, X, Loader2, Download, Paperclip } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { useNavigationStore } from "@/store/navigation-store";
import { LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useProjectBoardDetail, useCreateBoardReply } from "@/lib/api-hooks";
import { useToast } from "@/components/common/app-toast";
import { formatDate } from "@/lib/utils";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
  "txt", "csv", "zip", "rar", "7z",
];
const ALLOWED_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function ReplyProjectBoardPage() {
  const router = useRouter();
  const params = useParams();
  const parentId = Number(params.id);
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();

  const { data: parentData, isLoading } = useProjectBoardDetail(parentId);
  const createReply = useCreateBoardReply(parentId);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("1");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setPageTitle("답글 작성");
  }, [setPageTitle]);

  useEffect(() => {
    if (parentData && !title) {
      setTitle(`RE: ${parentData.title}`);
    }
  }, [parentData, title]);

  const handleDownload = async (attachmentId: number, filename: string) => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`/api/project-board/attachments/${attachmentId}/download`, {
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

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const newFiles = Array.from(selectedFiles);
    const validFiles: File[] = [];
    for (const file of newFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast("error", `${file.name}은(는) 허용되지 않는 파일 형식입니다.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast("error", `${file.name}은(는) 10MB를 초과합니다.`);
        continue;
      }
      validFiles.push(file);
    }
    if (files.length + validFiles.length > MAX_FILES) {
      toast("error", `최대 ${MAX_FILES}개까지만 첨부할 수 있습니다.`);
      setFiles([...files, ...validFiles].slice(0, MAX_FILES));
    } else {
      setFiles([...files, ...validFiles]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast("error", "제목을 입력해주세요.");
      return;
    }
    if (!content.trim()) {
      toast("error", "내용을 입력해주세요.");
      return;
    }

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("content", content.trim());
    formData.append("status", selectedStatus);
    files.forEach((file) => formData.append("files", file));

    try {
      await createReply.mutateAsync(formData);
      toast("success", "답글이 등록되었습니다.");
      router.push(`/project-board/${parentId}`);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || "답글 등록에 실패했습니다.";
      toast("error", msg);
    }
  };

  if (isLoading || !parentData) {
    return (
      <PageTransition>
        <LoadingState message="원글 정보를 불러오는 중..." />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/dashboard">대시보드</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href="/project-board">프로젝트구축진행</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild><Link href={`/project-board/${parentId}`}>원글</Link></BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>답글 작성</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Original Post Summary */}
        <Card className="rounded-2xl bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">원글</p>
            <h3 className="text-sm font-semibold">{parentData.title}</h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{parentData.writer_name}</span>
              {parentData.project_name && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{parentData.project_name}</Badge>
              )}
            </div>
            {parentData.content && (
              <>
                <Separator className="my-3" />
                <div
                  className="prose prose-sm max-w-none text-sm text-muted-foreground leading-relaxed max-h-[300px] overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: parentData.content }}
                />
              </>
            )}
            {parentData.attachments && parentData.attachments.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  첨부파일 ({parentData.attachments.length})
                </p>
                <div className="space-y-1.5">
                  {parentData.attachments.map((file) => (
                    <button
                      key={file.id}
                      onClick={() => handleDownload(file.id, file.name)}
                      className="w-full flex items-center justify-between p-2.5 bg-background rounded-xl hover:bg-muted/80 transition-colors cursor-pointer text-left"
                    >
                      <span className="flex items-center gap-2 text-sm truncate">
                        <Download className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        {file.name}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                        {file.file_size ? formatFileSize(file.file_size) : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Reply Form */}
        <Card className="rounded-2xl">
          <CardHeader className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">답글 작성</h2>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">상태</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full rounded-xl h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">진행중</SelectItem>
                    <SelectItem value="2">완료</SelectItem>
                    <SelectItem value="3">보류</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">제목 <span className="text-red-500">*</span></label>
                <Input id="title" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="rounded-xl h-11" required />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <label htmlFor="content" className="text-sm font-medium">내용 <span className="text-red-500">*</span></label>
                <Textarea id="content" placeholder="답글 내용을 입력해주세요" value={content} onChange={(e) => setContent(e.target.value)} className="rounded-xl min-h-[200px] resize-y" required />
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">첨부파일</label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm mb-2">파일을 드래그하거나 클릭하여 선택</p>
                  <label>
                    <input type="file" multiple className="hidden" onChange={(e) => handleFileSelect(e.target.files)} accept={ALLOWED_ACCEPT} />
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={(e) => { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                      파일 선택
                    </Button>
                  </label>
                </div>
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))} className="ml-2 h-8 w-8 p-0 rounded-lg">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" className="flex-1 rounded-xl h-11" onClick={() => router.back()} disabled={createReply.isPending}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> 취소
                </Button>
                <Button type="submit" className="flex-1 rounded-xl h-11 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700" disabled={createReply.isPending}>
                  {createReply.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />등록 중...</>) : "답글 등록"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
