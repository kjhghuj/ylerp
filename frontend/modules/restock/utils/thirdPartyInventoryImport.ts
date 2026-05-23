import { InventoryItem, WarehouseMapping } from '../../../types';

interface BuildThirdPartyInventoryImportInput {
  rawData: any[][];
  inventory: InventoryItem[];
  warehouseMappings: WarehouseMapping[];
}

interface ImportRowDetail {
  excelSku: string;
  mappedSku?: string;
  stock: number;
  transit: number;
}

interface ImportUpdate {
  sku: string;
  stock: number;
  transit: number;
  sourceSkus: string[];
  usedFallback: boolean;
}

interface HeaderDetection {
  found: boolean;
  headerRowIndex: number;
  skuColIdx: number;
  stockColIdx: number;
  transitColIdx: number;
}

export interface ThirdPartyInventoryImportResult {
  header: HeaderDetection;
  updates: ImportUpdate[];
  fallbacks: ImportRowDetail[];
  unmatched: ImportRowDetail[];
}

const STOCK_HEADER_PRIORITY: Record<string, number> = {
  '仓库库存': 3,
  '可用库存': 2,
  '库存': 1,
};

const TRANSIT_HEADER_PRIORITY: Record<string, number> = {
  '头程在途': 3,
  '在途': 2,
  '头程': 1,
};

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[, ]/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const findHeader = (rawData: any[][]): HeaderDetection => {
  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    const row = rawData[i];
    if (!Array.isArray(row)) continue;

    let skuColIdx = -1;
    let stockColIdx = -1;
    let stockPriority = -1;
    let transitColIdx = -1;
    let transitPriority = -1;

    row.forEach((cell, colIdx) => {
      const val = String(cell || '').trim();
      if (!val) return;

      if (['SKU', '商品SKU'].includes(val.toUpperCase())) {
        skuColIdx = colIdx;
      }

      const stockHeaderPriority = STOCK_HEADER_PRIORITY[val];
      if (stockHeaderPriority && stockHeaderPriority > stockPriority) {
        stockColIdx = colIdx;
        stockPriority = stockHeaderPriority;
      }

      const transitHeaderPriority = TRANSIT_HEADER_PRIORITY[val];
      if (transitHeaderPriority && transitHeaderPriority > transitPriority) {
        transitColIdx = colIdx;
        transitPriority = transitHeaderPriority;
      }
    });

    if (skuColIdx !== -1 && (stockColIdx !== -1 || transitColIdx !== -1)) {
      return {
        found: true,
        headerRowIndex: i,
        skuColIdx,
        stockColIdx,
        transitColIdx,
      };
    }
  }

  return {
    found: false,
    headerRowIndex: -1,
    skuColIdx: -1,
    stockColIdx: -1,
    transitColIdx: -1,
  };
};

export const buildThirdPartyInventoryImport = ({
  rawData,
  inventory,
  warehouseMappings,
}: BuildThirdPartyInventoryImportInput): ThirdPartyInventoryImportResult => {
  const header = findHeader(rawData);
  if (!header.found) {
    return { header, updates: [], fallbacks: [], unmatched: [] };
  }

  const inventorySkuSet = new Set(inventory.map(item => item.sku));
  const dataMap = new Map<string, ImportUpdate>();
  const fallbacks: ImportRowDetail[] = [];
  const unmatched: ImportRowDetail[] = [];

  for (let i = header.headerRowIndex + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row) continue;

    const rawSku = row[header.skuColIdx];
    if (!rawSku) continue;

    const excelSku = String(rawSku).trim();
    if (!excelSku) continue;

    const stock = header.stockColIdx !== -1 ? parseNumber(row[header.stockColIdx]) : 0;
    const transit = header.transitColIdx !== -1 ? parseNumber(row[header.transitColIdx]) : 0;
    const mapping = warehouseMappings.find(
      m => m.type === 'third' && m.thirdPartyWarehouseId === excelSku
    );
    const mappedSku = mapping?.sku;

    let targetSku: string | null = null;
    let usedFallback = false;

    if (mappedSku && inventorySkuSet.has(mappedSku)) {
      targetSku = mappedSku;
    } else if (inventorySkuSet.has(excelSku)) {
      targetSku = excelSku;
      usedFallback = Boolean(mappedSku);
      if (mappedSku) {
        fallbacks.push({ excelSku, mappedSku, stock, transit });
      }
    }

    if (!targetSku) {
      unmatched.push({ excelSku, mappedSku, stock, transit });
      continue;
    }

    const current = dataMap.get(targetSku) || {
      sku: targetSku,
      stock: 0,
      transit: 0,
      sourceSkus: [],
      usedFallback: false,
    };

    current.stock += stock;
    current.transit += transit;
    current.sourceSkus.push(excelSku);
    current.usedFallback = current.usedFallback || usedFallback;
    dataMap.set(targetSku, current);
  }

  return {
    header,
    updates: Array.from(dataMap.values()),
    fallbacks,
    unmatched,
  };
};
