"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, FileText, Building2, Download } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigationStore } from "@/store/navigation-store";
import { StatusBadge, LoadingState } from "@/components/common";
import { AnimatedCounter } from "@/components/common/animated-counter";
import { PageTransition } from "@/components/layout/page-transition";
import { useEstimateDetail } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

function formatAmount(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function EstimateDetailPage() {
  const { setPageTitle } = useNavigationStore();
  const params = useParams();
  const id = Number(params.id);
  const { data, isLoading } = useEstimateDetail(id);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  useEffect(() => { setPageTitle("견적 상세"); }, [setPageTitle]);

  const downloadPdf = async (type: "estimate" | "contract") => {
    setPdfLoading(type);
    try {
      const token = localStorage.getItem("access_token");
      const endpoint = type === "estimate"
        ? `/api/estimates/${id}/pdf`
        : `/api/estimates/${id}/contract-pdf`;
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("PDF 생성 실패");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = type === "estimate"
        ? `견적서_${id}.pdf`
        : `계약서_${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("PDF 다운로드에 실패했습니다.");
    } finally {
      setPdfLoading(null);
    }
  };

  if (isLoading || !data) {
    return <PageTransition><LoadingState message="견적 정보를 불러오는 중..." /></PageTransition>;
  }

  return (
    <PageTransition>
      <div className="space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">대시보드</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/estimates">견적/계약</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>상세보기</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <Card className="rounded-2xl overflow-hidden border-0 animate-slide-in-right">
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold">{data.title}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-white/80">
                  {data.company_name && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{data.company_name}</span>}
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(data.created_at)}</span>
                </div>
              </div>
              <StatusBadge status={data.status} type="estimate" />
            </div>
            <div className="text-center pt-2 border-t border-white/20">
              <p className="text-sm text-white/70">총 견적금액</p>
              <p className="text-3xl font-bold mt-1">
                <AnimatedCounter value={data.total} duration={1200} />
                <span className="text-lg ml-1">원</span>
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={() => downloadPdf("estimate")}
                disabled={pdfLoading !== null}
                className="bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg px-3 py-1.5 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {pdfLoading === "estimate" ? "생성중..." : "견적서 PDF"}
              </button>
              {data.status === "5" && (
                <button
                  onClick={() => downloadPdf("contract")}
                  disabled={pdfLoading !== null}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs rounded-lg px-3 py-1.5 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {pdfLoading === "contract" ? "생성중..." : "계약서 PDF"}
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><h2 className="text-sm font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4" />견적 항목</h2></CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">항목</TableHead>
                    <TableHead className="text-center w-16">수량</TableHead>
                    <TableHead className="text-right w-28">단가</TableHead>
                    <TableHead className="text-right pr-6 w-28">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="pl-6 text-sm">{item.name}</TableCell>
                      <TableCell className="text-center text-sm">{item.quantity}{item.unit}</TableCell>
                      <TableCell className="text-right text-sm">{formatAmount(item.unit_price)}</TableCell>
                      <TableCell className="text-right pr-6 text-sm font-medium">{formatAmount(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">소계</span><span>{formatAmount(data.subtotal)}원</span></div>
            {data.discount > 0 && <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">할인{data.discount_description ? ` (${data.discount_description})` : ""}</span><span className="text-red-500">-{formatAmount(data.discount)}원</span></div>}
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">부가세 (VAT)</span><span>{formatAmount(data.tax)}원</span></div>
            <Separator />
            <div className="flex items-center justify-between font-bold"><span>합계</span><span className="text-lg text-primary">{formatAmount(data.total)}원</span></div>
          </CardContent>
        </Card>

        {data.notes && <Card className="rounded-2xl"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{data.notes}</p></CardContent></Card>}

        <div className="flex justify-end"><Link href="/estimates"><Button variant="outline" className="rounded-xl"><ArrowLeft className="h-4 w-4 mr-1" />목록으로</Button></Link></div>
      </div>
    </PageTransition>
  );
}
