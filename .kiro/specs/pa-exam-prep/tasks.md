# Implementation Plan: PA Exam Prep App

## Overview

Build an adaptive, AI-powered study platform for PA students preparing for PANCE/PANRE exams. The implementation follows a bottom-up approach: project scaffolding → data layer → API middleware & auth → core API routes → AI engine → frontend shell → feature pages → offline/PWA → admin interface → testing.

## Tasks

- [x] 1. Project scaffolding and configuration
  - [x] 1.1 Initialize monorepo with backend and frontend directories
    - Create `server/` directory with `package.json` (Express, Prisma, Zod, google-auth-library, @anthropic-ai/sdk, @vercel/blob, express-rate-limit, jsonwebtoken, bcrypt)
    - Create `client/` directory with Vite + React 18 + TypeScript template
    - Install Tailwind CSS, React Router v6, TanStack Query, vite-plugin-pwa, dexie
    - Create root `package.json` with workspace scripts
    - Copy `.env.example` to guide environment variable setup
    - _Requirements: 19.1, 20.1, 20.2, 21.1_

  - [x] 1.2 Configure Prisma schema and generate initial migration
    - Create `server/prisma/schema.prisma` with all enums (Role, Plan, TargetExam, SessionMode, QuestionType, MediaType, MediaTiming, SourceType, PrimaryTopic, LitflCategory, Difficulty, BoardRelevance, ClinicalUrgency, QuestionFormat)
    - Define all 18 models: User, Category, Question, QuestionOption, QuestionMedia, StudySession, Attempt, TopicScore, Bookmark, Case, SubCase, EcgFinding, AnswerLink, QuestionMediaRef, ClinicalPearl, CaseReference, CaseTag, AuthSession
    - Add all indexes per design document (attempts, topic_scores, questions, cases, sub_cases, ecg_findings, clinical_pearls, case_references, case_tags)
    - Run `npx prisma migrate dev` to generate and apply migration
    - _Requirements: 4.1, 25.1, 25.2, 25.3, 27.1, 27.2, 27.3, 27.4, 28.1, 28.2, 29.1, 29.2, 29.3, 29.4, 29.6, 30.1, 30.2, 30.3_

  - [x] 1.3 Set up Vitest and fast-check testing framework
    - Install vitest and fast-check in both server and client
    - Create `vitest.config.ts` for server with TypeScript paths
    - Create test directory structure: `tests/unit/`, `tests/property/`, `tests/integration/`
    - Add test scripts to package.json
    - _Requirements: N/A (testing infrastructure)_

  - [x] 1.4 Create seed script for NCCPA categories and admin user
    - Create `server/prisma/seed.ts` with all NCCPA blueprint categories (Cardiology, Pulmonary, Gastroenterology, etc.) and their task areas
    - Include a seed admin user with `role = admin`
    - _Requirements: 2.4, 3.3_

- [x] 2. Checkpoint — Ensure project builds, Prisma generates client, seed runs, and tests execute
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Authentication and authorization
  - [x] 3.1 Implement Google OAuth authentication endpoint
    - Create `server/src/routes/auth.ts` with `POST /auth/google` endpoint
    - Verify Google ID token using `google-auth-library`
    - Upsert user record (create with `role=student`, `plan=free` if new)
    - Mint JWT (15-min expiry) and refresh token, store hashed refresh token in `sessions` table
    - Return JWT in response body and refresh token in httpOnly cookie
    - Handle blocked users (return 403 with "Your account has been suspended.")
    - Handle invalid tokens (return 401)
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8_

  - [x] 3.2 Implement refresh token rotation and sign-out
    - Create `POST /auth/refresh` — validate refresh token from cookie, rotate token (invalidate old, issue new), return new JWT
    - Create `POST /auth/signout` — invalidate session record, clear cookie
    - _Requirements: 1.4_

  - [x] 3.3 Implement JWT auth middleware and role-check middleware
    - Create `server/src/middleware/auth.ts` — verify JWT from `Authorization: Bearer` header, attach `req.user` with userId and role, return 401 on failure
    - Create `server/src/middleware/roleCheck.ts` — check `req.user.role === 'admin'` for `/admin/*` routes, return 403 otherwise
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 3.4 Write property tests for auth (Properties 1–7)
    - **Property 1: Refresh token rotation invalidates previous token**
    - **Property 2: New user creation defaults (role=student, plan=free)**
    - **Property 3: Invalid token rejection returns 401**
    - **Property 4: Blocked user authentication denial returns 403**
    - **Property 5: Auth session persistence with hashed token**
    - **Property 6: JWT required on all authenticated routes**
    - **Property 7: Admin route access control returns 403 for non-admin**
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5**

