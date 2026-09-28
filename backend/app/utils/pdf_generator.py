"""
PDF generator for estimates and contracts.
Produces professional Korean-language A4 PDF documents using fpdf2.
"""

import html as html_lib
import re
from datetime import date, datetime
from pathlib import Path
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
        try:
            value = datetime.fromisoformat(value).date()
        except (ValueError, TypeError):
            return value
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return f"{value.year}년 {value.month:02d}월 {value.day:02d}일"
    return str(value)


def _fmt_datetime(value) -> str:
    """Format a datetime as YYYY년 MM월 DD일 HH:MM:SS."""
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except (ValueError, TypeError):
            return value
    if isinstance(value, datetime):
        return (
            f"{value.year}년 {value.month:02d}월 {value.day:02d}일 "
            f"{value.hour:02d}:{value.minute:02d}:{value.second:02d}"
        )
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

    def _space_left(self) -> float:
        """Remaining printable height on the current page."""
        return self.h - self.b_margin - self.get_y()

    def _ensure(self, height: float):
        """Start a new page when the given height does not fit."""
        if self._space_left() < height:
            self.add_page()

    def _line_count(self, text: str, width: float, size: float,
                    style: str = "", lh: float = 5.0) -> int:
        """Number of lines the text wraps to at the given width."""
        self._set_font(style, size)
        lines = self.multi_cell(width, lh, text, dry_run=True, output="LINES")
        return max(1, len(lines))

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
#
# PACMS 관리자 화면의 견적서 PDF 템플릿
# (managed/templates/estimate/estimate_pdf.html)과 동일한 구성으로 출력한다.
# ---------------------------------------------------------------------------

# --- 템플릿(CSS) 색상 ---
E_TEXT = (51, 51, 51)             # #333
E_MUTED = (102, 102, 102)         # #666
E_INFO_BORDER = (221, 221, 221)   # #ddd
E_INFO_TH_BG = (245, 245, 245)    # #f5f5f5
E_ITEM_BORDER = (51, 51, 51)      # #333
E_ITEM_TH_BG = (240, 240, 240)    # #f0f0f0
E_GRAND_BG = (224, 224, 224)      # #e0e0e0
E_DISCOUNT = (220, 53, 69)        # #dc3545
E_NOTES_BG = (249, 249, 249)      # #f9f9f9

# --- 조판 ---
E_BODY = 10
E_LH = 4.5
E_ITEM_FONT = 8
E_ITEM_LH = 3.8

# 견적 내역 컬럼: (제목, 폭 비율, 정렬, 줄바꿈 여부)  — 템플릿 th width 와 동일
ITEM_COLUMNS = [
    ("번호", 0.05, "C", False),
    ("분류", 0.10, "C", True),
    ("항목명", 0.20, "L", True),
    ("규격/사양", 0.25, "L", True),
    ("수량", 0.08, "R", False),
    ("단위", 0.08, "C", False),
    ("단가", 0.12, "R", False),
    ("금액", 0.12, "R", False),
]

# 공급자 정보 (템플릿에 하드코딩되어 있음)
SUPPLIER_NAME = "한결랩"
SUPPLIER_BUSINESS_NUMBER = "328-79-00578"
STAMP_PATH = Path(__file__).resolve().parent.parent / "assets" / "hankyeul_signature.png"


def _fmt_won(value) -> str:
    return f"{_fmt_number(value)}원"


def _fmt_rate(value) -> str:
    """Django DecimalField 출력과 동일하게 소수점 두 자리로 표기 (예: 10.00)."""
    if value is None:
        return "0.00"
    try:
        return f"{float(value):.2f}"
    except (ValueError, TypeError):
        return str(value)


class _EstimatePDF(_KoreanPDF):
    """estimate_pdf.html 의 인쇄 레이아웃을 그대로 옮긴 PDF."""

    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=20)
        # 셀 안쪽 여백은 직접 관리한다 (fpdf 기본 여백까지 더해지면 좁은 칸이 불필요하게 접힌다).
        self.c_margin = 0

    def section_heading(self, title: str):
        """.info-section h2 — 16pt + 하단 2px #666 실선."""
        self._ensure(16)
        self._set_font("B", 13)
        self._set_text_color(E_TEXT)
        self.cell(CONTENT_W, 8, title, new_x="LMARGIN", new_y="NEXT")
        y = self.get_y()
        self._set_draw_color(E_MUTED)
        self.set_line_width(0.5)
        self.line(MARGIN, y, MARGIN + CONTENT_W, y)
        self.set_line_width(0.2)
        self.ln(3)

    def info_row(self, th: str, td: str, th_w: float = 45, min_h: float = 0,
                 stamp: bool = False):
        """.info-table 한 행 (th 회색 배경 + td)."""
        td_w = CONTENT_W - th_w
        pad = 1.6
        n = self._line_count(td, td_w - 2 * pad, E_BODY, lh=E_LH)
        row_h = max(n * E_LH + 2 * pad, min_h)
        self._ensure(row_h)

        y = self.get_y()
        self._set_draw_color(E_INFO_BORDER)
        self._set_fill_color(E_INFO_TH_BG)
        self.rect(MARGIN, y, th_w, row_h, style="FD")
        self.rect(MARGIN + th_w, y, td_w, row_h, style="D")

        self._set_font("B", E_BODY)
        self._set_text_color(E_TEXT)
        self.set_xy(MARGIN + pad + 1, y + pad)
        self.cell(th_w - 2 * pad, row_h - 2 * pad, th)

        self._set_font("", E_BODY)
        self.set_xy(MARGIN + th_w + pad + 1, y + (row_h - n * E_LH) / 2)
        self.multi_cell(td_w - 2 * pad, E_LH, td, align="L",
                        new_x="LMARGIN", new_y="TOP")

        if stamp and STAMP_PATH.exists():
            try:
                size = 13
                self.image(str(STAMP_PATH),
                           x=MARGIN + th_w + pad + 3 + self.get_string_width(td) + 4,
                           y=y + (row_h - size) / 2, w=size, h=size)
            except Exception:      # 도장 이미지가 없어도 견적서는 나와야 한다
                pass

        self.set_y(y + row_h)


