# Backend QA Report — end-to-end

**Date:** 2026-10-14 · **Scope:** every controller in `src/` (~150 endpoints across 17 modules), as admin, murabbi and anonymous.
**Method:** an automated e2e suite (`test/e2e/`) boots the real `AppModule` — every guard, pipe, filter and interceptor — against a real MongoDB 7, plus a smoke run of the built server (`node dist/main.js`) for helmet/CORS/Swagger.

## Result

| | |
|---|---|
| Tests | **202**, all green |
| Confirmed bugs | **47** (pinned by 63 `it.failing('BUG-xx …')` tests) |
| Critical | 4 (BUG-10, BUG-02, BUG-01 + BUG-32 together) |
| High | 5 |
| Medium | 15 |
| Low | 23 |

Each bug is a test that asserts the **correct** behaviour, wrapped in `it.failing`. While the bug exists, the test fails, so the suite passes. When someone fixes a bug, its `it.failing` turns red, which means: change it to a plain `it`. The suite therefore can't drift silently.

## Running it

```bash
# needs a MongoDB; e.g. docker run -d --name mongo -p 27017:27017 mongo:7
E2E_MONGODB_URI=mongodb://127.0.0.1:27017 npm run test:e2e
```

Each spec file uses its own throwaway database (`noor_e2e_<name>`), dropped afterwards. The only things replaced are `MailService` (OTPs are captured in memory) and the throttler storage (so the suite isn't rate-limited). The real throttler is tested separately.

---

## Critical

### BUG-10 — Refresh tokens are interchangeable; logout, rotation and revocation don't work
`auth.service.ts` stores refresh tokens as `bcrypt.hash(token)`, but bcrypt only reads the **first 72 bytes**. Every refresh JWT for a user shares its first ~150 characters (header + `sub` + `email`), so *any* refresh token of that user matches *any* stored hash.
- Reusing a rotated token is accepted (theft detection never fires).
- After logout on one device, that token still works while any other session exists.
- **After a password reset, a stolen refresh token comes back to life as soon as the real user logs in again.**

**Fix:** hash with SHA-256 (or store a `jti` and compare that), and add a `jti` claim (also fixes BUG-09).

### BUG-02 — OTP is returned in the API response unless `NODE_ENV=production`
`forgot-password`, `signup/request-otp` and `resend-otp` add `otp` to the response when `NODE_ENV !== 'production'`. The Dockerfile never sets `NODE_ENV`. If Railway doesn't set it either, **anyone can reset any account's password, including the admin's**: request a reset, read the OTP from the response, then reset. The same flag also exposes Swagger at `/api/docs` (confirmed on the real server with `NODE_ENV` unset).

**Fix:** set `ENV NODE_ENV=production` in the Dockerfile, check the Railway variables now, and invert the check so the OTP is only returned when an explicit opt-in such as `EXPOSE_OTP_FOR_DEV=true` is set.

### BUG-01 + BUG-32 — A stranger can sign up and download every parent's contact details
- **BUG-01:** public `/auth/signup` creates an *active murabbi* with no admin approval.
- **BUG-32:** `GET /parents/page-data` is open to murabbis and is **not scoped**. It returns every parent in the system with name, phone, WhatsApp number, email, children's names and all feedback. `GET /parents` is scoped correctly; `page-data` bypasses it.

Together (proven end-to-end by the `BUG-01+32` test), anyone on the internet can register and pull all parents' and children's personal data. **Fix:** scope or restrict `page-data` to admins, and gate self-signup behind admin approval (or remove it, since admins already create murabbis).

## High

| ID | Where | Problem |
|---|---|---|
| BUG-21 | `PATCH /admin/circles/:id` | Changing a circle's murabbi doesn't update `student.murabbi`. The **old** murabbi keeps seeing and editing those students, and the **new** one gets 400/403 awarding points, viewing attendance or registering parents for them. |
| BUG-43 | `GET /parents/engagement/whatsapp-stream` | The global `ResponseInterceptor` wraps every SSE event, so the browser gets `{"data":"{\"type\":…}"}`. `ParentsPage.tsx` checks `data.type`, which is always undefined, so the WhatsApp broadcast UI never shows progress or completion while the messages are actually being sent. |
| BUG-47 | `main.ts` | `trust proxy` isn't set. Behind Railway's proxy `req.ip` is the proxy's address for everyone, so **all users share one 100 req/min bucket**, and busy dashboards will start getting 429s. *(The shared bucket is proven in the test; that Railway's proxy produces it is inferred.)* |
| BUG-23 | `POST /attendance` | `records[].student` is never checked against the circle. A murabbi can mark other murabbis' students (or made-up ids) present or absent, and duplicate entries are accepted. This corrupts attendance rates and every report built on them. |
| BUG-04 | `POST /auth/verify-otp` | No attempt limit on the 6-digit OTP; wrong guesses don't invalidate it. |