- [x] 4. Zod validation middleware and error handling
  - [x] 4.1 Implement Zod validation middleware and global error handler
    - Create `server/src/middleware/validate.ts` — validate `req.body`, `req.query`, `req.params` against route-specific Zod schemas; return 400 with descriptive errors on failure
    - Create `server/src/middleware/errorHandler.ts` — catch all unhandled errors, map Prisma errors (unique constraint → 409, not found → 404), map Zod errors to 400, return structured JSON error response `{ error: { code, message, details } }`
    - _Requirements: 19.1, 19.2_

  - [x] 4.2 Define all Zod validation schemas
    - Create `server/src/schemas/auth.ts` — googleAuthSchema
    - Create `server/src/schemas/attempts.ts` — createAttemptSchema (with answer_format, raw_response_text fields)
    - Create `server/src/schemas/sessions.ts` — createSessionSchema
    - Create `server/src/schemas/questions.ts` — questionImportSchema
    - Create `server/src/schemas/cases.ts` — litflImportSchema (full LITFL case-based schema with metadata, cases, sub_cases, media, questions, answers, tags)
    - Create `server/src/schemas/users.ts` — updateProfileSchema
    - Create `server/src/schemas/media.ts` — createMediaSchema (require non-empty alt_text and attribution)
    - _Requirements: 19.1, 23.1, 23.8, 15.5, 16.4, 24.9_

  - [ ]* 4.3 Write property test for Zod validation rejection (Property 33)
    - **Property 33: Zod validation rejects invalid input with 400**
    - **Validates: Requirements 19.1, 19.2**

- [x] 5. Checkpoint — Ensure auth flow works end-to-end and validation rejects bad input
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Core scoring engine
  - [x] 6.1 Implement Elo score calculator
    - Create `server/src/services/eloCalculator.ts`
    - Implement `calculateNewScore(currentElo, questionDifficultyElo, isCorrect)` with K-factor 32
    - Implement `difficultyToElo(difficulty)` mapping: 1→600, 2→800, 3→1000, 4→1200, 5→1400
    - Expected score formula: `1 / (1 + 10^((questionDifficulty - playerElo) / 400))`
    - _Requirements: 4.2, 4.3, 4.4_

  - [x] 6.2 Implement gap detection service
    - Create `server/src/services/gapDetector.ts`
    - Implement `detectGaps(userId)` — query last 10 attempts per category, flag if error rate > 40%; query Elo score trend over last 3 sessions, flag if declining
    - _Requirements: 5.1, 5.2_

  - [x] 6.3 Implement spaced repetition decay calculator
    - Create `server/src/services/decayCalculator.ts`
    - Implement `applyDecay(currentScore, daysSinceReview)` with decay rate 0.995, minimum score floor 400
    - Formula: `newScore = max(currentScore * (0.995 ^ daysSinceReview), 400)`
    - _Requirements: 6.1, 6.2_

  - [x] 6.4 Implement readiness score calculator
    - Create `server/src/services/readinessCalculator.ts`
    - Implement `calculateReadiness(topicScores, categoryWeights, examDate?)` — weighted average of Elo scores mapped to 0–100, adjusted by exam proximity factor
    - _Requirements: 10.1, 10.2_

  - [ ]* 6.5 Write property tests for scoring (Properties 11–16, 22–23, 25)
    - **Property 11: Topic score uniqueness per student per category**
    - **Property 12: Elo score adjustment magnitude is monotonic with surprise**
    - **Property 13: Initial Elo score is 1000**
    - **Property 14: Gap detection by error rate (>40% over last 10)**
    - **Property 15: Gap detection by Elo decline over last 3 sessions**
    - **Property 16: Decay is monotonically increasing with time since review**
    - **Property 22: Readiness score range invariant (0–100)**
    - **Property 23: Exam proximity affects readiness score**
    - **Property 25: Category ranking correctness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 6.2, 10.1, 10.2, 13.2**

- [x] 7. Cron jobs
  - [x] 7.1 Implement nightly cron jobs
    - Create `server/src/cron/eloRecalculation.ts` — recalculate all topic scores from attempt history, scheduled at 2:00 AM UTC
    - Create `server/src/cron/spacedRepetitionDecay.ts` — apply decay factor to topic scores not recently reviewed, scheduled at 2:00 AM UTC
    - Create `server/src/cron/analyticsRollup.ts` — aggregate daily attempt statistics per student, scheduled at 3:00 AM UTC
    - Create `server/src/cron/index.ts` — register all cron jobs with node-cron
    - Add health check endpoint `GET /health` reporting last successful run time per job
    - _Requirements: 4.5, 6.1, 13.5_

