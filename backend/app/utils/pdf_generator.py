"""
PDF generator for estimates and contracts.
Produces professional Korean-language A4 PDF documents using fpdf2.
"""

from datetime import date, datetime
from typing import Optional

from fpdf import FPDF


# --- Font paths ---
FONT_REGULAR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# --- Colour palette ---
COLOR_BLACK = (0, 0, 0)
COLOR_LABEL = (102, 102, 102)        # #666666
COLOR_HEADER_BG = (245, 245, 250)    # light lavender for header row
COLOR_TABLE_BORDER = (200, 200, 200)
COLOR_ACCENT = (102, 126, 234)       # #667eea  (brand purple)
COLOR_WHITE = (255, 255, 255)

# --- Layout constants ---
PAGE_W = 210  # A4 width mm
MARGIN = 20
CONTENT_W = PAGE_W - 2 * MARGIN


def _fmt_number(value) -> str:
    """Format an integer with thousands separator, handling None."""
    if value is None:
        return "0"
    try:
        return f"{int(value):,}"
    except (ValueError, TypeError):
        return "0"


def _fmt_date(value) -> str:
    """Format a date as YYYY년 MM월 DD일."""
    if value is None:
        return ""
    if isinstance(value, str):
        # Try parsing ISO format
        try:
            value = datetime.fromisoformat(value).date()
        except (ValueError, TypeError):
            return value
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return f"{value.year}년 {value.month:02d}월 {value.day:02d}일"
    return str(value)


def _safe(value, default: str = "") -> str:
    """Return str(value) if truthy, else default."""
    if value is None:
        return default
    s = str(value)
    return s if s else default


# ---------------------------------------------------------------------------
# Base PDF class with Korean font support
# ---------------------------------------------------------------------------

class _KoreanPDF(FPDF):
    """FPDF subclass pre-configured with NotoSansCJK fonts."""

    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_margins(MARGIN, MARGIN, MARGIN)
        self.set_auto_page_break(auto=True, margin=25)
        self.add_font("NotoSans", "", FONT_REGULAR, uni=True)
        self.add_font("NotoSans", "B", FONT_BOLD, uni=True)

    # Convenience helpers ------------------------------------------------

    def _set_font(self, style: str = "", size: int = 10):
        self.set_font("NotoSans", style, size)

    def _set_text_color(self, rgb: tuple):
        self.set_text_color(*rgb)

    def _set_draw_color(self, rgb: tuple):
        self.set_draw_color(*rgb)

    def _set_fill_color(self, rgb: tuple):
        self.set_fill_color(*rgb)

    def _draw_line(self, y: Optional[float] = None):
        """Draw a full-width horizontal line at current or given y."""
        if y is None:
            y = self.get_y()
        self._set_draw_color(COLOR_TABLE_BORDER)
        self.line(MARGIN, y, MARGIN + CONTENT_W, y)

    def _label_value_row(self, label: str, value: str, label_w: float = 35):
        """Print a label: value row."""
        y_start = self.get_y()
        self._set_font("", 9)
        self._set_text_color(COLOR_LABEL)
        self.set_xy(MARGIN, y_start)
        self.cell(label_w, 6, label, new_x="RIGHT")
        self._set_text_color(COLOR_BLACK)
        self._set_font("", 10)
        self.cell(CONTENT_W - label_w, 6, value, new_x="LMARGIN", new_y="NEXT")

    def _section_title(self, title: str):
        """Print a section heading with accent underline."""
        self.ln(4)
        self._set_font("B", 11)
        self._set_text_color(COLOR_ACCENT)
        self.cell(CONTENT_W, 7, title, new_x="LMARGIN", new_y="NEXT")
        self._set_text_color(COLOR_BLACK)
        self._set_draw_color(COLOR_ACCENT)
        self.line(MARGIN, self.get_y(), MARGIN + CONTENT_W, self.get_y())
        self.ln(3)


# ---------------------------------------------------------------------------
# Estimate PDF
# ---------------------------------------------------------------------------

