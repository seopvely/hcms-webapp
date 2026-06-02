"use client";

import { useState } from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DevPriceGuideSection() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info className="h-4 w-4 text-blue-500" />
          <span>개발 구독 안내</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t">
          <Tabs defaultValue="plans" className="mt-4">
            <TabsList className="mb-4">
              <TabsTrigger value="plans">플랜 비교</TabsTrigger>
              <TabsTrigger value="cost">작업별 소요 포인트</TabsTrigger>
            </TabsList>

            {/* Tab 1: 플랜 비교 */}
            <TabsContent value="plans">
              <div className="space-y-4">
                {/* Plan cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="py-4 border-slate-200 bg-slate-50 dark:bg-slate-900/30 dark:border-slate-700">
                    <CardContent className="px-4 py-0">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">STARTER</p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">월 390,000원</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">유지보수 15점/월</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">개발 포인트 미포함</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">베타: 270,000원/월</p>
                    </CardContent>
                  </Card>
                  <Card className="py-4 border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700">
                    <CardContent className="px-4 py-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">GROWTH</p>
                        <Badge className="h-4 px-1.5 text-[10px] bg-blue-500 text-white border-0">인기</Badge>
                      </div>
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-200">월 890,000원</p>
                      <p className="text-xs text-blue-600/80 dark:text-blue-400 mt-0.5">유지보수 20점 + 개발 15점/월</p>
                      <p className="text-xs text-blue-500/70 dark:text-blue-500 mt-0.5">응답: 영업일 12시간 내</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">베타: 620,000원/월</p>
                    </CardContent>
                  </Card>
                  <Card className="py-4 border-purple-200 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-800">
                    <CardContent className="px-4 py-0">
                      <p className="text-xs font-semibold text-purple-500 dark:text-purple-400 mb-1">SCALE</p>
                      <p className="text-sm font-bold text-purple-700 dark:text-purple-200">월 1,790,000원</p>
                      <p className="text-xs text-purple-600/80 dark:text-purple-400 mt-0.5">유지보수 30점 + 개발 40점/월</p>
                      <p className="text-xs text-purple-500/70 dark:text-purple-500 mt-0.5">응답: 영업일 4시간 내</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">베타: 1,250,000원/월</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Beta notice */}
                <Card className="py-4 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                  <CardContent className="px-4 py-0">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                      선착순 3개 기업 — 첫 3개월 30% 할인
                    </p>
                    <p className="text-xs text-green-600/80 dark:text-green-400 mt-0.5">
                      베타 종료 후 정상 요금 자동 전환 · 언제든 해지 가능
                    </p>
                  </CardContent>
                </Card>

                {/* Point policy */}
                <div>
                  <p className="text-sm font-medium mb-2">포인트 정책</p>
                  <ul className="space-y-1.5 text-sm text-foreground/80">
                    {[
                      "포인트는 매월 1일 충전되며 당월 소진 (이월 없음)",
                      "개발 포인트는 GROWTH 플랜 이상에서 사용 가능",
                      "포인트 부족 시 30,000원/점으로 추가 구매 가능",
                      "기획 협업은 GROWTH 플랜 이상 포함",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </TabsContent>

            {/* Tab 2: 작업별 소요 포인트 */}
            <TabsContent value="cost">
              <div className="space-y-4">
                <p className="text-xs font-medium text-muted-foreground">개발 포인트</p>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2.5 text-left font-medium">작업 유형</th>
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">소요 포인트</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">신규 페이지 제작</td>
                        <td className="px-3 py-2.5 font-medium">5 ~ 8점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">API 연동</td>
                        <td className="px-3 py-2.5 font-medium">5 ~ 10점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">관리자 기능 추가</td>
                        <td className="px-3 py-2.5 font-medium">8 ~ 15점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">신규 기능 개발</td>
                        <td className="px-3 py-2.5 font-medium text-muted-foreground">별도 협의</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-xs font-medium text-muted-foreground">유지보수 포인트</p>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2.5 text-left font-medium">작업 유형</th>
                        <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap">소요 포인트</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">텍스트·이미지·링크 수정</td>
                        <td className="px-3 py-2.5 font-medium">1점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">디자인 소폭 수정</td>
                        <td className="px-3 py-2.5 font-medium">1 ~ 2점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">버그 수정 (소)</td>
                        <td className="px-3 py-2.5 font-medium">2 ~ 3점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">버그 수정 (대)</td>
                        <td className="px-3 py-2.5 font-medium">4 ~ 6점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">속도 개선·보안 패치</td>
                        <td className="px-3 py-2.5 font-medium">3 ~ 5점</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">서버·도메인·SSL 관리</td>
                        <td className="px-3 py-2.5 font-medium">2 ~ 3점</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground">
                  위 단가는 참고용이며, 실제 작업 난이도와 범위에 따라 조정될 수 있습니다.
                </p>
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
