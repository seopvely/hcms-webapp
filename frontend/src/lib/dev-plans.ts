// 개발자 구독(통합 플랜) 요금 — 고객 화면 공용. 백엔드 app/services/subscriptions.py 의 price 와 같아야 한다.
export const DEV_PLAN_PRICES = {
  STARTER: { price: 390000, betaPrice: 270000 },
  GROWTH: { price: 890000, betaPrice: 620000 },
  SCALE: { price: 1790000, betaPrice: 1250000 },
} as const;

export type DevPlanName = keyof typeof DEV_PLAN_PRICES;

export const BETA_MONTHS = 3;

export const won = (n: number) => n.toLocaleString("ko-KR");