## Medium

| ID | Where | Problem |
|---|---|---|
| BUG-03 | `POST /auth/reset-password` | The reset token can be replayed for its full 10-minute lifetime. |
| BUG-12 | `DELETE /admin/murabbis/:id` | Deletes a murabbi who still owns circles, leaving those circles orphaned (`murabbi: null`). |
| BUG-13 | neighbourhood create/update, pipeline launch | The name is interpolated into `$regex`. `"DHA Phase (2"` causes a 500, and `"Block.A"` is rejected as a duplicate of `"BlockXA"`. |
| BUG-14 | ~8 endpoints (neighbourhood PATCH/DELETE, `students?murabbiId`, `murabbi/students/:id`, `attendance/by-murabbi/:id`, `performance/reviews?circleId`, `reports/attendance-trend?circleId`, `notifications/:id/*`) | A malformed id returns 500 instead of 400. `new Types.ObjectId(bad)` throws a `BSONError`, which the global filter doesn't map. A one-line fix in `HttpExceptionFilter` covers all of them. |
| BUG-29 | `POST /training/exam/submit` | Unlimited attempts plus `correctCount` in the response means the exam can be brute-forced one answer at a time. |
| BUG-30 | `POST /training/batches` | `status: active` closes the current active batch **before** the insert. If the insert fails (e.g. a duplicate number), the active batch is already closed. |
| BUG-34 | `POST /parents/engagement/send-whatsapp` | Ignores the "WhatsApp Updates: off" setting. |
| BUG-35 | WhatsApp SSE | The token is verified but the user is never loaded, so a deleted or deactivated admin's unexpired token can still start a blast. The token is also sent in the URL, so it ends up in access logs. |
| BUG-39 | `GET /reports/attendance-trend?circleId=` | A murabbi can read any circle's trend; the ownership branch is skipped when `circleId` is given. |
| BUG-41 | `GET /sessions/list` | Every circle's sessions (circle names, murabbi names, attendance) are shown to every murabbi. |
| BUG-26 | `PATCH /training/modules/:id`, `PATCH /lessons/:id` | The body is typed `Partial<Dto>`, which erases to `Object`, so **no validation runs**, and the update skips `runValidators`. Enums, `minTier` range and empty titles are all accepted. |
| BUG-08 | `PATCH /users/:id/deactivate`, `/admin/murabbis/:id/deactivate` | An admin can deactivate themselves or other admins (lock-out risk). |
| BUG-11 | `PATCH /admin/murabbis/:id` | Edits admin accounts too; there's no role check on the target. |
| BUG-18 / 22 | student enrol (admin / murabbi) | `neighbourhoodId` isn't checked against the circle (admin) or for existence (murabbi). |

## Low