- [x] 8. Study session and attempt API routes
  - [x] 8.1 Implement diagnostic baseline endpoint
    - Create logic in session creation to generate a 20-question diagnostic spanning all NCCPA categories
    - On completion, initialize TopicScore records for every category with Elo 1000
    - Gate adaptive sessions and exam simulations behind diagnostic completion
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 8.2 Write property tests for diagnostic baseline (Properties 8–10)
    - **Property 8: Diagnostic baseline covers all categories (20 questions, all NCCPA categories)**
    - **Property 9: Diagnostic completion initializes all topic scores**
    - **Property 10: Diagnostic gate for advanced sessions**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 8.3 Implement study session CRUD endpoints
    - Create `POST /sessions` — create study session with mode, call AI engine for adaptive mode, generate question set for exam_simulation (120 questions) and weak_spot_sprint (10 questions from selected category)
    - Create `PATCH /sessions/:id` — set ended_at timestamp
    - Create `GET /sessions` — paginated session history
    - Create `GET /sessions/:id` — session detail with attempts
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 8.4 Write property tests for sessions (Properties 17–20)
    - **Property 17: Session plan structure and persistence round-trip**
    - **Property 18: Exam simulation question count (exactly 120)**
    - **Property 19: Weak spot sprint scoping (10 questions, single category)**
    - **Property 20: Study session lifecycle records (started_at, ended_at)**
    - **Validates: Requirements 7.2, 7.3, 8.2, 8.3, 8.5, 8.6**

  - [x] 8.5 Implement attempt submission endpoint
    - Create `POST /attempts` — validate submission, check correctness against question options, create attempt record with selected option, correctness, duration, confidence rating
    - Update topic score Elo after each attempt using EloCalculator
    - Support answer_format field (multiple_choice, free_text, audio) and store raw_response_text for free text/audio
    - For free_text/audio: send to Claude API for semantic evaluation, parse correctness judgment, treat partially_correct as incorrect for Elo
    - Create `GET /attempts` — paginated attempt history with filters
    - _Requirements: 9.4, 24.4, 24.5, 24.6, 24.7, 24.9_

  - [ ]* 8.6 Write property tests for attempts (Properties 21, 38–40)
    - **Property 21: Attempt record completeness (all required fields stored)**
    - **Property 38: AI evaluation response structure (correctness, confidence, explanation)**
    - **Property 39: Partially correct treated as incorrect for Elo**
    - **Property 40: Answer format locked during session**
    - **Validates: Requirements 9.4, 24.6, 24.7, 24.9, 24.10**

- [x] 9. Checkpoint — Ensure sessions, attempts, and scoring work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. AI engine integration
  - [x] 10.1 Implement AI session planning service
    - Create `server/src/services/aiEngine.ts` implementing the `AIEngine` interface
    - Construct Claude API prompt with student's topic scores, gap categories, time-since-review data
    - Parse Claude response into `SessionPlan` (questionIds, difficultyTargets, rationale)
    - Store plan in `study_sessions.ai_plan` JSONB field
    - Implement fallback: if Claude is unavailable, use rule-based question selection from topic scores and gap categories
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 10.2 Implement Claude answer evaluation service
    - Create `server/src/services/answerEvaluator.ts`
    - For free text: send student response + correct answer + explanation to Claude with tool use for structured scoring output
    - For audio: placeholder for speech-to-text transcription, then same evaluation flow
    - Parse response: correctness judgment (correct/partially_correct/incorrect), confidence score, explanation
    - Use prompt caching for system prompt and tool definitions
    - _Requirements: 24.4, 24.5, 24.6, 24.8_

  - [x] 10.3 Implement Claude ECG vision analyzer service
    - Create `server/src/services/ecgVisionAnalyzer.ts`
    - Send ECG image URL + student claim to Claude vision API for validation
    - Use tool use for structured ECG analysis output (rate, rhythm, axis, intervals, findings)
    - _Requirements: per Claude Integration Guide — ECG Vision Analyzer role_

