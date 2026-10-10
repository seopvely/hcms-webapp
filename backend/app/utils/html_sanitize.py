"""HTML 허용목록 정화 (저장형 XSS 방지). 요청·댓글·문의 등 사용자 입력 HTML 을 저장·표시 전에 거친다."""
import re

import nh3

_TAGS = {
    "p", "br", "hr", "div", "span", "strong", "b", "em", "i", "u", "s", "strike", "del", "sub", "sup",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
    "ul", "ol", "li", "a", "img", "table", "thead", "tbody", "tr", "th", "td", "font",
}
_ATTRIBUTES = {
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "width", "height"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
    "font": {"color"},
    "*": {"style"},
}
_URL_SCHEMES = {"http", "https", "mailto", "tel", "data"}


def sanitize_html(value: str | None) -> str:
    if not value:
        return ""
    return nh3.clean(
        value,
        tags=_TAGS,
        attributes=_ATTRIBUTES,
        url_schemes=_URL_SCHEMES,
        link_rel="noopener noreferrer",
    )


def html_to_text(value: str | None, limit: int | None = None) -> str:
    """목록 요약용 평문. 태그를 모두 지우고 공백을 정리한다."""
    # 블록 경계가 붙어 버리지 않게 공백을 먼저 넣는다
    spaced = re.sub(r"<(br|/p|/div|/li|/h[1-6]|/tr|/td)\b[^>]*>", " ", value or "", flags=re.I)
    text = nh3.clean(spaced, tags=set())
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        return text[:limit] + "…"
    return text
