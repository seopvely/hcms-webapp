import Link from "next/link";
import { Building2, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function PrivacyPage() {
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
            <h1 className="text-2xl font-bold tracking-tight">개인정보처리방침</h1>
            <p className="mt-1 text-sm text-white/80">HCMS 고객 포털 서비스</p>
          </div>

          <CardContent className="p-6 space-y-6">
            <p className="text-xs text-muted-foreground text-right">시행일: 2026년 2월 25일</p>

            <p className="text-sm text-muted-foreground leading-relaxed">
              한결랩(이하 "회사")은 개인정보보호법에 따라 이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이 개인정보처리방침을 수립·공개합니다.
            </p>

            {/* 제1조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제1조 (개인정보의 처리 목적)</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회원 식별 및 인증: 로그인 처리, 본인 확인</li>
                <li>② 서비스 제공: 유지보수 요청 조회, 건별업무 확인, 견적서 열람, 문의사항 처리, 포인트 내역 조회</li>
                <li>③ 푸시 알림: 서비스 관련 알림(유지보수 상태 변경, 견적서 발송 등) 전송</li>
                <li>④ 서비스 개선 및 민원 처리: 서비스 품질 향상 및 불만·민원 대응</li>
              </ul>
            </section>

            {/* 제2조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제2조 (수집하는 개인정보 항목)</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 필수 수집 항목
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>- 아이디(로그인 ID)</li>
                    <li>- 비밀번호 (암호화 저장)</li>
                    <li>- 이름</li>
                    <li>- 이메일 주소</li>
                    <li>- 연락처(휴대폰 번호)</li>
                    <li>- 소속 현장/건물 정보 (사이트키)</li>
                  </ul>
                </li>
                <li>② 서비스 이용 시 자동 수집 항목
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>- 기기 정보(기기 토큰, OS 종류 및 버전): 푸시 알림 전송 목적</li>
                    <li>- 서비스 이용 기록, 접속 로그</li>
                    <li>- IP 주소</li>
                  </ul>
                </li>
              </ul>
            </section>

            {/* 제3조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제3조 (개인정보의 보유 및 이용기간)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회사는 법령에 따른 개인정보 보유·이용기간 또는 이용자로부터 개인정보를 수집 시 동의받은 기간 내에서 개인정보를 처리·보유합니다.</li>
                <li>② 개인정보 처리 및 보유기간은 다음과 같습니다.
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>- 회원 정보: 계정 유지 기간 (계정 삭제 시 즉시 파기)</li>
                    <li>- 서비스 이용 기록: 3년 (전자상거래법)</li>
                    <li>- 기기 토큰 (푸시 알림용): 앱 삭제 또는 푸시 알림 해제 시까지</li>
                  </ul>
                </li>
              </ul>
            </section>

            {/* 제4조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제4조 (개인정보의 제3자 제공)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.</li>
                <li>② 다만, 다음의 경우에는 예외로 합니다.
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>- 이용자가 사전에 동의한 경우</li>
                    <li>- 법령의 규정에 의거하거나 수사기관의 적법한 요청이 있는 경우</li>
                  </ul>
                </li>
              </ul>
            </section>

            {/* 제5조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제5조 (개인정보처리의 위탁)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회사는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁할 수 있습니다.
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>- 수탁자: Google Firebase (Google LLC) / 위탁 업무: 푸시 알림(FCM) 발송</li>
                  </ul>
                </li>
                <li>② 회사는 위탁계약 체결 시 개인정보보호법에 따라 수탁자가 개인정보를 안전하게 처리하도록 필요한 사항을 규정하고 감독합니다.</li>
              </ul>
            </section>

            {/* 제6조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제6조 (개인정보의 파기)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.</li>
                <li>② 전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없도록 기술적 방법을 사용하여 삭제합니다.</li>
                <li>③ 종이에 출력된 개인정보는 분쇄기로 분쇄하거나 소각하여 파기합니다.</li>
              </ul>
            </section>

            {/* 제7조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제7조 (이용자의 권리)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 이용자는 언제든지 다음과 같은 개인정보 보호 관련 권리를 행사할 수 있습니다.
                  <ul className="mt-1 space-y-1 pl-4">
                    <li>- 개인정보 열람 요구</li>
                    <li>- 오류 등이 있을 경우 정정 요구</li>
                    <li>- 삭제 요구</li>
                    <li>- 처리 정지 요구</li>
                  </ul>
                </li>
                <li>② 권리 행사는 담당 관리자를 통해 서면, 이메일 등의 방법으로 하실 수 있으며, 회사는 이에 대해 지체 없이 조치하겠습니다.</li>
              </ul>
            </section>

            {/* 제8조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제8조 (개인정보 보호책임자)</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 이용자의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
              </p>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-muted-foreground space-y-1">
                <p>개인정보 보호책임자</p>
                <p>회사명: 한결랩</p>
                <p>웹사이트: hankyeul.com</p>
                <p>문의: 담당 관리자에게 연락해주세요.</p>
              </div>
            </section>

            {/* 제9조 */}
            <section className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">제9조 (개인정보 처리방침 변경)</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-none pl-2">
                <li>① 이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행일 7일 전부터 공지사항을 통하여 고지할 것입니다.</li>
                <li>② 중요한 사항 변경 시에는 최소 30일 전에 공지합니다.</li>
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
