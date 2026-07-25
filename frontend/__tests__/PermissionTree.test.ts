import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  expandPermissions,
  getAllPermissionKeys,
  getModuleKeyFromSubKey,
  getModuleKeys,
  getSubKeysForModule,
  hasPermission,
} from '../components/PermissionTree';

describe('dashboard permission choices', () => {
  it('exposes only the permissions used by the redesigned dashboard', () => {
    expect(getSubKeysForModule('dashboard')).toEqual([
      'dashboard.balance',
      'dashboard.alerts',
      'dashboard.debt',
      'dashboard.inventoryTable',
    ]);
    const keys = getAllPermissionKeys();
    expect(keys).not.toContain('dashboard.margin');
    expect(keys).not.toContain('dashboard.chart');
    expect(keys).not.toContain('dashboard.profitTable');
  });

  it('keeps parent and child permission behavior intact', () => {
    expect(hasPermission(['dashboard'], 'dashboard.alerts')).toBe(true);
    expect(hasPermission(['dashboard.inventoryTable'], 'dashboard')).toBe(true);
    expect(hasPermission(['dashboard.balance'], 'dashboard.debt')).toBe(false);
    expect(expandPermissions(['dashboard'])).toEqual(expect.arrayContaining([
      'dashboard',
      'dashboard.balance',
      'dashboard.debt',
      'dashboard.alerts',
      'dashboard.inventoryTable',
    ]));
  });
});

describe('generic permission utilities', () => {
  it('returns unique module and permission keys', () => {
    const keys = getAllPermissionKeys();
    expect(new Set(keys).size).toBe(keys.length);
    expect(getModuleKeys()).toEqual(ALL_PERMISSIONS.map(node => node.key));
  });

  it('extracts module keys and preserves unknown stored values', () => {
    expect(getModuleKeyFromSubKey('dashboard.balance')).toBe('dashboard');
    expect(getModuleKeyFromSubKey('dashboard')).toBeUndefined();
    expect(expandPermissions(['legacy.permission'])).toEqual(['legacy.permission']);
  });
});
