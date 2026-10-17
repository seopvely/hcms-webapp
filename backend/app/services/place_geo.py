"""미팅 장소 AI 찾기 — `claude -p` 웹검색 + Nominatim 좌표 보완(cms managed/naver_utils.py 를 줄여 옮김, SPEC 06 §3).

- ① 네이버 통합검색 페이지에 박힌 플레이스 결과(이름·도로명주소·x/y)를 먼저 쓴다 — 정확하고 1초 남짓. 키 없이 화면 HTML 을 읽는
  방식이라 네이버가 구조를 바꾸면 조용히 0건이 되고 ②로 넘어간다.
- ② 없으면 claude 가 웹검색으로 장소 후보(이름·주소·좌표·출처)를 JSON 배열로 돌려준다. claude WebSearch 는 한국 지역 업체를
  거의 못 찾아서(예: "더비앙" → 영국 Derby) 네이버 검색 결과 본문을 프롬프트 문맥으로 함께 넘긴다. 실행은 api/endpoints/managed/ai.py 의 작업 큐.
- claude 는 좌표를 null 로 주는 경우가 많아 주소로 Nominatim(OpenStreetMap) 지오코딩해 채운다(이용정책: 1초 1요청).
- 좌표를 못 채운 후보도 주소가 있으면 돌려준다(화면에서 주소만 채움).
"""
import html
import json
import logging
import re
import threading
import time
import urllib.request
from urllib.parse import urlencode

from app.services import claude_cli

logger = logging.getLogger(__name__)

TOOLS = ["WebSearch", "WebFetch"]
LIMIT = 5

NAVER_SEARCH_URL = "https://search.naver.com/search.naver"
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
NAVER_CONTEXT_MAX = 6000  # claude 에 넘길 검색 결과 본문 길이

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_UA = "HCMS-meeting/1.0 (kks@hankyeul.com)"
NOMINATIM_TIMEOUT = 10
NOMINATIM_MIN_INTERVAL = 1.1
_nominatim_lock = threading.Lock()
_nominatim_last = 0.0

# 대한민국 좌표 범위
LAT_MIN, LAT_MAX = 33.0, 39.0
LNG_MIN, LNG_MAX = 124.0, 132.0

_TAG_RE = re.compile(r"<[^>]+>")
_PAREN_RE = re.compile(r"\([^)]*\)")
_ROAD_PREFIX_RE = re.compile(r"^(.*?(?:로|길)\s*\d+(?:-\d+)?)(?=[\s,]|$)")
_JIBUN_PREFIX_RE = re.compile(r"^(.*?(?:동|읍|면|리)\s*\d+(?:-\d+)?)(?=[\s,]|$)")
_GU_TOKEN_RE = re.compile(r"(?<=\s)(?!대구\s)\S{1,4}구(?=\s)")  # OSM 은 부천시 오정구 같은 일부 일반구를 모른다
_STREET_ONLY_RE = re.compile(r"^(.*?(?:로|길))\s*\d+(?:-\d+)?(?=[\s,]|$)")
_HAS_NUMBER_RE = re.compile(r"\d")

PLACE_PROMPT = (
    '한국의 장소 "{query}"를 웹검색(네이버 검색/네이버지도 우선, 없으면 카카오맵·다음)으로 찾아 '
    "최대 {limit}개 후보를 JSON 배열로만 출력하세요.\n"
    "{address_hint}"
    "설명·코드블록 없이 순수 JSON만. 형식: "
    '[{{"name":"장소명","address":"지번주소","road_address":"도로명주소",'
    '"lat":37.1234567,"lng":127.1234567,"category":"분류","phone":"전화번호(있으면)",'
    '"source_url":"근거가 된 웹페이지 URL","snippet":"그 페이지에서 확인한 핵심 문구(주소/전화/업종 등, 120자 이내)"}}]\n'
    "좌표는 WGS84 십진수. 확실한 좌표를 못 구하면 주소만이라도 정확히 채우고 lat/lng는 null로 두세요. "
    "주소를 못 찾은 후보는 넣지 마세요.\n"
    "후보마다 반드시 실제로 확인한 출처 URL과 근거 문구를 넣으세요. 출처가 없는 후보는 넣지 마세요. "
    "후보는 관련성 높은 순으로.\n"
    "단, 시간이 제한되어 있으니 도구 호출은 최소로 하세요: WebSearch 1~2회로 끝내고, "
    "검색 결과에 나온 URL과 요약 문구를 그대로 source_url/snippet 에 사용하세요. "
    "주소가 검색 결과 요약만으로 확인되면 WebFetch 는 생략하세요. 60초 안에 답을 마치세요."
)