| ID | Problem |
|---|---|
| BUG-05 | `PATCH /users/profile` takes `body: any`: phone format and image URL aren't validated (`javascript:` URLs are accepted). |
| BUG-06 | `change-password` has no password policy (`"a"` is accepted). |
| BUG-07 | `change-password` with a non-string password returns 500. |
| BUG-09 | JWTs have no `jti`; two logins in the same second get identical tokens. |
| BUG-15 | Pipeline update accepts any `status` string. |
| BUG-16 | Circle capacity can be lowered below current enrolment. |
| BUG-17 | There's no endpoint to deactivate a circle, though `isActive` is enforced everywhere. |
| BUG-19 | Re-assigning a student to their own full circle fails with "Circle is full". |
| BUG-20 | Re-activating a student skips the capacity check. |
| BUG-24 | Editing an attendance session's date skips the one-session-per-day rule. |
| BUG-25 | The same `sessionNumber` can be used twice in a circle; trend reports merge them. |
| BUG-27 | A murabbi can record progress on modules above their tier. |
| BUG-28 | An exam question's `correctIndex` can point outside its options (unanswerable). |
| BUG-31 | Non-existent users can be added as batch candidates. |
| BUG-33 | The engagement toggles accept a missing or garbage value, and the reply says "disabled" anyway. |
| BUG-36 | Incentive ownership failures return 400, while attendance returns 403. |
| BUG-37 | Points can be awarded to deactivated students. |
| BUG-38 | Performance reviews can be filed against other murabbis' circles, or circles that don't exist. |
| BUG-40 | `monthlyEnrollments` returns the **oldest** 6 months (sort ascending, then `$limit`). |
| BUG-42 | `sessionsCompleted` counts distinct session *numbers*, not sessions. |
| BUG-44 | `Draft` lessons are visible to murabbis. |
| BUG-45 | `recurringTime` isn't validated (`"soon"` is accepted, producing an Invalid Date). |
| BUG-46 | `POST /upload/image` with no file returns 500. |

## Found by code review, not covered by a test

- **`npm test` is broken:** `src/app.controller.spec.ts` imports `describe/it` from `node:test`, so Jest finds no tests and fails the run. It's the only unit spec in the repo.
- **WebP uploads always fail:** the multer filter allows `image/webp`, but the Cloudinary call sets `allowed_formats: ['jpg','jpeg','png']`.
- **Recurring live-session times use the server's timezone** (UTC on Railway). An admin who enters `19:00` meaning Pakistan time sees the session marked live 5 hours late.
- **Mail failures:** if SMTP is down, signup and forgot-password return 500 for real accounts but 200 for unknown emails, which reveals which accounts exist.
- **Orphans on delete:** deleting a student or circle (including via an accepted delete-request) leaves attendance records, incentives and parent links pointing at missing documents.
- **Delete requests with several admins:** each admin gets a separate pending copy. Accepting one leaves the others pending, so one admin can "reject" an already-executed delete.
- **Misleading stats:**
  - "Murabbi of the Month" is awarded (at 0%) even when there's no attendance data.
  - The murabbi report assumes a 12-session curriculum, while sessions use 40.
  - The training `passRate` is computed from batch status, not exam results.
- **Scalability:** dashboard and stats endpoints load every attendance record into memory on each request.

## Verified working

These areas are covered by passing tests:
- **Signup:** the OTP is hashed, expires and is single-use.
- **Sign-in and tokens:** generic errors (no user enumeration), case-insensitive email, forged or wrong-secret tokens rejected, the role in the JWT is not trusted, deactivation locks a user out immediately.
- **Input handling:** NoSQL-injection payloads and unknown fields are rejected with 400.
- **Access control:** every `/admin` route is 403 for murabbis and 401 for anonymous users. Ownership checks on attendance, parents CRUD, circle reports and incentives work.
- **CRUD:** neighbourhoods, circles, students and pipeline, including capacity checks.
- **Workflows:** the delete-request accept/reject flow, the exam lock until modules are complete, and exam answers never being sent to murabbis.
- **Certificates:** issued once, a valid PDF, revocable.
- **Uploads:** wrong mimetypes get 400 and files over 5 MB get 413.
- **Platform:** consistent error envelope, the health check, and the real throttler returning 429 after 100 requests.
- **Real server:** helmet headers present, CORS limited to `FRONTEND_URL`.
