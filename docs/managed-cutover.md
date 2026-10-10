# /managed 이관 — 전환(cutover) 런북

cms.hankyeul.com/managed(Django) → hcms.hankyeul.com/managed(이 repo). 화면·API·배치는 모두 배포돼 있고,
**운영에서는 읽기 전용**이다. 아래 스위치를 켜는 순간 hcms 가 실제로 쓰기·발송을 시작한다.
같은 DB(pacmsDB)를 쓰므로 데이터 이동은 없고, 롤백은 스위치를 끄고 cms 패치를 되돌리면 된다(SPEC 11 §2·§7).

## 1. 스위치 (backend/.env, 바꾼 뒤 `~/restart.sh`)

| 변수 | 의미 | 기본 |
|---|---|---|
| `MANAGED_WRITE_AREAS` | 쓰기를 여는 영역(쉼표) — 아니면 409 + "cms 에서 처리" 안내 | 비어 있음 |
| `ENABLED_JOBS` | 스케줄러가 돌릴 job(쉼표) | 비어 있음 |
| `STAFF_BASE_URL` | 직원 메일·링크의 기준 주소. 컷오버 때 `https://hcms.hankyeul.com` 으로 | cms |
| `INTERNAL_API_KEY` | 맥미니 iMessage 전달기가 outbox 를 읽는 키(없으면 `/api/internal` 503) | 비어 있음 |
| `TAX_SYNC_START_DATE` | 매출 세금계산서 동기화 기준일 | 2026-07-01 |
| `POINT_CHARGE_CATCHUP_FROM` | 유지보수 프로젝트 정기충전 따라잡기 시작일(비우면 켠 날부터) | 비어 있음 |
| `KAKAO_REST_API_KEY` | 미팅 장소검색(없으면 주소 직접 입력) | 비어 있음 |

## 2. 영역별 쓰기 전환 (MANAGED_WRITE_AREAS)

영역 하나씩: ① hcms 에서 화면·숫자 대조(그림자 기간) → ② 같은 시각에 hcms 영역 켜기 + cms 해당 뷰 302 패치(인계, pacms 권한)
→ ③ 1~2주 관찰. 번호 생성·전환·철회처럼 부작용이 큰 묶음은 같은 날 같이 켠다.

| 영역 값 | hcms 화면 | cms 에서 302 할 경로(예) | 같이 켤 것 |
|---|---|---|---|
| `maintenance`, `points` | 유지보수·포인트 | `/managed/managelist*`, `/managed/pointdeduct*` | |
| `inquiries`, `tasks`, `news`, `project_board`, `customers` | 고객문의·건별작업·최신소식·구축게시판·업체/계정 | `/managed/oneperone*`, `/managed/inditask*`, `/managed/news*`, `/managed/projectboard*`, `/managed/custom*` | |
| `estimates`, `contracts`, `conversion`, `sales` | 견적·계약·계약전환·영업 | `/managed/estimate*`, `/managed/contract*`, `/managed/sales*` | 같은 날(번호·전환·철회) |
| `projects`, `domains`, `outsourcing` | 프로젝트·도메인·외주 | `/managed/projectmanage*`, `/managed/domain*`, `/managed/outsourcing*` | |
| `billing` | 납부·납부내역·결제일알람·월별수익·매출계획 | `/managed/prepayment*`, `/managed/paymenthistory*`, `/managed/payment-alarm*`, `/managed/sales-plan*` | job `payment_alarms` |
| `tax` | 세금계산서 | `/managed/tax*` | job `tax_sales_sync`, `purchase_budget_check` (SPEC 06 §5: 셋이 한 시스템에서) |
| `subscriptions`, `maint_renewal` | 구독·유지보수 전환 | `/managed/*-subscription*`, `/managed/maint-renewal*` | job `charge_*`, `maint_renewal_scan` |
| `fde` | FDE 계약·요금제 | (신규) | `billing` 이 켜져야 청구 생성 가능 |
| `alarms`, `meetings`, `todos`, `ai_prompts` | 업무도구 | `/managed/alarm*`, `/managed/meeting*`, `/managed/todo*` | job `alarms`, `meetings`, `todo_digest` |

## 3. 배치 전환 (ENABLED_JOBS)

hcms 쪽 cron 은 한 줄이다(hcms 사용자 crontab):

```
*/5 * * * * cd /home/hcms/hcms-customer-app/backend && venv/bin/python -m app.jobs.runner tick >> logs/jobs.cron.log 2>&1
```

**이 줄은 아직 설치하지 않았다**(ENABLED_JOBS 가 비어 있으면 아무 일도 안 하므로 첫 job 을 켜는 날 설치).

**처음 켜기 전**: `run <job> --dry-run` 으로 건수를 확인한다. 만료·충전 job 은 cms 의 '정확히 그날' 대신 '기간 안 + 미처리'로 바뀌어,
첫 실행에서 지금 해당되는 건을 한꺼번에 처리한다(10-11 dry-run: 도메인 만료 1건, 나머지 0건). 과거 건을 보내지 않으려면 그 키로
`job_claim` 행을 미리 넣는다.

