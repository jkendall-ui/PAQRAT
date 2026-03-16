# PA Exam Prep App — Finalized Product Specification

**Version:** 1.0  
**Status:** Approved  
**Prepared for:** Kiro  

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Infrastructure & Vendors](#2-infrastructure--vendors)
3. [Client — React PWA](#3-client--react-pwa)
4. [Authentication — Google OAuth 2.0](#4-authentication--google-oauth-20)
5. [Backend — Node.js + Express](#5-backend--nodejs--express)
6. [Data — PostgreSQL](#6-data--postgresql)
7. [Media](#7-media)
8. [AI Adaptive Engine](#8-ai-adaptive-engine)
9. [Admin Role](#9-admin-role)
10. [Core Features & UX Patterns](#10-core-features--ux-patterns)
11. [Accessibility](#11-accessibility)
12. [Post-Launch Roadmap](#12-post-launch-roadmap)

---

## 1. Product Vision

An adaptive, AI-powered study platform for Physician Assistant (PA) students preparing for the PANCE and PANRE exams. The app identifies knowledge gaps, serves rich multimedia content, and personalizes study sessions using AI — helping students build toward exam readiness with precision.

**Target users:** PA students (individual accounts, no institutional licensing at launch)  
**Target exams:** PANCE (entry-level) and PANRE (recertification)  
**Pricing model:** Free at launch. Architecture must support adding individual paid plans (free / pro) in the future without a schema rework.  
**Scale:** Low volume at launch. Infrastructure chosen accordingly.

---

## 2. Infrastructure & Vendors

All infrastructure runs across two vendor platforms. No additional third-party accounts are required at launch.

| Need | Vendor | Service |
|---|---|---|
| React PWA hosting | **Vercel** | Static deploy + edge CDN |
| Image optimization | **Vercel** | Built-in image optimization pipeline |
| Media storage (images, EKGs, audio) | **Vercel** | Vercel Blob |
| Node.js API | **Railway** | Docker container |
| PostgreSQL | **Railway** | Managed Postgres add-on |
| Scheduled jobs (cron) | **Railway** | Railway cron |
| Video content | **YouTube / Vimeo** | Embed via iframe (no storage cost) |

**No Redis at launch.** Postgres handles all data needs at low volume. Redis should be revisited when a concrete performance problem justifies it — it is a straightforward Railway add-on when needed.

**No email at launch.** Email features (weekly reports, nudges) are deferred to the post-launch roadmap.

---

## 3. Client — React PWA

### Framework & Tooling

| Decision | Choice |
|---|---|
| Framework | React 18 |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| Server state | TanStack Query |
| PWA | Vite PWA plugin + service worker |
| Offline storage | IndexedDB via Dexie.js |

### Mobile-First Design

- All layouts designed for mobile viewport first. `sm:`, `md:`, `lg:` breakpoints scale up to tablet and desktop.
- **Bottom tab bar navigation** with 4 tabs: Dashboard, Study, Library, Progress. Thumb-reachable on all phone sizes.
- **Light mode only.** No dark mode at launch.

### PWA Capabilities

- Installable on iOS and Android via browser "Add to Home Screen."
- Current study session (active question set) cached in IndexedDB so students can study without a WiFi connection.
- Service worker handles offline fallback screens gracefully.

### No Native App

This is a PWA only. React Native is not in scope. One codebase targets all platforms.

---

## 4. Authentication — Google OAuth 2.0

### Flow

1. User taps "Sign in with Google" in the React app.
2. Browser redirects to Google OAuth consent screen.
3. Google returns an ID token to the app.
4. App sends ID token to the API (`POST /auth/google`).
5. API verifies the ID token using `google-auth-library`.
6. API mints a short-lived JWT (15 min) and a refresh token stored in an `httpOnly` cookie.
7. Refresh token rotation occurs on every use.

### Rules

- **Any Google account is permitted.** No school email domain restrictions.
- **No passwords.** Google OAuth is the only sign-in method.
- **No self-serve account creation** beyond the OAuth flow.

### Roles

There are two roles on the `users` table: `student` and `admin`.

- All new users are assigned the `student` role on first sign-in.
- Admin accounts are promoted manually via a seed script or direct database update. There is no self-serve admin signup.
- Admin-only API routes (`/admin/*`) are protected by role-check middleware, separate from standard JWT verification.

### Session Storage

Sessions are stored in a `sessions` table in Postgres. No Redis cache at launch.

### Future Payments

The `users` table includes a `plan` field (`free` | `pro`) defaulting to `free`. This enables adding individual paid subscriptions later without a schema migration.

---

## 5. Backend — Node.js + Express

### Runtime & Validation

- Node.js 20 LTS
- Express.js
- Zod for all request/response validation

### API Route Groups

| Route group | Purpose |
|---|---|
| `/auth` | Google OAuth, JWT refresh, sign-out |
| `/users` | Profile read/update |
| `/questions` | Fetch questions, question bank browse |
| `/sessions` | Start/end study session, session history |
| `/attempts` | Submit answer, fetch attempt history |
| `/progress` | Topic scores, readiness score, heatmap data |
| `/analytics` | Performance trends, gap report |
| `/media` | Generate signed Vercel Blob URLs for media assets |
| `/admin` | Admin-only: user management, reports, question bank CRUD |

### Background Jobs (Railway Cron)

No queue system at launch. Async work runs as Railway cron jobs on a schedule.

| Job | Schedule | Purpose |
|---|---|---|
| Elo score recalculation | Nightly (2am UTC) | Recalculate topic scores from attempt history |
| Spaced repetition decay | Nightly (2am UTC) | Apply decay factor to topic scores not recently reviewed |
| Analytics rollup | Nightly (3am UTC) | Aggregate daily attempt stats per user |

### Deployment

The API is containerized with Docker and deployed to Railway. Auto-deploy on push to `main`.

---

## 6. Data — PostgreSQL

### ORM

Prisma — type-safe queries, clean migration workflow, excellent TypeScript integration.

### Core Schema

#### `users`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `google_id` | string unique | From Google OAuth |
| `email` | string unique | |
| `name` | string | |
| `avatar_url` | string nullable | |
| `role` | enum | `student` \| `admin` |
| `plan` | enum | `free` \| `pro` (default: free) |
| `target_exam` | enum | `PANCE` \| `PANRE` |
| `exam_date` | date nullable | Student's target exam date |
| `is_blocked` | boolean | Default false. Admin can block. |
| `created_at` | timestamp | |

#### `categories`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | string | e.g. "Cardiology" |
| `nccpa_task_area` | string | NCCPA blueprint mapping |
| `parent_id` | UUID nullable | Subcategory support |

#### `questions`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `body` | text | Question stem / vignette |
| `type` | enum | `single_best_answer` \| `case_based` |
| `difficulty` | int | 1–5 |
| `category_id` | UUID FK | |
| `explanation` | text | Full rationale with why each answer is correct/incorrect |
| `nccpa_task_area` | string | |
| `is_active` | boolean | Admin can deactivate questions |
| `created_at` | timestamp | |

#### `question_options`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `question_id` | UUID FK | |
| `body` | text | Answer option text |
| `is_correct` | boolean | |
| `explanation` | text nullable | Per-option distractor explanation |

#### `question_media`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `question_id` | UUID FK | |
| `type` | enum | `image` \| `audio` \| `video_embed` \| `pdf` |
| `url` | string | Vercel Blob URL or YouTube/Vimeo embed URL |
| `alt_text` | string | Required for WCAG 2.1 AA compliance |
| `attribution` | string | Required for CC-licensed images |
| `caption` | string nullable | |

#### `study_sessions`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `mode` | enum | `adaptive` \| `exam_simulation` \| `weak_spot_sprint` |
| `started_at` | timestamp | |
| `ended_at` | timestamp nullable | |
| `ai_plan` | jsonb | AI-recommended question IDs and difficulty targets for this session |

#### `attempts`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `question_id` | UUID FK | |
| `session_id` | UUID FK | |
| `selected_option_id` | UUID FK | |
| `is_correct` | boolean | |
| `duration_ms` | int | Time spent on question |
| `confidence_rating` | int nullable | 1–3 self-rating (optional) |
| `created_at` | timestamp | |

#### `topic_scores`
One row per (user × category). This is the core of the adaptive engine.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `category_id` | UUID FK | |
| `elo_score` | float | Starts at 1000 |
| `attempt_count` | int | |
| `correct_count` | int | |
| `decay_factor` | float | Applied nightly for spaced repetition |
| `last_reviewed_at` | timestamp | |

#### `bookmarks`
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `question_id` | UUID FK nullable | |
| `created_at` | timestamp | |

#### `sessions` (auth)
| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK | |
| `refresh_token_hash` | string | Hashed refresh token |
| `expires_at` | timestamp | |
| `created_at` | timestamp | |

### Search

Standard Postgres full-text search (`tsvector`) on the `questions` table. Sufficient for a question bank under 500 questions. `pgvector` for semantic search is deferred to the post-launch roadmap.

### Indexes

- `attempts(user_id, created_at)` — for performance trend queries
- `attempts(user_id, question_id)` — for retry detection
- `topic_scores(user_id, category_id)` — unique, for fast heatmap queries
- `questions(category_id, difficulty, is_active)` — for adaptive question selection

---

## 7. Media

### Storage

All static media (images, EKGs, audio clips, PDFs) stored in **Vercel Blob**. Signed URLs with a 15-minute TTL are generated by the API — the Blob bucket is never publicly exposed directly.

### Image Optimization

Vercel's built-in image optimization pipeline is used for all images served to the client. This handles:
- Automatic WebP conversion
- Responsive `srcset` generation
- Lazy loading support

### Supported Media Types

| Type | Examples | Storage |
|---|---|---|
| Images | X-rays, CT/MRI slices, EKG strips, skin lesions, fundoscopic views, lab tables | Vercel Blob |
| Audio | Heart sounds, lung sounds | Vercel Blob (post-launch) |
| Video | Procedural demos, concept explainers | YouTube / Vimeo embed |
| PDF | High-yield reference cards | Vercel Blob |

### Image Content

All medical images at launch use **open-source or public domain** content. Approved sources:
- NIH National Library of Medicine
- Radiopaedia (Creative Commons licensed)
- Wikimedia Commons medical collections
- PhysioNet (EKG strips)

The `question_media` table includes an `attribution` field. CC-licensed images must have attribution recorded and displayed to comply with license terms.

### Admin Upload Flow

1. Admin selects a file in the admin interface.
2. API generates a presigned Vercel Blob upload URL.
3. Client uploads the file directly to Vercel Blob.
4. API records the media metadata (URL, type, alt text, attribution) in the `question_media` table.

### Video

Video content embeds via YouTube or Vimeo `<iframe>`. No video files are stored. All embeds must use unlisted links for licensed content to restrict access.

---

## 8. AI Adaptive Engine

### Overview

The adaptive engine is a service module in the Node.js API that calls the **Claude API**. It takes a student's performance history and returns a recommended question set and difficulty targets for the next study session.

### Diagnostic Baseline

New users complete a **20-question diagnostic block** on first sign-in, spanning all NCCPA categories. This establishes a starting Elo score per category before adaptive sessions begin.

### Scoring Model

An **Elo-style scoring system** per (user × category):
- Correct answer on a question harder than expected → score increases more
- Incorrect answer on a question easier than expected → score decreases more
- Starting score: 1000 per category
- Scores are recalculated nightly via Railway cron

### Gap Detection

After each study session the API evaluates topic scores and flags any category where:
- Error rate exceeds 40% over the last 10 attempts, or
- Elo score has declined over the last 3 sessions

Flagged categories surface as "Focus Areas" on the student dashboard.

### Session Planning

The AI engine builds a recommended session plan from:
1. The student's current topic scores across all categories
2. Flagged gap categories
3. The selected session mode
4. Time since each category was last reviewed (spaced repetition decay)

The plan is a JSON object stored in `study_sessions.ai_plan`, containing recommended question IDs and difficulty targets.

### Study Session Modes

| Mode | Description |
|---|---|
| Adaptive | AI-planned mix of gap remediation + strength reinforcement |
| Exam simulation | Fixed 120-question PANCE-style timed block |
| Weak spot sprint | 10-question burst focused on a single flagged category |

### Readiness Score

A 0–100 score calculated from the student's weighted Elo scores across all NCCPA categories, adjusted for exam date proximity. Displayed prominently on the dashboard.

---

## 9. Admin Role

### Access

- Admin accounts are created by manually setting `role = 'admin'` in the database via seed script or direct update.
- Admin routes (`/admin/*`) are protected by role-check middleware on the API.
- The admin UI is a role-gated section of the React app at `/admin`. No separate admin frontend.

### Admin Capabilities

| Capability | Notes |
|---|---|
| Block / unblock users | Blocked users receive a 403 on login with a "your account has been suspended" message |
| View all user accounts | Name, email, join date, plan, last active |
| View usage reports | Active users, session counts, question attempt volume |
| View per-student progress | Topic scores, readiness score, attempt history |
| Question bank CRUD | Create, edit, deactivate questions and answer options |
| Media management | Upload images/audio, attach to questions, set attribution |

### Question Bank Management

At launch, the question bank is managed through the admin UI. There is no separate CMS. Deactivated questions (`is_active = false`) are excluded from all student-facing queries but are retained in the database.

---

## 10. Core Features & UX Patterns

### Dashboard

- Readiness score (0–100, prominently displayed)
- Today's Focus — 3 AI-recommended topic cards
- Study streak counter (with grace days to avoid demotivating students who miss a day)
- Exam countdown if exam date is set
- Link to start today's adaptive session

### Question Interface

- Clean, distraction-free single-question view
- Inline media viewer — tap/click to expand EKG, image, etc.
- Flag for review, bookmark for later
- Post-answer: immediate rationale reveal with visual hierarchy
  - Correct answer highlighted in green with a checkmark icon (not color alone — WCAG compliant)
  - Incorrect selection marked with an X icon
  - Full distractor explanations for all options
- Confidence self-rating (optional, 1–3 scale) before revealing answer

### Progress Heatmap

- NCCPA blueprint category grid, color-coded by mastery level
- Color is supplemented by a label or pattern — never color alone (WCAG 2.1 AA compliant)
- Tap any category cell to drill into that category's performance detail

### Analytics View

- Performance over time chart
- Weakest vs. strongest topic breakdown
- Predicted PANCE score band
- Total questions attempted, accuracy rate, study time

### Content Library

- Browseable question bank by organ system / category
- Video library (YouTube/Vimeo embeds) by topic
- My Bookmarks — saved questions
- High-yield reference cards (PDF viewer)

---

## 11. Accessibility

The app adheres to **WCAG 2.1 AA** throughout. Key requirements:

| Requirement | Implementation |
|---|---|
| Color contrast | Minimum 4.5:1 ratio for all body text, 3:1 for large text and UI components |
| Color independence | No information conveyed by color alone. Icons and labels accompany all color indicators (correct/incorrect, heatmap mastery levels) |
| Keyboard navigation | All interactive elements reachable and operable via keyboard |
| Focus indicators | Visible focus rings on all interactive elements — never removed with `outline: none` without a custom replacement |
| Images | All `<img>` elements and media have descriptive `alt` text. `alt_text` is a required field on `question_media` |
| Audio | All audio players have visible, labeled playback controls with ARIA labels |
| Form labels | All form inputs have associated `<label>` elements |
| Error messages | Form errors are announced to screen readers via `aria-live` regions |
| Touch targets | Minimum 44×44px touch target size on all interactive elements |

---

## 12. Post-Launch Roadmap

The following features are explicitly out of scope for launch and scheduled for post-launch evaluation:

| Feature | Rationale for deferral |
|---|---|
| Weekly progress report emails (Resend + React Email) | Not needed at low volume; in-app analytics covers the same need |
| Study streak / exam countdown nudge emails | Nice-to-have; PWA push notifications are a better mobile-first alternative |
| PWA push notifications | Engagement feature; evaluate after launch |
| Heart / lung sound audio | Content sourcing unresolved at launch |
| pgvector semantic question search | Overkill under 500 questions; revisit when bank exceeds ~2,000 |
| Multi-tenancy (institutional licensing) | Not needed until institutional sales; add `school_id` FK when required |
| Redis caching + BullMQ job queue | Not justified at low volume; straightforward Railway add-on when needed |
| Admin CMS UI (rich content editor) | Manage via admin interface and direct DB at launch; build when content volume demands it |
| Individual paid subscriptions (Pro plan) | Schema is ready (`plan` field on `users`); payments integration deferred |
| Peer benchmarking / leaderboards | Engagement feature for post-MVP |

---

*End of specification.*
