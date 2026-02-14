"use client";

import { useEffect } from "react";
import { useNavigationStore } from "@/store/navigation-store";
import { PageTransition } from "@/components/layout/page-transition";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Shield,
  Zap,
  Globe,
  Wrench,
  Code,
  Mail,
  Phone,
  MessageCircle,
  Check,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

function serviceInquiryUrl(service: string, plan: string) {
  return `/inquiries/create?service=${encodeURIComponent(service)}&plan=${encodeURIComponent(plan)}`;
}

export default function ServicesPage() {
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);

  useEffect(() => {
    setPageTitle("할 수 있는 일");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-12 pb-12">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            할 수 있는 일
          </h1>
          <p className="text-muted-foreground">
            2026 · VAT 별도 · 고객님의 디지털 성공을 위한 맞춤형 서비스
          </p>
        </div>

        {/* 1. 웹호스팅 서비스 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-blue-500 pl-4">
            <Server className="h-6 w-6 text-blue-600" />
            <h2 className="text-2xl font-bold">웹호스팅 서비스</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Basic */}
            <Link href={serviceInquiryUrl("웹호스팅", "Basic")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Basic</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">50,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">1사이트 호스팅</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL/TLS 인증서</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">일일 자동 백업</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Uptime 모니터링</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">10GB SSD</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Business */}
            <Link href={serviceInquiryUrl("웹호스팅", "Business")} className="block">
              <Card className="rounded-2xl hover-lift border-2 border-blue-500 relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-blue-500 to-cyan-500">
                    인기
                  </Badge>
                </div>
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Business</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">100,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">3사이트 호스팅</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL/TLS 인증서</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">일일 자동 백업</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">24시간 모니터링</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">50GB SSD</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">CDN 가속</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Premium */}
            <Link href={serviceInquiryUrl("웹호스팅", "Premium")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Premium</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">200,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">무제한 사이트</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL/TLS 인증서</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">실시간 백업</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">24시간 모니터링+장애 대응</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">100GB SSD</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">CDN+DDoS 방어</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* 2. 유지보수 정액제 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-cyan-500 pl-4">
            <Wrench className="h-6 w-6 text-cyan-600" />
            <h2 className="text-2xl font-bold">유지보수 정액제 (월 단위)</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Starter */}
            <Link href={serviceInquiryUrl("유지보수 정액제", "Starter")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Starter</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">100,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Basic Hosting 포함</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">이메일 계정 2개</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">콘텐츠 수정 월 1회</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">DB·파일 백업 월 1회</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Standard */}
            <Link href={serviceInquiryUrl("유지보수 정액제", "Standard")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Standard</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">200,000</span>
                      <span className="text-muted-foreground">원/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Basic Hosting 포함</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">이메일 계정 5개</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">콘텐츠 수정 월 3회</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">보안 점검·장애 24h 대응</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Enterprise */}
            <Link href={serviceInquiryUrl("유지보수 정액제", "Enterprise")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Enterprise</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">300,000</span>
                      <span className="text-muted-foreground">원~/월</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Basic Hosting 포함</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">무제한 수정 (Fair Policy)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">속도·보안 최적화</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">월간 리포트+실시간 지원</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>
          </div>
          <Card className="rounded-2xl bg-muted/50">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                <strong>건별 유지보수:</strong> 텍스트/이미지 30,000원~,
                스크립트 추가 50,000원~, 장애 복구 100,000원~
              </p>
            </CardContent>
          </Card>
        </section>

        {/* 3. 홈페이지 구축 패키지 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-purple-500 pl-4">
            <Globe className="h-6 w-6 text-purple-600" />
            <h2 className="text-2xl font-bold">홈페이지 구축 패키지</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Launch Kit */}
            <Link href={serviceInquiryUrl("홈페이지 구축", "Launch Kit")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Launch Kit</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">1,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">랜딩/프로모션 1페이지</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">반응형 디자인</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">SSL+GA 설정</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">기본 SEO</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Growth Pack */}
            <Link href={serviceInquiryUrl("홈페이지 구축", "Growth Pack")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Growth Pack</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">2,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">5–6페이지 사이트</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">관리자 CMS</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">1개월 유지보수</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* Enterprise Build */}
            <Link href={serviceInquiryUrl("홈페이지 구축", "Enterprise Build")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Enterprise Build</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">3,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">맞춤 디자인·기능</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">최신 스택</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">3개월 유지보수</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* 4. 서버 작업 · DevOps */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-green-500 pl-4">
            <Code className="h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-bold">서버 작업 · DevOps</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {/* DevOps Basic */}
            <Link href={serviceInquiryUrl("서버·DevOps", "DevOps Basic")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">DevOps Basic</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">1,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Ubuntu 서버 구축</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Nginx 설정</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Docker 환경</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">자동 백업·SSL</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>

            {/* DevOps Pro */}
            <Link href={serviceInquiryUrl("서버·DevOps", "DevOps Pro")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardHeader>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">DevOps Pro</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">3,000,000</span>
                      <span className="text-muted-foreground">원~</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">CI/CD 파이프라인</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">고가용성 DB</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">AWS S3 통합</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-sm">WAF·교육</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* 5. 부가 서비스 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-orange-500 pl-4">
            <Sparkles className="h-6 w-6 text-orange-600" />
            <h2 className="text-2xl font-bold">부가 서비스</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Link href={serviceInquiryUrl("부가서비스", "유료 SSL")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">유료 SSL (기업 인증)</h3>
                      <p className="text-sm text-muted-foreground">
                        EV/OV 인증서
                      </p>
                    </div>
                    <Badge variant="secondary">100,000원~/년</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href={serviceInquiryUrl("부가서비스", "속도 퍼포먼스 튜닝")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">속도 퍼포먼스 튜닝</h3>
                      <p className="text-sm text-muted-foreground">
                        로딩 속도 최적화
                      </p>
                    </div>
                    <Badge variant="secondary">200,000원~</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href={serviceInquiryUrl("부가서비스", "메일 이전")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">메일 이전</h3>
                      <p className="text-sm text-muted-foreground">
                        메일 서버 마이그레이션
                      </p>
                    </div>
                    <Badge variant="secondary">150,000원~</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href={serviceInquiryUrl("부가서비스", "도메인 등록·이전")} className="block">
              <Card className="rounded-2xl hover-lift">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">도메인 등록/이전</h3>
                      <p className="text-sm text-muted-foreground">
                        도메인 관리 대행
                      </p>
                    </div>
                    <Badge variant="secondary">별도 문의</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        {/* 6. 고객군별 권장 플랜 */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-pink-500 pl-4">
            <Shield className="h-6 w-6 text-pink-600" />
            <h2 className="text-2xl font-bold">고객군별 권장 플랜</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="rounded-2xl hover-lift bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
              <CardHeader>
                <h3 className="text-xl font-bold">개인·소상공인</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Basic Hosting</strong>
                  <br />+ <strong>Launch Kit</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  빠르게 시작하고 안정적으로 운영
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl hover-lift bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
              <CardHeader>
                <h3 className="text-xl font-bold">중소기업</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Standard 유지보수</strong>
                  <br />+ <strong>Growth Pack</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  성장을 위한 확장 가능한 플랫폼
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl hover-lift bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
              <CardHeader>
                <h3 className="text-xl font-bold">중견·대기업</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <strong>Enterprise 유지보수</strong>
                  <br />+ <strong>Enterprise Build</strong>
                  <br />+ <strong>DevOps Pro</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  엔터프라이즈급 성능과 보안
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Bottom: 문의·상담 */}
        <section className="space-y-6">
          <Card className="rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-600 text-white">
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">
                  궁금하신 점이 있으신가요?
                </h2>
                <p className="text-blue-100">
                  언제든지 문의 주시면 친절하게 상담해 드립니다.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3 max-w-3xl mx-auto">
                <div className="flex items-center justify-center gap-2">
                  <Phone className="h-5 w-5" />
                  <span className="font-semibold">010-7185-8207</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Mail className="h-5 w-5" />
                  <span className="font-semibold">kks@hankyeul.com</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  <span className="font-semibold">@hklab</span>
                </div>
              </div>
              <Link href="/inquiries/create">
                <button className="rounded-xl bg-white text-blue-600 px-8 py-3 font-semibold hover:bg-blue-50 transition-colors">
                  문의하기
                </button>
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </PageTransition>
  );
}
