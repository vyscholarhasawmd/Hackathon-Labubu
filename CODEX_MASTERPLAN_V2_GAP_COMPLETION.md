# CODEX MASTERPLAN V2 — Re-Sort Gap Completion & Production-Grade Demo

> **Mệnh lệnh thực thi cho Codex:** Hãy dùng chính file này làm nguồn yêu cầu duy nhất để hoàn thiện web app Re-Sort trong workspace hiện tại. Bắt đầu từ code và working tree đang có; tuyệt đối không reset, checkout, xóa hoặc ghi đè thay đổi chưa commit của người dùng. Giữ mọi tính năng và visual behavior đang hoạt động, bổ sung toàn bộ phần còn thiếu, sửa mọi regression, chạy migration/seed/test/E2E và chỉ dừng khi Definition of Done trong tài liệu này đạt 100% ở `AI_MODE=mock`. Nếu có `OPENAI_API_KEY`, chạy thêm OpenAI contract test; nếu không có key, đó không phải blocker. Không hỏi lại những quyết định đã được khóa trong tài liệu này.

**Tên sản phẩm:** Re-Sort  
**Phiên bản masterplan:** 2.0  
**Ngày audit:** 2026-08-15  
**Loại tài liệu:** Current-state assessment + product requirements + solution architecture + migration runbook + test contract  
**Mục tiêu cuối:** Vue 3 frontend + NestJS backend + PostgreSQL + OpenAI Responses API hoặc mock provider, chạy end-to-end bằng một quy trình local rõ ràng và có dữ liệu thật trong PostgreSQL.

---

## 0. Nguyên tắc thực thi không được vi phạm

1. **Không làm lại từ đầu.** Refactor theo lát cắt nhỏ, giữ nguyên design system, routes, copy quan trọng và flow đang hoạt động.
2. **Không reset working tree.** Trước khi sửa, chạy `git status --short`, `git diff --check`, đọc toàn bộ file liên quan và bảo toàn thay đổi hiện có.
3. **PostgreSQL là runtime chính.** `DATA_MODE=postgres` là mặc định của local demo và production. In-memory store chỉ được giữ làm test double trong unit test, không còn là product runtime.
4. **Không “train ChatGPT bằng luật”.** Luật phải nằm trong database/rule engine có version, source URL, effective date và precedence. Model chỉ nhận diện ảnh và có thể diễn giải dữ liệu đã được rule engine xác nhận.
5. **Không để LLM tự quyết định thùng rác.** Kết quả bin/route cuối cùng phải do deterministic country rule engine tạo ra.
6. **Không phụ thuộc OpenAI để demo.** `AI_MODE=auto` dùng OpenAI khi có key, nếu không tự chuyển sang mock; `AI_MODE=mock` luôn deterministic.
7. **Không có silent client fallback giả dữ liệu.** Khi API lỗi, frontend hiển thị error/retry state. Demo offline phải dùng mock provider ở backend, không tự bịa kết quả trong Pinia.
8. **Không gọi số carbon là full product carbon footprint.** Luôn dùng “Estimated disposal footprint” hoặc “Estimated end-of-life footprint” và hiển thị boundary/proxy disclaimer.
9. **Không tuyên bố accuracy là bảo đảm.** `~80%`, `~90%`, `>90%` là product benchmark target; phải có footnote và eval harness.
10. **Household, hardware và payment thật không nằm trong demo.** Household chỉ display-only; Re-Sort Bin chỉ coming-soon modal; payment chỉ fake token.
11. **Không TODO/FIXME trong flow bắt buộc.** Chỉ hạng mục được ghi rõ “Coming soon” mới được phép chưa thực thi.
12. **Không kết thúc ở skeleton.** Codex phải thực hiện code, migrations, seeds, tests, documentation và browser E2E.

---

## 1. Assessment trạng thái hiện tại

### 1.1 Baseline đã xác nhận

Workspace hiện là pnpm monorepo:

- `apps/web`: Vue 3, Vite, Vue Router, Pinia, Axios, Lucide.
- `apps/api`: NestJS, Swagger, JWT, Sharp, Argon2, OpenAI SDK, PostgreSQL packages.
- `packages/contracts`: shared TypeScript DTOs.
- PostgreSQL 17 Docker Compose.
- Hai mockup visual trong `design/`.
- Master spec cũ vẫn là tài liệu tham khảo lịch sử, nhưng file V2 này là nguồn thực thi mới.

Audit đã xác nhận:

- `AI_MODE=mock pnpm verify` pass: lint, typecheck, 11 tests và production build.
- Browser E2E tạm thời ở mock mode pass cho scan → review → accept → analysis và fake Plus checkout.
- Không có browser console warning/error trong flow đã kiểm tra.
- `pnpm verify` không ép `AI_MODE=mock` sẽ fail nếu `.env` đang để `AI_MODE=openai`; integration test có thể gọi OpenAI thật và timeout. Đây là P0 test-isolation bug.
- Git branch hiện đi trước `origin/main` và working tree có nhiều thay đổi/untracked files liên quan OpenAI/rules/UI. Tất cả phải được bảo toàn.

### 1.2 Feature inventory hiện tại

| Capability | Trạng thái | Nhận xét |
|---|---|---|
| Mobile responsive shell/design | Đã có | Visual tốt, creamy off-white/orange/green, bottom navigation, mockup direction rõ ràng |
| Home/dashboard | Có nhưng dữ liệu một phần hardcode | Weekly chart/category summary chưa hoàn toàn lấy từ DB |
| Country selector | Có UI | Germany enabled; AT/FR/NL coming soon; request scan vẫn hardcode `DE` và backend chưa validate body country |
| Camera/photo library | Đã có | Có preview, reselect, photo tip, progress UI |
| Image sanitization | Một phần | Sharp validate/rotate/resize/re-encode; chưa persist private media/thumbnail |
| OpenAI vision | Đang được bổ sung | Responses API + Zod có, nhưng model đang trả luôn disposal route/bin — sai boundary kiến trúc |
| Mock AI | Đã có | Luôn trả yogurt cup, chưa có scenario fixtures đa dạng |
| Review accept/reject | Có | Accept tạo record; reject không lưu feedback thật và success là toast thay vì popup exact copy |
| Analysis | Có | Waste type, bin, instructions, reuse tip, source, weight, carbon UI |
| Germany rule engine | Chưa đạt | Hiện gần như pass-through recommendation từ AI; source packaging cũ đã lỗi thời |
| Carbon | Có prototype | Một factor `4.65358` dùng rộng; null carbon render thành `0.00`; update weight có thể tạo carbon cho unsupported category |
| History | Có | Global in-memory list, chưa ownership/pagination/filter chuẩn |
| Daily analytics/impact | Có prototype | `dailyCounts` và một số UI values/suggestions hardcode, không user/timezone aware |
| Subscription cards | Có | Free/Plus/Household và Re-Sort Bin button có; accuracy labels chưa hiện trên cards |
| Fake payment | Có happy path | Chưa lưu transaction, chưa có decline flow UI, không atomic DB |
| Weekly quota | Có prototype | Không reset count theo tuần thật, không atomic, không concurrency safe |
| Backend login/register | Có prototype | Access JWT only; logout no-op; không refresh rotation/rate limit |
| Frontend login/logout | Thiếu | App auto-login demo bằng credentials hardcode; “Clear local session” không phải logout |
| PostgreSQL | Schema draft only | Migrate/seed scripts có nhưng app luôn dùng `MemoryStore`; `DATA_MODE=postgres` không đổi repository |
| Multi-user ownership | Thiếu nghiêm trọng | Scan/record endpoints lấy dữ liệu chỉ theo id; history/analytics dùng global maps |
| Security/privacy/observability | Một phần | Có basic validation/CORS; thiếu ownership, rate limit, refresh cookie, request id, retention |

