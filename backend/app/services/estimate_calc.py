"""견적 금액 계산 — 직원·고객 화면 공용."""
from app.models.customer import Estimate


def amounts(e: Estimate) -> dict:
    """PACMS Estimate.get_* 와 같은 금액 계산(별도 항목 0, 세율 NULL 이면 0)."""
    subtotal = sum(0 if i.is_separate else (i.quantity or 0) * (i.unit_price or 0) for i in e.items)
    discount = 0
    if e.discount_type == "1" and e.discount_rate:
        discount = int(subtotal * (float(e.discount_rate) / 100))
    elif e.discount_type == "2" and e.discount_amount:
        discount = e.discount_amount
    discounted = subtotal - discount
    tax = int(discounted * (float(e.tax_rate) / 100)) if e.tax_rate else 0
    return {"subtotal": subtotal, "discount": discount, "discounted": discounted, "tax": tax, "total": discounted + tax}
