# Finance Module: Shared Data Access

**Date:** 2026-05-30
**Status:** Approved

## Goal

Change the finance module from per-user data isolation to shared data — all users see and modify the same finance records. Preserve audit trail (who created/modified each record).

## Design

### Database

- Keep `userId` on `FinanceRecord` — semantics change from "data owner" to "creator"
- Add `updatedBy` (nullable String) — tracks who last modified the record

### Backend API

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /` | `where: { userId }` | `where: {}` |
| `POST /` | Sets userId | Unchanged (userId = creator) |
| `POST /batch` | Sets userId | Unchanged |
| `PUT /:id` | `where: { id, userId }` | `where: { id }`, also sets `updatedBy` |
| `DELETE /:id` | `where: { id, userId }` | `where: { id }` |
| `DELETE /all` | `where: { userId }` | `where: {}` |
| `DELETE /month/:month` | `where: { userId, date }` | `where: { date }` |

- Redis cache key: `finance:${userId}` → `finance:all`
- GET response now includes `userId` and `updatedBy` fields

### Frontend

- `FinanceRecord` type: add optional `userId` and `updatedBy`
- `DayDetailModal`: show creator/modifier info at bottom
- All other components: no changes needed

### Migration

- Add `updatedBy` column (nullable, no data loss)
- Existing `userId` values preserved as creator markers