### 1.3 P0/P1 gap phải đóng

| Priority | Gap | Hậu quả nếu không sửa |
|---|---|---|
| P0 | PostgreSQL chưa được dùng ở runtime | Dữ liệu mất khi restart, không đạt stack yêu cầu |
| P0 | Không có ownership theo `user_id` | User có thể đọc/sửa/xóa dữ liệu của user khác |
| P0 | LLM đang chọn disposal route | Có thể hallucinate luật/thùng rác |
| P0 | Packaging source còn `VerpackG` | `VerpackG` đã bị thay từ 12/08/2026 |
| P0 | Frontend không có auth UI thật | Không đạt yêu cầu login/logout username/password |
| P0 | Quota không atomic/reset thật | Vượt limit, sai subscription, tốn AI cost |
| P0 | Default test có thể gọi OpenAI thật | Flaky, timeout, có thể phát sinh cost |
| P1 | Reject không persist feedback/exact modal | Không đạt Module 1 |
| P1 | Analytics/carbon một phần hardcode | Output không phản ánh dữ liệu user |
| P1 | Subscription plans hardcode ở UI | Backend và frontend có thể lệch |
| P1 | Carbon factor không versioned | Kết quả khó audit và dễ gây hiểu nhầm |
| P1 | No refresh session/rate limit | Auth demo không đủ an toàn |
| P1 | No image lifecycle/private endpoint | Privacy và history thumbnail không hoàn chỉnh |

---

## 2. Scope và hợp đồng giữ nguyên feature

### 2.1 Must preserve

Codex phải giữ hoặc cải thiện, không được loại bỏ:

- Brand “Re-Sort”.
- Visual direction của `design/resort-responsive-ux-ui-mockup.png` và `design/resort-mobile-webapp-ux-ui-mockup.png`.
- Creamy off-white background, burnt-orange primary CTA, forest-green information accents, gold/olive secondary accents.
- Mobile-first phone-like experience nhưng responsive tốt trên desktop.
- Routes hiện có: `/`, `/scan`, `/scan/:id/review`, `/analysis/:id`, `/history`, `/impact`, `/subscription`, `/profile`.
- Bottom navigation: Home, Scan, History, Impact, Profile.
- Camera và photo library flow, preview, chọn ảnh khác, progress steps.
- Exact photo tip: “If the product has a recycling or disposal symbol, make sure it is clearly visible in the photo.”
- Review object/material/symbol/confidence, accept/reject.
- Analysis bin/route/instructions/reuse-carbon-source sections.
- History, dashboard, impact insights.
- Free/Plus/Household cards, fake checkout và Re-Sort Bin modal.
- Demo account và mock AI mode cho local demo.
- Swagger, health endpoints, shared contracts và pnpm monorepo.

### 2.2 New routes được phép thêm

- `/login`
- `/register`
- Optional `/settings` nếu cần, nhưng không thay `/profile`.

### 2.3 Out of scope / coming soon

- Household member invitation, 4-account management, child account enforcement.
- Bluetooth/Wi-Fi Re-Sort Bin pairing.
- Stripe/PayPal/payment thật.
- Production object storage/CDN; chỉ cần adapter interface + local private storage implementation.
- Municipality-specific rules ngoài warning/local-guidance fallback.
- Full product life-cycle assessment hoặc legal compliance certification.
- Fine-tuning OpenAI model.

---

## 3. Kiến trúc đích

```mermaid
flowchart LR
  User["User browser"] --> Vue["Vue 3 SPA"]
  Vue --> API["NestJS REST /api/v1"]
  API --> Auth["Auth + ownership"]
  API --> Scan["Scan orchestration"]
  API --> Subs["Subscription + quota"]
  API --> Analytics["History + analytics"]
  Scan --> Media["Private local media adapter"]
  Scan --> Vision["WasteVisionProvider"]
  Vision -->|"AI_MODE=openai"| OpenAI["OpenAI Responses API"]
  Vision -->|"AI_MODE=mock"| Mock["Deterministic mock provider"]
  Scan --> Rules["Versioned country rule engine"]
  Rules --> Carbon["Versioned carbon estimator"]
  Rules --> Narrative["Optional grounded AI narrative"]
  Auth --> PG[("PostgreSQL 17")]
  Scan --> PG
  Subs --> PG
  Analytics --> PG
  Rules --> PG
  Carbon --> PG
```

### 3.1 Module boundaries backend

Tách NestJS theo feature; controller không được gọi trực tiếp TypeORM query lộn xộn:

```text
apps/api/src/
├── common/              # config, errors, request-id, guards, decorators
├── database/            # DataSource, migrations, seeds, transaction helpers
├── auth/                # register/login/refresh/logout/me
├── users/
├── countries/
├── subscriptions/       # plans, quota, fake payment
├── media/               # sanitize, private local storage, authorized stream
├── ai/                  # provider interfaces, OpenAI, mock, prompt versions
├── scans/               # orchestration, state machine, feedback
├── rules/               # source registry, Germany matcher, precedence
├── carbon/              # factor repository + calculation
├── waste-records/
├── analytics/
└── health/
```

### 3.2 Port-and-adapter rules

Tối thiểu phải có các interfaces:

```ts
interface WasteVisionProvider {
  identify(input: IdentifyWasteInput): Promise<IdentificationResult>;
}

interface WasteNarrativeProvider {
  explain(input: GroundedAnalysisInput): Promise<GroundedNarrative>;
}

interface MediaStorage {
  put(input: SanitizedMediaInput): Promise<StoredMedia>;
  read(ownerId: string, mediaId: string): Promise<Readable>;
  delete(ownerId: string, mediaId: string): Promise<void>;
}
```

Repository interfaces có PostgreSQL implementation. `MemoryStore` hiện tại phải được chia nhỏ thành test fixtures/test doubles hoặc xóa khỏi runtime sau khi migration hoàn tất.

### 3.3 Runtime modes

| Mode | Database | AI | Mục đích |
|---|---|---|---|
| Local default | PostgreSQL | mock hoặc auto | Demo đầy đủ, persistent |
| Test unit | test doubles | mock only | Nhanh, không network |
| Test integration | PostgreSQL test DB | mock only | Transaction/ownership/migrations |
| Optional contract | PostgreSQL test DB | OpenAI | Chỉ khi key + explicit flag |
| Production-like | PostgreSQL | OpenAI | Không dùng default secrets |

---

## 4. Cấu hình và startup contract

### 4.1 `.env.example` bắt buộc

```dotenv
NODE_ENV=development
API_PORT=3000
WEB_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=/api/v1

DATA_MODE=postgres
DATABASE_URL=postgresql://resort:resort@localhost:5432/resort
POSTGRES_DB=resort
POSTGRES_USER=resort
POSTGRES_PASSWORD=resort

JWT_ACCESS_SECRET=change-me-at-least-32-characters
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECURE=false

AI_MODE=auto
OPENAI_API_KEY=
OPENAI_MODEL_FREE=gpt-5.6-luna
OPENAI_MODEL_PLUS=gpt-5.6-terra
OPENAI_MODEL_HOUSEHOLD=gpt-5.6-sol
OPENAI_TIMEOUT_MS=45000
OPENAI_MAX_RETRIES=2
OPENAI_STORE=false

UPLOAD_DIR=./uploads
MAX_UPLOAD_BYTES=10485760
MAX_IMAGE_PIXELS=25000000
IMAGE_RETENTION_DAYS=30

DEFAULT_COUNTRY_CODE=DE
DEFAULT_TIMEZONE=Europe/Berlin
RULE_SOURCE_MAX_AGE_DAYS=90
RUN_OPENAI_CONTRACT_TEST=false
```

