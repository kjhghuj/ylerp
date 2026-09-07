# Finance Module Shared Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change finance module from per-user data isolation to shared data across all users, with audit trail (who created/modified each record).

**Architecture:** Remove `userId` filtering from all backend queries. Repurpose `userId` as "creator" marker. Add `updatedBy` field to track last modifier. Change Redis cache key from per-user to shared. Frontend shows creator/modifier in day detail modal.

**Tech Stack:** Node.js/Express, Prisma ORM, PostgreSQL, React/TypeScript

---

### Task 1: Database Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: (generated migration)

- [ ] **Step 1: Add `updatedBy` field to FinanceRecord model**

In `backend/prisma/schema.prisma`, add `updatedBy String?` after the `userId` line:

```prisma
model FinanceRecord {
  id          String   @id @default(uuid())
  date        DateTime
  type        String
  amount      Float
  category    String
  description String
  accountId   String
  userId      String
  updatedBy   String?
  user        User     @relation(fields: [userId], references: [id])
}
```

- [ ] **Step 2: Create and run migration**

```bash
cd backend && npx prisma migrate dev --name add_updated_by_to_finance
```

Expected: Migration created and applied, `updatedBy` column added (nullable).

- [ ] **Step 3: Verify migration**

```bash
cd backend && npx prisma db pull --print | grep -A 15 "model FinanceRecord"
```

Expected: Output shows `updatedBy String?` in FinanceRecord model.

---

### Task 2: Backend API — Remove userId filtering

**Files:**
- Modify: `backend/src/routes/financeRoutes.ts`

- [ ] **Step 1: Change GET `/` to return all records with user info**

Replace the GET route (lines 8-24):

```typescript
router.get('/', async (req, res) => {
    try {
        const cacheKey = 'finance:all';
        const cachedFinance = await safeRedis.get(cacheKey);
        if (cachedFinance) {
            return res.json(JSON.parse(cachedFinance));
        }

        const finance = await prisma.financeRecord.findMany({
            include: { user: { select: { id: true, displayName: true } } }
        });
        await safeRedis.set(cacheKey, JSON.stringify(finance), 'EX', 3600);
        res.json(finance);
    } catch (error) {
        console.error('Failed to fetch finance records:', error);
        res.status(500).json({ error: 'Failed to fetch finance records' });
    }
});
```

- [ ] **Step 2: Change POST `/batch` cache key to shared**

Change line 44 from `safeRedis.del(`finance:${userId}`)` to `safeRedis.del('finance:all')`.

- [ ] **Step 3: Change POST `/` cache key to shared**

Change line 58 from `safeRedis.del(`finance:${userId}`)` to `safeRedis.del('finance:all')`.

- [ ] **Step 4: Change PUT `/:id` — remove userId check, add updatedBy**

Replace the PUT route (lines 66-87):

```typescript
router.put('/:id', async (req, res) => {
    try {
        const existing = await prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Record not found' });

        const recordData = { ...req.body };
        if (req.body.date) recordData.date = new Date(req.body.date);
        delete recordData.id;
        delete recordData.userId;
        recordData.updatedBy = req.user!.username;

        const record = await prisma.financeRecord.update({
            where: { id: req.params.id },
            data: recordData,
        });
        await safeRedis.del('finance:all');
        res.json(record);
    } catch (error) {
        console.error('Failed to update finance record:', error);
        res.status(500).json({ error: 'Failed to update finance record' });
    }
});
```

- [ ] **Step 5: Change DELETE `/all` — remove userId filtering**

Replace lines 89-99:

```typescript
router.delete('/all', authorize('owner'), async (req, res) => {
    try {
        await prisma.financeRecord.deleteMany({ where: {} });
        await safeRedis.del('finance:all');
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete all finance records:', error);
        res.status(500).json({ error: 'Failed to delete all finance records' });
    }
});
```

- [ ] **Step 6: Change DELETE `/month/:month` — remove userId filtering**

Replace lines 101-132:

```typescript
router.delete('/month/:month', authorize('owner'), async (req, res) => {
    try {
        const monthParam = Array.isArray(req.params.month) ? req.params.month[0] : req.params.month;
        const [yearStr, monthStr] = monthParam.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        if (isNaN(year) || isNaN(month)) {
            return res.status(400).json({ error: 'Invalid month format, expected YYYY-MM' });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);

        const result = await prisma.financeRecord.deleteMany({
            where: {
                date: {
                    gte: startDate,
                    lt: endDate
                }
            }
        });

        await safeRedis.del('finance:all');
        res.json({ message: 'Deleted records', count: result.count });
    } catch (error) {
        console.error('Delete month failed:', error);
        res.status(500).json({ error: 'Failed to delete finance records for the month' });
    }
});
```

- [ ] **Step 7: Change DELETE `/:id` — remove userId filtering**

Replace lines 134-147:

```typescript
router.delete('/:id', async (req, res) => {
    try {
        const existing = await prisma.financeRecord.findFirst({ where: { id: req.params.id } });
        if (!existing) return res.status(404).json({ error: 'Record not found' });

        await prisma.financeRecord.delete({ where: { id: req.params.id } });
        await safeRedis.del('finance:all');
        res.status(204).send();
    } catch (error) {
        console.error('Failed to delete finance record:', error);
        res.status(500).json({ error: 'Failed to delete finance record' });
    }
});
```

- [ ] **Step 8: Verify backend compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: No TypeScript errors.

---

### Task 3: Frontend Types

**Files:**
- Modify: `frontend/types.ts`

- [ ] **Step 1: Add `userId`, `updatedBy`, and `user` to FinanceRecord**

In `frontend/types.ts`, update the FinanceRecord interface (line 30-38):

```typescript
export interface FinanceRecord {
  id: string;
  date: string;
  type: 'income' | 'expense' | 'debt_repayment' | 'new_debt' | 'debt_balance' | 'account_balance';
  amount: number;
  category: string;
  description: string;
  accountId: 'main';
  userId?: string;
  updatedBy?: string;
  user?: { id: string; displayName: string };
}
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No TypeScript errors.

---

### Task 4: Frontend — Show creator/modifier in DayDetailModal

**Files:**
- Modify: `frontend/modules/finance/modals/DayDetailModal.tsx`

- [ ] **Step 1: Add audit info section**

Add the following code right before the closing `</div>` of the scrollable area (after line 156, before `</div>` on line 157):

```tsx
{date && (() => {
    const dayRecords = financeRecords.filter(r => r.date === date);
    const creator = dayRecords.find(r => r.user?.displayName)?.user?.displayName;
    const modifier = dayRecords.find(r => r.updatedBy)?.updatedBy;
    if (!creator && !modifier) return null;
    return (
        <div className="mt-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 space-y-1">
            {creator && <p>创建者: <span className="font-medium text-slate-700">{creator}</span></p>}
            {modifier && <p>最后修改: <span className="font-medium text-slate-700">{modifier}</span></p>}
        </div>
    );
})()}
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No TypeScript errors.

---

### Task 5: Verification

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Test cross-user visibility**

1. Login as User A, add a finance transaction
2. Login as User B — verify the transaction from User A is visible
3. As User B, edit the transaction
4. Open day detail modal — verify "创建者: UserA · 最后修改: UserB"
5. Delete the transaction as User B — verify it works
6. Import batch data as one user, verify both users see it

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/ backend/src/routes/financeRoutes.ts frontend/types.ts frontend/modules/finance/modals/DayDetailModal.tsx
git commit -m "feat: change finance module to shared data with audit trail"
```
