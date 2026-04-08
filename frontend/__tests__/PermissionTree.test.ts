import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  getAllPermissionKeys,
  getModuleKeys,
  getSubKeysForModule,
  getModuleKeyFromSubKey,
  expandPermissions,
  ALL_PERMISSIONS,
} from '../components/PermissionTree';

describe('getAllPermissionKeys', () => {
  it('should return all module keys and their sub-keys', () => {
    const keys = getAllPermissionKeys();
    expect(keys).toContain('dashboard');
    expect(keys).toContain('dashboard.balance');
    expect(keys).toContain('dashboard.margin');
    expect(keys).toContain('profit');
    expect(keys).toContain('profit.calc');
    expect(keys).toContain('finance');
    expect(keys).toContain('inventory');
    expect(keys).toContain('pricing');
    expect(keys).toContain('product-list');
    expect(keys).toContain('restock-records');
    expect(keys).toContain('chroma-adapt');
  });

  it('should not contain duplicates', () => {
    const keys = getAllPermissionKeys();
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });
});

describe('getModuleKeys', () => {
  it('should return only top-level module keys', () => {
    const keys = getModuleKeys();
    expect(keys).toEqual(ALL_PERMISSIONS.map(n => n.key));
    expect(keys).not.toContain('dashboard.balance');
    expect(keys).not.toContain('profit.calc');
  });
});

describe('getSubKeysForModule', () => {
  it('should return sub-keys for a known module', () => {
    const subs = getSubKeysForModule('dashboard');
    expect(subs).toContain('dashboard.balance');
    expect(subs).toContain('dashboard.margin');
    expect(subs).toContain('dashboard.alerts');
    expect(subs).toContain('dashboard.debt');
    expect(subs).toContain('dashboard.chart');
    expect(subs).toContain('dashboard.profitTable');
    expect(subs).toContain('dashboard.inventoryTable');
    expect(subs.length).toBe(7);
  });

  it('should return empty array for unknown module', () => {
    expect(getSubKeysForModule('nonexistent')).toEqual([]);
  });
});

describe('getModuleKeyFromSubKey', () => {
  it('should extract module key from sub-key', () => {
    expect(getModuleKeyFromSubKey('dashboard.balance')).toBe('dashboard');
    expect(getModuleKeyFromSubKey('profit.calc')).toBe('profit');
    expect(getModuleKeyFromSubKey('finance.income')).toBe('finance');
  });

  it('should return undefined for non-sub-key', () => {
    expect(getModuleKeyFromSubKey('dashboard')).toBeUndefined();
    expect(getModuleKeyFromSubKey('')).toBeUndefined();
  });
});

describe('hasPermission', () => {
  it('should return true for exact permission match', () => {
    expect(hasPermission(['dashboard.balance'], 'dashboard.balance')).toBe(true);
    expect(hasPermission(['profit.calc'], 'profit.calc')).toBe(true);
  });

  it('should return true when user has parent module permission', () => {
    expect(hasPermission(['dashboard'], 'dashboard.balance')).toBe(true);
    expect(hasPermission(['dashboard'], 'dashboard.chart')).toBe(true);
    expect(hasPermission(['profit'], 'profit.save')).toBe(true);
  });

  it('should return true when user has any sub-permission and checking parent module', () => {
    expect(hasPermission(['dashboard.balance'], 'dashboard')).toBe(true);
    expect(hasPermission(['dashboard.chart'], 'dashboard')).toBe(true);
  });

  it('should return false when user has no relevant permissions', () => {
    expect(hasPermission(['profit'], 'dashboard')).toBe(false);
    expect(hasPermission(['dashboard.balance'], 'profit.calc')).toBe(false);
    expect(hasPermission([], 'dashboard')).toBe(false);
  });

  it('should return false for unrelated sub-permissions', () => {
    expect(hasPermission(['dashboard.balance'], 'dashboard.margin')).toBe(false);
    expect(hasPermission(['finance.income'], 'finance.debt')).toBe(false);
  });

  it('should handle empty permissions array', () => {
    expect(hasPermission([], 'dashboard')).toBe(false);
    expect(hasPermission([], 'dashboard.balance')).toBe(false);
  });

  it('should handle owner with all permissions', () => {
    const allKeys = getAllPermissionKeys();
    expect(hasPermission(allKeys, 'dashboard')).toBe(true);
    expect(hasPermission(allKeys, 'profit.calc')).toBe(true);
  });
});

describe('expandPermissions', () => {
  it('should expand module key into module + all sub-keys', () => {
    const result = expandPermissions(['dashboard']);
    expect(result).toContain('dashboard');
    expect(result).toContain('dashboard.balance');
    expect(result).toContain('dashboard.margin');
    expect(result).toContain('dashboard.chart');
    expect(result).toContain('dashboard.profitTable');
    expect(result).toContain('dashboard.inventoryTable');
    expect(result).toContain('dashboard.alerts');
    expect(result).toContain('dashboard.debt');
  });

  it('should keep individual sub-keys without expanding', () => {
    const result = expandPermissions(['dashboard.balance']);
    expect(result).toContain('dashboard.balance');
    expect(result).not.toContain('dashboard');
    expect(result).not.toContain('dashboard.margin');
  });

  it('should handle mix of module and sub-keys', () => {
    const result = expandPermissions(['dashboard', 'profit.calc']);
    expect(result).toContain('dashboard');
    expect(result).toContain('dashboard.balance');
    expect(result).toContain('profit.calc');
    expect(result).not.toContain('profit');
    expect(result).not.toContain('profit.save');
  });

  it('should not contain duplicates', () => {
    const result = expandPermissions(['dashboard', 'dashboard.balance']);
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it('should handle empty array', () => {
    expect(expandPermissions([])).toEqual([]);
  });

  it('should handle non-existent module key gracefully', () => {
    const result = expandPermissions(['nonexistent']);
    expect(result).toEqual(['nonexistent']);
  });
});