Model IDs phải cấu hình qua env, không hardcode vào business logic. Theo official OpenAI documentation tại ngày audit, GPT-5.6 family hỗ trợ image input và Structured Outputs qua Responses API. Nếu model availability của account khác, Codex ghi rõ override env; không đổi product behavior.

### 4.2 Config validation

- Dùng một typed env schema; fail fast khi DB URL/JWT secret/port invalid.
- Production từ chối default DB credentials và default JWT secret.
- `AI_MODE=openai` thiếu key → readiness degraded/503 với error rõ ràng.
- `AI_MODE=auto` thiếu key → warning một lần và dùng mock.
- Test suite set env trước khi import `AppModule`; không được load developer `.env` để quyết định AI provider.
- `OPENAI_STORE` bắt buộc false.

### 4.3 Local startup

Từ clone sạch phải chạy được:

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Thêm script idempotent `pnpm setup:local` nếu hữu ích. README phải ghi URL web/API/Swagger/health và demo credentials.

---

## 5. Data model PostgreSQL

Tạo TypeORM entities và versioned migrations; không dùng `synchronize: true`.

### 5.1 `users`

- `id uuid PK`
- `username varchar(30) unique`, lưu lowercase
- `password_hash text`
- `display_name varchar(80)`
- `country_code char(2) default 'DE'`
- `timezone varchar(64) default 'Europe/Berlin'`
- `role varchar(20) default 'USER'`
- `created_at`, `updated_at`

### 5.2 `refresh_sessions`

- `id uuid PK`
- `user_id uuid FK`
- `token_hash text unique`
- `expires_at`, `revoked_at`, `rotated_to_session_id`
- `created_at`, `last_used_at`
- optional `user_agent_hash`, không lưu raw IP bắt buộc

### 5.3 `countries`

- `code char(2) PK`
- `name`
- `enabled`
- `default_timezone`
- `active_rule_set_id nullable`
- Germany enabled; Austria/France/Netherlands disabled + “Coming soon”.

### 5.4 `rule_sources`

- `id uuid PK`
- `country_code`
- `title`
- `authority`
- `source_url`
- `source_type` = `LAW`, `REGULATION`, `GOVERNMENT_GUIDANCE`, `MUNICIPAL_GUIDANCE`
- `published_at nullable`, `effective_from`, `effective_to nullable`
- `last_verified_at`
- `content_hash nullable`
- `notes`

### 5.5 `rule_sets`

- `id uuid PK`
- `country_code`
- `version unique`, ví dụ `DE-FEDERAL-2026.08.12-v2`
- `effective_from`, `effective_to nullable`
- `status` = `DRAFT`, `ACTIVE`, `RETIRED`
- `source_snapshot_json`
- `created_at`

Chỉ một active rule set/country tại một thời điểm.

### 5.6 `sorting_rules`

- `id uuid PK`
- `rule_set_id FK`
- `code unique within rule set`
- `priority integer`
- `conditions_json jsonb`
- `waste_category`
- `disposal_route`
- `bin_label`
- `preparation_steps_json`
- `reuse_recycle_tips_json`
- `requires_local_guidance boolean`
- `source_ids_json`

### 5.7 `subscription_plans`

- `code PK`: `FREE`, `PLUS`, `HOUSEHOLD`
- `name`
- `weekly_image_limit`: 10, 100, 250
- `price_cents`: demo values hiện hành 0, 999, 1799
- `accuracy_label`: `Target AI accuracy ~80%`, `~90%`, `>90%`
- `quality_tier`: `BASIC`, `ENHANCED`, `HOUSEHOLD_PREVIEW`
- `features_json`
- `checkout_enabled`; Household false
- `coming_soon`

### 5.8 `subscriptions`

- `id uuid PK`
- `user_id uuid unique FK`
- `plan_code FK`
- `status`: `ACTIVE`, `CANCELED`
- `started_at`, `updated_at`

### 5.9 `weekly_usage`

- `id uuid PK`
- `user_id uuid FK`
- `week_start date`
- `used_count integer >= 0`
- `updated_at`
- unique `(user_id, week_start)`

`week_start` tính theo timezone user, Monday 00:00 local.

### 5.10 `scan_jobs`

- `id uuid PK`
- `user_id uuid FK`
- `idempotency_key uuid`
- `status`: `PROCESSING`, `ANALYZED`, `ACCEPTED`, `REJECTED`, `FAILED`
- `country_code`
- `rule_set_version_snapshot`
- `subscription_plan_snapshot`
- `quality_tier_snapshot`
- `identification_json`
- `ai_provider`, `ai_model`, `prompt_version`
- `ai_latency_ms nullable`, `ai_request_id nullable`
- `quota_reserved boolean`, `quota_released_at nullable`
- `error_code nullable`
- `created_at`, `updated_at`, `decided_at nullable`
- unique `(user_id, idempotency_key)`

### 5.11 `scan_media`

- `id uuid PK`
- `scan_id uuid unique FK`
- `user_id uuid FK`
- `storage_key unique`
- `mime_type` sau sanitize luôn `image/jpeg`
- `byte_size`, `width`, `height`, `sha256`
- `metadata_stripped boolean`
- `created_at`, `delete_after nullable`

### 5.12 `scan_feedback`

- `id uuid PK`
- `scan_id uuid unique FK`
- `user_id uuid FK`
- `reason_code nullable`
- `comment varchar(500) nullable`
- `identification_snapshot_json`
- `created_at`

### 5.13 `carbon_factor_sets` và `carbon_factors`

Factor set:

- `id`, `version unique`, `source_name`, `source_url`, `source_country`
- `applicable_country`, `is_proxy`, `boundary`, `published_at`

Factor:

- `id`, `factor_set_id`
- `waste_category nullable`, `material nullable`, `treatment_route`
- `kg_co2e_per_tonne numeric`
- unique logical mapping

### 5.14 `waste_records`

- `id uuid PK`
- `scan_id uuid unique FK`
- `user_id uuid FK`
- `identified_name`, `waste_type_label`
- `waste_category`, `primary_material`, `material_label`
- `disposal_route`, `bin_label`
- `preparation_steps_json`, `reuse_suggestions_json`
- `environmental_impact_summary`
- `classification_confidence`
- `estimated_weight_grams`
- `weight_source`: `AI_ESTIMATE`, `CATEGORY_DEFAULT`, `USER`
- `weight_confidence nullable`
- `estimated_disposal_co2e_kg nullable`
- `carbon_factor_id nullable`, `carbon_methodology_version nullable`
- `rule_set_version`, `source_snapshot_json`
- `seeded boolean default false`
- `created_at`, `updated_at`

### 5.15 `payment_transactions`

- `id uuid PK`
- `user_id uuid FK`
- `plan_code`
- `amount_cents`, `currency='EUR'`
- `status`: `SUCCEEDED`, `DECLINED`
- `provider='FAKE'`
- `provider_reference unique`
- `failure_code nullable`
- `created_at`

Không lưu số thẻ, CVV, expiry hoặc fake token raw.

### 5.16 Indexes bắt buộc

- `scan_jobs(user_id, created_at desc)`
- `scan_jobs(user_id, idempotency_key)` unique
- `scan_jobs(status, created_at)`
- `waste_records(user_id, created_at desc)`
- `waste_records(user_id, waste_category, created_at)`
- `scan_feedback(user_id, created_at desc)`
- `payment_transactions(user_id, created_at desc)`
- `weekly_usage(user_id, week_start)` unique
- `refresh_sessions(user_id, expires_at)`