- [x] 11. Progress and analytics API routes
  - [x] 11.1 Implement progress endpoints
    - Create `GET /progress/scores` — return all topic scores + calculated readiness score
    - Create `GET /progress/heatmap` — return categories with mastery levels (color-coded data)
    - Create `GET /progress/gaps` — return current gap categories
    - Create `GET /progress/streak` — calculate study streak with grace day logic (single-day gap doesn't reset)
    - _Requirements: 5.3, 10.1, 10.2, 10.3, 11.1, 11.3, 11.4, 12.1_

  - [ ]* 11.2 Write property test for streak calculation (Property 24)
    - **Property 24: Study streak calculation with grace days**
    - **Validates: Requirements 11.3, 11.4**

  - [x] 11.3 Implement analytics endpoints
    - Create `GET /analytics/trends` — daily accuracy trend over configurable time window
    - Create `GET /analytics/summary` — total attempts, accuracy rate, study time, predicted PANCE score band
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 11.4 Write property test for analytics aggregation (Property 26)
    - **Property 26: Analytics summary aggregation correctness**
    - **Validates: Requirements 13.4, 17.4**

- [x] 12. Questions, bookmarks, and content API routes
  - [x] 12.1 Implement question browsing and search endpoints
    - Create `GET /questions` — paginated, filterable by categoryId, difficulty, with full-text search via PostgreSQL tsvector on question body
    - Create `GET /questions/:id` — single question with options and media
    - Exclude questions with `is_active = false` from all student-facing queries
    - _Requirements: 14.1, 14.5, 18.4_

  - [x] 12.2 Implement bookmark endpoints
    - Create `POST /bookmarks` — create bookmark (unique per user+question)
    - Create `DELETE /bookmarks/:id` — remove bookmark
    - Create `GET /bookmarks` — list user's bookmarks
    - _Requirements: 9.8, 14.3_

  - [ ]* 12.3 Write property tests for content (Properties 27–30)
    - **Property 27: Bookmark round-trip (add then list contains, remove then list doesn't)**
    - **Property 28: Full-text search returns matching questions**
    - **Property 29: Signed URL TTL invariant (15-minute expiry)**
    - **Property 30: Media record requires alt text and attribution**
    - **Validates: Requirements 14.3, 14.5, 15.1, 15.5, 16.3, 16.4**

- [x] 13. Media endpoints
  - [x] 13.1 Implement media signed URL and upload endpoints
    - Create `GET /media/:id/url` — generate signed Vercel Blob URL with 15-minute TTL
    - Create `POST /admin/media/upload-url` — generate presigned upload URL for admin
    - Create `POST /admin/media` — create question_media record with type, url, altText, attribution (validate non-empty alt_text and attribution)
    - _Requirements: 15.1, 15.2, 15.5, 16.1, 16.2, 16.3_

- [x] 14. Case-based content API routes
  - [x] 14.1 Implement case browsing endpoints
    - Create `GET /cases` — paginated case listing with filters (source_type, primary_topic, difficulty, board_relevance, clinical_urgency, search)
    - Create `GET /cases/:caseId` — full case detail with sub-cases, tags, clinical pearls, references
    - Create `GET /cases/:caseId/sub-cases/:subCaseId` — sub-case with media and progressive questions
    - Create `GET /cases/:caseId/sub-cases/:subCaseId/questions` — questions in sequence order with structured answers (summary, ecg_findings, interpretation_text, related_links)
    - _Requirements: 25.4, 25.6, 26.3, 26.4, 26.5, 27.5, 28.3, 28.4, 31.1, 31.2, 31.3, 31.4_

  - [ ]* 14.2 Write property tests for case tag filtering (Property 47)
    - **Property 47: Case tag filtering correctness (primary_topic, difficulty, board_relevance, clinical_urgency, source_type)**
    - **Validates: Requirements 29.5, 31.3**

- [x] 15. Admin API routes
  - [x] 15.1 Implement admin user management endpoints
    - Create `GET /admin/users` — paginated user list with name, email, join date, plan, last active
    - Create `PATCH /admin/users/:id/block` — set is_blocked true/false
    - Create `GET /admin/users/:id/progress` — view student's topic scores, readiness score, attempt history
    - Create `GET /admin/reports` — active user count, session count, attempt volume
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [ ]* 15.2 Write property test for block/unblock (Property 31)
    - **Property 31: Block/unblock user round-trip**
    - **Validates: Requirements 17.2, 17.3**

  - [x] 15.3 Implement admin question bank CRUD endpoints
    - Create `POST /admin/questions` — create question with stem, type, difficulty, category, explanation, options
    - Create `PATCH /admin/questions/:id` — edit question and options
    - Create `PATCH /admin/questions/:id/deactivate` — set is_active = false
    - _Requirements: 18.1, 18.2, 18.3, 18.5_

  - [ ]* 15.4 Write property test for deactivated question exclusion (Property 32)
    - **Property 32: Deactivated questions excluded from student queries but retained in database**
    - **Validates: Requirements 18.3, 18.4, 18.5**

- [x] 16. JSON import/export endpoints
  - [x] 16.1 Implement flat question import/export
    - Create `POST /admin/questions/import` — accept array of questions in flat JSON format, validate each with Zod, create Question + QuestionOption + QuestionMedia records; reject entire batch on any validation failure with 400 listing all errors with entry index
    - Create `GET /admin/questions/export` — export all active questions in JSON format; support optional `category_id` filter
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5_

  - [ ]* 16.2 Write property tests for question import/export (Properties 36–37)
    - **Property 36: Question import/export round-trip**
    - **Property 37: Import batch atomicity (one invalid entry rejects entire batch)**
    - **Validates: Requirements 23.2, 23.3, 23.4, 23.5**

  - [x] 16.3 Implement LITFL case-based import/export
    - Create `POST /admin/cases/import` — accept LITFL JSON payload (metadata + cases array), validate against litflImportSchema, create Case, SubCase, Question (with sequence, question_format, answer_summary, interpretation_text), EcgFinding, QuestionMedia (with extended type, timing, media_ref_id, local_filename), QuestionMediaRef, ClinicalPearl, CaseReference, CaseTag records; reject entire batch on any validation failure
    - Create `GET /admin/cases/export` — export all cases in LITFL JSON format; support optional source_type, primary_topic, difficulty filters
    - Ensure round-trip: import → export → import produces equivalent records
    - _Requirements: 23.8, 23.9, 23.10, 23.11, 23.12_

  - [ ]* 16.4 Write property tests for case import/export (Properties 42–52)
    - **Property 42: Case import creates complete entity graph**
    - **Property 43: Case import/export round-trip**
    - **Property 44: Case import batch atomicity**
    - **Property 45: Sub-case question sequence ordering**
    - **Property 46: ECG findings structure preservation**
    - **Property 47: Case tag filtering correctness**
    - **Property 48: Question-media reference integrity**
    - **Property 49: Case export filter correctness**
    - **Property 50: Clinical pearls and references association**
    - **Property 51: Extended media type and timing persistence**
    - **Property 52: Case ID uniqueness and pattern validation**
    - **Validates: Requirements 23.8, 23.9, 23.10, 23.11, 23.12, 25.1, 25.2, 25.3, 25.5, 26.1, 26.3, 26.4, 27.2, 28.1, 28.2, 29.5, 30.1, 30.2, 30.3**

- [x] 17. Checkpoint — Ensure all API routes work, import/export round-trips pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Material Design 3 design system foundation
  - [x] 18.1 Set up M3 Tailwind theme configuration
    - Install `@material/material-color-utilities` for seed color → tonal palette generation
    - Extend `tailwind.config.ts` with M3 color roles mapped to CSS custom properties (`--md-sys-color-*`) for primary, on-primary, primary-container, on-primary-container, secondary, tertiary, surface, surface-variant, surface-container (lowest/low/default/high/highest), outline, outline-variant, error, on-error
    - Add M3 typography scale as Tailwind `fontSize` extensions: display-lg/md/sm, headline-lg/md/sm, title-lg/md/sm, body-lg/md/sm, label-lg/md/sm with correct size/line-height/weight
    - Add M3 shape tokens as Tailwind `borderRadius` extensions: rounded-xs (4px), rounded-sm (8px), rounded-md (12px), rounded-lg (16px), rounded-xl (28px), rounded-full
    - Create Tailwind plugin for M3 elevation levels (0–5) using `color-mix()` surface tint approach
    - Add M3 motion tokens as Tailwind `transitionDuration` (duration-short1 through duration-long2) and `transitionTimingFunction` (easing-standard, easing-standard-decelerate, easing-standard-accelerate, easing-emphasized) extensions
    - _Requirements: 32.2, 32.3, 32.4, 32.5, 32.11_

  - [x] 18.2 Create M3 theme generator and CSS custom property injection
    - Create `client/src/theme/m3ThemeGenerator.ts` — function that takes a seed color, computes tonal palettes via `@material/material-color-utilities`, and sets all `--md-sys-color-*` CSS custom properties on `:root`
    - Call theme generator at app initialization to apply the M3 color scheme
    - _Requirements: 32.1, 32.2_

  - [x] 18.3 Build reusable M3 component primitives
    - Create `client/src/components/m3/M3NavigationBar.tsx` — M3 Navigation Bar (bottom) for mobile viewports with 4 destinations (Dashboard, Study, Library, Progress), icons + labels, M3 state layers
    - Create `client/src/components/m3/M3NavigationRail.tsx` — M3 Navigation Rail for tablet/desktop viewports (≥768px) with the same 4 destinations
    - Create `client/src/components/m3/M3SegmentedButton.tsx` — M3 Segmented button group for mode selection
    - Create `client/src/components/m3/M3FilterChip.tsx` — M3 Filter chip for case/question filtering
    - Create `client/src/components/m3/M3FAB.tsx` — M3 Floating Action Button for primary actions
    - Create `client/src/components/m3/M3Snackbar.tsx` — M3 Snackbar for transient feedback messages
    - Create `client/src/components/m3/M3BottomSheet.tsx` — M3 Bottom Sheet for contextual actions on mobile
    - Create `client/src/components/m3/M3Dialog.tsx` — M3 Dialog for confirmations
    - Create `client/src/components/m3/M3LinearProgress.tsx` — M3 Linear progress indicator
    - Create `client/src/components/m3/M3CircularProgress.tsx` — M3 Circular progress indicator
    - Create M3 Button variants (Filled, Outlined, Text, Icon Button) in `client/src/components/m3/M3Button.tsx`
    - Create M3 Card variants (Filled, Elevated, Outlined) in `client/src/components/m3/M3Card.tsx`
    - Create M3 Text Field variants (Filled, Outlined) in `client/src/components/m3/M3TextField.tsx`
    - Create M3 Chip variants (Input, Assist) in `client/src/components/m3/M3Chip.tsx`
    - All components must implement M3 state layers (hover 8%, focus 12%, pressed 12%, dragged 16%) via Tailwind pseudo-class utilities
    - _Requirements: 32.1, 32.6, 32.7, 32.8, 32.9, 32.10, 32.12, 32.13, 32.14_

  - [ ]* 18.4 Write property test for M3 navigation responsiveness (Property 53)
    - **Property 53: M3 navigation pattern responsiveness — Navigation Bar visible on mobile (<768px), Navigation Rail visible on tablet/desktop (≥768px), never both simultaneously, never neither**
    - **Validates: Requirements 32.6**

- [x] 19. Frontend shell and routing
  - [x] 19.1 Set up React app shell with routing and layout
    - Configure React Router v6 with all routes per design (LoginPage, DiagnosticPage, DashboardPage, StudyModePicker, SessionPage, SessionReviewPage, LibraryPage, CaseBrowserPage, CaseDetailPage, ProgressPage, AdminDashboard, AdminUsersPage, AdminQuestionsPage, AdminImportPage, AdminMediaPage)
    - Replace `BottomTabBar` with `M3NavigationBar` (mobile) and `M3NavigationRail` (tablet/desktop) for 4 destinations (Dashboard, Study, Library, Progress) — responsive switching at 768px breakpoint, thumb-reachable, 44×44px touch targets
    - Create `OfflineBanner` component for offline mode notification
    - Set up TanStack Query provider for server state management
    - Implement auth context with JWT storage and automatic refresh
    - Implement route guards: redirect unauthenticated users to login, redirect non-admin users from `/admin/*`
    - _Requirements: 21.1, 21.2, 21.3, 22.3, 22.4, 22.8, 32.6_

  - [x] 19.2 Implement Google OAuth login page
    - Create `LoginPage` with "Sign in with Google" M3 Filled button
    - Redirect to Google OAuth consent screen on tap
    - Handle callback: send ID token to `POST /auth/google`, store JWT, redirect to dashboard or diagnostic
    - _Requirements: 1.1, 1.2_

- [x] 20. Dashboard and progress frontend
  - [x] 20.1 Implement Dashboard page
    - Create `DashboardPage` with ReadinessGauge (0–100 score), FocusCards using `M3Card` filled variant (3 AI-recommended topics from gap categories), StreakCounter (with grace day display), ExamCountdown (if exam date set)
    - Add `M3FAB` for "Start Adaptive Session" primary action
    - Fetch data from `GET /progress/scores`, `GET /progress/gaps`, `GET /progress/streak`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 32.7, 32.8_

  - [x] 20.2 Implement Progress page with heatmap and analytics
    - Create `HeatmapGrid` — NCCPA category grid, color-coded by mastery level with text labels/patterns (not color alone), minimum 3:1 contrast ratio between adjacent cells
    - Tap category cell → navigate to category detail view with performance history, Elo trend, recent attempts
    - Create performance-over-time chart (accuracy trend across sessions)
    - Create weakest/strongest category breakdown using `M3Card` outlined variant for analytics summary cards
    - Display predicted PANCE score band
    - Display summary stats: total questions attempted, accuracy rate, total study time
    - Fetch data from `GET /progress/heatmap`, `GET /analytics/trends`, `GET /analytics/summary`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4, 22.1, 22.2, 32.8_

- [x] 21. Study session frontend
  - [x] 21.1 Implement study mode picker and session creation
    - Create `StudyModePicker` using `M3SegmentedButton` for three modes: Adaptive Session, Exam Simulation, Weak Spot Sprint
    - For Weak Spot Sprint: show category selector (only Gap_Categories)
    - Add answer format selector using `M3SegmentedButton` (multiple choice default, free text, audio) — format locked for entire session
    - On selection, call `POST /sessions` and navigate to session page
    - _Requirements: 8.1, 24.1, 24.10, 32.7_

  - [x] 21.2 Implement question interface (SessionPage)
    - Create `QuestionCard` using `M3Card` elevated variant — single-question view with stem, answer options (for multiple choice), `M3TextField` (for free text), record button (for audio)
    - Create `MediaViewer` — inline media display with tap-to-expand via `M3BottomSheet` for images/EKGs on mobile, display alt text on all images, show attribution for CC-licensed media, show `MediaTimingBadge` for timing indicators
    - Create `ConfidenceRating` using `M3SegmentedButton` — optional 1–3 scale before submission
    - Add "Flag for Review" and "Bookmark" actions using `M3IconButton` on each question
    - Submit answer using `M3Button` filled variant; on submit: call `POST /attempts`, display `AnswerFeedback`
    - Show `M3LinearProgress` for session progress (determinate)
    - Show `M3Snackbar` for transient feedback ("Bookmark saved", "Answer submitted")
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 15.4, 22.5, 24.1, 24.2, 24.3, 30.4, 30.5, 32.7, 32.8, 32.9, 32.12, 32.13_

  - [x] 21.3 Implement answer feedback display
    - Create `AnswerFeedback` using `M3Card` filled variant — correct answer in tertiary-container with checkmark icon, incorrect in error-container with X icon (not color alone)
    - Display full explanation with distractor explanations for all options
    - For free text/audio: display AI feedback alongside full rationale, show student response vs expected answer
    - For case-based questions: display `EcgFindingsDisplay` (structured findings grouped by category), answer summary, interpretation text, related links
    - _Requirements: 9.5, 9.6, 24.8, 27.5, 32.8_

  - [x] 21.4 Implement session review page
    - Create `SessionReviewPage` — post-session summary with score, time, flagged questions
    - Use `M3Dialog` for "End Session" confirmation before finalizing
    - Call `PATCH /sessions/:id` to end session
    - _Requirements: 8.6, 32.9_

  - [ ]* 21.5 Write property test for media alt text rendering (Property 41)
    - **Property 41: Media alt text rendered on images matches database alt_text field**
    - **Validates: Requirements 22.5**

- [x] 22. Content library frontend
  - [x] 22.1 Implement Library page
    - Create `LibraryPage` with tabs/sections: Question Bank (browseable by organ system/category), Video Library (YouTube/Vimeo embeds by topic), My Bookmarks, Reference Cards (PDF viewer)
    - Question bank: `M3TextField` outlined variant with leading search icon for full-text search, `M3FilterChip` for category and difficulty filters
    - Video library: render YouTube/Vimeo iframe embeds
    - Bookmarks: fetch from `GET /bookmarks`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 15.3, 32.10, 32.12_

  - [x] 22.2 Implement case browser and case detail pages
    - Create `CaseBrowserPage` with `CaseFilterBar` using `M3FilterChip` components — filter by source_type, primary_topic, difficulty, board_relevance, clinical_urgency; display total matching cases/questions count
    - Create `CaseDetailPage` using `M3Card` outlined variant for case listing items — display clinical_context, sub-case tabs with `SubCaseView` (media gallery + sequential questions)
    - Create `ClinicalPearlsPanel` — collapsible panel shown after case completion
    - Display case references with clickable links; use `M3Chip` input variant for keyword tags, `M3Chip` assist variant for AI-recommended next actions
    - _Requirements: 25.4, 25.6, 26.3, 28.3, 28.4, 31.1, 31.2, 31.3, 31.4, 31.5, 32.8, 32.10_

- [x] 23. PWA and offline support
  - [x] 23.1 Configure Vite PWA plugin and service worker
    - Configure vite-plugin-pwa with service worker for asset caching
    - Create web app manifest for "Add to Home Screen" on iOS and Android
    - Create offline fallback screen for non-cached routes
    - _Requirements: 20.1, 20.2, 20.4_

  - [x] 23.2 Implement offline study session with Dexie.js
    - Set up Dexie.js database with stores: cachedQuestions, pendingAttempts, activeSession
    - On session start: cache question set in IndexedDB
    - During offline: read cached questions, store attempts locally
    - On reconnect: sync pending attempts to API, clear synced data
    - Handle conflicts (duplicate attempts) and partial sync
    - _Requirements: 20.3, 20.5_

  - [ ]* 23.3 Write property tests for offline (Properties 34–35)
    - **Property 34: Offline question cache round-trip**
    - **Property 35: Offline attempt sync round-trip**
    - **Validates: Requirements 20.3, 20.5**

- [x] 24. Checkpoint — Ensure frontend renders, offline caching works, study flow is complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 25. Admin interface frontend
  - [x] 25.1 Implement admin dashboard and user management
    - Create `AdminDashboard` — usage reports (active users, session count, attempt volume)
    - Create `AdminUsersPage` — user list with name, email, join date, plan, last active; block/unblock actions using `M3Dialog` for confirmation; view student progress (topic scores, readiness, attempts)
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 32.9_

  - [x] 25.2 Implement admin question bank management
    - Create `AdminQuestionsPage` — list questions with CRUD actions
    - Create/edit form using `M3TextField` filled variant with supporting text and error states: stem, type, difficulty (1–5), category, explanation, answer options with per-option explanations
    - Deactivate action (set is_active = false)
    - _Requirements: 18.1, 18.2, 18.3, 32.12_

  - [x] 25.3 Implement admin import/export interface
    - Create `AdminImportPage` — "Import Questions" action accepting JSON file upload for flat format, submit to `POST /admin/questions/import`
    - Add "Import Cases" action accepting LITFL JSON file upload, submit to `POST /admin/cases/import`
    - Add "Export Questions" action downloading JSON from `GET /admin/questions/export`
    - Add "Export Cases" action downloading JSON from `GET /admin/cases/export`
    - Display validation errors on import failure
    - _Requirements: 23.6, 23.7_

  - [x] 25.4 Implement admin media management
    - Create `AdminMediaPage` — upload interface requiring alt text and attribution before upload
    - Generate presigned URL via `POST /admin/media/upload-url`, upload directly to Vercel Blob
    - Create media record via `POST /admin/media`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [-] 26. Accessibility compliance pass
  - [x] 26.1 Audit and fix accessibility across all components
    - Ensure 4.5:1 contrast ratio for body text, 3:1 for large text and UI components
    - Ensure no information conveyed by color alone (icons + labels on correct/incorrect, heatmap mastery)
    - Ensure all interactive elements keyboard-navigable with visible focus indicators
    - Associate all form inputs with `<label>` elements
    - Add `aria-live` regions for form validation errors
    - Ensure 44×44px minimum touch targets on all interactive elements
    - Add ARIA labels on audio playback controls
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8, 22.9_

- [x] 27. Wire Express app together
  - [x] 27.1 Create Express app entry point and register all routes
    - Create `server/src/app.ts` — wire middleware stack: CORS → JSON parser → rate limiter → routes → error handler
    - Register all route groups: /auth, /users, /questions, /sessions, /attempts, /progress, /analytics, /media, /admin, /cases
    - Apply JWT auth middleware to all authenticated routes
    - Apply role-check middleware to all /admin/* routes
    - Apply Zod validation middleware to each route with its schema
    - Create `server/src/index.ts` — start server, initialize Prisma client, register cron jobs
    - Create Dockerfile for Railway deployment
    - _Requirements: 2.1, 2.2, 19.1_

- [x] 28. Final checkpoint — Ensure all tests pass, full integration works
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (53 properties total)
- Unit tests validate specific examples and edge cases
- The tech stack is TypeScript throughout: React 18 + Vite frontend, Node.js + Express backend, Prisma ORM, Zod validation, fast-check for property testing
- All 32 requirements are covered by implementation tasks
- Task 18 (M3 design system foundation) must be completed before Tasks 19–25 (frontend tasks) since all frontend components depend on the M3 theme, primitives, and design tokens
