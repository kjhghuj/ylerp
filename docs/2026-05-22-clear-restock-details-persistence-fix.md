# Clear Restock Details Persistence Fix

## Bug

The "清空补货详情" action only hides the current `InventoryTable` rows with component state. It does not clear the inventory rows that produce those restock details.

## Root Cause

`frontend/modules/restock/components/InventoryTable.tsx` computes restock details from `useStore().inventory`.

The previous clear implementation:

- set `detailsCleared` to `true`
- hid the table rows
- left `inventory` unchanged

The component also resets `detailsCleared` when `inventory`, `targetDate`, or `leadTime` changes. Re-importing updates inventory state, so the hidden table becomes visible again and the old inventory-derived restock details reappear.

## Expected Behavior

When the user clicks "清空补货详情":

- all current restock detail source rows should be cleared from inventory
- the table should remain empty after subsequent imports unless the import creates new rows
- no stale pre-clear rows should reappear
- failures should not leave the UI claiming the details were cleared

## Related Code Reviewed

- `frontend/modules/restock/components/InventoryTable.tsx`
  - renders grouped restock details from `inventory`
  - already deletes all inventory rows after saving a restock record
- `frontend/modules/restock/hooks/useInventoryImport.ts`
  - sales imports create missing inventory rows
  - official and third-party stock imports update existing rows only
- `frontend/StoreContext.tsx`
  - exposes `deleteInventoryItem(id)` for backend-backed row deletion

## Fix Plan

1. Update the regression test to require `deleteInventoryItem` to be called for each current inventory row.
2. Change `handleClearDetails` to async.
3. Snapshot current inventory rows before deletion.
4. Delete every current inventory row through `deleteInventoryItem`.
5. Show success only after deletion completes.
6. Keep a local `clearingDetails` state to disable the clear button while deletion is running.
7. Keep `detailsCleared` only as immediate UI feedback after successful deletion.
8. Run the targeted test, all frontend tests, and frontend build.
