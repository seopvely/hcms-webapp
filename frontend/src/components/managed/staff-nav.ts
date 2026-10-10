// 직원 사이드바 정보구조 (SPEC cms_dev §4.1). 아직 이관되지 않은 메뉴는 cms 화면을 새 탭으로 연다.
// 메뉴를 hcms 로 옮기면 href 를 /managed/... 로 바꾸고 legacy 를 지운다.
export const CMS_BASE = "https://cms.hankyeul.com";

export interface StaffNavItem {
  label: string;
  href: string;
  legacy?: boolean; // true = cms 에서 열기
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
      { label: "유지보수 요청", href: cms("/managed/managelist"), legacy: true },
      { label: "유지보수 일정", href: cms("/managed/maintenance-schedule/"), legacy: true },
      { label: "건별작업", href: cms("/managed/inditask"), legacy: true },
      { label: "고객문의", href: cms("/managed/oneperone"), legacy: true },
      { label: "포인트 장부", href: cms("/managed/pointdeduct"), legacy: true },
      { label: "처리내역 검색", href: cms("/managed/history"), legacy: true },
      { label: "포인트 안내", href: cms("/managed/point-guide/"), legacy: true },
    ],
  },
  {
    title: "프로젝트",
    items: [
      { label: "프로젝트관리", href: cms("/managed/projectmanage"), legacy: true },
      { label: "진행중 프로젝트", href: cms("/managed/processlist"), legacy: true },
      { label: "계약 달력", href: cms("/managed/projectmanage/calendar/"), legacy: true },
      { label: "도메인", href: cms("/managed/domain"), legacy: true },
      { label: "프로젝트구축진행", href: cms("/managed/project-board/"), legacy: true },
      { label: "외주관리", href: cms("/managed/outsourcing/"), legacy: true },
      { label: "외주 달력", href: cms("/managed/outsourcing/calendar/"), legacy: true },
    ],
  },
  {
    title: "고객",
    items: [
      { label: "고객리스트", href: cms("/managed/custom"), legacy: true },
      { label: "업체관리", href: cms("/managed/suppliermanage"), legacy: true },
      { label: "유지보수 전환", href: cms("/managed/maint-renewal/"), legacy: true },
      { label: "최신소식", href: cms("/managed/news/"), legacy: true },
      { label: "레퍼런스 사이트", href: cms("/managed/reference-sites/"), legacy: true },
    ],
  },
  {
    title: "영업·견적",
    items: [
      { label: "영업접수", href: cms("/managed/sales/"), legacy: true },
      { label: "견적서", href: cms("/managed/estimate-new/"), legacy: true },
      { label: "견적발행", href: cms("/managed/estimate/"), legacy: true },
      { label: "계약서", href: cms("/managed/contract/"), legacy: true },
      { label: "견적 대시보드", href: cms("/managed/estimate/dashboard/"), legacy: true },
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
      { label: "에이전트", href: cms("/managed/agent"), legacy: true },
      { label: "CreateSite 콘솔", href: cms("/api/sso/createsite"), legacy: true },
      { label: "WealthReach 관리자", href: cms("/api/sso/wealthreach"), legacy: true },
    ],
  },
];