---

## 6. Auth, session và ownership

### 6.1 Backend auth flow

- Register username/password.
- Username validation: 3–30 chars, `[a-zA-Z0-9._-]`, canonical lowercase.
- Password minimum 10 chars cho demo; Argon2id hash.
- Login trả access token 15 phút và đặt refresh token random 256-bit trong HttpOnly cookie.
- Cookie: `resort_refresh`, `HttpOnly`, `SameSite=Lax`, `Path=/api/v1/auth`, `Secure=true` ở production.
- Chỉ lưu hash refresh token trong DB.
- Refresh rotate token atomically; reuse token đã revoke phải fail.
- Logout revoke current refresh session, clear cookie, trả 204.
- `/auth/me` trả user + current subscription.

### 6.2 Frontend auth

- Tạo `/login` và `/register` theo cùng design system.
- Không auto-login bằng credentials hardcode.
- Access token giữ trong memory store; refresh bằng HttpOnly cookie và `withCredentials: true`.
- Axios 401 interceptor chỉ thử refresh một lần, sau đó redirect `/login`.
- Route guard bảo vệ mọi route hiện tại trừ `/login` và `/register`.
- Profile có button “Log out”; gọi API logout rồi clear local state.
- Local development có thể hiển thị “Use demo account” nếu `VITE_DEMO_LOGIN_ENABLED=true`, nhưng production phải tắt.

### 6.3 Ownership invariant

Mọi query scan/media/record/feedback/transaction phải có cả `id` và `user_id` từ access token. Không có controller method nào được gọi `getById(id)` rồi trả thẳng cho user.

Test bắt buộc: user A không thể GET/PATCH/DELETE scan, image, waste record hay transaction của user B; response dùng 404 để không leak existence.

---

## 7. Module 1 — Scan & Sort

### 7.1 UX flow

1. User đã login mở `/scan`.
2. Country selector load từ API; Germany mặc định và enabled.
3. AT/FR/NL display “Coming soon”, disabled.
4. Hiển thị Germany-wide/local variation notice.
5. Hiển thị exact photo tip.
6. User dùng camera hoặc photo library.
7. Frontend validate sơ bộ, preview và cho chọn lại.
8. “Use this photo” tạo UUID `Idempotency-Key` một lần cho file đang chọn.
9. Frontend submit chính `selectedCountryCode`, không hardcode `DE`.
10. Progress: Uploading → Identifying → Preparing result.
11. API trả analyzed scan, chuyển `/scan/:id/review`.
12. Review hiển thị object, materials, visible symbols, confidence, uncertainties và retake advice.
13. Không hiển thị bin từ AI ở Review. Nếu muốn preview, chỉ hiển thị sau khi deterministic rule engine chạy; flow chuẩn là bin ở Analysis sau accept.
14. Accept → transaction tạo waste record → `/analysis/:wasteRecordId`.
15. Reject → lưu feedback, hiển thị popup exact **“Your feedback has been received”**, CTA “Scan another item”; không tạo waste record.

### 7.2 Upload validation

- Multipart field `image` bắt buộc.
- Supported input: JPEG, PNG, WebP, HEIF nếu build Sharp hỗ trợ; kiểm tra magic bytes/decoded metadata, không tin MIME/extension.
- Max 10 MiB và 25 megapixels.
- Reject malformed/decompression bomb/zero dimensions.
- Sharp auto-rotate, resize inside 1600×1600, no enlargement, encode JPEG quality 85.
- Strip EXIF/GPS/ICC metadata trước khi lưu và trước khi gửi OpenAI.
- Store private path `{userId}/{yyyy}/{mm}/{scanId}.jpg` qua `MediaStorage`.
- Thumbnail endpoint có auth + ownership; không expose static upload directory.

### 7.3 Scan state machine

```mermaid
stateDiagram-v2
  [*] --> PROCESSING
  PROCESSING --> ANALYZED: image + AI success
  PROCESSING --> FAILED: technical/validation/provider failure
  ANALYZED --> ACCEPTED: one atomic decision
  ANALYZED --> REJECTED: one atomic decision
  ACCEPTED --> [*]
  REJECTED --> [*]
  FAILED --> [*]
```

- Decision lần hai trả 409 `SCAN_ALREADY_DECIDED`.
- Accept và waste record insert cùng transaction; nếu transaction fail, scan vẫn `ANALYZED` để retry.
- Reject và feedback insert cùng transaction.
- Owner mismatch trả 404.

### 7.4 Atomic quota + idempotency

Trong transaction ngắn trước OpenAI:

1. Validate UUID idempotency key.
2. Nếu `(user_id, idempotency_key)` đã tồn tại, trả scan hiện có và không increment.
3. Tính `week_start` theo timezone user.
4. Lock current subscription + weekly usage row bằng `SELECT ... FOR UPDATE` hoặc TypeORM pessimistic write.
5. Nếu `used_count >= limit`, trả 429 `WEEKLY_SCAN_LIMIT_REACHED`.
6. Insert `scan_jobs(PROCESSING, quota_reserved=true)` và increment usage đúng một lần.
7. Commit rồi mới gọi OpenAI.

Sau đó:

- AI success: update `ANALYZED`; accept/reject đều giữ quota đã dùng.
- Validation trước reserve không tính quota.
- Technical/provider failure sau reserve: mark `FAILED` và release quota đúng một lần trong transaction; `quota_released_at` chống double decrement.
- Retry cùng key trả cùng scan/error state, không tính lần hai.
- Frontend refresh `/subscriptions/current` sau scan thay vì tự `used += 1`.

### 7.5 Mock scenarios

Mock provider phải hỗ trợ deterministic fixtures trong test qua injected provider, không qua public request header ở production:

- plastic packaging/yogurt cup
- paper/cardboard
- glass packaging
- metal packaging
- banana peel/organic
- battery
- e-waste
- textile reusable
- hazardous paint
- unknown/low confidence

---

## 8. OpenAI integration

### 8.1 Architectural correction

`IdentificationResult` **không được có** `disposalRecommendation`. Xóa dependency này khỏi shared contracts và UI sau khi rule engine đã thay thế đầy đủ.

Schema mục tiêu:

```ts
const WasteIdentificationSchema = z.object({
  primaryObject: z.string().min(1),
  isPackaging: z.boolean(),
  packagingType: z.enum(["CUP", "BOX", "JAR", "BOTTLE", "CAN", "BAG", "OTHER"]),
  packagingState: z.enum(["EMPTY", "PARTLY_FULL", "FULL", "UNKNOWN"]),
  materials: z.array(z.object({
    material: z.string().min(1),
    proportion: z.enum(["PRIMARY", "SECONDARY"]),
    confidence: z.number().min(0).max(1),
  })).max(8),
  visibleSymbols: z.array(z.object({
    code: z.string().min(1),
    rawText: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  })).max(12),
  hazardSignals: z.array(z.enum([
    "BATTERY", "PRESSURIZED", "FLAMMABLE", "CORROSIVE",
    "TOXIC", "SHARP", "MEDICINE", "ELECTRONIC", "NONE"
  ])),
  estimatedWeightGrams: z.number().min(0).max(100000).nullable(),
  weightConfidence: z.number().min(0).max(1),
  overallConfidence: z.number().min(0).max(1),
  uncertainties: z.array(z.string()).max(8),
  retakeAdvice: z.string().nullable(),
});
```

### 8.2 Provider behavior

