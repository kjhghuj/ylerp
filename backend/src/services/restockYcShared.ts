/**
 * 补货模块共享工具（restock-v2 / restock-v3 路由共用）。
 * 内容：站点与 SKU 规范化、请求参数解析、YC 站点仓库解析与库存/在途拉取、
 * YC SKU 别名映射、按模块前缀的权限守卫。
 * 全部为纯函数或依赖注入形式（ycClient / prisma 均由调用方传入），
 * 不直接 import prisma 实例，路由测试的 jest.mock('../../index') 不受影响。
 */

import { type NextFunction, type Request, type Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import {
  getYcWarehouseCodesForSite,
  YcClientError,
  type YcCustomerWarehouse,
  type YcOpenPlatformClient,
} from './ycOpenPlatformClient';
import {
  RestockSourceDataError,
  type RemoteInboundOrder,
  type RemoteStockRow,
} from './restockPlanner';

export const SITE_LABELS: Record<string, string> = {
  MY: 'Malaysia',
  SG: 'Singapore',
  PH: 'Philippines',
  TH: 'Thailand',
  ID: 'Indonesia',
  CN: 'China',
};

export const MAX_PLANNING_DAYS = 3650;
export const MAX_GROWTH_PERCENT = 1000;
export const MAX_IMPORT_FILE_NAME_LENGTH = 255;
export const MAX_SITE_LENGTH = 32;
export const MAX_IMPORT_ID_LENGTH = 100;
export const MAX_TARGET_SKU_NAME_LENGTH = 500;
export const YC_STOCK_SKU_MAX_LENGTH = 50;

export const normalizeSite = (site: unknown) => String(site || '').trim().toUpperCase();

export const normalizeSku = (sku: string | null | undefined) => String(sku || '').trim().toUpperCase();

/** 日志脱敏：YC 客户端错误带结构化字段，其余错误只保留 code */
export const logSafeFailure = (context: string, error: unknown) => {
  if (error instanceof YcClientError) {
    console.warn(context, {
      code: error.code,
      path: error.path,
      httpStatus: error.httpStatus,
    });
    return;
  }
  const safeCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN';
  console.warn(context, { code: safeCode });
};

export const parseBoundedQueryNumber = (
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
  integer = false,
): number => {
  if (value === undefined) return fallback;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    throw new Error(`Invalid ${field}`);
  }
  if (typeof value === 'string' && value.trim() === '') throw new Error(`Invalid ${field}`);
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error(`Invalid ${field}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Invalid ${field}`);
  }
  return parsed;
};

export const parseDateQuery = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
};

