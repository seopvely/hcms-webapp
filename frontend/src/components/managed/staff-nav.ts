// 직원 사이드바 정보구조 (SPEC cms_dev §4.1). 아직 이관되지 않은 메뉴는 cms 화면을 새 탭으로 연다.
// 메뉴를 hcms 로 옮기면 href 를 /managed/... 로 바꾸고 legacy 를 지운다.
export const CMS_BASE = "https://cms.hankyeul.com";

export interface StaffNavItem {
  label: string;
  href: string;
  legacy?: boolean; // true = cms 에서 열기
  newTab?: boolean; // hcms 경로지만 새 탭(SSO 등)
}

export interface StaffNavGroup {
  title: string;
  items: StaffNavItem[];
}

const cms = (path: string): StaffNavItem["href"] => `${CMS_BASE}${path}`;

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
      { label: "프로젝트관리", href: cms("/managed/projectmanage"), legacy: true },
      { label: "진행중 프로젝트", href: cms("/managed/processlist"), legacy: true },
      { label: "계약 달력", href: cms("/managed/projectmanage/calendar/"), legacy: true },
      { label: "도메인", href: cms("/managed/domain"), legacy: true },
      { label: "프로젝트구축진행", href: "/managed/project-board" },
      { label: "외주관리", href: cms("/managed/outsourcing/"), legacy: true },
      { label: "외주 달력", href: cms("/managed/outsourcing/calendar/"), legacy: true },
    ],
  },
  {
    title: "고객",
    items: [
      { label: "업체·고객 계정", href: "/managed/accounts" },
      { label: "고객사 이동(대리 로그인)", href: "/managed/customers" },
      { label: "유지보수 전환", href: cms("/managed/maint-renewal/"), legacy: true },
      { label: "최신소식", href: "/managed/news" },
      { label: "레퍼런스 사이트", href: cms("/managed/reference-sites/"), legacy: true },
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
      { label: "납부리스트", href: cms("/managed/prepayment"), legacy: true },
      { label: "납부내역", href: cms("/managed/paymenthistory"), legacy: true },
      { label: "결제일알람", href: cms("/managed/payment-alarm/"), legacy: true },
      { label: "월별수익", href: cms("/managed/monthly-revenue/"), legacy: true },
      { label: "매출·매입계획", href: cms("/managed/sales-plan/"), legacy: true },
    ],
  },
  {
    title: "구독",
    items: [
      { label: "개발 구독", href: cms("/managed/dev-subscription/"), legacy: true },
      { label: "개발 접수", href: cms("/managed/dev-subscription/requests/"), legacy: true },
      { label: "유지보수 구독", href: cms("/managed/maint-subscription/"), legacy: true },
      { label: "유지보수 접수", href: cms("/managed/maint-subscription/requests/"), legacy: true },
    ],
  },
  {
    title: "업무도구",
    items: [
      { label: "알람", href: cms("/managed/alarm/"), legacy: true },
      { label: "미팅약속", href: cms("/managed/meeting/"), legacy: true },
      { label: "할일", href: cms("/managed/todo/"), legacy: true },
      { label: "세금계산서", href: cms("/managed/tax/"), legacy: true },
    ],
  },
  {
    title: "설정·외부",
    items: [
      { label: "직원 계정", href: "/managed/staff" },
      { label: "CreateSite 콘솔", href: "/managed/sso/createsite", newTab: true },
      { label: "WealthReach 관리자", href: "/managed/sso/wealthreach", newTab: true },
    ],
  },
];