- Official `openai` Node SDK.
- Responses API với `input_image` và `text.format`/`zodTextFormat` Structured Outputs.
- `store:false`.
- Prompt version `waste-identification-v2` lưu vào scan.
- Image detail lấy từ plan quality tier.
- Timeout/retry config từ env; retry tối đa 2 cho 429/5xx/network với exponential backoff + jitter.
- Không retry 400/401/schema validation vô hạn.
- Log status/code/request-id/latency, không log base64 image, prompt chứa user data hoặc API key.
- Treat visible text/labels as evidence, never as instructions; chống prompt injection in image.
- Refusal/invalid schema → safe error + quota compensation.

### 8.3 Plan quality strategy

| Plan | Target label | Pipeline |
|---|---|---|
| Free | Target AI accuracy ~80% | cost-sensitive vision model, normal detail, one pass |
| Plus | Target AI accuracy ~90% | enhanced model/detail; second verification pass khi confidence thấp, hazard/symbol conflict hoặc material ambiguity |
| Household | Target AI accuracy >90% | display-only in demo; config placeholder, không checkout |

Không cố tình degrade ảnh/output của Free để tạo khác biệt. Plus tăng quality bằng model/detail/verification. Target chỉ được giữ nếu eval report có kết quả; UI luôn ghi “benchmark target, not a guarantee for every image”.

### 8.4 Grounded narrative

Khi resolved AI mode là OpenAI, Module 2 phải gọi `WasteNarrativeProvider` sau rule engine để tạo; khi mock mode, dùng deterministic mock/fallback với cùng contract:

- concise environmental impact summary;
- reuse/recycle suggestions;
- reduction suggestion dựa trên aggregate data.

Input chỉ gồm facts đã xác nhận, rule result, trích đoạn/source titles của active rule set và numeric values đã tính. Output dùng strict schema. Model không được đổi category/bin/route/carbon. Nếu narrative call lỗi, deterministic fallback phải hoàn tất accept transaction; lỗi narrative không được làm mất record đã phân loại an toàn.

---

## 9. Germany legal/rule baseline hiện hành

### 9.1 Quyết định pháp lý quan trọng

Tại ngày audit 2026-08-15:

- EU Packaging and Packaging Waste Regulation `Regulation (EU) 2025/40` và German `Verpackungsrecht-Durchführungsgesetz (VerpackDG)` đã có hiệu lực từ **2026-08-12**.
- `VerpackDG` thay thế `VerpackG`. Không seed `VerpackG §38` như luật packaging đang hiệu lực.
- OpenAI model knowledge cutoff không phải nguồn pháp lý; rule sources phải được inject từ DB và hiển thị version/effective date.
- UBA practical guidance cập nhật 2026-02-02 vẫn hữu ích cho household sorting nhưng phần link `VerpackG` của trang đó đã cũ sau 2026-08-12; lưu nó là government guidance, không phải sole current legal authority.

### 9.2 Official sources cần seed và verify

1. Current German Packaging law publication, BGBl. 2026 I Nr. 207 / VerpackDG:  
   `https://www.recht.bund.de/bgbl/1/2026/207/VO.html`
2. German Federal Government summary confirming effective date and replacement:  
   `https://www.bundesregierung.de/breg-de/aktuelles/verpackungsrecht-gesetz-2406776`
3. EU PPWR official text:  
   `https://eur-lex.europa.eu/eli/reg/2025/40/oj`
4. Kreislaufwirtschaftsgesetz (KrWG), especially §20 separate collection:  
   `https://www.gesetze-im-internet.de/krwg/BJNR021210012.html`
5. ElektroG §10 separate collection:  
   `https://www.gesetze-im-internet.de/elektrog_2015/__10.html`
6. Batterierecht-Durchführungsgesetz (BattDG), including retailer/public collection obligations:  
   `https://www.gesetze-im-internet.de/battdg/`
7. UBA household sorting guidance, updated 2026-02-02:  
   `https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt`

Codex phải re-open/verify official sources lúc implementation, lưu `last_verified_at`, effective dates và snapshot notes. Nếu một source unavailable, không bịa nội dung; dùng source official khác và ghi audit note.

### 9.3 Deterministic precedence

Rule engine phải match theo priority:

1. Medical sharps / dangerous chemical / pressurized / flammable.
2. Loose battery/accumulator.
3. Electronic/electrical equipment; safely removable batteries handled separately.
4. Deposit-return marking.
5. Reusable/donatable intact item.
6. Glass packaging, with exclusions for ceramics, mirrors, drinking glass and window glass.
7. Lightweight packaging made from plastic/metal/composite → yellow bin/sack.
8. Clean/dry paper/cardboard; contaminated/thermal/photo paper excluded.
9. Organic household waste; no conventional or “compostable” plastic bag by default.
10. Textiles; wearable/reusable vs non-wearable must include local warning.
11. Bulky/construction waste → municipality/recycling center.
12. Residual only for positively identified non-recoverable household waste.
13. Unknown/low-confidence/local-dependent → `LOCAL_GUIDANCE_REQUIRED`.

Invariant:

- Yellow bin/sack chỉ cho packaging, trừ khi municipality-specific Wertstofftonne rule sau này explicitly enables non-packaging plastics/metals.
- Battery, e-waste, hazardous, sharps không bao giờ route vào ordinary household bin.
- Medicine không bao giờ vào toilet/drain; route có thể khác municipality nên ưu tiên local guidance.
- Rule output luôn có source IDs, rule-set version và local warning khi cần.

### 9.4 Minimum Germany rules

| Code | Match summary | Category | Route/bin |
|---|---|---|---|
| `DE_HAZARDOUS` | chemical/pressurized/hazard | `HAZARDOUS_WASTE` | Schadstoffmobil/Wertstoffhof, keep container intact |
| `DE_SHARPS` | needle/blade/medical sharp | `MEDICAL_SHARPS` | puncture-resistant container + local medical route |
| `DE_BATTERY` | loose battery/accumulator | `BATTERY` | retailer or battery collection point |
| `DE_E_WASTE` | powered/electronic item | `E_WASTE` | retailer/municipal e-waste point |
| `DE_DEPOSIT` | valid deposit-return evidence | `DEPOSIT_RETURN` | deposit return point |
| `DE_REUSE` | usable item | `REUSE_DONATE` | reuse/donate route |
| `DE_GLASS_PACKAGING` | glass packaging | `GLASS_PACKAGING` | glass container by color; caps separate |
| `DE_LIGHT_PACKAGING` | plastic/metal/composite packaging | `LIGHTWEIGHT_PACKAGING` | yellow bin/sack; empty, no rinse needed |
| `DE_PAPER` | clean dry paper/cardboard | `PAPER_CARDBOARD` | blue bin; remove contamination |
| `DE_ORGANIC` | food/garden organic | `ORGANIC` | bio bin/compost with local caveat |
| `DE_TEXTILE` | textile | `TEXTILE` | reuse/textile collection/local guidance |
| `DE_BULKY` | furniture/mattress etc. | `BULKY_WASTE` | registered bulky collection/recycling center |
| `DE_CONSTRUCTION` | rubble/building material | `CONSTRUCTION_WASTE` | recycling center/local route |
| `DE_RESIDUAL` | confirmed non-recyclable residue | `RESIDUAL` | residual bin |
| `DE_UNKNOWN` | no safe match | `LOCAL_GUIDANCE_REQUIRED` | municipal waste A–Z/recycling center |

---

## 10. Module 2 — Analysis, carbon, history và impact

### 10.1 Accept orchestration

Trong transaction:

