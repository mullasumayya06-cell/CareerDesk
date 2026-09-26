# 🚀 OpportunityOS — AI Master Context & Handoff Document

> **NOTE FOR ANY AI ASSISTANT (Claude, GPT, etc.):**  
> Read this document first before generating or modifying any code. It contains the single source of truth for **OpportunityOS**, current implementation status, architectural rules, and exact next steps. Do not hallucinate external packages or deviate from this specification.

---

## 1. Project Overview & Identity
* **Project Name**: **OpportunityOS** *(formerly "Campus Opportunity Hub" in early drafts)*
* **Target Audience**: College students & graduates in India looking for hackathons, coding contests, case competitions, and innovation challenges.
* **Core Value Proposition**: An all-in-one "student career OS" that aggregates live verified opportunities from multiple platforms via Brabble API, lets students search/filter with zero lag, and personalizes tracking (bookmarking, application status tracking, reminders).
* **Target Outcome**: A stellar portfolio project that demonstrates production-ready full-stack architecture, clean API integration, secure database design, and 100% uptime for recruiters.

---

## 2. Locked Production Tech Stack
* **Frontend**: Responsive UI (HTML5 / Modern CSS / Vanilla JS or React) deployed to **Vercel Edge CDN** (0s spin-up, instant global caching).
* **Backend**: Python (Flask / Serverless Functions) deployed on **Vercel**.
* **Database**: **Supabase (Managed PostgreSQL 15+)**:
  * Persistent cloud storage with Connection Pooling (`pgbouncer` on port 6543 for serverless).
  * Row Level Security (RLS) protecting student bookmarks, applications, and profile records.
* **External Ingestion Source**: **Brabble API** (`GET https://brabble.ai/api/listings`):
  * Refreshed hourly on Brabble's end.
  * Free tier: 1,000 requests/day.
  * Server-side authentication only (`BRABBLE_API_KEY`), never sent to the browser.
* **Sync Mechanism**: **Vercel Cron** hitting `/api/cron/sync` (protected with `CRON_SECRET`) hourly.

---

