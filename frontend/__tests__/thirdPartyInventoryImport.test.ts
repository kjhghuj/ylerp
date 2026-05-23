import { describe, expect, it } from 'vitest';
import { buildThirdPartyInventoryImport } from '../modules/restock/utils/thirdPartyInventoryImport';
import { InventoryItem, WarehouseMapping } from '../types';

const baseInventory = (sku: string): InventoryItem => ({
  id: sku,
  name: sku,
  sku,
  currentStock: 0,
  stockOfficial: 0,
  stockThirdParty: 0,
  inTransit: 0,
  dailySales: 0,
  leadTime: 30,
  replenishCycle: 30,
  costPerUnit: 0,
});

const thirdMapping = (thirdPartyWarehouseId: string, sku: string): WarehouseMapping => ({
  id: `${thirdPartyWarehouseId}-${sku}`,
  type: 'third',
  thirdPartyWarehouseId,
  sku,
});

describe('buildThirdPartyInventoryImport', () => {
  it('updates the mapped system SKU when the mapped SKU exists in inventory', () => {
    const result = buildThirdPartyInventoryImport({
      rawData: [
        ['sku', '仓库库存', '头程在途'],
        ['TP-001', 8, 60],
      ],
      inventory: [baseInventory('SYS-001')],
      warehouseMappings: [thirdMapping('TP-001', 'SYS-001')],
    });

    expect(result.updates).toEqual([
      {
        sku: 'SYS-001',
        stock: 8,
        transit: 60,
        sourceSkus: ['TP-001'],
        usedFallback: false,
      },
    ]);
    expect(result.fallbacks).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it('falls back to the raw Excel SKU when the mapped SKU is missing but the raw SKU exists', () => {
    const result = buildThirdPartyInventoryImport({
      rawData: [
        ['sku', '仓库库存', '头程在途'],
        ['L1-BlackBlue-Wireless', 8, 60],
      ],
      inventory: [baseInventory('L1-BlackBlue-Wireless')],
      warehouseMappings: [
        thirdMapping('L1-BlackBlue-Wireless', 'L1_Link2_Black_Blue_wireless'),
      ],
    });

    expect(result.updates).toEqual([
      {
        sku: 'L1-BlackBlue-Wireless',
        stock: 8,
        transit: 60,
        sourceSkus: ['L1-BlackBlue-Wireless'],
        usedFallback: true,
      },
    ]);
    expect(result.fallbacks).toEqual([
      {
        excelSku: 'L1-BlackBlue-Wireless',
        mappedSku: 'L1_Link2_Black_Blue_wireless',
        stock: 8,
        transit: 60,
      },
    ]);
  });

  it('reports unmatched rows when neither mapped nor raw SKU exists in inventory', () => {
    const result = buildThirdPartyInventoryImport({
      rawData: [
        ['sku', '仓库库存', '头程在途'],
        ['TP-MISSING', 3, 4],
      ],
      inventory: [baseInventory('OTHER-SKU')],
      warehouseMappings: [thirdMapping('TP-MISSING', 'SYS-MISSING')],
    });

    expect(result.updates).toEqual([]);
    expect(result.unmatched).toEqual([
      {
        excelSku: 'TP-MISSING',
        mappedSku: 'SYS-MISSING',
        stock: 3,
        transit: 4,
      },
    ]);
  });

  it('prefers 仓库库存 over 可用库存 when both stock columns are present', () => {
    const result = buildThirdPartyInventoryImport({
      rawData: [
        ['sku', '仓库库存', '可用库存', '头程在途'],
        ['TP-001', 8, 99, 60],
      ],
      inventory: [baseInventory('TP-001')],
      warehouseMappings: [],
    });

    expect(result.header.stockColIdx).toBe(1);
    expect(result.updates[0].stock).toBe(8);
  });
});
