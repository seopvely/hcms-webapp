# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HCMS Customer App — a customer-facing portal for 한결랩's PACMS (property/asset management system). Customers view maintenance requests, news, estimates, tasks, point usage, and submit inquiries. The backend reads from PACMS's existing MySQL database (pacmsDB) and adds HCMS-specific tables.

**Domain:** hcms.hankyeul.com

## Commands

```bash
# Service restart (production)
~/restart.sh   # sudo systemctl restart hcms-frontend hcms-backend

# Frontend dev
cd frontend && nvm use 20 && npm run dev     # port 8011
npm run build                                 # production build
npm run lint                                  # eslint

# Backend dev
cd backend && source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 9011 --reload

# Alembic migrations (hcms 전용 테이블만 — alembic/env.py HCMS_OWNED_TABLES)
cd backend && source venv/bin/activate
alembic revision --autogenerate -m "description"   # include_object 로 hcms 전용 테이블만 비교
alembic upgrade head

# Capacitor (mobile build)
cd frontend && CAPACITOR_BUILD=true npm run build   # static export to out/
npx cap sync && npx cap open ios
```

## Tech Stack

- **Frontend (port 8011):** Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS v4 + shadcn/ui + Zustand 5 + React Query 5 + Axios + React Hook Form 7 + Zod 4 + Capacitor 7
- **Backend (port 9011):** FastAPI 0.128 + SQLAlchemy 2.0 + Alembic + Pydantic 2 + python-jose (JWT) + passlib/bcrypt + firebase-admin (FCM)
- **DB:** MySQL (PyMySQL) — shared `pacmsDB` on 192.168.0.10:3306
- **Infra:** Node.js 20.20.0 (nvm), Python 3.12 (venv), nginx reverse proxy, systemd services

## Architecture

### Shared Database with PACMS

The backend maps onto PACMS's existing Django-managed MySQL tables. Table names preserve the original casing:
- `company`, `manager`, `project` — core entities
- `Managelist`, `Managelist_comment` — maintenance requests (legacy naming)
- `Inditask`, `InditaskComment` — tasks
- `Estimate`, `estimate_item` — estimates
- `News`, `News_companies` — news articles
- `pacms_customauthuser` — Django user table (admin/worker accounts, read-only)
- `point_history` — point usage tracking

Table ownership:
- **Alembic (hcms 전용)**: the allowlist `HCMS_OWNED_TABLES` in `backend/alembic/env.py` — `push_token`, `free_maint_alert_log`, `staff_session`, `staff_audit_log`, `customer_invite`, `service_plan`, `fde_engagement`, `fde_engagement_addon`, `job_run`, `job_claim`, `notification_event`. Add new hcms-only tables there (autogenerate ignores everything else).
- **Django (pacms) 마이그레이션**: every other table, including the ones hcms added features for (`maintenance_attachment`, `comment_attachment`, `inquiry*`, `estimate_contract`, `estimate_status_history`, `estimate_revision_request`). Never change their structure from Alembic.
- Status/code columns are `varchar` in the DB even where the model says `Integer` — compare with `str(...)`.

All SQLAlchemy models use `seq` as primary key (matching PACMS convention), not `id`.

### Company-Scoped Data Access

Every authenticated endpoint filters by `current_user.company_id`. Login is login_id + password (`manager.login_id`); `site_key` is optional and the login page no longer sends it. Customer JWTs (`typ=customer`, `token_use=access|refresh`) are stored in localStorage; the axios client refreshes once on 401.

Estimate/contract mail links (`/estimate-auth`, `/contract-auth`) do **not** log the customer in: they get a 24h document token (`token_use=doc`, bound to one estimate) kept in sessionStorage, accepted only by `get_estimate_actor` on `/api/estimates/{id}*`. The `(authenticated)` layout renders that one page without menus.

### Staff `/managed` (cms 이관)

- Unified `/login`: an id containing `@` is a staff email → httpOnly cookie session (`staff_session`, CSRF double submit, Origin check against `settings.staff_origins`), TOTP shared with cms (`pacms_customauthuser.totp_*`). Session lasts 24h from login (`STAFF_SESSION_HOURS`; idle timeout equals it). Staff without 2FA are sent to `/managed/mfa-setup`; staff-account management and wealthreach SSO require an OTP session (`require_staff_mfa`).
- All `/api/managed/*` routers require `get_current_staff`. Writes are gated per area by `require_write("<area>")` against `MANAGED_WRITE_AREAS` (409 = still handled in cms). Batch jobs: `app/jobs/runner.py` + `ENABLED_JOBS`. Cutover steps: `docs/managed-cutover.md`; SPEC review/handoffs: `docs/managed-spec-review.md`.
- AI drafts (`/api/managed/ai/*`: estimate items, contract text, meeting place search) run the server's `claude -p` CLI as the hcms user (claude.ai subscription login, no tools except WebSearch/WebFetch for place search, isolated cwd) via start-then-poll jobs held in memory (single uvicorn worker). Templates come from `ai_prompt_template`. Place search (`services/place_geo`) first parses Naver search-page place JSON (no key; silently 0 hits if Naver changes markup), then falls back to claude with the Naver page text as context — claude's WebSearch barely finds Korean local businesses. If the login lapses, run `claude` once as hcms to re-login; `AI_ENABLED=false` turns it off. Results only fill the form — saving goes through the normal gated endpoints.
- Shared helpers to reuse: `services/estimate_calc.amounts`, `services/points` (cycle usage/remaining), `utils/media.resolve_media_path`/`save_upload`, `utils/html_sanitize.sanitize_html` (+ `lib/sanitize.ts` on the client), `db/locks.hold_lock` (number generation).