def _items_table(pdf: _EstimatePDF, items: list):
    """.items-table — 8열, 페이지가 넘어가면 머리행을 다시 그린다."""
    widths = [round(CONTENT_W * ratio, 2) for _, ratio, _, _ in ITEM_COLUMNS]
    widths[-1] = round(CONTENT_W - sum(widths[:-1]), 2)
    pad = 1.2

    def draw_header():
        pdf._ensure(7 + E_ITEM_LH * 2)
        pdf._set_draw_color(E_ITEM_BORDER)
        pdf._set_fill_color(E_ITEM_TH_BG)
        pdf._set_font("B", E_ITEM_FONT)
        pdf._set_text_color(E_TEXT)
        for (title, _, _, _), w in zip(ITEM_COLUMNS, widths):
            pdf.cell(w, 7, title, border=1, align="C", fill=True, new_x="RIGHT")
        pdf.ln()

    draw_header()

    if not items:
        pdf._set_font("", E_ITEM_FONT)
        pdf.cell(CONTENT_W, 10, "등록된 항목이 없습니다.", border=1, align="C",
                 new_x="LMARGIN", new_y="NEXT")
        pdf.ln(6)
        return

    for idx, item in enumerate(items, 1):
        is_separate = bool(item.get("is_separate"))
        cells = [
            str(idx),
            _safe(item.get("category"), "-"),
            _safe(item.get("name")),
            _safe(item.get("specification"), "-"),
            _fmt_number(item.get("quantity")),
            _safe(item.get("unit")),
            "-" if is_separate else _fmt_won(item.get("unit_price")),
            "별도" if is_separate else _fmt_won(item.get("amount")),
        ]

        pdf._set_font("", E_ITEM_FONT)
        counts = [
            pdf._line_count(text, w - 2 * pad, E_ITEM_FONT, lh=E_ITEM_LH)
            for text, w in zip(cells, widths)
        ]
        row_h = max(counts) * E_ITEM_LH + 2 * pad

        if pdf._space_left() < row_h:
            pdf.add_page()
            draw_header()

        y = pdf.get_y()
        x = MARGIN
        pdf._set_draw_color(E_ITEM_BORDER)
        for (_, _, align, _), w, text, n in zip(ITEM_COLUMNS, widths, cells, counts):
            pdf.rect(x, y, w, row_h, style="D")
            pdf._set_font("", E_ITEM_FONT)
            pdf._set_text_color(E_TEXT)
            pdf.set_xy(x + pad, y + (row_h - n * E_ITEM_LH) / 2)
            pdf.multi_cell(w - 2 * pad, E_ITEM_LH, text, align=align,
                           new_x="LMARGIN", new_y="TOP")
            x += w
        pdf.set_y(y + row_h)

    pdf.ln(6)


def _total_table(pdf: _EstimatePDF, data: dict):
    """.total-section — 우측 절반 폭의 합계 테이블."""
    table_w = CONTENT_W / 2
    th_w = 40
    td_w = table_w - th_w
    x0 = MARGIN + CONTENT_W - table_w
    pad = 1.8

    def row(label: str, value: str, sub: str = "", grand: bool = False,
            color: tuple = E_TEXT):
        size = 12 if grand else E_BODY
        lh = 6 if grand else E_LH
        row_h = lh + 2 * pad + (4.2 if sub else 0)
        pdf._ensure(row_h)
        y = pdf.get_y()

        pdf._set_draw_color(E_ITEM_BORDER)
        if grand:
            pdf._set_fill_color(E_GRAND_BG)
            pdf.rect(x0, y, th_w, row_h, style="FD")
            pdf.rect(x0 + th_w, y, td_w, row_h, style="FD")
        else:
            pdf._set_fill_color(E_ITEM_TH_BG)
            pdf.rect(x0, y, th_w, row_h, style="FD")
            pdf.rect(x0 + th_w, y, td_w, row_h, style="D")

        pdf._set_font("B", size)
        pdf._set_text_color(color)
        pdf.set_xy(x0 + pad + 1, y + pad)
        pdf.cell(th_w - 2 * pad, lh, label)
        if sub:
            pdf._set_font("", 7.5)
            pdf.set_xy(x0 + pad + 1, y + pad + lh - 1)
            pdf.cell(th_w - 2 * pad, 4.2, sub)

        pdf._set_font("B", size)
        pdf._set_text_color(color)
        pdf.set_xy(x0 + th_w + pad, y + pad)
        pdf.cell(td_w - 2 * pad, lh, value, align="R")

        pdf._set_text_color(E_TEXT)
        pdf.set_y(y + row_h)

    separate_count = data.get("separate_item_count") or 0
    has_discount = bool(data.get("discount_type"))

    # 합계 표는 중간에서 끊기지 않게 한 페이지에 모아 그린다.
    # 소계 + 부가세 (+ 할인, 할인 적용 소계) 행 + 총 견적 금액 행
    height = (E_LH + 2 * pad) * (4 if has_discount else 2) + (6 + 2 * pad)
    height += 4.2 if separate_count else 0
    height += 4.2 if (has_discount and data.get("discount_description")) else 0
    pdf._ensure(height)

    row("소계", _fmt_won(data.get("subtotal")),
        sub=f"('별도' 항목 {separate_count}건 제외)" if separate_count else "")

    if has_discount:
        label = "할인"
        if str(data.get("discount_type")) == "1" and data.get("discount_rate") is not None:
            label = f"할인 ({_fmt_rate(data.get('discount_rate'))}%)"
        row(label, f"-{_fmt_won(data.get('discount_amount'))}",
            sub=_safe(data.get("discount_description")), color=E_DISCOUNT)
        row("할인 적용 소계", _fmt_won(data.get("discounted_subtotal")))

    row(f"부가세 ({_fmt_rate(data.get('tax_rate'))}%)", _fmt_won(data.get("tax")))
    row("총 견적 금액", _fmt_won(data.get("total")), grand=True)


