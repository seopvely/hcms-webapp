"""유지보수 포인트 6개월 주기 계산.

계약 시작일부터 6개월 단위로 주기를 나누고, 포인트(총/사용/잔여)는 현재 주기 안에서만 계산한다.
주기가 바뀌면 사용 포인트가 0부터 다시 시작한다(= 6개월마다 초기화).
- 주기 포인트 = 주기 개월수 × 월 포인트 (마지막 주기가 6개월 미만이면 남은 개월수만큼)
- 주기 경계는 계약 시작일의 '일' 기준 (예: 02-12 시작 → 08-12, 다음해 02-12 에 초기화)
"""
import math
from datetime import date, datetime, timedelta

from dateutil.relativedelta import relativedelta

CYCLE_MONTHS = 6


def _as_date(value):
    return value.date() if isinstance(value, datetime) else value


def _months_between(start: date, end: date) -> int:
    """start~end 사이 개월수. 남는 일수가 있으면 한 달로 올림."""
    rd = relativedelta(end, start)
    months = rd.years * 12 + rd.months
    if rd.days > 0:
        months += 1
    return max(months, 0)


def get_point_cycle(project, today: date = None):
    """현재 6개월 주기 정보. 계약일이 없으면 None.

    반환 dict:
      index / count      — 현재 주기 번호(0부터) / 전체 주기 수
      start / end        — 주기 시작일 / 주기 마지막 날(표시용, 포함)
      query_start / query_end — PointHistory.created_at 조회 범위 [query_start, query_end)
      next_reset         — 다음 초기화일 (마지막 주기면 None)
      months / total_points
    """
    contract_start = _as_date(project.contract_date)
    contract_end = _as_date(project.contract_termination_date)
    if not contract_start or not contract_end:
        return None
    today = today or datetime.now().date()

    total_months = max(_months_between(contract_start, contract_end), 1)
    count = max(math.ceil(total_months / CYCLE_MONTHS), 1)

    index = 0
    while index + 1 < count and contract_start + relativedelta(months=CYCLE_MONTHS * (index + 1)) <= today:
        index += 1

    start = contract_start + relativedelta(months=CYCLE_MONTHS * index)
    is_last = index + 1 >= count
    if is_last:
        end_exclusive = contract_end + timedelta(days=1)  # 계약 종료일 당일까지 포함
    else:
        end_exclusive = min(contract_start + relativedelta(months=CYCLE_MONTHS * (index + 1)), contract_end + timedelta(days=1))

    months = max(min(_months_between(start, end_exclusive - timedelta(days=1)), CYCLE_MONTHS), 1)

    return {
        "index": index,
        "count": count,
        "start": start,
        "end": end_exclusive - timedelta(days=1),
        "query_start": datetime.combine(start, datetime.min.time()),
        "query_end": datetime.combine(end_exclusive, datetime.min.time()),
        "next_reset": None if is_last else end_exclusive,
        "months": months,
        "total_points": months * (project.point or 0),
    }