1. Lock owned scan in `ANALYZED` state.
2. Load active rule set snapshot matching scan country/effective time.
3. Run deterministic matcher on `IdentificationResult`.
4. Resolve weight and weight source.
5. Resolve carbon factor or null.
6. Generate grounded AI narrative khi resolved mode là OpenAI; mock/deterministic safe fallback luôn sẵn có.
7. Insert exactly one `waste_record` with source/rule/carbon snapshots.
8. Mark scan `ACCEPTED`.
9. Commit, return record id.

### 10.2 Analysis screen content

- Original identified item.
- Waste type/category.
- Recommended bin/collection route.
- Preparation/disposal steps.
- “Why this recommendation?” grounded explanation.
- Reuse/recycle/repair suggestion only when applicable.
- Confidence/uncertainty/local warning.
- Estimated weight + source; editable 1–100000 g.
- Estimated disposal footprint or explicit no-factor state.
- Rule-set version, effective date, source links.
- Disclaimer: informational guidance, follow product labels and local authority.
- CTA “Scan another item” và “View dashboard”.

### 10.3 Carbon method

```ts
estimatedDisposalCo2eKg =
  (estimatedWeightGrams / 1_000_000) * kgCo2ePerTonne;
```

Seed a transparent demo proxy factor set. Có thể tiếp tục các proxy values đã dùng trong spec cũ, nhưng phải đưa vào DB với version/source/boundary:

| Treatment proxy | kg CO2e/tonne | Usage |
|---|---:|---|
| recycling collection/delivery | 4.65358 | yellow/blue/glass/deposit demo route |
| combustion delivery | 4.65358 | residual demo route, not stack total |
| composting | 9.00687 | organic demo route |
| anaerobic digestion | 9.00687 | optional organic route |

Không dùng landfill comparison làm Germany default. Battery/e-waste/hazardous/sharps/medicine/bulky/construction/reuse/local guidance → `null` trừ khi có verified applicable factor.

Weight resolution:

- AI estimate nếu non-null và confidence ≥0.35.
- Nếu không, category default và `CATEGORY_DEFAULT`.
- User edit đổi source thành `USER` và recalculate bằng cùng factor mapping/version.
- Update unsupported category phải vẫn `null`.
- UI không render null thành `0.00`; dùng “Not enough verified factor data”.

Exact disclaimer:

> This is an indicative end-of-life estimate based on item weight and a versioned waste-treatment proxy. It is not a full product life-cycle assessment and local German treatment emissions may differ.

### 10.4 Analytics

Chỉ tính accepted `waste_records` của current user; rejected/failed/deleted không tính.

`GET /analytics/summary?from=&to=&timezone=` trả:

- `totalAccepted`
- `totalWeightGrams`
- `totalDisposalCo2eKg` chỉ sum non-null
- `recordsWithoutCarbonFactor`
- `daily[]`: `{date, count, weightGrams, disposalCo2eKg}`
- `categories[]`: `{category, label, count, weightGrams}`
- `suggestions[]`: `{code, title, action, evidence}`

Date grouping theo user timezone, không raw UTC. Home/category cards/chart phải bind API values, không hardcode `4/2/1/0` hoặc `[3,5,4,2,4,6,3]`.

Deterministic suggestion examples:

- ≥5 lightweight packages/7 days → refill/reusable packaging suggestion.
- repeated paper contamination → keep paper clean/dry.
- battery/e-waste record → batch return safely.
- high residual share → identify common avoidable items.
- reusable item → repair/donate/extend life.

Optional OpenAI personalization chỉ diễn giải aggregate facts; không bịa số.

### 10.5 History

- Pagination, date/category filters, newest first.
- Deep link `/analysis/:id` fetch trực tiếp record khi Pinia empty/refresh.
- Delete requires confirm UI and owner check; delete/cascade related private media according retention policy.
- Empty/loading/error states.

---

## 11. Module 3 — Subscription, quota và fake payment

### 11.1 UI source of truth

Subscription page phải load `GET /subscriptions/plans`; không hardcode cards trong Vue.

Cards bắt buộc hiển thị:

| Plan | Weekly scans | Accuracy target | Extra |
|---|---:|---|---|
| Free | 10 | ~80% | basic guidance/history |
| Plus | 100 | ~90% | enhanced verification, full history/impact |
| Household | 250 | >90% | 4 accounts + optional child accounts, Coming soon |

Footnote exact meaning: “Accuracy figures are benchmark targets, not a guarantee for every image.”

Household:

- Hiện như viable option.
- CTA disabled/Coming soon.
- Backend fake checkout `HOUSEHOLD` trả 409 `PLAN_NOT_AVAILABLE`.
- Không implement member/child model trong demo.

### 11.2 Fake checkout

- UI không nhận card number/CVV/expiry.
- Success gửi `{planCode:'PLUS', paymentMethodToken:'tok_demo_visa'}`.
- Decline test/UI gửi `tok_demo_declined`.
- Success transaction insert + subscription update cùng DB transaction.
- Decline transaction được ghi `DECLINED`, subscription không đổi.
- Current usage được giữ khi upgrade/downgrade.
- Downgrade Free khi used >10 chặn scan đến tuần reset; không cắt used count.
- `GET /subscriptions/transactions` trả fake history current user.

### 11.3 Re-Sort Bin

Bên dưới cards giữ exact button:

> Connect with your Re-Sort Bin

Click mở modal:

- Title “Re-Sort Bin connection”.
- Copy giải thích smart bin connectivity is coming soon.
- Không gọi hardware API.

---

## 12. API contract `/api/v1`

### 12.1 Auth

| Method | Endpoint | Auth | Result |
|---|---|---|---|
| POST | `/auth/register` | no | access token + refresh cookie + user |
| POST | `/auth/login` | no | access token + refresh cookie + user |
| POST | `/auth/refresh` | refresh cookie | rotated access/refresh |
| POST | `/auth/logout` | access/cookie | revoke + clear cookie, 204 |
| GET | `/auth/me` | yes | user + subscription |

### 12.2 Countries/scans

| Method | Endpoint | Auth | Result |
|---|---|---|---|
| GET | `/countries` | yes | enabled/coming-soon countries + active rule metadata |
| POST | `/scans` | yes | multipart image + countryCode + Idempotency-Key |
| GET | `/scans/:id` | owner | scan state + identification |
| GET | `/scans/:id/thumbnail` | owner | private sanitized image |
| POST | `/scans/:id/decision` | owner | accept/reject; reject optional reason/comment |

### 12.3 Waste/analytics

| Method | Endpoint | Auth | Result |
|---|---|---|---|
| GET | `/waste-records` | owner | paginated/filter list |
| GET | `/waste-records/:id` | owner | full Analysis DTO |
| PATCH | `/waste-records/:id/weight` | owner | recalculate carbon |
| DELETE | `/waste-records/:id` | owner | 204 |
| GET | `/analytics/summary` | owner | date/category/suggestion aggregate |

### 12.4 Subscription

| Method | Endpoint | Auth | Result |
|---|---|---|---|
| GET | `/subscriptions/plans` | yes | 3 plan definitions |
| GET | `/subscriptions/current` | owner | plan + usage + reset |
| POST | `/subscriptions/fake-checkout` | owner | fake success/decline |
| POST | `/subscriptions/switch-to-free` | owner | immediate demo downgrade |
| GET | `/subscriptions/transactions` | owner | fake payment history |

### 12.5 Operations

- `GET /health/live`: process alive only.
- `GET /health/ready`: DB `SELECT 1`, migration status, `dataMode`, resolved `aiMode`, OpenAI configured boolean, active Germany rule-set version/freshness. Không gọi OpenAI trong health.
- Swagger at `/api/v1/docs`.

