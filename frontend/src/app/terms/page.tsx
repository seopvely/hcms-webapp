import Link from "next/link";
import { Building2, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl py-8">
        <Card className="overflow-hidden rounded-3xl border-0 shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] px-6 py-10 text-center text-white">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Building2 className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">이용약관</h1>
            <p className="mt-1 text-sm text-white/80">HCMS 고객 포털 서비스</p>
          </div>

          <CardContent className="p-6 space-y-6">
            <p className="text-xs text-muted-foreground text-right">시행일: 2026년 2월 25일</p>

            {/* 제1조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제1조 (목적)</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                이 약관은 한결랩(이하 "회사")이 운영하는 HCMS 고객 포털(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
              </p>
            </section>

            {/* 제2조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제2조 (정의)</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                이 약관에서 사용하는 용어의 정의는 다음과 같습니다.
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① "서비스"란 회사가 제공하는 HCMS 고객 포털 및 이와 관련된 제반 서비스를 의미합니다.</li>
                <li>② "회원"이란 이 약관에 동의하고 서비스를 이용하는 고객을 의미합니다.</li>
                <li>③ "아이디(ID)"란 회원 식별과 서비스 이용을 위하여 회원이 설정하고 회사가 승인한 문자 또는 숫자의 조합을 의미합니다.</li>
                <li>④ "비밀번호"란 회원이 아이디와 일치하는 회원임을 확인하고 개인정보를 보호하기 위해 설정한 문자·숫자·특수문자의 조합을 의미합니다.</li>
                <li>⑤ "사이트키(Site Key)"란 회원이 소속된 건물/현장을 식별하는 고유 코드를 의미합니다.</li>
              </ul>
            </section>

            {/* 제3조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제3조 (약관의 효력 및 변경)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 이 약관은 서비스 화면에 게시하거나 기타의 방법으로 회원에게 공지함으로써 효력이 발생합니다.</li>
                <li>② 회사는 필요한 경우 관계 법령을 위배하지 않는 범위 내에서 이 약관을 변경할 수 있습니다.</li>
                <li>③ 약관이 변경되는 경우 회사는 변경 사항을 시행일 7일 전에 서비스 내 공지사항 또는 이메일 등의 방법으로 회원에게 공지합니다.</li>
                <li>④ 회원이 변경된 약관에 동의하지 않는 경우 서비스 이용을 중단하고 탈퇴를 요청할 수 있습니다.</li>
              </ul>
            </section>

            {/* 제4조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제4조 (서비스의 제공)</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                회사는 다음과 같은 서비스를 제공합니다.
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 유지보수 요청 조회: 건물·시설에 대한 유지보수 요청 내역 및 처리 상태 확인</li>
                <li>② 건별업무 확인: 담당 건별 업무(인디태스크)의 진행 현황 조회</li>
                <li>③ 견적서 확인: 유지보수 및 공사 관련 견적서 열람 및 승인</li>
                <li>④ 뉴스/공지사항: 건물 관리와 관련된 공지 및 뉴스 열람</li>
                <li>⑤ 문의사항: 관리사무소 또는 담당자에 대한 문의 접수 및 답변 확인</li>
                <li>⑥ 포인트 내역: 서비스 이용에 따른 포인트 적립 및 사용 내역 조회</li>
              </ul>
            </section>

            {/* 제5조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제5조 (회원의 의무)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회원은 아이디와 비밀번호를 안전하게 관리할 의무가 있으며, 타인에게 양도하거나 공유하여서는 안 됩니다.</li>
                <li>② 회원은 서비스를 이용하여 다음 행위를 하여서는 안 됩니다.
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>- 타인의 정보를 도용하거나 허위 정보를 등록하는 행위</li>
                    <li>- 서비스의 정상적인 운영을 방해하는 행위</li>
                    <li>- 회사 또는 제3자의 지적재산권을 침해하는 행위</li>
                    <li>- 기타 관련 법령에 위반되는 행위</li>
                  </ul>
                </li>
                <li>③ 회원은 계정 도용 또는 부정 이용 사실을 인지한 경우 즉시 회사에 통보하여야 합니다.</li>
              </ul>
            </section>

            {/* 제6조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제6조 (서비스 이용 제한)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회사는 회원이 이 약관의 의무를 위반하거나 서비스의 정상적인 운영을 방해한 경우 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.</li>
                <li>② 회사는 시스템 점검, 보수, 장애 등의 사유로 서비스 제공을 일시 중단할 수 있으며, 이 경우 사전 또는 사후에 공지합니다.</li>
                <li>③ 서비스 이용 제한으로 인한 불이익에 대해 회사는 관련 법령에서 정한 경우를 제외하고 책임지지 않습니다.</li>
              </ul>
            </section>

            {/* 제7조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제7조 (면책조항)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회사는 천재지변, 전쟁, 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
                <li>② 회사는 회원의 귀책사유로 인한 서비스 이용 장애에 대해 책임을 지지 않습니다.</li>
                <li>③ 회사는 회원이 서비스를 이용하여 기대하는 수익을 얻지 못하거나 손실이 발생한 것에 대해 책임을 지지 않습니다.</li>
                <li>④ 회사는 회원이 게시한 정보, 자료, 사실의 신뢰도 및 정확성 등에 관해 책임을 지지 않습니다.</li>
              </ul>
            </section>

            {/* 제8조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제8조 (분쟁해결)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 서비스 이용과 관련하여 회사와 회원 간에 분쟁이 발생한 경우, 양 당사자는 원만한 합의를 위해 성실히 협의합니다.</li>
                <li>② 협의가 이루어지지 않을 경우, 대한민국 법률을 준거법으로 하고 관할 법원은 민사소송법상의 관할 법원으로 합니다.</li>
              </ul>
            </section>

            <div className="border-t pt-4 text-center text-xs text-muted-foreground">
              <p>한결랩 (hankyeul.com)</p>
              <p className="mt-1">문의: 관리자에게 연락해주세요.</p>
            </div>

            <div className="pt-2 flex justify-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:from-[#5a6fd6] hover:to-[#6a4192] shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30"
              >
                <ArrowLeft className="h-4 w-4" />
                돌아가기
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