def _notes_box(pdf: _EstimatePDF, data: dict):
    """.notes — 지불조건 / 납품조건 / 비고."""
    payment_terms = _safe(data.get("payment_terms"))
    delivery_terms = _safe(data.get("delivery_terms"))
    content_blocks = _linebreak_blocks(data.get("estimate_content"))
    if not (payment_terms or delivery_terms or content_blocks):
        return

    pad = 3.5
    entries = []           # (label, [lines])
    if payment_terms:
        entries.append(("지불조건:", [payment_terms], True))
    if delivery_terms:
        entries.append(("납품조건:", [delivery_terms], True))
    if content_blocks:
        lines = []
        for i, block in enumerate(content_blocks):
            lines.extend(block)
            if i < len(content_blocks) - 1:
                lines.append("")
        entries.append(("비고:", lines, False))

    inner_w = CONTENT_W - 2 * pad
    height = 2 * pad
    for label, lines, inline in entries:
        if inline:
            pdf._set_font("", E_BODY)
            label_w = pdf.get_string_width(label) + 2
            height += pdf._line_count(lines[0], inner_w - label_w, E_BODY, lh=E_LH) * E_LH
        else:
            height += E_LH * (1 + len(lines))
        height += 1.5

    pdf.ln(8)
    pdf._ensure(height + 4)
    y = pdf.get_y()
    pdf._set_fill_color(E_NOTES_BG)
    pdf._set_draw_color(E_INFO_BORDER)
    pdf.rect(MARGIN, y, CONTENT_W, height, style="FD")

    y_line = y + pad
    for label, lines, inline in entries:
        pdf._set_font("B", E_BODY)
        pdf._set_text_color(E_TEXT)
        label_w = pdf.get_string_width(label) + 2
        pdf.set_xy(MARGIN + pad, y_line)
        pdf.cell(label_w, E_LH, label)
        pdf._set_font("", E_BODY)
        if inline:
            pdf.set_xy(MARGIN + pad + label_w, y_line)
            pdf.multi_cell(inner_w - label_w, E_LH, lines[0], align="L",
                           new_x="LMARGIN", new_y="TOP")
            y_line += pdf._line_count(lines[0], inner_w - label_w, E_BODY,
                                      lh=E_LH) * E_LH
        else:
            y_line += E_LH
            for line in lines:
                pdf.set_xy(MARGIN + pad, y_line)
                pdf.cell(inner_w, E_LH, line)
                y_line += E_LH
        y_line += 1.5

    pdf.set_y(y + height)


