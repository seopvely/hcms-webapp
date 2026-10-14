// 직원 사이드바 정보구조 (SPEC cms_dev §4.1). 아직 이관되지 않은 메뉴는 cms 화면을 새 탭으로 연다.
// 메뉴를 hcms 로 옮기면 href 를 /managed/... 로 바꾸고 legacy 를 지운다.
export const CMS_BASE = "https://cms.hankyeul.com";

export interface StaffNavItem {
  label: string;
  href: string;
  legacy?: boolean; // true = cms 에서 열기
  newTab?: boolean; // hcms 경로지만 새 탭(SSO 등)
  adminOnly?: boolean; // 관리자에게만 표시(재무 D12)
}

export interface StaffNavGroup {
  title: string;
  items: StaffNavItem[];
}

export const STAFF_NAV: StaffNavGroup[] = [
  { title: "대시보드", items: [{ label: "대시보드", href: "/managed" }] },
  {
    title: "유지보수",
    items: [
      { label: "유지보수 요청", href: "/managed/maintenance" },
      { label: "유지보수 일정", href: "/managed/maintenance/schedule" },
      { label: "건별작업", href: "/managed/tasks" },
      { label: "고객문의", href: "/managed/inquiries" },
      { label: "포인트 장부", href: "/managed/points" },
      { label: "처리내역 검색", href: "/managed/maintenance/comments" },
      { label: "포인트 안내", href: "/managed/points/guide" },
    ],
  },
  {
    title: "프로젝트",
    items: [
      { label: "프로젝트관리", href: "/managed/projects" },
      { label: "계약 달력", href: "/managed/projects/calendar" },
      { label: "도메인", href: "/managed/domains" },
      { label: "프로젝트구축진행", href: "/managed/project-board" },
      { label: "외주관리", href: "/managed/outsourcing" },
      { label: "외주 달력", href: "/managed/outsourcing/calendar" },
    ],
  },
  {
    title: "고객",
    items: [
      { label: "업체·고객 계정", href: "/managed/accounts" },
      { label: "고객사 이동(대리 로그인)", href: "/managed/customers" },
      { label: "유지보수 전환", href: "/managed/maint-renewal" },
      { label: "최신소식", href: "/managed/news" },
      { label: "레퍼런스 사이트", href: "/managed/reference-sites" },
    ],
  },
  {
    title: "영업·견적",
    items: [
      { label: "영업접수", href: "/managed/sales" },
      { label: "견적서", href: "/managed/estimates" },
      { label: "계약서", href: "/managed/contracts" },
      { label: "견적 대시보드", href: "/managed/estimates/dashboard" },
    ],
  },
  {
    title: "과금",
    items: [
      { label: "납부리스트", href: "/managed/billing/payments", adminOnly: true },
      { label: "납부내역", href: "/managed/billing/history", adminOnly: true },
      { label: "결제일알람", href: "/managed/billing/alarms", adminOnly: true },
      { label: "월별수익", href: "/managed/billing/revenue", adminOnly: true },
      { label: "매출·매입계획", href: "/managed/billing/sales-plan", adminOnly: true },
    ],
  },
  {
    title: "구독·FDE",
    items: [
      { label: "개발 구독", href: "/managed/subscriptions/dev" },
      { label: "개발 접수", href: "/managed/subscriptions/dev/requests" },
      { label: "유지보수 구독", href: "/managed/subscriptions/maint" },
      { label: "유지보수 접수", href: "/managed/subscriptions/maint/requests" },
      { label: "FDE 계약", href: "/managed/fde" },
      { label: "FDE 요금제", href: "/managed/fde/plans" },
    ],
  },
  {
    title: "업무도구",
    items: [
      { label: "알람", href: "/managed/alarms" },
      { label: "미팅약속", href: "/managed/meetings" },
      { label: "할일", href: "/managed/todos" },
      { label: "세금계산서", href: "/managed/tax", adminOnly: true },
    ],
  },
  {
    title: "보안",
    items: [{ label: "차단 분석(Fail2Ban)", href: "/managed/security-bans", adminOnly: true }],
  },
  {
    title: "설정·외부",
    items: [
      { label: "직원 계정", href: "/managed/staff", adminOnly: true },
      { label: "처리내역 템플릿", href: "/managed/settings/comment-templates" },
      { label: "AI 프롬프트", href: "/managed/settings/ai-prompts" },
      { label: "매입 공급자", href: "/managed/settings/suppliers", adminOnly: true },
      { label: "연동(웹훅) 설정", href: "/managed/settings/webhooks", adminOnly: true },
      { label: "이관 상태·배치", href: "/managed/settings/jobs", adminOnly: true },
      { label: "CreateSite 콘솔", href: "/managed/sso/createsite", newTab: true },
      { label: "WealthReach 관리자", href: "/managed/sso/wealthreach", newTab: true },
    ],
  },
];
