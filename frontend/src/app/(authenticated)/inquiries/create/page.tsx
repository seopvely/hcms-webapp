"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function CreateInquiryPage() {
  const router = useRouter();
  const { setPageTitle } = useNavigationStore();
  const { toast } = useToast();
  const createInquiry = useCreateInquiry();

  const [title, setTitle] = useState("");
  const [contents, setContents] = useState("");
  const [inquiryType, setInquiryType] = useState<string>("1");
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    setPageTitle("문의 등록");
  }, [setPageTitle]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    // Validate file count
    if (files.length + selectedFiles.length > MAX_FILES) {
      toast("error", `최대 ${MAX_FILES}개의 파일만 첨부할 수 있습니다.`);
      return;
    }

    // Validate file sizes
    const invalidFiles = selectedFiles.filter(f => f.size > MAX_FILE_SIZE);
    if (invalidFiles.length > 0) {
      toast("error", "10MB를 초과하는 파일은 첨부할 수 없습니다.");
      return;
    }

    setFiles(prev => [...prev, ...selectedFiles]);
    e.target.value = ""; // Reset input
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
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      id="file-upload"
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl h-11"
                      onClick={() => document.getElementById("file-upload")?.click()}
                      disabled={files.length >= MAX_FILES}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      파일 선택
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      최대 {MAX_FILES}개, 각 10MB 이하
                    </p>
                  </div>

                  {/* Selected Files */}
                  {files.length > 0 && (
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-xl"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFile(index)}
                            className="shrink-0 h-8 w-8 p-0 rounded-lg"
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
