# MedSchedule — Backend API

> Express 5 + TypeScript + JSON file store API for MedSchedule. Pairs with `medschedule-frontend`. Keep this README updated as endpoints are added.

---

## Status — June 24, 2026

### Completed — All Sections (1–10)

- Express 5 + TypeScript + JSON file store (`data/store.json` — no native deps, Windows-friendly)
- Universal `ApiResponse<T>` shape (matches `api-contract.md`)
- JWT auth middleware (`Authorization: Bearer`) with `facilityId` on payload
- Socket.io v4 — room-based realtime events (`user:${userId}`, `facility:${facilityId}`)
- TypeScript: zero errors (`npx tsc --noEmit`)

#### Auth (Section 1)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create admin or staff account (staff auto-creates StaffProfile) |
| POST | `/api/auth/login` | Password login |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/magic-link` | Request magic link (logs URL to console in dev) |
| POST | `/api/auth/magic-link/verify` | Consume magic link token |
| GET | `/api/auth/qr-token` | Generate QR login token (staff only) |
| POST | `/api/auth/qr-login/verify` | Consume QR token |

#### Facilities (Section 2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/facilities` | Create facility (admin); links admin's facilityId |
| GET | `/api/facilities/:facilityId` | Get facility details (own facility only) |

#### Staff (Section 3)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/facilities/:facilityId/staff` | List all staff |
| GET | `/api/staff/:staffId` | Get single profile |
| POST | `/api/facilities/:facilityId/staff` | Add staff member (admin-created, no login) |
| PATCH | `/api/staff/:staffId` | Update profile |
| PATCH | `/api/staff/:staffId/deactivate` | Deactivate staff member |

#### Shifts & Schedules (Section 4)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/shifts` | Staff personal schedule (`?staffId=&month=YYYY-MM`) |
| GET | `/api/facilities/:facilityId/schedule` | Full facility schedule with gaps & overtime |
| POST | `/api/shifts` | Create single shift (admin) |
| PATCH | `/api/shifts/:shiftId` | Update shift (emits `shift_updated` if published) |
| DELETE | `/api/shifts/:shiftId` | Delete shift |
| POST | `/api/facilities/:facilityId/schedule/publish` | Publish schedule; creates notifications + emits `schedule_published` |

#### AI Schedule (Section 5)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ai/generate-schedule` | Round-robin AI preview by `availability` |
| POST | `/api/ai/generate-schedule/confirm` | Commit preview to shifts |

#### Swap Requests (Section 6)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/swap-requests` | Submit swap request (staff) |
| GET | `/api/facilities/:facilityId/swap-requests` | List all (`?status=pending\|approved\|rejected`) |
| PATCH | `/api/swap-requests/:swapRequestId` | Approve/reject; notifies staff via socket |

#### Time Off (Section 7)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/time-off` | Submit time-off request (staff, own only) |
| GET | `/api/time-off` | Staff's own requests (`?staffId=`) |
| GET | `/api/facilities/:facilityId/time-off` | All facility requests (admin) |
| PATCH | `/api/time-off/:requestId` | Approve/reject; notifies staff via socket |

#### Notifications (Section 8)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | Own notifications (`?userId=&unreadOnly=true`) |
| PATCH | `/api/notifications/:notificationId/read` | Mark read |

#### Announcements (Section 9)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/announcements` | Post announcement; notifies all active staff |
| GET | `/api/facilities/:facilityId/announcements` | List announcements |

#### WebSocket Events (Section 10)
Clients connect to `http://localhost:5000` with `auth: { token: "<jwt>" }`. On connect the server joins:
- `user:${userId}` — individual notifications
- `facility:${facilityId}` — broadcast events

| Event | Trigger | Payload |
|-------|---------|---------|
| `schedule_published` | Publish schedule | `{ facilityId, month, publishedAt }` |
| `shift_updated` | Admin edits a published shift | `{ shiftId, staffId, changes }` |
| `swap_approved` / `swap_rejected` | Admin responds to swap | `{ swapRequestId, requesterId, targetStaffId }` |
| `time_off_approved` / `time_off_rejected` | Admin responds to time-off | `{ requestId, staffId }` |
| `announcement_posted` | New announcement | `{ announcementId, facilityId, priority }` |

### Known Gaps / Out of Contract
- Magic link email is console-logged only in dev (no email provider wired up)
- Gap detection (`calcGaps`) returns `[]` — requires staffing requirements model not in api-contract.md
- AI algorithm is round-robin MVP; no ML/LLM weighting

---

## Run Locally

```bash
cd medschedule-backend
cp .env.example .env   # set JWT_SECRET at minimum
npm install
npm run dev
```

API base: `http://localhost:5000/api`

Frontend `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_WS_URL=http://localhost:5000
NEXT_PUBLIC_WS_ENABLED=true
```

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | HTTP + WebSocket port |
| `JWT_SECRET` | `dev-secret-change-me` | Signing secret (required in prod) |
| `FRONTEND_URL` | `http://localhost:3000` | CORS origin + magic/QR link URLs |
| `DATABASE_PATH` | `./data/medschedule.db` | Data directory (stores `store.json`) |

---

## Architecture

```
src/
  index.ts          # HTTP server + Socket.io; calls setIo(), wires socket rooms
  app.ts            # Express app factory; registers all routers
  config.ts         # Env-backed config
  socket.ts         # io singleton (setIo / emitToUser / emitToFacility)
  types/index.ts    # Domain types matching api-contract.md Appendix B
  middleware/
    auth.ts         # requireAuth (JWT → req.auth) + requireRole
  db/
    store.ts        # readOnlyDb / withDb / defaultDb / all record types
    users.ts        # User CRUD
    facilities.ts   # Facility CRUD
    staff.ts        # StaffProfile CRUD
    shifts.ts       # Shift CRUD + publish + overtime + AI preview
    requests.ts     # SwapRequest + TimeOffRequest CRUD
    notifications.ts
    announcements.ts
    tokens.ts       # Magic link + QR token management
  routes/
    auth.ts         # Section 1
    facilities.ts   # Section 2
    staff.ts        # Section 3
    shifts.ts       # Section 4
    ai.ts           # Section 5
    swapRequests.ts # Section 6
    timeOff.ts      # Section 7
    notifications.ts # Section 8
    announcements.ts # Section 9
  utils/
    response.ts     # sendSuccess / sendError helpers
```

---

## QR Login Flow

1. Staff (authenticated) calls `GET /api/auth/qr-token`
2. Response includes `loginUrl` → `http://localhost:3000/qr-login?token=qr_...`
3. Phone scans QR → frontend calls `POST /api/auth/qr-login/verify`
4. Returns same payload as login; token is single-use, 5 min TTL

---

## Contract

`../medschedule-frontend/api-contract.md` is the source of truth.