### 12.6 Error envelope

```json
{
  "statusCode": 429,
  "code": "WEEKLY_SCAN_LIMIT_REACHED",
  "message": "You have reached your weekly scan limit.",
  "requestId": "uuid",
  "details": {
    "plan": "FREE",
    "limit": 10,
    "used": 10,
    "resetsAt": "ISO-8601"
  }
}
```

Không trả stack trace/internal DB/OpenAI message cho client.

---

## 13. Frontend refactor contract

`MobileExperience.vue` hiện chứa quá nhiều screens. Refactor sang view/components nhưng không làm thay đổi visual:

```text
apps/web/src/
├── api/
├── stores/
│   ├── auth.ts
│   ├── scan.ts
│   ├── subscription.ts
│   └── analytics.ts
├── views/
│   ├── LoginView.vue
│   ├── RegisterView.vue
│   ├── HomeView.vue
│   ├── ScanView.vue
│   ├── ReviewView.vue
│   ├── AnalysisView.vue
│   ├── HistoryView.vue
│   ├── ImpactView.vue
│   ├── SubscriptionView.vue
│   └── ProfileView.vue
└── components/
```

Frontend rules:

- API DTOs từ `@resort/contracts`, không duplicate interface.
- Mọi route detail tự fetch theo route param; không phụ thuộc navigation state.
- Không catch API error rồi mutate local fake success.
- Loading/error/empty/disabled states rõ ràng.
- Scan submit disabled khi remaining = 0, nhưng backend vẫn source of truth.
- File input keyboard accessible, target tối thiểu 44×44.
- Modal có focus trap, Escape, accessible title, restore focus.
- Country selector dùng API state và disabled options đúng semantics.
- Null carbon, low confidence, local guidance và provider mode render rõ.
- Không đưa API key vào frontend bundle.

---

## 14. Security, privacy và reliability

### 14.1 Security

- Helmet hoặc equivalent secure headers.
- CORS allow exact `WEB_ORIGIN` ở production; credentials true cho refresh cookie.
- Auth rate limit theo route; scan rate limit ngoài weekly quota.
- Argon2id password hash.
- JWT secret đủ mạnh; key không log.
- DTO whitelist + forbid non-whitelisted.
- Ownership guard/repository invariant cho mọi resource.
- UUID/idempotency validation.
- Parameterized DB queries/TypeORM.
- Fake checkout không nhận/lưu payment data thật.

### 14.2 Privacy

- Strip EXIF/GPS trước lưu/gửi.
- Private upload directory; không static serve.
- OpenAI `store:false`.
- UI privacy line giữ “Metadata removed before analysis”.
- Retention cleanup command/job xóa expired image và DB media row an toàn.
- Logs không chứa image/base64/password/cookie/API key/access token.
- Image có người/label riêng tư vẫn phải có user feedback/retention disclosure.

### 14.3 Reliability

- Request ID middleware và structured logs.
- OpenAI timeout/retry/circuit-safe errors.
- DB transaction cho quota, decisions và checkout.
- Idempotent migrations/seeds.
- Graceful shutdown đóng DB connection.
- Readiness 503 khi DB unavailable hoặc config mode invalid.

---

## 15. Testing strategy bắt buộc

### 15.1 Test isolation P0

- Unit/integration default set `NODE_ENV=test`, `AI_MODE=mock` trước AppModule import.
- Config test không load root `.env` hoặc không cho `.env` override test env.
- Spy/assert OpenAI client không bao giờ được gọi trong `pnpm test`.
- OpenAI contract test nằm script riêng và skip trừ khi `RUN_OPENAI_CONTRACT_TEST=true` + key.

### 15.2 Backend unit tests

- Password/refresh rotation/revocation.
- Country enable validation/default DE.
- Rule precedence: hazard > battery > e-waste > deposit > packaging > residual.
- Yellow bin packaging invariant.
- Low confidence → local guidance.
- Germany source/version/effective date.
- Carbon formula/factor selection/null/update behavior.
- Week start Europe/Berlin including DST boundary.
- Deterministic suggestions.
- AI schema parsing/refusal/error mapping with mocked SDK.

### 15.3 Database/integration tests

- Migrations from empty DB and repeat without drift.
- Register/login/refresh/logout.
- Two-user ownership isolation.
- Atomic quota under concurrent uploads; never exceed limit.
- Same idempotency key uses one quota and one scan.
- Technical AI failure releases quota once.
- Accept creates exactly one record.
- Reject creates exactly one feedback and no record.
- Repeated decision returns 409.
- Weekly reset creates new usage row.
- Fake checkout success atomic; decline no plan change.
- Analytics only current user accepted records.

### 15.4 Frontend component tests

- Login/register validation and auth redirect.
- Country options/API selection and actual form country.
- File type/size errors.
- Scan retry reuses same idempotency key.
- Review renders actual identification.
- Reject exact success popup.
- Analysis deep-link fetch.
- Null carbon copy.
- Dynamic category/chart data, no hardcoded counts.
- Plan cards show weekly limit + accuracy target from API.
- Household disabled.
- Fake checkout success/decline.
- Logout clears state and returns login.

### 15.5 Browser E2E/Playwright

1. Login demo user/password.
2. Country default Germany; other countries disabled.
3. Upload fixture → review → accept → complete Analysis.
4. Upload fixture → reject → popup exact “Your feedback has been received” → no waste record.
5. Update weight → carbon recalculates or remains null correctly.
6. History deep-link survives browser refresh.
7. Dashboard values change only after accept.
8. Free quota reaches 10, next scan blocked with reset date.
9. Upgrade Plus fake success → 100 limit; usage preserved.
10. Fake decline leaves plan unchanged.
11. Household cannot checkout.
12. Re-Sort Bin modal exact title/copy.
13. Logout → protected route redirects login.
14. User B cannot access User A URL.
15. Mobile viewport and desktop responsive screenshots/DOM assertions.

### 15.6 Final verification commands