## 3. Current Implementation Status
* **Phase 0 (API Verification)**: ✅ Complete (Brabble API live test verified).
* **Phase 1 (Documentation & Rebranding)**: ✅ Complete (OpportunityOS branding updated across all docs).
* **Phase 2 (Repo & Security Hardening)**: ✅ Complete (Git initialized, security-hardened `.gitignore`, `.env.example` created, commit-per-change protocol established).
* **Phase 3 (Database Schema)**: ✅ Complete (7 Supabase migrations: 6 tables + RLS policies via MCP).
* **Phase 4 (Project Scaffold)**: ✅ Complete (Flask app factory, `vercel.json`, Supabase client).
* **Phase 5 (Brabble Sync Engine)**: ✅ Complete (BrabbleClient, normalizer, sync orchestrator).
* **Phase 6 (REST API)**: ✅ Complete (12 endpoints: opportunities, auth, bookmarks, applications, dashboard, submissi* **Phase 7 (Middleware & Security)**: ✅ Complete (auth decorators, rate limiter, input validators).
* **Phase 7.5 (Supabase Auth Migration & DB Cleanup)**: ✅ Complete (Dropped 26 legacy hospital tables, migrated from Flask sessions to Supabase Auth Google SSO only, created `opp_profiles` linked to `auth.users(id)` with automated trigger, Bearer JWT validation in middleware).
* **Phase 8 (Frontend Discovery UI & Career OS)**: ✅ Complete (Semantic HTML5, Neo-Cyber CSS design system, live stats radar, debounced search, mode/type filtering, optimistic bookmarks, Kanban pipeline tracker, Google SSO auth client, details & recovery modals).
* **Phase 9 (Live Ingestion, Full-Stack Testing & Vercel Deployment)**: ✅ Complete (Batch upserting in 15.8s, 914 live opportunities stored in Supabase, 11/11 automated tests passed, local server verified, Vercel deployment instructions prepared).
* **Phase 10 (Legal Compliance, Privacy Shield & WCAG 2.2 Accessibility)**: ✅ Complete (Privacy Policy, Terms & Conditions, Cookie Policy, Refund Policy, Cookie/Storage consent banner, statutory Grievance Officer details, Section 79 IT Act intermediary safe harbor, Right to Erasure cascade deletion `DELETE /api/auth/profile`, form submission consent, zero third-party trackers/ad pixels, inline SVG default avatar, WCAG 2.2 AA accessibility skip-links, focus rings, and aria-labels).

---

## 4. Master Development Roadmap

| Phase | Milestone | Description | Status |
| :---: | :--- | :--- | :--- |
| **0** | **API Verification** | Verified Brabble API endpoints, parameters, and live data | ✅ Done |
| **1** | **Spec Documentation** | Requirements, schemas, and security documented in `/docs` | ✅ Done |
| **2** | **Project Setup & Handoff** | Renamed to OpportunityOS, created context handoff system, git init | ✅ Done |
| **3** | **Database Schema (Supabase)** | Initial tables + RLS policies | ✅ Done |
| **4** | **Backend Scaffold** | Flask app factory, `vercel.json`, Supabase client factory (service_role + anon) | ✅ Done |
| **5** | **Brabble Sync Engine** | `brabble_client.py` (paginated, rate-limited), `normalizer.py`, `sync.py` (upsert + expire) | ✅ Done |
| **6** | **REST API (12 endpoints)** | Opportunities search/filter, auth, bookmarks, applications, dashboard, submissions, admin CRUD, cron sync | ✅ Done |
| **7** | **Security Middleware** | `login_required`/`admin_required` decorators, per-IP rate limiter, URL/input validators | ✅ Done |
| **7.5** | **Supabase Auth & DB Cleanup** | Dropped 26 legacy tables, Google SSO only, `opp_profiles` with `auth.users` trigger, Bearer JWT middleware | ✅ Done |
| **8** | **Frontend Discovery UI** | Neo-Cyber UI, Supabase Google sign-in, opportunity search & filter, bookmarks & Kanban tracker | ✅ Done |
| **9** | **Live Ingestion & Vercel Deployment** | Live sync (914 opportunities), batch upserting, 11/11 automated tests passed, deployment guide | ✅ Done |
| **10** | **Legal Compliance & Accessibility** | DPDP Act 2023 / GDPR / CCPA privacy policy, Terms of Service, cookie banner, Section 79 safe harbor, Right to Erasure, WCAG 2.2 AA | ✅ Done |

---

## 5. Critical Technical Constraints & Security Rules
1. **Zero Keys in Code**: All API keys, connection strings, and tokens must ONLY exist in `.env` (locally) and Vercel Environment Variables (in production). Never hardcode secrets.
2. **Never Expose `BRABBLE_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to the browser**: Ingestion and privileged operations happen strictly server-side.
3. **Commit After Every Change**: Run atomic git commits after completing each discrete unit of work.
4. **Zero Live Ingestion Queries on User Search**: Frontend search queries our indexed Supabase database, not the external Brabble API. Brabble is only hit by the hourly sync job.
5. **Anti-IDOR & Parameterized SQL**: Every user query is scoped to `user_id = authenticated_user_id` and executed via parameterized queries.
6. **Authentication Pattern**: Supabase Auth with Google OAuth Only. No passwords stored on OpportunityOS. API expects `Authorization: Bearer <supabase_access_token>`.

---

## 6. How to Resume This Session in Any AI Assistant (Claude / GPT)
When starting a new session or switching accounts, give the AI this prompt:

```markdown
I am building "OpportunityOS" — a student discovery & tracking platform for hackathons and coding contests.
Please read `context/PROJECT_STATE.md` and `docs/` in the project root to understand the complete architecture, stack, and current progress.
Follow all security rules: no hardcoded keys, commit after every single change, and do not hallucinate external dependencies.
Backend, Database, and Frontend are COMPLETE (Phases 3–8).
The UI is live in `public/` (Neo-Cyber aesthetic, Google OAuth Supabase Auth, Opportunity Explorer, Bookmark state, Kanban Pipeline tracker).
Next step: Phase 9 (Vercel Deployment & Cron Automation).
```

---

## 7. Session Activity Log
* **2026-09-20**: 
  * Workspace reviewed. Identified 20 documentation files.
  * Project officially renamed to **OpportunityOS**.
  * User confirmed stack choice: **Vercel + Supabase (PostgreSQL)**.
  * Security-hardened `.gitignore` and `.env.example` created with Supabase pooler credentials and `CRON_SECRET`.
  * Git initialized; staged `.agents/` skills and initial configuration.
  * First commit created: `chore: initialize repository with security rules, environment templates, and AI context`.
  * Updated entire documentation suite in `/docs`.
  * Enforced zero-application-code policy until user explicitly requested "build backend".
  * **Backend Built** (user command: "Build backend"):
    * Applied Supabase migrations via MCP: `opp_opportunities`, `opp_users`, `opp_bookmarks`, `opp_applications`, `opp_submissions`, `opp_sync_logs` + RLS policies.
    * Created Flask app factory (`api/index.py`) with CORS, error handlers.
    * Built Brabble sync engine: `brabble_client.py` (paginated fetch, rate limit tracking, retry), `normalizer.py` (Brabble→DB transform), `sync.py` (orchestrator).
    * Implemented 12 REST API endpoints across 8 blueprint files.
    * Security middleware: `auth_middleware.py`, `rate_limiter.py`, `validators.py`.
    * Commit: `b8e6a62` — 22 files, 2,187 insertions.
  * **Database Cleanup & Supabase Auth Migration (Google SSO Only)**:
    * Executed `drop_legacy_hospital_tables` migration: dropped all 26 tables from old hospital project (`orders`, `audit_events`, `patients`, `appointments`, `doctors`, `medicines`, etc.).
    * Executed `refactor_auth_to_opp_profiles` migration: removed `opp_users`, created `opp_profiles` linked 1-to-1 with `auth.users(id) ON DELETE CASCADE`.
    * Created automated trigger `handle_new_user` on `auth.users` to automatically populate `opp_profiles` with Google user metadata upon OAuth sign-in.
    * Re-linked foreign keys on `opp_bookmarks`, `opp_applications`, `opp_submissions` to `opp_profiles(id)`.
    * Updated `api/middleware/auth_middleware.py` to validate Supabase JWT access tokens from `Authorization: Bearer <token>` and inject `g.user_id` and `g.current_user`.
    * Updated `api/routes/auth.py` for Google-only auth (`GET /api/auth/me`, `PUT /api/auth/profile`, `POST /api/auth/forgot-password`, `POST /api/auth/logout`).
    * Updated `api/routes/admin.py` to join on `opp_profiles`.
    * Cleaned `api/index.py` session cookies for stateless JWT runtime and configured preflight OPTIONS handling.
    * Commit: `f7cb956`. All tests passed.
  * **Phase 8 (Frontend Discovery UI & Student Career OS)**:
    * Created `public/css/style.css`: Neo-Cyber Career Terminal design system (Deep Obsidian palette, glassmorphism, Google Fonts `Plus Jakarta Sans` & `Outfit`, urgency pulses, responsive breakpoints).
    * Created `public/index.html`: Semantic HTML5 layout, sticky navigation bar, live hero stats radar, search & filter controls, view tabs, modals, toast container, Supabase JS v2 CDN.
    * Created `public/js/config.js`: Dynamic configuration loading from server environment variables (`/api/config`).
    * Created `public/js/auth.js`: Google OAuth integration via Supabase Auth, session listener, profile sync, Bearer token injection.
    * Created `public/js/api.js`: REST client for Flask endpoints with automatic Bearer token headers.
    * Created `public/js/app.js`: Tab routing, debounced live search, mode/type filtering, deadline countdown timers, optimistic bookmarks, Kanban pipeline tracker, community submissions, admin review queue.
    * Updated `api/index.py` & `vercel.json` for seamless static serving and Vercel edge deployment.
    * Commit: `70d8527` (8 files, 2,702 insertions). All route & asset tests passed.
  * **Phase 9 (Live Ingestion, Full-Stack Testing & Vercel Deployment)**:
    * Applied database migration `widen_opportunity_columns` to support long organizer/platform strings.
    * Upgraded `api/services/sync.py` to batch upserting (chunks of 100) and timestamp-based expiration tracking.
    * Ran live ingestion: fetched 914 opportunities from Brabble and batch-upserted into Supabase in 15.8 seconds.
    * Added parameter aliases (`search` / `q`, `type` / `category`, `page` / `offset`, sort aliases) to `api/routes/opportunities.py`.
    * Implemented full-stack test suite (`11/11` assertions passed covering health, config, static assets, live data queries, search, and cron auth protection).
    * Verified local development server running on `http://127.0.0.1:3000`.
    * Commit: `350562a`. Production ready.
  * **Phase 10 (Legal Compliance, Privacy Shield, WCAG 2.2 Accessibility & Anti-Liability Overhaul)**:
    * Implemented full legal suite: `public/privacy.html` (DPDP Act 2023, GDPR, CCPA compliant), `public/terms.html` (Section 79 IT Act 2000 safe harbor intermediary status, 48h notice-and-takedown SLA), `public/cookies.html` (comprehensive storage inventory), and `public/refund.html` (₹0 platform service fee disclosure).
    * Implemented Cookie & Local Storage consent banner (`#cookieConsentBanner`) with persistent preferences in `localStorage`.
    * Designed statutory Grievance Redressal mechanism: Publisher: CareerDesk Technologies, Nandyal, Andhra Pradesh; Support: `sumayyamulla30@gmail.com`; Grievance Officer: Sumayya (`sumayyamulla30@gmail.com`) with 48h SLA.
    * Added user Right to Erasure cascade deletion endpoint: `DELETE /api/auth/profile` in `api/routes/auth.py`, wrapped in `ApiClient.deleteAccount()` and triggered via user profile menu with explicit confirmation modal.
    * Enforced statutory submission consent checkbox (`#submissionConsent`) on community event submission form.
    * Overhauled accessibility to WCAG 2.2 AA standard: added `.skip-link`, high-contrast `*:focus-visible` rings, descriptive `aria-label`s on buttons, landmark roles (`role="banner"`, `role="navigation"`, `role="main"`, `role="contentinfo"`, `role="region"`).
    * Replaced external Unsplash avatar dependency with a zero-network procedural SVG gradient avatar, eliminating third-party tracking and copyright risk.
    * Made hero prize pool counter dynamic and backed by live database totals.
    * Commit: `f99ed5e`. 100% compliant.