기존 `0 9 * * * … app.jobs.free_maint_alerts` 줄은 `free_maint_alerts` 를 ENABLED_JOBS 에 넣는 날 지운다(이중 실행 방지).
점검: `venv/bin/python -m app.jobs.runner list` / `run <job> --dry-run`.

| hcms job | 대체하는 cms cron | 끌 줄(인계) |
|---|---|---|
| `alarms`, `payment_alarms`, `meetings`, `todo_digest` | pacms `*/5 check_alarms.py` (+ root 09:00 같은 스크립트) | 두 줄 모두. 십일조 메일(D13 미결)은 cms 에 남기려면 check_alarms 의 해당 함수만 유지 |
| `tax_sales_sync` | pacms 02:00 `sync_tax_data.py` | 그 줄 |
| `charge_maint_subscriptions` | pacms 00:05 `daily_maint_subscription_charge.py` | 그 줄 |
| `charge_dev_subscriptions` | root 00:00 `daily_dev_subscription_charge.py` | 그 줄(`<=` 따라잡기로 바뀜) |
| `charge_maint_projects` | root 00:00 `daily_point_charge.py` | 그 줄(회차 선점·마지막 회차 개월 올림) |
| `purchase_budget_check` | pacms 09:00 `daily_purchase_budget_check.py` | 그 줄 |
| `estimate_expiry` | root 00:00 `check_estimate_expiry.py` | 그 줄(발송 시각 09:00 으로) |
| `contract_expiry`, `maint_renewal_scan` | root 09:00 `check_contract_expiry.py` | 그 줄 — **cms 운영본 소스(10-08 수정)는 권한상 못 읽었다. 켜기 전 메일 문구 대조** |
| `domain_expiry` | root 09:00 `check_domain_expiry.sh`(현재 미발송) | 그 줄 |
| `free_maint_alerts` | hcms 09:00 기존 줄 | hcms crontab 기존 줄 |
| `fde_notice_check`, `session_cleanup` | (신규) | – |

모든 발송 job 은 `job_claim` 선점 후 발송한다 — cms 줄을 늦게 꺼도 hcms 쪽 중복은 없지만 **cms·hcms 동시 발송은 막지 못한다**.
반드시 같은 시각에 바꾼다. 결과는 `job_run` 표와 `logs/jobs.log`.

### 정책 확인 필요
- `charge_maint_projects` 를 과거 날짜부터 따라잡게 하면(`POINT_CHARGE_CATCHUP_FROM`) cms 가 놓친 1차 충전이 생긴다
  (예: 프로젝트 #47·#65 — 계약전환 충전(월 1회분)만 있고 1차 6개월 충전 없음). 계약전환 충전과 정기 충전을 합산하는 정책(SPEC 05 R6)을 정한 뒤에.

## 4. iMessage 전달기(맥미니)

hcms 는 고객 승인·거절·수정요청·계약 서명, 알람·미팅 알람 발송 때 `notification_event`(outbox)에 한 줄씩 쓴다.
전달기를 SSH+pacms ORM 대신 다음으로 바꾼다(SPEC 07 §5.5):

```
GET  https://hcms.hankyeul.com/api/internal/notification-events?after=<마지막 id>&limit=20   (X-Internal-Key)
POST https://hcms.hankyeul.com/api/internal/notification-events/ack  {"ids":[…]}
```
커서는 outbox id(삽입 순)라 seq ≠ 발송 순서 누락(seq 125)이 없다. web1 nginx 가 `/api/internal/` 을 외부에 열지 여부는 결정 필요
(맥미니 IP 만 허용 권고).

## 5. 컷오버 당일 (모든 영역 전환 후)
1. `STAFF_BASE_URL=https://hcms.hankyeul.com` → 메일 링크가 hcms 로(옛 cms 경로는 hcms `redirects()` 가 새 경로로 매핑).
2. web1 nginx: `cms.hankyeul.com/managed/*`·`/member/*`·`/` → hcms 302(쿼리 보존), 공개 계약 토큰 경로 302 (SPEC 11 §4).
3. cms `/media` 공개 alias 닫기(레퍼런스 썸네일 예외), Django admin·직원 세션 정리.
4. SSO 키 파일을 hcms 가 읽는 위치로 복사(`/home/hcms/.secrets/…`, pacms 권한) — 없으면 hcms SSO 버튼 503.

## 6. 롤백
`MANAGED_WRITE_AREAS`·`ENABLED_JOBS` 에서 해당 값 제거 → `~/restart.sh` → cms 302 패치·cron 줄 복원. 같은 날 발송 기록(job_run, alarm_history,
payment_alarm_history) 대조해 중복 발송 확인.