def generate_estimate_pdf(data: dict) -> bytes:
    """
    Generate estimate PDF from a data dict.

    Expected keys:
        id, title, estimate_number, estimate_date, valid_until,
        company_name, company_ceo, company_business_number, company_address,
        items: [{name, quantity, unit, unit_price, amount}],
        subtotal, discount, discount_description, tax, total, notes
    """
    pdf = _KoreanPDF()
    pdf.add_page()

    # === Title ===
    pdf._set_font("B", 22)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(CONTENT_W, 14, "견 적 서", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf._set_text_color(COLOR_BLACK)
    pdf.ln(2)

    # Accent line under title
    pdf._set_draw_color(COLOR_ACCENT)
    pdf.set_line_width(0.8)
    pdf.line(MARGIN + 50, pdf.get_y(), MARGIN + CONTENT_W - 50, pdf.get_y())
    pdf.set_line_width(0.2)
    pdf.ln(8)

    # === Party info: two-column layout ===
    col_w = CONTENT_W / 2 - 2
    y_top = pdf.get_y()

    # Left column - customer (갑)
    pdf.set_xy(MARGIN, y_top)
    pdf._set_font("B", 10)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(col_w, 6, "[ 갑 ]  수 신", new_x="LMARGIN", new_y="NEXT")
    pdf._set_text_color(COLOR_BLACK)

    pdf.set_x(MARGIN)
    pdf._set_font("", 9)
    pdf._set_text_color(COLOR_LABEL)
    pdf.cell(22, 5.5, "상 호", new_x="RIGHT")
    pdf._set_text_color(COLOR_BLACK)
    pdf._set_font("", 10)
    pdf.cell(col_w - 22, 5.5, _safe(data.get("company_name")), new_x="LMARGIN", new_y="NEXT")

    pdf.set_x(MARGIN)
    pdf._set_font("", 9)
    pdf._set_text_color(COLOR_LABEL)
    pdf.cell(22, 5.5, "대표자", new_x="RIGHT")
    pdf._set_text_color(COLOR_BLACK)
    pdf._set_font("", 10)
    pdf.cell(col_w - 22, 5.5, _safe(data.get("company_ceo")), new_x="LMARGIN", new_y="NEXT")

    pdf.set_x(MARGIN)
    pdf._set_font("", 9)
    pdf._set_text_color(COLOR_LABEL)
    pdf.cell(22, 5.5, "사업자번호", new_x="RIGHT")
    pdf._set_text_color(COLOR_BLACK)
    pdf._set_font("", 10)
    pdf.cell(col_w - 22, 5.5, _safe(data.get("company_business_number")), new_x="LMARGIN", new_y="NEXT")

    y_left_end = pdf.get_y()

    # Right column - 한결랩 (을)
    pdf.set_xy(MARGIN + col_w + 4, y_top)
    pdf._set_font("B", 10)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(col_w, 6, "[ 을 ]  발 신", new_x="LMARGIN", new_y="NEXT")
    pdf._set_text_color(COLOR_BLACK)

    pdf.set_xy(MARGIN + col_w + 4, pdf.get_y())
    pdf._set_font("", 9)
    pdf._set_text_color(COLOR_LABEL)
    pdf.cell(22, 5.5, "상 호", new_x="RIGHT")
    pdf._set_text_color(COLOR_BLACK)
    pdf._set_font("", 10)
    pdf.cell(col_w - 22, 5.5, "한결랩", new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(MARGIN + col_w + 4, pdf.get_y())
    pdf._set_font("", 9)
    pdf._set_text_color(COLOR_LABEL)
    pdf.cell(22, 5.5, "대표자", new_x="RIGHT")
    pdf._set_text_color(COLOR_BLACK)
    pdf._set_font("", 10)
    pdf.cell(col_w - 22, 5.5, "김경섭", new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(MARGIN + col_w + 4, pdf.get_y())
    pdf._set_font("", 9)
    pdf._set_text_color(COLOR_LABEL)
    pdf.cell(22, 5.5, "사업자번호", new_x="RIGHT")
    pdf._set_text_color(COLOR_BLACK)
    pdf._set_font("", 10)
    pdf.cell(col_w - 22, 5.5, "328-79-00578", new_x="LMARGIN", new_y="NEXT")

    pdf.set_y(max(y_left_end, pdf.get_y()) + 4)
    pdf._draw_line()
    pdf.ln(5)

    # === Basic info ===
    pdf._section_title("견적 정보")
    pdf._label_value_row("견적번호", _safe(data.get("estimate_number"), "-"))
    pdf._label_value_row("견적일", _fmt_date(data.get("estimate_date")))
    pdf._label_value_row("유효기간", _safe(data.get("valid_until"), "견적일로부터 30일"))
    pdf._label_value_row(
        "총 견적금액",
        f"{_fmt_number(data.get('total'))} 원"
    )
    pdf.ln(4)

    # === Items table ===
    pdf._section_title("견적 항목")

    items = data.get("items", [])

    # Column widths: 번호(12), 항목명(55), 수량(18), 단위(18), 단가(30), 금액(37) = 170
    col_widths = [12, 55, 18, 18, 30, 37]
    headers = ["번호", "항목명", "수량", "단위", "단가", "금액"]
    aligns = ["C", "C", "C", "C", "C", "C"]
    data_aligns = ["C", "L", "R", "C", "R", "R"]

    # Header row
    pdf._set_fill_color(COLOR_HEADER_BG)
    pdf._set_font("B", 9)
    pdf._set_text_color(COLOR_LABEL)
    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 8, header, border=1, align=aligns[i], fill=True,
                 new_x="RIGHT")
    pdf.ln()

    # Data rows
    pdf._set_font("", 9)
    pdf._set_text_color(COLOR_BLACK)
    for idx, item in enumerate(items, 1):
        row_data = [
            str(idx),
            _safe(item.get("name")),
            _fmt_number(item.get("quantity")),
            _safe(item.get("unit"), "식"),
            _fmt_number(item.get("unit_price")),
            _fmt_number(item.get("amount")),
        ]
        for i, val in enumerate(row_data):
            pdf.cell(col_widths[i], 7, val, border=1, align=data_aligns[i],
                     new_x="RIGHT")
        pdf.ln()

    pdf.ln(4)

    # === Financial summary ===
    pdf._section_title("금액 요약")
    summary_label_w = 40
    summary_value_w = 50

    def _summary_row(label: str, value: str, bold: bool = False):
        pdf.set_x(MARGIN + CONTENT_W - summary_label_w - summary_value_w)
        pdf._set_font("", 9)
        pdf._set_text_color(COLOR_LABEL)
        pdf.cell(summary_label_w, 7, label, align="R", new_x="RIGHT")
        pdf._set_font("B" if bold else "", 10 if bold else 9)
        pdf._set_text_color(COLOR_BLACK)
        pdf.cell(summary_value_w, 7, value, align="R", new_x="LMARGIN", new_y="NEXT")

    _summary_row("소 계", f"{_fmt_number(data.get('subtotal'))} 원")

    discount = data.get("discount", 0) or 0
    if discount > 0:
        desc = data.get("discount_description", "")
        discount_label = f"할 인 ({desc})" if desc else "할 인"
        _summary_row(discount_label, f"-{_fmt_number(discount)} 원")

    _summary_row("부가세 (VAT)", f"{_fmt_number(data.get('tax'))} 원")

    # Total line
    pdf._set_draw_color(COLOR_ACCENT)
    total_start_x = MARGIN + CONTENT_W - summary_label_w - summary_value_w
    pdf.line(total_start_x, pdf.get_y(), MARGIN + CONTENT_W, pdf.get_y())
    pdf.ln(1)
    _summary_row("합 계", f"{_fmt_number(data.get('total'))} 원", bold=True)
    pdf.ln(3)

    # === Notes ===
    notes = data.get("notes")
    if notes:
        pdf._section_title("비 고")
        pdf._set_font("", 9)
        pdf._set_text_color(COLOR_BLACK)
        pdf.multi_cell(CONTENT_W, 5, str(notes))
        pdf.ln(4)

    # === Footer ===
    pdf.ln(6)
    pdf._set_draw_color(COLOR_TABLE_BORDER)
    pdf._draw_line()
    pdf.ln(3)
    pdf._set_font("", 8)
    pdf._set_text_color(COLOR_LABEL)
    pdf.cell(CONTENT_W, 4, "한결랩  |  사업자등록번호: 328-79-00578  |  대표: 김경섭", align="C",
             new_x="LMARGIN", new_y="NEXT")
    pdf.cell(CONTENT_W, 4, "경기도 고양시 일산서구 고양대로 666 101-603  |  kks@hankyeul.com", align="C",
             new_x="LMARGIN", new_y="NEXT")

    return pdf.output()


# ---------------------------------------------------------------------------
# Contract PDF
# ---------------------------------------------------------------------------

def generate_contract_pdf(data: dict) -> bytes:
    """
    Generate contract PDF from a data dict.

    Expected keys match EstimateContract model fields:
        contract_number, contract_title, contract_date,
        party_a_name, party_a_ceo, party_a_business_number, party_a_address, party_a_email,
        party_b_name, party_b_ceo, party_b_business_number, party_b_address, party_b_email,
        project_description, service_scope, contract_period,
        contract_start_date, contract_end_date,
        contract_amount, payment_terms, special_terms
    """
    pdf = _KoreanPDF()
    pdf.add_page()

    # === Title ===
    pdf._set_font("B", 24)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(CONTENT_W, 16, "계 약 서", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf._set_text_color(COLOR_BLACK)
    pdf.ln(2)

    # Accent line
    pdf._set_draw_color(COLOR_ACCENT)
    pdf.set_line_width(0.8)
    pdf.line(MARGIN + 50, pdf.get_y(), MARGIN + CONTENT_W - 50, pdf.get_y())
    pdf.set_line_width(0.2)
    pdf.ln(8)

    # === Contract number & date ===
    pdf._set_font("", 10)
    pdf._set_text_color(COLOR_LABEL)
    contract_number = _safe(data.get("contract_number"), "-")
    contract_date = _fmt_date(data.get("contract_date"))
    pdf.cell(CONTENT_W / 2, 6, f"계약번호: {contract_number}", new_x="RIGHT")
    pdf.cell(CONTENT_W / 2, 6, f"계약일자: {contract_date}", align="R",
             new_x="LMARGIN", new_y="NEXT")
    pdf._set_text_color(COLOR_BLACK)
    pdf.ln(4)

    # === Contract title ===
    contract_title = _safe(data.get("contract_title"), "")
    if contract_title:
        pdf._set_font("B", 13)
        pdf.cell(CONTENT_W, 8, contract_title, align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)

    # === Parties section ===
    pdf._section_title("계약 당사자")

    col_w = CONTENT_W / 2 - 2
    y_top = pdf.get_y()

    # 갑 (customer)
    pdf.set_xy(MARGIN, y_top)
    pdf._set_font("B", 10)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(col_w, 6, '[ 갑 ]', new_x="LMARGIN", new_y="NEXT")
    pdf._set_text_color(COLOR_BLACK)

    party_a_fields = [
        ("상 호", _safe(data.get("party_a_name"))),
        ("대표자", _safe(data.get("party_a_ceo"))),
        ("사업자번호", _safe(data.get("party_a_business_number"))),
        ("주 소", _safe(data.get("party_a_address"))),
        ("이메일", _safe(data.get("party_a_email"))),
    ]
    for label, value in party_a_fields:
        pdf.set_x(MARGIN)
        pdf._set_font("", 9)
        pdf._set_text_color(COLOR_LABEL)
        pdf.cell(22, 5.5, label, new_x="RIGHT")
        pdf._set_text_color(COLOR_BLACK)
        pdf._set_font("", 10)
        pdf.cell(col_w - 22, 5.5, value, new_x="LMARGIN", new_y="NEXT")

    y_left_end = pdf.get_y()

    # 을 (한결랩)
    pdf.set_xy(MARGIN + col_w + 4, y_top)
    pdf._set_font("B", 10)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(col_w, 6, '[ 을 ]', new_x="LMARGIN", new_y="NEXT")
    pdf._set_text_color(COLOR_BLACK)

    party_b_fields = [
        ("상 호", _safe(data.get("party_b_name"), "한결랩")),
        ("대표자", _safe(data.get("party_b_ceo"), "김경섭")),
        ("사업자번호", _safe(data.get("party_b_business_number"), "328-79-00578")),
        ("주 소", _safe(data.get("party_b_address"), "경기도 고양시 일산서구 고양대로 666 101-603")),
        ("이메일", _safe(data.get("party_b_email"), "kks@hankyeul.com")),
    ]
    for label, value in party_b_fields:
        pdf.set_xy(MARGIN + col_w + 4, pdf.get_y())
        pdf._set_font("", 9)
        pdf._set_text_color(COLOR_LABEL)
        pdf.cell(22, 5.5, label, new_x="RIGHT")
        pdf._set_text_color(COLOR_BLACK)
        pdf._set_font("", 10)
        pdf.cell(col_w - 22, 5.5, value, new_x="LMARGIN", new_y="NEXT")

    pdf.set_y(max(y_left_end, pdf.get_y()) + 4)

    # === Contract details ===
    pdf._section_title("계약 내용")

    # Project description
    project_desc = _safe(data.get("project_description"))
    if project_desc:
        pdf._set_font("", 9)
        pdf._set_text_color(COLOR_LABEL)
        pdf.cell(CONTENT_W, 5, "프로젝트 내용", new_x="LMARGIN", new_y="NEXT")
        pdf._set_font("", 10)
        pdf._set_text_color(COLOR_BLACK)
        pdf.multi_cell(CONTENT_W, 5.5, project_desc)
        pdf.ln(3)

    # Service scope
    service_scope = _safe(data.get("service_scope"))
    if service_scope:
        pdf._set_font("", 9)
        pdf._set_text_color(COLOR_LABEL)
        pdf.cell(CONTENT_W, 5, "서비스 범위", new_x="LMARGIN", new_y="NEXT")
        pdf._set_font("", 10)
        pdf._set_text_color(COLOR_BLACK)
        pdf.multi_cell(CONTENT_W, 5.5, service_scope)
        pdf.ln(3)

    # Contract period
    period = _safe(data.get("contract_period"))
    start_date = _fmt_date(data.get("contract_start_date"))
    end_date = _fmt_date(data.get("contract_end_date"))
    period_text = period
    if not period_text and start_date and end_date:
        period_text = f"{start_date} ~ {end_date}"
    if period_text:
        pdf._label_value_row("계약기간", period_text)

    # Contract amount
    pdf._label_value_row("계약금액", f"{_fmt_number(data.get('contract_amount'))} 원 (부가세 별도)")
    pdf.ln(3)

    # === Payment terms ===
    payment_terms = _safe(data.get("payment_terms"))
    if payment_terms:
        pdf._section_title("지급 조건")
        pdf._set_font("", 10)
        pdf._set_text_color(COLOR_BLACK)
        pdf.multi_cell(CONTENT_W, 5.5, payment_terms)
        pdf.ln(3)

    # === Special terms ===
    special_terms = _safe(data.get("special_terms"))
    if special_terms:
        pdf._section_title("특약 사항")
        pdf._set_font("", 10)
        pdf._set_text_color(COLOR_BLACK)
        pdf.multi_cell(CONTENT_W, 5.5, special_terms)
        pdf.ln(3)

    # === Signature area ===
    pdf.ln(8)

    # Check if we need a new page for signature area (need ~50mm)
    if pdf.get_y() > 230:
        pdf.add_page()
        pdf.ln(10)

    pdf._set_font("", 10)
    pdf._set_text_color(COLOR_BLACK)
    pdf.cell(CONTENT_W, 7,
             "위 계약 내용에 대해 갑과 을은 상호 합의하에 본 계약을 체결하며,",
             align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(CONTENT_W, 7,
             "각 1부씩 보관한다.",
             align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # Date
    pdf._set_font("", 11)
    pdf.cell(CONTENT_W, 8, contract_date, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)

    # Signature lines - two columns
    sig_col_w = CONTENT_W / 2 - 10
    y_sig = pdf.get_y()

    # 갑 signature
    pdf.set_xy(MARGIN, y_sig)
    pdf._set_font("B", 10)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(sig_col_w, 7, "[ 갑 ]", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(MARGIN)
    pdf._set_font("", 10)
    pdf._set_text_color(COLOR_BLACK)
    pdf.cell(sig_col_w, 7, f"상 호: {_safe(data.get('party_a_name'))}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(MARGIN)
    pdf.cell(sig_col_w, 7, f"대표자: {_safe(data.get('party_a_ceo'))}                (인)", new_x="LMARGIN", new_y="NEXT")

    # 을 signature
    pdf.set_xy(MARGIN + CONTENT_W / 2 + 10, y_sig)
    pdf._set_font("B", 10)
    pdf._set_text_color(COLOR_ACCENT)
    pdf.cell(sig_col_w, 7, "[ 을 ]", new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(MARGIN + CONTENT_W / 2 + 10, pdf.get_y())
    pdf._set_font("", 10)
    pdf._set_text_color(COLOR_BLACK)
    pdf.cell(sig_col_w, 7, f"상 호: {_safe(data.get('party_b_name'), '한결랩')}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(MARGIN + CONTENT_W / 2 + 10, pdf.get_y())
    pdf.cell(sig_col_w, 7, f"대표자: {_safe(data.get('party_b_ceo'), '김경섭')}                (인)", new_x="LMARGIN", new_y="NEXT")

    return pdf.output()