def _fetch_naver(query: str) -> str:
    req = urllib.request.Request(NAVER_SEARCH_URL + "?" + urlencode({"query": query}),
                                 headers={"User-Agent": BROWSER_UA, "Accept-Language": "ko-KR,ko;q=0.9"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return r.read().decode("utf-8", "replace")


def _naver_place_objects(page: str) -> list[dict]:
    """페이지 스크립트 JSON 에서 "fullAddress" 를 가진 플레이스 객체들을 꺼낸다."""
    found, seen, decoder = [], set(), json.JSONDecoder()
    pos = page.find('"fullAddress":"')
    while pos != -1:
        depth, j = 0, pos
        while j > 0 and pos - j < 20000:  # 감싸는 객체의 '{' 까지 거꾸로
            ch = page[j]
            if ch == "}":
                depth += 1
            elif ch == "{":
                if depth == 0:
                    break
                depth -= 1
            j -= 1
        try:
            obj, _ = decoder.raw_decode(page[j:])
        except ValueError:
            obj = None
        if isinstance(obj, dict) and obj.get("id") not in seen:
            seen.add(obj.get("id"))
            found.append(obj)
        pos = page.find('"fullAddress":"', pos + 1)
    return found


def _page_text(page: str) -> str:
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S | re.I)
    text = html.unescape(_TAG_RE.sub(" ", text))
    return re.sub(r"\s+", " ", text).strip()


def naver_lookup(query: str) -> tuple[list[dict] | None, str]:
    """(플레이스 후보 | None, claude 프롬프트에 덧붙일 검색 결과 문맥). 네트워크 오류는 (None, "")."""
    try:
        page = _fetch_naver(query)
    except Exception as e:  # noqa: BLE001
        logger.warning("네이버 검색 실패: %s", e)
        return None, ""
    places = []
    for o in _naver_place_objects(page):
        lat, lng = _to_float(o.get("y")), _to_float(o.get("x"))
        full = _clean_text(o.get("fullAddress")).replace("()", "").strip()
        if not full or not valid_kr_coord(lat, lng):
            continue
        name = _clean_text(o.get("normalizedName") or o.get("name"), 100)
        places.append({
            "name": name, "address": full, "road_address": full, "jibun_address": _clean_text(o.get("commonAddress")) + " " + _clean_text(o.get("address")),
            "lat": lat, "lng": lng, "approx": False, "source": "naver", "category": _clean_text(o.get("category"), 60),
            "phone": _clean_text(o.get("phone") or o.get("virtualPhone"), 40),
            "source_url": f"https://map.naver.com/p/entry/place/{o['id']}" if str(o.get("id") or "").isdigit() else "",
            "snippet": " · ".join(x for x in (_clean_text(o.get("category"), 60), _clean_text(o.get("phone"), 40)) if x),
        })
        if len(places) >= LIMIT:
            break
    if places:
        return places, ""
    text = _page_text(page)
    cut = text.find(f"{query} 검색 결과")  # 앞쪽 메뉴·안내 문구 건너뜀
    text = text[cut:] if cut != -1 else text
    if not text:
        return None, ""
    return None, ("\n\n[참고: 서버가 네이버에서 같은 검색어로 검색한 결과 본문(일부). 웹검색보다 이 내용을 우선 참고하고, "
                  "근거 URL 이 없으면 source_url 은 https://search.naver.com/search.naver?query=검색어 로 쓰세요]\n"
                  + text[:NAVER_CONTEXT_MAX])


def build_prompt(query: str, address: str = "") -> str:
    hint = f'참고로 사용자가 입력한 주소는 "{address}" 입니다(틀릴 수 있음).\n' if address else ""
    return PLACE_PROMPT.format(query=query, limit=LIMIT, address_hint=hint)


def _clean_text(value, max_len: int = 200) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", _TAG_RE.sub("", str(value))).strip()[:max_len]


def _clean_url(value) -> str:
    """http(s) 만 통과 — 화면에 링크로 나간다."""
    url = _clean_text(value, 500)
    return url if url.startswith(("http://", "https://")) else ""


def _to_float(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def valid_kr_coord(lat, lng) -> bool:
    lat, lng = _to_float(lat), _to_float(lng)
    return lat is not None and lng is not None and LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX


def _throttle() -> None:
    global _nominatim_last
    with _nominatim_lock:
        wait = NOMINATIM_MIN_INTERVAL - (time.monotonic() - _nominatim_last)
        if wait > 0:
            time.sleep(wait)
        _nominatim_last = time.monotonic()


def _address_variants(address: str) -> list[tuple[str, bool]]:
    """Nominatim 이 못 찾는 건물·호수·괄호·일반구를 걷어 낸 변형들 → [(주소, approx)] (뒤로 갈수록 근사치).

    원본 → 괄호 제거 → 도로명+번지/지번까지 → "○○구" 제거 → 도로명만(번지 제거, approx).
    """
    address = (address or "").strip()
    if not address:
        return []
    base = [address]
    cleaned = re.sub(r"\s+", " ", _PAREN_RE.sub(" ", address)).strip(" ,")
    if cleaned:
        base.append(cleaned)
        for rx in (_ROAD_PREFIX_RE, _JIBUN_PREFIX_RE):
            m = rx.match(cleaned)
            if m:
                base.append(m.group(1).strip())
    gu_removed = [g for v in base if (g := re.sub(r"\s+", " ", _GU_TOKEN_RE.sub(" ", f" {v} ")).strip(" ,")) and g != v]
    street_only = [s for v in base + gu_removed if (m := _STREET_ONLY_RE.match(v)) and (s := m.group(1).strip()) != v]
    ordered, seen = [], set()
    for v, approx in [(v, False) for v in base + gu_removed] + [(v, True) for v in street_only]:
        if v and v not in seen:
            seen.add(v)
            ordered.append((v, approx))
    return ordered[:6]


def _geocode_once(query: str, original: str, approx: bool) -> dict | None:
    _throttle()
    url = NOMINATIM_URL + "?" + urlencode({"q": query, "format": "jsonv2", "countrycodes": "kr", "limit": 1, "addressdetails": 1})
    req = urllib.request.Request(url, headers={"User-Agent": NOMINATIM_UA, "Accept-Language": "ko"})
    try:
        with urllib.request.urlopen(req, timeout=NOMINATIM_TIMEOUT) as r:
            items = json.loads(r.read().decode()) or []
    except Exception as e:  # noqa: BLE001
        logger.warning("Nominatim 지오코딩 실패: %s", e)
        return None
    for item in items:
        if not isinstance(item, dict):
            continue
        lat, lng = _to_float(item.get("lat")), _to_float(item.get("lon"))  # Nominatim 은 경도가 lon
        if not valid_kr_coord(lat, lng):
            continue
        details = item.get("address") if isinstance(item.get("address"), dict) else {}
        # 번지가 있는 주소인데 결과에 house_number 가 없으면 도로 중심 좌표(근사치)
        return {"lat": lat, "lng": lng, "approx": approx or (bool(_HAS_NUMBER_RE.search(original)) and not details.get("house_number"))}
    return None


def geocode_address(address: str) -> dict | None:
    """주소 → {lat, lng, approx} (Nominatim). 못 찾으면 None."""
    for variant, approx in _address_variants(address):
        hit = _geocode_once(variant, address, approx)
        if hit:
            return hit
    return None


def parse_places(text: str) -> list[dict]:
    """claude 응답 → 후보 목록. 좌표가 없거나 범위 밖이면 주소로 지오코딩해 채운다."""
    out = []
    for item in claude_cli.extract_json_array(text):
        if not isinstance(item, dict):
            continue
        address = _clean_text(item.get("address"))
        road = _clean_text(item.get("road_address"))
        if not address and not road:
            continue
        lat, lng = _to_float(item.get("lat")), _to_float(item.get("lng"))
        source, approx = "claude", False
        if not valid_kr_coord(lat, lng):
            lat = lng = None
            geo = geocode_address(road or address)
            if geo:
                lat, lng, approx, source = geo["lat"], geo["lng"], geo["approx"], "claude+nominatim"
        out.append({
            "name": _clean_text(item.get("name"), 100), "address": road or address, "road_address": road, "jibun_address": address,
            "lat": lat, "lng": lng, "approx": approx, "source": source, "category": _clean_text(item.get("category"), 60),
            "phone": _clean_text(item.get("phone"), 40), "source_url": _clean_url(item.get("source_url")), "snippet": _clean_text(item.get("snippet")),
        })
        if len(out) >= LIMIT:
            break
    if not out:
        raise ValueError("장소를 찾지 못했습니다. 장소명을 더 구체적으로(지역명 포함) 쓰거나 다시 시도하세요.")
    return out
