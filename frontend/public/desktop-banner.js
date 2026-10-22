/*
 * "데스크탑 앱에서 열기" 배너 — hcms 웹(및 연동 사이트)의 공통 레이아웃에 넣는다.
 *   <script src="/desktop-banner.js" defer></script>
 *
 * 보이는 조건: Mac 브라우저 · HCMS 데스크탑 앱 밖 · 최근 14일 안에 닫지 않음
 * 동작: [앱에서 열기] → hankyeul:// 딥링크로 지금 보는 화면을 데스크탑 앱에서 연다.
 *       2.5초 안에 앱이 열리지 않으면 설치 안내로 바뀐다.
 * 페이지 스타일과 섞이지 않도록 Shadow DOM 안에 그린다.
 */
;(function () {
  var DOWNLOAD_URL = 'https://hcms.hankyeul.com/desktop/download'
  var SITES = {
    'hcms.hankyeul.com': 'hcms',
    'createsite.hankyeul.com': 'createsite',
    'wealthreach.hankyeul.com': 'wealthreach',
    'searching.hankyeul.com': 'searching'
  }
  // 이 경로에서는 띄우지 않는다 (중계 페이지, 설치 페이지)
  var SKIP_PATHS = ['/open', '/desktop/download']
  var DISMISS_KEY = 'hcms-desktop-banner-dismissed-at'
  var DISMISS_DAYS = 14
  var WAIT_MS = 2500

  var ua = navigator.userAgent
  var isMac = /Macintosh|Mac OS X/.test(ua) && !(navigator.maxTouchPoints > 1)
  var site = SITES[location.hostname]
  if (!isMac || /HCMSDesktop\//.test(ua) || !site) return
  if (SKIP_PATHS.some(function (path) { return location.pathname.indexOf(path) === 0 })) return
  try {
    var dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return
  } catch (e) {}

  var MARK =
    '<svg viewBox="20.4 -0.4 38 38" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M57.9967 12.4509C57.9967 19.3273 52.4223 24.9018 45.5458 24.9018V13.945C45.5458 13.1198 44.8769 12.4509 44.0517 12.4509L33.0949 12.4509V1.49411C33.0949 0.668934 33.7639 0 34.589 0H45.5458C52.4223 0 57.9967 5.57445 57.9967 12.4509Z"/><path class="outline" d="M22.1382 12.9509H32.5952V23.4079C32.5954 24.5091 33.4881 25.402 34.5894 25.402H45.0454V35.8581C45.0454 36.4071 44.6003 36.8522 44.0513 36.8522H22.1382C21.5892 36.8522 21.144 36.4071 21.144 35.8581V13.945C21.144 13.396 21.5892 12.9509 22.1382 12.9509Z"/></svg>'

  var STYLE =
    ':host{all:initial}' +
    '.bar{--bg:#ffffff;--fg:#172033;--muted:#5d6679;--line:#e0e4ee;--accent:#13499e;--accent-fg:#fff;' +
    'position:fixed;z-index:2147483000;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);' +
    'display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:10px 10px 10px 14px;' +
    'border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--fg);' +
    'box-shadow:0 8px 28px rgba(11,35,80,.18);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}' +
    '@media (prefers-color-scheme:dark){.bar{--bg:#1b2130;--fg:#e6e9f0;--muted:#9aa3b5;--line:#2f3748;--accent:#6f9ee8;--accent-fg:#0d1626}}' +
    'svg{flex:none;width:26px;height:26px}svg path{fill:var(--accent)}svg .outline{fill:none;stroke:var(--accent);stroke-width:1.2}' +
    '.text{min-width:0}.title{font-weight:600}.sub{color:var(--muted);font-size:12px}' +
    '.actions{display:flex;gap:6px;flex:none}' +
    'button,a{font:inherit;font-weight:600;font-size:13px;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer;text-decoration:none;white-space:nowrap}' +
    '.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}' +
    '.close{border:none;padding:6px 8px;color:var(--muted);font-size:16px;line-height:1}' +
    'button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
    '@media (max-width:560px){.sub{display:none}}'

  function mount() {
    var host = document.createElement('div')
    host.id = 'hcms-desktop-banner'
    var root = host.attachShadow({ mode: 'open' })
    root.innerHTML =
      '<style>' + STYLE + '</style>' +
      '<div class="bar" role="region" aria-label="HCMS 데스크탑 앱">' + MARK +
      '<div class="text"><div class="title">HCMS 데스크탑 앱에서 열기</div>' +
      '<div class="sub">알림을 받고, 연동 사이트를 로그인 없이 바로 엽니다.</div></div>' +
      '<div class="actions"><button class="primary" type="button" data-open>앱에서 열기</button>' +
      '<a href="' + DOWNLOAD_URL + '" target="_blank" rel="noopener" data-install>설치</a></div>' +
      '<button class="close" type="button" aria-label="닫기" data-close>×</button></div>'
    document.body.appendChild(host)

    var title = root.querySelector('.title')
    var sub = root.querySelector('.sub')
    var openButton = root.querySelector('[data-open]')

    function dismiss() {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch (e) {}
      host.remove()
    }

    openButton.addEventListener('click', function () {
      var opened = false
      var onLeave = function () { opened = true }
      window.addEventListener('blur', onLeave, { once: true })
      document.addEventListener('visibilitychange', onLeave, { once: true })
      location.href = 'hankyeul://' + site + location.pathname + location.search + location.hash
      setTimeout(function () {
        window.removeEventListener('blur', onLeave)
        document.removeEventListener('visibilitychange', onLeave)
        if (opened) return
        title.textContent = '데스크탑 앱이 열리지 않았나요?'
        sub.textContent = '설치되어 있지 않다면 설치 후 다시 눌러 주세요.'
        sub.style.display = 'block'
        openButton.textContent = '다시 열기'
      }, WAIT_MS)
    })
    root.querySelector('[data-close]').addEventListener('click', dismiss)
  }

  if (document.body) mount()
  else document.addEventListener('DOMContentLoaded', mount)
})()