Codex phải chạy và sửa đến khi tất cả pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm verify
```

`pnpm verify` phải tự cô lập mock AI; không phụ thuộc giá trị `AI_MODE` trong developer `.env`.

---

## 16. Implementation sequence cho Codex

Mỗi phase phải đạt gate trước khi đi tiếp. Không tạo code song song gây merge conflict trong cùng file.

### Phase 0 — Protect baseline và fix test isolation

- Audit `git status`, diff, source tree, current tests.
- Chụp baseline routes/UI behavior bằng tests.
- Fix test config để default tests luôn mock và không network.
- Normalize env schema và `.env.example`.
- Gate: current feature tests + `pnpm verify` pass ngay cả khi local `.env` là openai.

### Phase 1 — PostgreSQL foundation

- Tạo DataSource, entities, migrations, seeds.
- Seed countries, plans, Germany sources/rules, carbon factors và demo accounts.
- Tạo repository ports/adapters.
- Chuyển runtime từ `MemoryStore` sang PostgreSQL.
- Gate: restart API không mất plan/history; migration/seed idempotent; readiness query DB thật.

### Phase 2 — Auth + ownership

- Refresh session entity/service/controller.
- Login/register/refresh/logout/me.
- Frontend auth views/store/interceptor/route guards/profile logout.
- Apply owner-scoped queries everywhere.
- Gate: auth E2E + two-user isolation pass.

### Phase 3 — Media + scan/quota orchestration

- Sanitize/private store/thumbnail.
- Atomic quota/idempotency/state machine.
- CountryCode end-to-end.
- Replace client-side quota mutation bằng backend refresh.
- Gate: invalid images, retry, concurrency, quota compensation tests pass.

### Phase 4 — AI boundary correction

- Provider interface + scenario-rich mock.
- OpenAI Responses + Structured Outputs identification-only.
- Remove AI disposal recommendation from contracts/UI.
- Plus verification strategy.
- Grounded narrative optional + fallback.
- Gate: mock E2E đa category; unit tests prove model cannot set final bin.

### Phase 5 — Germany rule engine + legal refresh

- Verify current official sources, including VerpackDG/PPWR effective 2026-08-12.
- Seed rule set/version/precedence.
- Implement matcher and local guidance.
- Remove stale active VerpackG rule reference.
- Gate: rule matrix and source/effective date tests pass.

### Phase 6 — Accept/reject + Analysis/carbon

- Atomic decisions, feedback persistence, exact popup.
- Waste record snapshots.
- Factor-based carbon, weight source/edit/null UI.
- Deep-link record fetch.
- Gate: accept/reject/carbon E2E pass.

### Phase 7 — History/analytics/suggestions

- Pagination/filter/delete.
- DB aggregates by user/timezone.
- Replace all hardcoded charts/counts/insights.
- Gate: fixture totals match UI/API exactly; rejected excluded.

### Phase 8 — Subscription/payment completion

- API-driven cards + accuracy labels.
- Atomic fake checkout success/decline/transaction history.
- Plus pipeline selection, Free downgrade behavior.
- Household display-only + bin modal.
- Gate: complete subscription E2E pass.

### Phase 9 — Security/privacy/observability/polish

- Helmet, rate limits, request IDs, log redaction, cleanup job.
- Accessibility, keyboard/mobile/desktop QA.
- Swagger and error envelope.
- Gate: no security regression, no console errors, no secret in tracked files.

### Phase 10 — Clean-state verification và handoff

- Run all commands Section 15.6.
- Re-run migration/seed from clean test DB.
- Run browser flows at mobile + desktop.
- Update README only after commands are proven.
- Run `git diff --check`, inspect `git status`, no build/uploads/env tracked.
- Final report: implemented features, commands/results, startup, mock/openai mode, known intentional coming-soon items only.

---

## 17. Definition of Done

### Platform/database

- [ ] `pnpm install` works from clean clone.
- [ ] PostgreSQL healthy; app runtime uses it.
- [ ] Migrations and seeds are versioned/idempotent.
- [ ] Restart preserves users, scans, history, subscription and quota.
- [ ] `DATA_MODE=postgres` health is truthful.
- [ ] No secret/env/upload/dist tracked.

### Auth/security

- [ ] Username/password register/login UI + API.
- [ ] Refresh token rotation in HttpOnly cookie.
- [ ] Real logout/revocation.
- [ ] Protected routes and owner-scoped resources.
- [ ] Two-user isolation tests pass.
- [ ] Auth/scan rate limits and secure headers.

### Module 1

- [ ] Germany default, selection submitted end-to-end.
- [ ] Other countries display disabled/Coming soon.
- [ ] Camera + photo library + exact tip + preview/reselect.
- [ ] Magic-byte validation, EXIF/GPS removal, resize, private storage.
- [ ] Mock and OpenAI provider abstraction.
- [ ] OpenAI output identification-only, strict schema, `store:false`.
- [ ] Review object/material/symbol/confidence/uncertainty.
- [ ] Accept once; reject once.
- [ ] Reject persists feedback and exact popup.
- [ ] Quota/idempotency/concurrency/compensation safe.

### Module 2

- [ ] Versioned deterministic Germany rules.
- [ ] Current VerpackDG/PPWR source active, stale VerpackG not active.
- [ ] Hazard/battery/e-waste precedence correct.
- [ ] Yellow bin packaging invariant.
- [ ] Analysis type/bin/instructions/reason/source/local warning.
- [ ] Conditional reuse/recycle suggestions.
- [ ] Editable weight with source.
- [ ] Versioned carbon proxy + correct null state/disclaimer.
- [ ] History/pagination/deep links.
- [ ] User/timezone-aware daily/category analytics.
- [ ] Deterministic + optional grounded AI environmental suggestions.

### Module 3

- [ ] Free 10/week + target ~80% shown.
- [ ] Plus 100/week + target ~90% shown.
- [ ] Household 250/week, 4 accounts, child option, >90%, Coming soon.
- [ ] Accuracy target footnote.
- [ ] API-driven cards.
- [ ] Fake payment success/decline, no card data, transaction persisted.
- [ ] Upgrade/downgrade quota behavior.
- [ ] Exact “Connect with your Re-Sort Bin” + modal.

### Quality

- [ ] Default tests never call OpenAI.
- [ ] Unit/integration/frontend/E2E tests pass.
- [ ] Lint/typecheck/build/verify pass.
- [ ] Swagger and health endpoints work.
- [ ] No browser console error in core flows.
- [ ] Mobile + desktop responsive and keyboard accessible.
- [ ] Existing visual design/features retained.
- [ ] No TODO/FIXME in required flows.
- [ ] README quickstart verified.

---

## 18. Acceptance evidence Codex phải bàn giao

Final response không chỉ nói “done”. Phải kèm:

1. Summary modules đã hoàn tất.
2. Danh sách commands đã chạy và pass/fail counts.
3. URL local + demo credentials.
4. Database mode và AI mode đã verify.
5. Germany active rule-set version/effective date và packaging-law migration note.
6. OpenAI contract test result hoặc “not run — no key”; mock completion vẫn là 100% demo completion.
7. Duy nhất các giới hạn chủ động còn lại: Household execution, hardware connection, real payment, municipality rules, carbon full LCA.
8. `git status --short` để người dùng thấy file changes; không tự commit trừ khi được yêu cầu.

---

## 19. Nguồn kỹ thuật và pháp lý

### OpenAI official documentation

- Model catalog and image-capable current models:  
  `https://developers.openai.com/api/docs/models`
- Images and vision via Responses API:  
  `https://developers.openai.com/api/docs/guides/images-vision`
- Structured Outputs and Zod parsing:  
  `https://developers.openai.com/api/docs/guides/structured-outputs`
- Codex workflows for understanding codebases, QA and goal-based execution:  
  `https://learn.chatgpt.com/use-cases`

### Germany/EU

- VerpackDG official publication:  
  `https://www.recht.bund.de/bgbl/1/2026/207/VO.html`
- German Government effective-date summary:  
  `https://www.bundesregierung.de/breg-de/aktuelles/verpackungsrecht-gesetz-2406776`
- EU PPWR Regulation (EU) 2025/40:  
  `https://eur-lex.europa.eu/eli/reg/2025/40/oj`
- KrWG:  
  `https://www.gesetze-im-internet.de/krwg/BJNR021210012.html`
- ElektroG §10:  
  `https://www.gesetze-im-internet.de/elektrog_2015/__10.html`
- BattDG:  
  `https://www.gesetze-im-internet.de/battdg/`
- UBA household sorting guidance:  
  `https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt`

---

## 20. Stop condition

Codex chỉ được dừng khi:

- toàn bộ Definition of Done đã đạt ở mock mode;
- app chạy end-to-end với PostgreSQL;
- current features không regression;
- test/verify/build/E2E pass;
- chỉ còn những hạng mục được ghi rõ Coming soon/out of scope;
- hoặc có external blocker không thể mock như Docker hoàn toàn unavailable. Trong trường hợp blocker thật, Codex vẫn phải hoàn tất mọi phần không phụ thuộc blocker, ghi command/error evidence và không biến thiếu OpenAI key thành blocker.