export const parseRequiredString = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`);
  const parsed = value.trim();
  if (!parsed || parsed.length > maxLength) throw new Error(`Invalid ${field}`);
  return parsed;
};

export const parseNullableBoundedNumber = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  integer = false,
): number | null => {
  if (value === undefined || value === null) return null;
  return parseBoundedQueryNumber(value, field, minimum, minimum, maximum, integer);
};

export const warehouseCodesForSite = (warehouses: YcCustomerWarehouse[], site: string): string[] => {
  const normalizedSite = normalizeSite(site);
  return warehouses
    .filter(warehouse => normalizeSite(warehouse.siteCode) === normalizedSite)
    .map(warehouse => String(warehouse.code || '').trim())
    .filter(Boolean);
};

export const mergeWarehouseCodes = (envCodes: string[], remoteCodes: string[]) => {
  return Array.from(new Set([...envCodes, ...remoteCodes].filter(Boolean)));
};

/** 站点 → YC 仓库编码：环境变量映射 ∪ 远端仓库列表（远端失败时降级仅环境变量并带 warning） */
export const resolveWarehouseCodesForSite = async (
  ycClient: YcOpenPlatformClient,
  site: string,
): Promise<{ warehouseCodes: string[]; warnings: string[] }> => {
  const envCodes = getYcWarehouseCodesForSite(site);
  if (!ycClient.isConfigured()) return { warehouseCodes: envCodes, warnings: [] };

  try {
    const remoteWarehouses = await ycClient.listCustomerWarehouses();
    return {
      warehouseCodes: mergeWarehouseCodes(envCodes, warehouseCodesForSite(remoteWarehouses, site)),
      warnings: [],
    };
  } catch (error) {
    logSafeFailure('YC warehouse lookup failed', error);
    return {
      warehouseCodes: envCodes,
      warnings: ['YC warehouse fetch failed'],
    };
  }
};

/** 并行拉取 YC 库存与在途：任一失败记入 failures（由调用方决定是否 503） */
export const fetchRemoteRows = async (
  ycClient: YcOpenPlatformClient,
  warehouseCodes: string[],
  skus: string[],
): Promise<{
  stockRows?: RemoteStockRow[];
  inboundOrders?: RemoteInboundOrder[];
  failures: Array<{ source: 'stock' | 'inbound'; error: unknown }>;
}> => {
  const [stockResult, inboundResult] = await Promise.allSettled([
    ycClient.listProductInventory({ warehouseCodes, customerSkus: skus }),
    ycClient.listInboundOrders({ warehouseCodes }),
  ]);
  const failures: Array<{ source: 'stock' | 'inbound'; error: unknown }> = [];
  if (stockResult.status === 'rejected') failures.push({ source: 'stock', error: stockResult.reason });
  if (inboundResult.status === 'rejected') failures.push({ source: 'inbound', error: inboundResult.reason });
  return {
    stockRows: stockResult.status === 'fulfilled' ? stockResult.value : undefined,
    inboundOrders: inboundResult.status === 'fulfilled' ? inboundResult.value : undefined,
    failures,
  };
};

/** WarehouseMapping(type='third') → { YC customerSku → ERP SKU } 别名表（仅保留目标 SKU 仍存在的行） */
export const buildYcSkuAliasMap = (
  warehouseMappings: Array<{ sku: string; thirdPartyWarehouseId?: string | null; type?: string | null }>,
  productSkus: string[],
) => {
  const productSkuSet = new Set(productSkus.map(normalizeSku));
  const aliases = new Map<string, string>();

  for (const mapping of warehouseMappings) {
    const erpSku = String(mapping.sku || '').trim();
    const ycSku = String(mapping.thirdPartyWarehouseId || '').trim();
    if (!erpSku || !ycSku) continue;
    if (mapping.type && mapping.type !== 'third') continue;
    if (normalizeSku(erpSku) === normalizeSku(ycSku)) continue;
    if (!productSkuSet.has(normalizeSku(erpSku))) continue;
    aliases.set(normalizeSku(ycSku), erpSku);
  }

  return aliases;
};

export const withMappedCustomerSku = (rows: RemoteStockRow[], aliases: Map<string, string>): RemoteStockRow[] => {
  return rows.map(row => {
    const mappedSku = aliases.get(normalizeSku(row.customerSku));
    return mappedSku ? { ...row, customerSku: mappedSku } : row;
  });
};

export const withMappedInboundCustomerSku = (
  orders: RemoteInboundOrder[],
  aliases: Map<string, string>,
): RemoteInboundOrder[] => {
  return orders.map(order => ({
    ...order,
    details: (order.details || []).map(detail => {
      const mappedSku = aliases.get(normalizeSku(detail.customerSku))
        || aliases.get(normalizeSku(detail.productSku));
      return mappedSku ? { ...detail, customerSku: mappedSku } : detail;
    }),
  }));
};

export const hasRestockPermission = (permissions: string[], permission: string): boolean => {
  const moduleKey = permission.split('.')[0];
  return permissions.includes('*') || permissions.includes(permission) || permissions.includes(moduleKey);
};

/** 按模块前缀生成权限守卫中间件（restock-v2 / restock-v3 各自实例化）；
 *  owner 直通，其余实时查库校验 isActive + permissions。
 *  db 以 getter 注入：路由模块从 index 循环导入 prisma，模块加载期不可取值（TDZ），须延迟到请求时 */
export const createRestockPermissionGuard =
  (dbAccessor: () => Pick<PrismaClient, 'user'>, modulePrefix: 'restock-v2' | 'restock-v3') => {
    const requireRestockPermission = (permission: `${typeof modulePrefix}.view` | `${typeof modulePrefix}.refresh`) => {
      return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        if (req.user.role === 'owner') return next();
        try {
          const user = await dbAccessor().user.findUnique({
            where: { id: req.user.id },
            select: { permissions: true, isActive: true },
          });
          if (!user?.isActive || !hasRestockPermission(user.permissions || [], permission)) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          return next();
        } catch (error) {
          logSafeFailure('Restock permission lookup failed', error);
          return res.status(500).json({ error: 'Permission check failed' });
        }
      };
    };
    return requireRestockPermission;
  };

/** 重新导出便于路由层统一引用（RestockSourceDataError 供 503 判断） */
export { RestockSourceDataError };
