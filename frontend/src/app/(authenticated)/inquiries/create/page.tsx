"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useNavigationStore } from "@/store/navigation-store";
import { PageTransition } from "@/components/layout/page-transition";
import { useCreateInquiry } from "@/lib/api-hooks";
import { useToast } from "@/components/common/app-toast";

const INQUIRY_TYPES = [
  { value: "1", label: "버그 신고" },
  { value: "2", label: "디자인 변경" },
  { value: "3", label: "기능 추가" },
  { value: "4", label: "기술 지원" },
  { value: "5", label: "성능 개선" },
  { value: "6", label: "권한 문제" },
  { value: "7", label: "기타" },
];

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const ALLOWED_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp", "hwpx",
  "txt", "csv",
  "zip", "rar", "7z",
];

const ALLOWED_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function CreateInquiryForm() {
  const router = useRouter();
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();
  const createInquiry = useCreateInquiry();
  const searchParams = useSearchParams();

  const [title, setTitle] = useState("");
  const [contents, setContents] = useState("");
  const [inquiryType, setInquiryType] = useState<string>("1");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setPageTitle("문의 등록");
  }, [setPageTitle]);

  useEffect(() => {
    const service = searchParams.get("service");
    const plan = searchParams.get("plan");
    if (service && plan) {
      setTitle(`[${service}] ${plan} 문의`);
      setContents(`안녕하세요.\n\n[${service}] ${plan} 서비스에 대해 문의드립니다.\n\n`);
      setInquiryType("4"); // 기술 지원
    }
  }, [searchParams]);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast("error", "제목을 입력해주세요.");
      return;
    }

    if (!contents.trim()) {
      toast("error", "내용을 입력해주세요.");
      return;
    }

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("contents", contents.trim());
    formData.append("inquiry_type", inquiryType);

    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      await createInquiry.mutateAsync(formData);
      toast("success", "문의가 등록되었습니다.");
      router.push("/inquiries");
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || "문의 등록에 실패했습니다.";
      toast("error", errorMessage);
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">대시보드</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/inquiries">고객문의</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>문의 등록</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Form Card */}
        <Card className="rounded-2xl">
          <CardHeader className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">문의 등록</h2>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Inquiry Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  문의 유형 <span className="text-red-500">*</span>
                </label>
                <Select value={inquiryType} onValueChange={setInquiryType}>
                  <SelectTrigger className="w-full rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INQUIRY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  제목 <span className="text-red-500">*</span>
                </label>
                <Input
                  id="title"
                  type="text"
                  placeholder="제목을 입력해주세요 (최대 200자)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  className="rounded-xl h-11"
                  required
                />
                <p className="text-xs text-muted-foreground text-right">
                  {title.length}/200
                </p>
              </div>

              {/* Contents */}
              <div className="space-y-2">
                <label htmlFor="contents" className="text-sm font-medium">
                  내용 <span className="text-red-500">*</span>
                </label>
                <Textarea
                  id="contents"
                  placeholder="문의 내용을 입력해주세요"
                  value={contents}
                  onChange={(e) => setContents(e.target.value)}
                  className="rounded-xl min-h-[200px] resize-y"
                  required
                />
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium">첨부파일</label>
                <p className="text-xs text-muted-foreground">
                  최대 {MAX_FILES}개, 각 파일 10MB 이하
                </p>
                <div className="space-y-3">
                  {/* Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                      border-2 border-dashed rounded-xl p-8 text-center transition-colors
                      ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
                    `}
                  >
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-medium mb-1">
                      파일을 드래그하거나 클릭하여 선택
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      PNG, JPG, PDF, DOCX, XLSX 등
                    </p>
                    <label>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                        accept={ALLOWED_ACCEPT}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={(e) => {
                          e.preventDefault();
                          (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                        }}
                        disabled={files.length >= MAX_FILES}
                      >
                        파일 선택
                      </Button>
                    </label>
                  </div>

                  {/* File List */}
                  {files.length > 0 && (
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-xl"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFile(index)}
                            className="ml-2 h-8 w-8 p-0 rounded-lg"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl h-11"
                  onClick={() => router.back()}
                  disabled={createInquiry.isPending}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  취소
                </Button>
                <Button
                  type="submit"
                  className="flex-1 rounded-xl h-11 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700"
                  disabled={createInquiry.isPending}
                >
                  {createInquiry.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      등록 중...
                    </>
                  ) : (
                    "문의 등록"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

export default function CreateInquiryPage() {
  return (
    <Suspense>
      <CreateInquiryForm />
    </Suspense>
  );
}