def generate_estimate_pdf(data: dict) -> bytes:
    """
    Generate estimate PDF from a data dict.

    PACMS `estimate/estimate_pdf.html` 과 동일한 구성으로 출력한다.

    Expected keys:
        estimate_number, title, estimate_type, manager_name,
        estimate_date, validity_period,
        company_name, company_ceo, company_business_number, company_address,
        items: [{category, name, specification, quantity, unit, unit_price,
                 amount, is_separate}],
        subtotal, separate_item_count,
        discount_type, discount_rate, discount_amount, discount_description,
        discounted_subtotal, tax_rate, tax, total,
        payment_terms, delivery_terms, estimate_content
    """
    pdf = _EstimatePDF()
    pdf.add_page()

    # "작성일"/푸터는 견적서의 작성일(estimate_date)을 표시한다. 없으면 PDF 발행(다운로드) 날짜.
    created_at = _fmt_date(data.get("estimate_date")) or _fmt_date(datetime.now())

    # === 헤더 ===
    pdf._set_font("B", 22)
    pdf._set_text_color(E_TEXT)
    pdf.set_char_spacing(4)
    pdf.set_x(MARGIN - 4 * 25.4 / 72 / 2)
    pdf.cell(CONTENT_W, 13, "견 적 서", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_char_spacing(0)
    pdf.ln(1)
    pdf._set_font("", 12)
    pdf._set_text_color(E_MUTED)
    pdf.cell(CONTENT_W, 7, _safe(data.get("estimate_number"), "-"), align="C",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)
    y = pdf.get_y()
    pdf._set_draw_color(E_TEXT)
    pdf.set_line_width(0.8)
    pdf.line(MARGIN, y, MARGIN + CONTENT_W, y)
    pdf.set_line_width(0.2)
    pdf.set_y(y)
    pdf.ln(9)

    # === 고객 정보 ===
    pdf.section_heading("고객 정보")
    pdf.info_row("업체명", _safe(data.get("company_name"), "-"))
    pdf.info_row("대표자", _safe(data.get("company_ceo"), "-"))
    pdf.info_row("사업자번호", _safe(data.get("company_business_number"), "-"))
    pdf.info_row("주소", _safe(data.get("company_address"), "-"))
    pdf.ln(8)

    # === 견적 정보 ===
    pdf.section_heading("견적 정보")
    pdf.info_row("상호명", SUPPLIER_NAME, min_h=16, stamp=True)
    pdf.info_row("사업자번호", SUPPLIER_BUSINESS_NUMBER)
    pdf.info_row("견적서 제목", _safe(data.get("title"), "-"))
    pdf.info_row("견적 유형", _safe(data.get("estimate_type"), "-"))
    pdf.info_row("담당자", _safe(data.get("manager_name"), "-"))
    pdf.info_row("작성일", created_at)
    pdf.info_row("유효기간", _fmt_date(data.get("validity_period")) or "-")
    contract_date = _fmt_date(data.get("contract_date"))
    contract_end_date = _fmt_date(data.get("contract_end_date"))
    if contract_date or contract_end_date:
        pdf.info_row(
            "계약정보",
            f"{contract_date or '-'} ~ {contract_end_date or '-'}",
        )
    pdf.ln(8)

    # === 견적 내역 ===
    pdf.section_heading("견적 내역")
    _items_table(pdf, data.get("items", []))

    # === 합계 ===
    _total_table(pdf, data)

    # === 비고 ===
    _notes_box(pdf, data)

    # === 푸터 ===
    pdf.ln(12)
    pdf._ensure(16)
    y = pdf.get_y()
    pdf._set_draw_color(E_INFO_BORDER)
    pdf.line(MARGIN, y, MARGIN + CONTENT_W, y)
    pdf.ln(5)
    pdf._set_font("", 8.5)
    pdf._set_text_color(E_MUTED)
    pdf.cell(CONTENT_W, 5, f"본 견적서는 {created_at}에 작성되었습니다.", align="C",
             new_x="LMARGIN", new_y="NEXT")
    pdf.cell(CONTENT_W, 5, "감사합니다.", align="C", new_x="LMARGIN", new_y="NEXT")

    return pdf.output()


# ---------------------------------------------------------------------------
# Contract PDF
#
# PACMS 관리자 화면의 계약서 미리보기 템플릿
# (managed/templates/contract/contract_preview.html)과 동일한 구성/문구로
# 출력한다. 조문 번호는 템플릿과 같은 규칙으로 자동 증가한다.
# ---------------------------------------------------------------------------

# --- 템플릿(CSS) 색상 ---
C_TEXT = (51, 51, 51)             # #333
C_SUBTITLE = (102, 102, 102)      # #666
C_NUMBER = (153, 153, 153)        # #999
C_PARTIES_BG = (249, 249, 249)    # #f9f9f9
C_INTRO_BG = (245, 245, 245)      # #f5f5f5
C_ARTICLE_BG = (233, 236, 239)    # #e9ecef
C_ARTICLE_BAR = (73, 80, 87)      # #495057
C_BORDER = (221, 221, 221)        # #ddd
C_TH_BG = (245, 245, 245)         # #f5f5f5
C_AMOUNT = (0, 102, 204)          # #0066cc
C_SPECIAL_BORDER = (23, 162, 184) # #17a2b8
C_SPECIAL_BG = (232, 244, 248)    # #e8f4f8
C_STAMP_BORDER = (204, 204, 204)  # #ccc
C_STAMP_BG = (249, 249, 249)      # #f9f9f9
C_STAMP_LABEL = (85, 85, 85)      # #555

# --- 본문 조판 ---
BODY_SIZE = 10
BODY_LH = 5.8                     # line-height 1.8 상당
ART_TITLE_H = 8.5
INDENT = 6                        # .article-content padding-left: 20px
SUB_INDENT = 6                    # .sub-item padding-left: 20px

# 프로젝트 유형 코드 → 명칭 (managed.views.contract_preview 와 동일)
PROJECT_TYPE_NAMES = {
    "1": "웹사이트 제작",
    "2": "모바일앱 개발",
    "3": "웹앱 개발",
    "4": "웹사이트+모바일앱 개발",
    "5": "도메인 등록/관리",
    "6": "보안서버(SSL) 설치",
    "7": "쇼핑몰 구축",
    "8": "운영 대행",
    "9": "유지보수",
    "10": "서버관리",
    "11": "서버마이그레이션",
}

# 저작권 조항이 붙는 유형 (제작/개발 계약)
DEV_TYPES = {"1", "2", "3", "4", "7"}

BANK_ACCOUNT = "하나은행 342-910478-82907 (예금주: 김경섭 - 한결랩)"


# --- 텍스트 처리 -----------------------------------------------------------

_RE_BR = re.compile(r"<br\s*/?>", re.I)
_RE_P_CLOSE = re.compile(r"</p\s*>", re.I)
_RE_P_OPEN = re.compile(r"<p[^>]*>", re.I)
_RE_TAG = re.compile(r"<[^>]+>")


def _html_to_text(value) -> str:
    """DB에 HTML로 저장된 본문을 평문으로 변환한다 (<br> → 줄바꿈, </p> → 빈 줄)."""
    if value is None:
        return ""
    s = str(value)
    s = _RE_BR.sub("\n", s)
    s = _RE_P_CLOSE.sub("\n\n", s)
    s = _RE_P_OPEN.sub("", s)
    s = _RE_TAG.sub("", s)
    s = html_lib.unescape(s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def _linebreak_blocks(value) -> list:
    """
    Django `|linebreaks` 필터와 동일하게 문단을 나눈다.
    빈 줄 = 문단 구분, 단일 개행 = 문단 내 줄바꿈.
    반환값: [[line, line, ...], ...]
    """
    text = _html_to_text(value)
    if not text:
        return []
    blocks = []
    for raw in re.split(r"\n\s*\n", text):
        lines = [line.strip() for line in raw.split("\n")]
        lines = [line for line in lines if line]
        if lines:
            blocks.append(lines)
    return blocks


def _fmt_date_ko(value) -> str:
    """템플릿의 `|date:"Y년 m월 d일"` 과 동일한 형식."""
    return _fmt_date(value)


def _fmt_dt_iso(value) -> str:
    """템플릿의 `|date:"Y-m-d H:i:s"` 과 동일한 형식."""
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except (ValueError, TypeError):
            return value
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d 00:00:00")
    return str(value)


# --- 계약서 전용 PDF -------------------------------------------------------

class _ContractPDF(_KoreanPDF):
    """contract_preview.html 의 인쇄 레이아웃을 그대로 옮긴 PDF."""

    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=20)

    # 여백/페이지 -------------------------------------------------------

    def space_left(self) -> float:
        return self.h - self.b_margin - self.get_y()

    def ensure(self, height: float):
        """남은 공간이 부족하면 새 페이지로 넘긴다."""
        if self.space_left() < height:
            self.add_page()

    def line_count(self, text: str, width: float, size: float, style: str = "") -> int:
        self._set_font(style, size)
        lines = self.multi_cell(width, BODY_LH, text, dry_run=True, output="LINES")
        return max(1, len(lines))

    # 블록 요소 ---------------------------------------------------------

    def para(self, text: str, indent: float = 0, size: float = BODY_SIZE,
             style: str = "", color: tuple = C_TEXT, align: str = "L",
             lh: float = BODY_LH):
        self.ensure(lh)
        self._set_font(style, size)
        self._set_text_color(color)
        self.set_x(MARGIN + indent)
        self.multi_cell(CONTENT_W - indent, lh, text, align=align,
                        new_x="LMARGIN", new_y="NEXT")

    def blocks(self, blocks: list, indent: float = 0):
        """`|linebreaks` 결과(문단 목록)를 출력한다."""
        for i, lines in enumerate(blocks):
            for line in lines:
                self.para(line, indent=indent)
            if i < len(blocks) - 1:
                self.ln(2.5)

    def article_title(self, title: str):
        self.ensure(ART_TITLE_H + BODY_LH * 2 + 4)
        y = self.get_y()
        self._set_fill_color(C_ARTICLE_BG)
        self.rect(MARGIN, y, CONTENT_W, ART_TITLE_H, style="F")
        self._set_fill_color(C_ARTICLE_BAR)
        self.rect(MARGIN, y, 1.4, ART_TITLE_H, style="F")   # border-left: 4px solid #495057
        self._set_font("B", 11)
        self._set_text_color(C_TEXT)
        self.set_xy(MARGIN + 4.5, y)
        self.cell(CONTENT_W - 4.5, ART_TITLE_H, title, new_x="LMARGIN", new_y="NEXT")
        self.set_y(y + ART_TITLE_H)
        self.ln(3)

    def amount_table(self, rows: list, indent: float = INDENT):
        """
        .amount-table 재현.
        rows: [(th, td, is_amount)]
        """
        th_w = 40
        table_w = CONTENT_W - indent
        td_w = table_w - th_w
        pad = 1.6

        for th, td, is_amount in rows:
            n = self.line_count(td, td_w - 2 * pad, BODY_SIZE,
                                "B" if is_amount else "")
            row_h = n * BODY_LH + 2 * pad
            self.ensure(row_h)
            y = self.get_y()
            x = MARGIN + indent

            self._set_draw_color(C_BORDER)
            self._set_fill_color(C_TH_BG)
            self.rect(x, y, th_w, row_h, style="FD")
            self.rect(x + th_w, y, td_w, row_h, style="D")

            self._set_font("", BODY_SIZE)
            self._set_text_color(C_TEXT)
            self.set_xy(x + pad, y + pad)
            self.cell(th_w - 2 * pad, row_h - 2 * pad, th)

            self._set_font("B" if is_amount else "", BODY_SIZE)
            self._set_text_color(C_AMOUNT if is_amount else C_TEXT)
            self.set_xy(x + th_w + pad, y + pad)
            self.multi_cell(td_w - 2 * pad, BODY_LH, td,
                            align="R" if is_amount else "L",
                            new_x="LMARGIN", new_y="TOP")

            self.set_y(y + row_h)
        self._set_text_color(C_TEXT)
        self.ln(3)


def _party_type_purpose(project_type: Optional[str]) -> str:
    """제1조 (계약의 목적) 유형별 문구."""
    if project_type in ("1", "7"):
        shop = "(쇼핑몰)" if project_type == "7" else ""
        return (f'본 계약은 "을"이 "갑"에게 웹사이트{shop} 제작 서비스를 제공하고, '
                '"갑"이 그 대가를 지급함에 있어 필요한 사항을 정함을 목적으로 한다.')
    texts = {
        "2": "모바일 애플리케이션 개발 서비스를 제공하고",
        "3": "웹 애플리케이션 개발 서비스를 제공하고",
        "4": "웹사이트 및 모바일 애플리케이션 통합 개발 서비스를 제공하고",
        "5": "도메인 등록 및 관리 서비스를 제공하고",
        "6": "SSL 보안서버 인증서 발급 및 설치 서비스를 제공하고",
        "9": "웹사이트/시스템 유지보수 서비스를 제공하고",
        "10": "서버 관리 및 모니터링 서비스를 제공하고",
        "11": "서버 마이그레이션(이전) 서비스를 제공하고",
    }
    if project_type == "8":
        return ('본 계약은 "을"이 "갑"의 웹사이트/시스템 운영 대행 서비스를 제공하고, '
                '"갑"이 그 대가를 지급함에 있어 필요한 사항을 정함을 목적으로 한다.')
    body = texts.get(project_type, "IT 서비스를 제공하고")
    return (f'본 계약은 "을"이 "갑"에게 {body}, '
            '"갑"이 그 대가를 지급함에 있어 필요한 사항을 정함을 목적으로 한다.')


def _default_service_items(project_type: Optional[str]) -> list:
    """제2조 (서비스 내용) 기본 항목 (project_description 이 없을 때)."""
    if project_type in ("1", "7"):
        items = [
            "1. 웹사이트 기획 및 디자인",
            "2. 웹사이트 개발 및 구축",
            "3. 서버 설정 및 도메인 연결",
            "4. 관리자 교육 및 매뉴얼 제공",
        ]
        if project_type == "7":
            items.append("5. 쇼핑몰 기능 구현 (상품관리, 주문관리, 결제연동 등)")
        return items
    if project_type == "2":
        return [
            "1. 모바일 앱 기획 및 UI/UX 디자인",
            "2. iOS/Android 앱 개발",
            "3. 스토어 등록 지원",
            "4. 사용자 교육 및 매뉴얼 제공",
        ]
    if project_type == "9":
        return [
            "1. 웹사이트/시스템 정기 점검",
            "2. 콘텐츠 수정 및 업데이트",
            "3. 오류 수정 및 기술 지원",
            "4. 보안 업데이트",
        ]
    if project_type == "10":
        return [
            "1. 서버 모니터링 및 관리",
            "2. 백업 관리",
            "3. 보안 관리",
            "4. 장애 대응",
        ]
    return [
        "1. 계약에 명시된 서비스 제공",
        "2. 기술 지원 및 상담",
    ]


def _default_payment_items(project_type: Optional[str]) -> list:
    """제N조 (대금 지급) 기본 항목 (payment_terms 가 없을 때)."""
    if project_type in DEV_TYPES:
        return [
            "1. 계약금: 계약 체결 시 총 계약금액의 50%",
            "2. 잔금: 최종 납품 완료 후 7일 이내 50%",
        ]
    if project_type in ("8", "9", "10"):
        return [
            "1. 월 정액 요금제: 매월 정해진 금액을 익월 10일까지 지급",
            "2. 연간 선납 시 1개월 요금 할인 적용",
        ]
    return ["1. 계약 체결 시 전액 지급"]


def generate_contract_pdf(data: dict) -> bytes:
    """
    Generate contract PDF from a data dict.

    PACMS `contract/contract_preview.html` 과 동일한 조문 구성/문구로 출력한다.

    Expected keys match EstimateContract model fields:
        project_type (견적서의 프로젝트 유형 코드), maintenance_point,
        contract_number, contract_title, contract_date,
        party_a_name, party_a_ceo, party_a_business_number, party_a_address, party_a_email,
        party_b_name, party_b_ceo, party_b_business_number, party_b_address, party_b_email,
        project_description, service_scope, contract_period,
        contract_start_date, contract_end_date,
        contract_amount, payment_terms, special_terms,
        customer_signed_* / manager_signed_*
    """
    pdf = _ContractPDF()
    pdf.add_page()

    project_type = data.get("project_type")
    project_type = str(project_type) if project_type not in (None, "") else None
    contract_type_name = PROJECT_TYPE_NAMES.get(project_type, "IT 서비스")

    party_a_name = _safe(data.get("party_a_name"))
    party_a_ceo = _safe(data.get("party_a_ceo"))
    party_b_name = _safe(data.get("party_b_name"), "한결랩")
    party_b_ceo = _safe(data.get("party_b_ceo"), "김경섭")

    service_scope = _safe(data.get("service_scope"))
    maintenance_point = data.get("maintenance_point")
    contract_date = _fmt_date_ko(data.get("contract_date"))

    # === 계약서 헤더 ===
    pdf._set_font("B", 20)
    pdf._set_text_color(C_TEXT)
    pdf.set_char_spacing(6)
    # 마지막 글자 뒤의 자간까지 폭에 포함되므로 그만큼 왼쪽으로 보정한다.
    pdf.set_x(MARGIN - 6 * 25.4 / 72 / 2)
    pdf.cell(CONTENT_W, 12, f"{contract_type_name} 계약서", align="C",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_char_spacing(0)
    pdf.ln(1)

    contract_title = _safe(data.get("contract_title"))
    if contract_title:
        pdf.para(contract_title, size=12, color=C_SUBTITLE, align="C", lh=6.5)
    pdf.ln(1)
    pdf.para(f"계약번호: {_safe(data.get('contract_number'), '-')}",
             size=9, color=C_NUMBER, align="C", lh=5)

    # border-bottom: 3px double #333
    pdf.ln(3)
    y = pdf.get_y()
    pdf._set_draw_color(C_TEXT)
    pdf.set_line_width(0.3)
    pdf.line(MARGIN, y, MARGIN + CONTENT_W, y)
    pdf.line(MARGIN, y + 1, MARGIN + CONTENT_W, y + 1)
    pdf.set_line_width(0.2)
    pdf.set_y(y + 1)
    pdf.ln(8)

    # === 당사자 정보 ===
    box_pad = 4
    box_h = box_pad * 2 + BODY_LH * 2 + 2
    pdf.ensure(box_h + 6)
    y = pdf.get_y()
    pdf._set_fill_color(C_PARTIES_BG)
    pdf.rect(MARGIN, y, CONTENT_W, box_h, style="F", round_corners=True,
             corner_radius=1.5)

    y_row = y + box_pad
    for label, name, ceo in (('"갑"', party_a_name, party_a_ceo),
                             ('"을"', party_b_name, party_b_ceo)):
        pdf.set_xy(MARGIN + box_pad, y_row)
        pdf._set_font("B", 11)
        pdf._set_text_color(C_TEXT)
        pdf.cell(14, BODY_LH, label)
        pdf._set_font("B", BODY_SIZE)
        pdf.cell(pdf.get_string_width(name) + 8, BODY_LH, name)
        pdf._set_font("", BODY_SIZE)
        pdf.cell(60, BODY_LH, f"대표: {ceo}")
        y_row += BODY_LH + 2

    pdf.set_y(y + box_h)
    pdf.ln(7)

    # === 계약 본문: 도입부 ===
    intro = (f'"갑"과 "을"은 상호 신의성실의 원칙에 따라 아래와 같이 '
             f'{contract_type_name} 계약을 체결한다.')
    n_lines = pdf.line_count(intro, CONTENT_W - 8, BODY_SIZE)
    intro_h = n_lines * BODY_LH + 7
    pdf.ensure(intro_h + 6)
    y = pdf.get_y()
    pdf._set_fill_color(C_INTRO_BG)
    pdf.rect(MARGIN, y, CONTENT_W, intro_h, style="F", round_corners=True,
             corner_radius=1.5)
    pdf.set_xy(MARGIN + 4, y + 3.5)
    pdf._set_font("", BODY_SIZE)
    pdf._set_text_color(C_TEXT)
    pdf.multi_cell(CONTENT_W - 8, BODY_LH, intro, align="C",
                   new_x="LMARGIN", new_y="NEXT")
    pdf.set_y(y + intro_h)
    pdf.ln(7)

    # === 조문 ===
    article_no = 0

    def next_no() -> int:
        nonlocal article_no
        article_no += 1
        return article_no

    # 제1조 (계약의 목적)
    pdf.article_title(f"제{next_no()}조 (계약의 목적)")
    pdf.para(_party_type_purpose(project_type), indent=INDENT)
    pdf.ln(5)

    # 제2조 (서비스 내용)
    pdf.article_title(f"제{next_no()}조 (서비스 내용)")
    desc_blocks = _linebreak_blocks(data.get("project_description"))
    if desc_blocks:
        pdf.blocks(desc_blocks, indent=INDENT)
    else:
        pdf.para('"을"이 "갑"에게 제공하는 서비스의 내용은 다음과 같다.', indent=INDENT)
        for item in _default_service_items(project_type):
            pdf.para(item, indent=INDENT + SUB_INDENT)
    pdf.ln(5)

    # 제3조 (서비스 범위) — service_scope 가 있을 때만
    if service_scope:
        pdf.article_title(f"제{next_no()}조 (서비스 범위)")
        pdf.blocks(_linebreak_blocks(service_scope), indent=INDENT)
        pdf.ln(5)

    # 제N조 (계약 기간)
    pdf.article_title(f"제{next_no()}조 (계약 기간)")
    period_rows = [("계약일", contract_date, False)]
    start_date = _fmt_date_ko(data.get("contract_start_date"))
    end_date = _fmt_date_ko(data.get("contract_end_date"))
    period = _safe(data.get("contract_period"))
    if start_date and end_date:
        text = f"{start_date} ~ {end_date}"
        if period:
            text += f" ({period})"
        period_rows.append(("계약 기간", text, False))
    elif period:
        period_rows.append(("계약 기간", period, False))
    pdf.amount_table(period_rows)
    if project_type in ("9", "10"):
        pdf.para("* 본 계약은 계약 종료일 1개월 전까지 서면으로 해지 의사를 통보하지 않는 한 "
                 "동일 조건으로 1년간 자동 연장된다.",
                 indent=INDENT + SUB_INDENT)
    pdf.ln(5)

    # 제N조 (계약 금액)
    pdf.article_title(f"제{next_no()}조 (계약 금액)")
    amount_rows = [("계약 금액", f"{_fmt_number(data.get('contract_amount'))}원 (부가세 포함)", True)]
    if maintenance_point:
        amount_rows.append(("유지보수 포인트", f"월 {maintenance_point}P", False))
    pdf.amount_table(amount_rows)
    pdf.ln(5)

    # 제N조 (대금 지급)
    pdf.article_title(f"제{next_no()}조 (대금 지급)")
    payment_blocks = _linebreak_blocks(data.get("payment_terms"))
    if payment_blocks:
        pdf.blocks(payment_blocks, indent=INDENT)
    else:
        for item in _default_payment_items(project_type):
            pdf.para(item, indent=INDENT + SUB_INDENT)
    pdf.ln(2)
    pdf.ensure(BODY_LH)
    pdf._set_font("B", BODY_SIZE)
    pdf._set_text_color(C_TEXT)
    pdf.set_x(MARGIN + INDENT)
    pdf.cell(pdf.get_string_width("입금 계좌:") + 2, BODY_LH, "입금 계좌:")
    pdf._set_font("", BODY_SIZE)
    pdf.multi_cell(0, BODY_LH, f" {BANK_ACCOUNT}", align="L",
                   new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    # 유지보수 포인트 정책 (유지보수 계약 + 포인트가 있을 때)
    if project_type == "9" and maintenance_point:
        policy_items = [
            f"1. 월간 제공 포인트: {maintenance_point}P",
            "2. 6개월 기간 포인트 누적 및 선사용이 가능합니다.",
            "3. 포인트 초과 사용 시 별도 협의 후 추가 비용이 발생합니다.",
            "4. 포인트 사용 내역은 매월 말 리포트로 제공됩니다.",
        ]
        box_h = 6 + BODY_LH * (len(policy_items) + 1) + 6
        pdf.ensure(box_h + 6)
        y = pdf.get_y()
        pdf._set_fill_color(C_SPECIAL_BG)
        pdf._set_draw_color(C_SPECIAL_BORDER)
        pdf.set_line_width(0.6)
        pdf.rect(MARGIN, y, CONTENT_W, box_h, style="FD", round_corners=True,
                 corner_radius=1.5)
        pdf.set_line_width(0.2)
        pdf.set_xy(MARGIN + 4, y + 4)
        pdf._set_font("B", 10.5)
        pdf._set_text_color(C_SPECIAL_BORDER)
        pdf.cell(CONTENT_W - 8, BODY_LH, "유지보수 포인트 정책",
                 new_x="LMARGIN", new_y="NEXT")
        pdf._set_font("", BODY_SIZE)
        pdf._set_text_color(C_TEXT)
        y_item = y + 4 + BODY_LH + 2
        for item in policy_items:
            pdf.set_xy(MARGIN + 4 + SUB_INDENT, y_item)
            pdf.cell(CONTENT_W - 8 - SUB_INDENT, BODY_LH, item)
            y_item += BODY_LH
        pdf.set_y(y + box_h)
        pdf.ln(6)

    # 제N조 (저작권 및 지적재산권) — 제작/개발 유형만
    if project_type in DEV_TYPES:
        pdf.article_title(f"제{next_no()}조 (저작권 및 지적재산권)")
        for item in [
            '1. "을"이 개발한 결과물의 저작권은 계약금액 전액 지급 완료 시 "갑"에게 양도된다.',
            '2. 단, "을"이 기존에 보유한 소스코드, 라이브러리, 프레임워크의 권리는 "을"에게 귀속된다.',
            '3. "갑"은 납품받은 결과물을 자유롭게 사용, 수정, 배포할 수 있다.',
        ]:
            pdf.para(item, indent=INDENT + SUB_INDENT)
        pdf.ln(5)

    # 제N조 (비밀유지)
    pdf.article_title(f"제{next_no()}조 (비밀유지)")
    for item in [
        '1. "갑"과 "을"은 본 계약의 이행과정에서 알게 된 상대방의 영업비밀을 제3자에게 '
        '누설하거나 본 계약의 목적 외의 용도로 사용하지 아니한다.',
        "2. 본 조의 의무는 계약 종료 후 3년간 유효하다.",
    ]:
        pdf.para(item, indent=INDENT + SUB_INDENT)
    pdf.ln(5)

    # 제N조 (계약 해지)
    pdf.article_title(f"제{next_no()}조 (계약 해지)")
    for item in [
        "1. 당사자 일방이 본 계약을 위반한 경우, 상대방은 서면 통지로써 본 계약을 해지할 수 있다.",
        '2. "갑"의 사정으로 계약이 해지되는 경우, 기 지급된 금액의 반환 여부는 진행 상황에 따라 협의한다.',
        '3. "을"의 귀책사유로 계약이 해지되는 경우, "을"은 기 수령한 금액 중 미이행 부분에 '
        '해당하는 금액을 반환한다. 단, 이미 이행이 완료된 부분에 대한 대가는 반환 대상에서 제외한다.',
    ]:
        pdf.para(item, indent=INDENT + SUB_INDENT)
    pdf.ln(5)

    # 특약사항
    special_blocks = _linebreak_blocks(data.get("special_terms"))
    if special_blocks:
        pdf.article_title("특약사항")
        pdf.blocks(special_blocks, indent=INDENT)
        pdf.ln(5)

    # 일반조항
    pdf.article_title("일반조항")
    for item in [
        "1. 본 계약에 명시되지 않은 사항은 상관례 및 관계 법령에 따른다.",
        '2. 본 계약과 관련하여 분쟁이 발생한 경우, "을"의 본사 소재지 관할 법원을 합의 관할법원으로 한다.',
        "3. 본 계약의 효력은 계약일로부터 발생한다.",
    ]:
        pdf.para(item, indent=INDENT + SUB_INDENT)

    # === 서명 섹션 ===
    _render_signature_section(pdf, data, contract_date, party_a_name, party_a_ceo,
                              party_b_name, party_b_ceo)

    # === 전자서명 타임스탬프 인증 ===
    _render_timestamp_block(pdf, data)

    return pdf.output()


def _render_signature_section(pdf: _ContractPDF, data: dict, contract_date: str,
                              party_a_name: str, party_a_ceo: str,
                              party_b_name: str, party_b_ceo: str):
    """.signature-section (page-break-inside: avoid) 재현."""
    box_w = (CONTENT_W - 8) / 2
    pad = 4
    inner_w = box_w - 2 * pad

    signed_name = _safe(data.get("customer_signed_name"))
    signed_at = _fmt_dt_iso(data.get("customer_signed_at"))
    manager_name = _safe(data.get("manager_signed_name"))
    manager_at = _fmt_dt_iso(data.get("manager_signed_at"))

    a_fields = [
        ("상호:", party_a_name),
        ("대표:", party_a_ceo),
        ("사업자번호:", _safe(data.get("party_a_business_number"), "-")),
        ("주소:", _safe(data.get("party_a_address"), "-")),
    ]
    b_fields = [
        ("상호:", party_b_name),
        ("대표:", party_b_ceo),
        ("사업자번호:", _safe(data.get("party_b_business_number"), "328-79-00578")),
        ("주소:", _safe(data.get("party_b_address"),
                       "경기도 고양시 일산서구 고양대로 666 101-603")),
    ]

    if signed_name:
        a_sign = f"{signed_name}  (전자서명: {signed_at})"
    else:
        a_sign = "(인)"
    if manager_name:
        b_sign = f"{manager_name}  (전자서명: {manager_at})"
    else:
        b_sign = f"{party_b_ceo}  (인)"

    def label_width(label: str) -> float:
        """라벨(볼드) 폭 — 값이 줄바꿈되는 폭을 계산할 때와 그릴 때 동일하게 쓴다."""
        pdf._set_font("B", BODY_SIZE)
        return pdf.get_string_width(label) + 1.5

    def value_height(label: str, value: str) -> float:
        return pdf.line_count(value, inner_w - label_width(label), BODY_SIZE) * BODY_LH

    def box_height(fields, sign_text):
        h = pad + 7 + 3            # h4 + 밑줄
        for label, value in fields:
            h += value_height(label, value)
        h += 5                     # .signature-line margin-top
        h += value_height("서명:", sign_text)
        h += pad + 2
        return h

    h_box = max(box_height(a_fields, a_sign), box_height(b_fields, b_sign))

    # 서명 날짜 + 박스가 한 페이지에 들어가도록
    needed = 10 + 10 + h_box + 4
    pdf.ln(14)
    pdf.ensure(needed)

    pdf._set_font("", 12)
    pdf._set_text_color(C_TEXT)
    pdf.cell(CONTENT_W, 9, contract_date, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(8)

    y_top = pdf.get_y()

    def draw_box(x: float, title: str, fields: list, sign_text: str):
        pdf._set_draw_color(C_BORDER)
        pdf.rect(x, y_top, box_w, h_box, style="D", round_corners=True,
                 corner_radius=1.5)

        y = y_top + pad
        pdf.set_xy(x + pad, y)
        pdf._set_font("B", 12)
        pdf._set_text_color(C_TEXT)
        pdf.cell(inner_w, 7, title)
        y += 7
        pdf._set_draw_color(C_BORDER)
        pdf.line(x + pad, y + 1, x + box_w - pad, y + 1)
        y += 3

        for label, value in fields:
            label_w = label_width(label)
            pdf.set_xy(x + pad, y)
            pdf._set_font("B", BODY_SIZE)
            pdf.cell(label_w, BODY_LH, label)
            pdf._set_font("", BODY_SIZE)
            pdf.set_xy(x + pad + label_w, y)
            pdf.multi_cell(inner_w - label_w, BODY_LH, value, align="L",
                           new_x="LMARGIN", new_y="NEXT")
            y += value_height(label, value)

        y += 5
        sign_label_w = label_width("서명:")
        pdf.set_xy(x + pad, y)
        pdf._set_font("B", BODY_SIZE)
        pdf.cell(sign_label_w, BODY_LH, "서명:")
        pdf._set_font("", BODY_SIZE)
        pdf.set_xy(x + pad + sign_label_w, y)
        pdf.multi_cell(inner_w - sign_label_w, BODY_LH, sign_text, align="L",
                       new_x="LMARGIN", new_y="NEXT")

    draw_box(MARGIN, '"갑" (고객사)', a_fields, a_sign)
    draw_box(MARGIN + box_w + 8, f'"을" ({party_b_name})', b_fields, b_sign)

    pdf.set_y(y_top + h_box)


def _render_timestamp_block(pdf: _ContractPDF, data: dict):
    """전자서명 타임스탬프 인증 박스 (서명 해시가 있을 때만)."""
    customer_hash = _safe(data.get("customer_signed_hash"))
    manager_hash = _safe(data.get("manager_signed_hash"))
    if not customer_hash and not manager_hash:
        return

    entries = []
    if customer_hash:
        entries.append((
            "▶ 갑(고객사) 서명",
            customer_hash,
            _fmt_dt_iso(data.get("customer_signed_at")),
            _safe(data.get("customer_signed_name")),
            _safe(data.get("customer_signed_ip"), "-"),
        ))
    if manager_hash:
        entries.append((
            "▶ 을(한결랩) 서명",
            manager_hash,
            _fmt_dt_iso(data.get("manager_signed_at")),
            _safe(data.get("manager_signed_name")),
            _safe(data.get("manager_signed_ip"), "-"),
        ))

    lh = 4.6
    pad = 3.5
    box_h = pad * 2 + lh + 2 + len(entries) * (lh * 4 + 2)
    pdf.ln(10)
    pdf.ensure(box_h + 4)

    y = pdf.get_y()
    pdf._set_fill_color(C_STAMP_BG)
    pdf._set_draw_color(C_STAMP_BORDER)
    pdf.rect(MARGIN, y, CONTENT_W, box_h, style="FD", round_corners=True,
             corner_radius=1.5)

    y_line = y + pad
    pdf.set_xy(MARGIN + pad, y_line)
    pdf._set_font("B", 9)
    pdf._set_text_color(C_TEXT)
    pdf.cell(CONTENT_W - 2 * pad, lh, "전자서명 타임스탬프 인증")
    y_line += lh + 2

    for title, hash_value, signed_at, signer, ip in entries:
        pdf.set_xy(MARGIN + pad, y_line)
        pdf._set_font("B", 8.5)
        pdf._set_text_color(C_STAMP_LABEL)
        pdf.cell(CONTENT_W - 2 * pad, lh, title)
        y_line += lh

        pdf._set_font("", 8.5)
        pdf._set_text_color(C_SUBTITLE)
        for text in (
            f"인증 해시: {hash_value}",
            f"서명 일시: {signed_at} (KST)",
            f"서명자: {signer} | IP: {ip}",
        ):
            pdf.set_xy(MARGIN + pad, y_line)
            pdf.cell(CONTENT_W - 2 * pad, lh, text)
            y_line += lh
        y_line += 2

    pdf.set_y(y + box_h)
    pdf._set_text_color(COLOR_BLACK)