### Frontend API Layer

All API calls go through a single centralized file: `src/lib/api-hooks.ts`. This contains:
- TypeScript interfaces for all API responses
- Fetch functions using the shared Axios instance (`src/lib/axios.ts`)
- React Query hooks with consistent query key patterns: `["entity", "list", params]` and `["entity", "detail", id]`
- Mutations that auto-invalidate related queries

The Axios instance (`src/lib/axios.ts`) attaches the customer JWT (or the document token for that estimate's URLs), retries once after `/auth/refresh` on 401, then redirects to `/login`. Staff screens use `src/lib/staff-api.ts` (cookie + CSRF header) instead.

### Frontend Layout Structure

- `src/app/layout.tsx` — Root layout with QueryProvider
- `src/app/(authenticated)/layout.tsx` — Authenticated shell: sidebar (desktop) + bottom nav (mobile) + header + ToastProvider + NavigationSpinnerProvider + push notification init
- Pages under `(authenticated)/` are protected; redirects to `/login` if no token
- Public pages: `/login`, `/login/2fa`, `/change-password`, `/contract-auth`, `/estimate-auth`, `/contract-sign`
- `src/app/(staff)/managed/` — staff screens (separate layout; also open inside the native app webview)

### File Serving

Backend uploads go under `/home/pacms/media/` (a symlink to `/accept/media/pacms/`, the sshfs-mounted image server): legacy customer uploads `upload_file/`, `project_board_files/YYYY/MM/DD/`; new staff uploads `utils/media.save_upload` → `<purpose>/YYYY/MM/<uuid>.<ext>`. Downloads must go through `resolve_media_path` (3 stored-path styles, allowed roots only).

The frontend symlinks (`media`, `bank_files`, `business_files`, `inquiry_files`, `related_documents`) are leftovers — nothing in `src/` references them.

### Nginx Routing

Managed externally (not by this repo). Reference config in `nginx/hcms-customer.conf`:
- `/` → frontend (127.0.0.1:8011)
- `/api/` → backend (127.0.0.1:9011). The backend mounts every router under `APIRouter(prefix="/api")` (no `root_path`), so the proxy must pass `/api` through unchanged.

Dev mode uses Next.js rewrites in `next.config.ts` to proxy `/api/*` to `127.0.0.1:9011/api/*`. Next.js `redirects()`/`rewrites()` are ignored in the Capacitor static export build.

## Frontend Conventions

### Common Components (MUST use these)

All in `src/components/common/`, re-exported via `index.ts`:
- **PageSpinner** — full-screen loading with backdrop blur
- **AppAlertDialog** — confirmation dialogs with `variant="default"|"destructive"|"warning"`
- **useToast** — toast notifications: `const { toast } = useToast(); toast("success"|"error"|"warning"|"info", message)`
- **EmptyState** — placeholder for empty lists (icon, title, description, optional action)
- **StatusBadge** — status display: `<StatusBadge status="3" type="maintenance"|"task"|"estimate" />`
- **CardSkeleton / TableSkeleton / DetailSkeleton** — loading skeletons
- **PageTransition** — wrap every page content for fade+slide-up animation

### Design Rules

- `rounded-xl` for buttons/inputs, `rounded-2xl` for cards
- Gradient headers: purple (`from-[#667eea] to-[#764ba2]`) for maintenance/estimates, emerald-teal for tasks
- Mobile-first: bottom nav on mobile, sidebar on desktop (`lg:` breakpoint)
- All UI text in Korean
- Every page sets title via `useNavigationStore.setPageTitle()`

### Status Codes

| Entity | 1 | 2 | 3 | 4 |
|--------|---|---|---|---|
| Maintenance | 접수 | 알림 | 처리중 | 완료 |
| Task | 접수 | 진행 | 처리중 | 완료 |
| Estimate | 작성중 | 발송 | 승인 | 거절 (5 = 계약전환, 만료 상태 없음) |
| Inquiry | 대기 | 답변중 | 완료 | — |

### Secrets / Config

`backend/.env` (0600) is required: `DATABASE_URL` and `SECRET_KEY` have no defaults in `core/config.py` and the app fails to start without them. Mail link bases come from `PUBLIC_BASE_URL` / `STAFF_BASE_URL` — don't hardcode domains. Settings forbid unknown keys (pydantic-settings `extra=forbid`): a new `.env` key needs a `Settings` field first or the backend won't start.

### Backend Endpoint Pattern

Endpoints return plain dicts (not Pydantic response models). List endpoints return `{items, total, page, per_page, total_pages}`. Detail endpoints return flat dicts with relationships inlined. File uploads use `multipart/form-data` with `Form()` + `File()` parameters.

## LLM Wiki

운영·설계 지식 위키: iCloud `/media/psf/iCloud/가족/0.hankyeul/wiki/hcms` (Karpathy LLM Wiki 방식, 규칙은 그 폴더의 `CLAUDE.md`, 목차 `index.md`).
- 이 파일이 작업 규칙의 정본이고, 위키는 함정·운영 절차·결정·미결·인계를 모은 파생 지도다. 이관·배치·인증을 고치기 전에 위키 `index.md` 의 관련 페이지를 먼저 본다.
- 함정·결정·운영 변경이 생긴 작업을 마치면(`~/restart.sh` 후) `/wiki-ingest` 로 반영하고, 가끔 `/wiki-lint` 로 점검한다(스킬은 `~/.claude/skills/wiki-*` → iCloud 공용 `skill/` 링크).
- iCloud 는 휴대폰까지 동기화된다 — 위키에 비밀번호·키·토큰 값, 이메일 주소를 쓰지 않는다. `backend/.env` 는 열지 않는다.
