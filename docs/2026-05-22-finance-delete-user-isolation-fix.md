# Finance Delete User Isolation Fix

## Bug

The finance delete endpoints for clearing records use destructive `deleteMany` calls without scoping the operation to the authenticated user.

Affected code:

- `backend/src/routes/financeRoutes.ts`
  - `DELETE /all`
  - `DELETE /month/:month`

## Impact

Finance records are otherwise user-scoped on read, create, update, and single-record delete. The two bulk delete endpoints break that isolation:

- `DELETE /finance/all` can delete every user's finance records.
- `DELETE /finance/month/:month` can delete every user's finance records in the selected month.
- Both endpoints can also leave the current user's cached `finance:${userId}` data stale because they do not invalidate the scoped cache.

## Related Code Reviewed

- Frontend calls:
  - `frontend/StoreContext.tsx` calls `api.delete('/finance/all')` from `clearAllTransactions`.
  - `frontend/StoreContext.tsx` calls `api.delete('/finance/month/${monthKey}')` from `deleteTransactionsByMonth`.
- Backend route pattern:
  - Other finance endpoints derive `const userId = req.user!.id`.
  - Other finance mutations invalidate `safeRedis.del(\`finance:${userId}\`)`.

## Regression Tests

Add focused backend route tests in `backend/src/routes/__tests__/financeRoutes.test.ts`:

- `DELETE /all` must call `prisma.financeRecord.deleteMany({ where: { userId } })`.
- `DELETE /month/:month` must call `prisma.financeRecord.deleteMany({ where: { userId, date: { gte, lt } } })`.
- Both routes must invalidate `finance:${userId}`.

These tests fail against the current implementation and should pass after the fix.

## Fix Plan

1. In `DELETE /all`, read `userId` from `req.user!.id`.
2. Replace unscoped `deleteMany()` with `deleteMany({ where: { userId } })`.
3. Invalidate `finance:${userId}` before returning `204`.
4. In `DELETE /month/:month`, read `userId` from `req.user!.id`.
5. Add `userId` to the date-range `deleteMany` filter.
6. Invalidate `finance:${userId}` after the delete.
7. Run the targeted finance route test, then the backend test suite and build.
