"use client";

import { useState } from "react";
import { Info, ChevronDown, ChevronUp, Download } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function PointGuideSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-blue-500" />
          <span>크레딧 안내</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-4 pb-4 border-t">
          <Tabs defaultValue="policy" className="mt-4">
            <TabsList className="mb-4">
              <TabsTrigger value="policy">크레딧 정책</TabsTrigger>
              <TabsTrigger value="cost">작업별 소요 크레딧</TabsTrigger>
            </TabsList>

            {/* Tab 1: 크레딧 정책 */}
            <TabsContent value="policy">
              <div className="space-y-4">
                {/* Plan cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="py-4 border-slate-200 bg-slate-50 dark:bg-slate-900/30 dark:border-slate-700">
                    <CardContent className="px-4 py-0">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Basic</p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">월 50,000원</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">크레딧 2개 포함</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">크레딧당 25,000원 · VAT 별도</p>
                    </CardContent>
                  </Card>
                  <Card className="py-4 border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700 relative">
                    <CardContent className="px-4 py-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">Growth</p>
                        <Badge className="h-4 px-1.5 text-[10px] bg-blue-500 text-white border-0">인기</Badge>
                      </div>
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-200">월 110,000원</p>
                      <p className="text-xs text-blue-600/80 dark:text-blue-400 mt-0.5">크레딧 5개 포함</p>
                      <p className="text-xs text-blue-500/70 dark:text-blue-500 mt-0.5">크레딧당 22,000원 · VAT 별도</p>
                    </CardContent>
                  </Card>
                  <Card className="py-4 border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800">
                    <CardContent className="px-4 py-0">
                      <p className="text-xs font-semibold text-purple-500 dark:text-purple-400 mb-1">Business</p>
                      <p className="text-sm font-bold text-purple-700 dark:text-purple-200">월 220,000원</p>
                      <p className="text-xs text-purple-600/80 dark:text-purple-400 mt-0.5">크레딧 15개 포함</p>
                      <p className="text-xs text-purple-500/70 dark:text-purple-500 mt-0.5">크레딧당 약 14,700원 · VAT 별도</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Credit info */}
                <Card className="py-4 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                  <CardContent className="px-4 py-0">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                      최대 6개월분 미리 사용 가능
                    </p>
                    <p className="text-xs text-green-600/80 dark:text-green-400 mt-0.5">
                      선사용 후 정산 방식 · 미사용 크레딧 6개월 후 소멸
                    </p>
                  </CardContent>
                </Card>

                {/* 크레딧 사용 가능 범위 */}
                <div>
                  <p className="text-sm font-medium mb-2">크레딧 사용 가능 범위</p>
                  <ul className="space-y-1.5 text-sm text-foreground/80">
                    {[
                      "오류 수정 및 장애 대응",
                      "경미한 기능 개선 (기존 기능 단순 수정, UI 보완 등)",
                      "콘텐츠 업데이트 (텍스트, 이미지 교체 등)",
                      "정기 점검 및 버전 패치",
                      "보안 패치 및 서버 환경 최적화",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 별도 비용 산정 항목 */}
                <div>
                  <p className="text-sm font-medium mb-2 text-muted-foreground">
                    별도 비용 산정 항목
                  </p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {[
                      "신규 기능 개발 및 대규모 구조 변경",
                      "기존 시스템 범위를 초과하는 확장 개발",
                      "외부 API 등 제3자 서비스 신규 연동 구축",
                      "디자인/기획의 전면 재작업",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* PDF download */}
                <a
                  href="/maint_point_revised.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Download className="h-4 w-4" />
                  크레딧 정책 안내서 다운로드
                </a>
              </div>
            </TabsContent>

            {/* Tab 2: 작업별 소요 크레딧 */}
            <TabsContent value="cost">
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2.5 text-left font-medium">구분</th>
                        <th className="px-3 py-2.5 text-left font-medium">작업 내용</th>
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">소요 크레딧</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700">
                            오류 수정
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">코드 수정, 링크 오류, CSS 깨짐 등 단순 오류</td>
                        <td className="px-3 py-2.5 font-medium">2크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700">
                            장애 대응(긴급)
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">서버 재기동, DB 문제, 긴급 패치 등</td>
                        <td className="px-3 py-2.5 font-medium">5 ~ 10크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700">
                            콘텐츠 수정
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">텍스트/이미지 교체, 게시물 등록</td>
                        <td className="px-3 py-2.5 font-medium">2 ~ 3크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700">
                            UI 개선
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">버튼 위치 변경, 레이아웃 조정 등</td>
                        <td className="px-3 py-2.5 font-medium">3 ~ 5크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700">
                            기능 개선(소규모)
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">로직 보완, 단순 옵션 추가</td>
                        <td className="px-3 py-2.5 font-medium">5 ~ 8크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">
                            신규 페이지 제작(단순)
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">템플릿 기반 페이지 추가</td>
                        <td className="px-3 py-2.5 font-medium">10 ~ 20크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-slate-800 text-slate-100 border-slate-700 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600">
                            신규 기능 개발(중규모)
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">예약/결제/회원 기능 일부 추가</td>
                        <td className="px-3 py-2.5 font-medium">20 ~ 40크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700">
                            디자인 작업
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">랜딩/프로모션 단일 디자인</td>
                        <td className="px-3 py-2.5 font-medium">20 ~ 40크레딧</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5">
                          <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700">
                            리뉴얼/대규모 변경
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">전체 구조 개편, 신규 구축</td>
                        <td className="px-3 py-2.5 font-medium text-muted-foreground">별도 협의</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground">
                  위 단가는 참고용이며, 실제 작업 난이도와 범위에 따라 조정될 수 있습니다.
                </p>

                {/* PDF download */}
                <a
                  href="/maint_cost_table.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Download className="h-4 w-4" />
                  작업별 크레딧 표 다운로드
                </a>
              </div>
            </TabsContent>
          </Tabs>

          {/* Contact info */}
          <div className="mt-4 pt-3 border-t flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs text-muted-foreground">
            <span>전화: 010-7185-8207</span>
            <span>이메일: kks@hankyeul.com</span>
          </div>
        </div>
      )}
    </div>
  );
}
