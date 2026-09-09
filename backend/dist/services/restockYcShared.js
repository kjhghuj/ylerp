"use strict";
/**
 * 补货模块共享工具（restock-v2 / restock-v3 路由共用）。
 * 内容：站点与 SKU 规范化、请求参数解析、YC 站点仓库解析与库存/在途拉取、
 * YC SKU 别名映射、按模块前缀的权限守卫。
 * 全部为纯函数或依赖注入形式（ycClient / prisma 均由调用方传入），
 * 不直接 import prisma 实例，路由测试的 jest.mock('../../index') 不受影响。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestockSourceDataError = exports.createRestockPermissionGuard = exports.hasRestockPermission = exports.withMappedInboundCustomerSku = exports.withMappedCustomerSku = exports.buildYcSkuAliasMap = exports.fetchRemoteRows = exports.resolveWarehouseCodesForSite = exports.mergeWarehouseCodes = exports.warehouseCodesForSite = exports.parseNullableBoundedNumber = exports.parseRequiredString = exports.parseDateQuery = exports.parseBoundedQueryNumber = exports.logSafeFailure = exports.normalizeSku = exports.normalizeSite = exports.YC_STOCK_SKU_MAX_LENGTH = exports.MAX_TARGET_SKU_NAME_LENGTH = exports.MAX_IMPORT_ID_LENGTH = exports.MAX_SITE_LENGTH = exports.MAX_IMPORT_FILE_NAME_LENGTH = exports.MAX_GROWTH_PERCENT = exports.MAX_PLANNING_DAYS = exports.SITE_LABELS = void 0;
const ycOpenPlatformClient_1 = require("./ycOpenPlatformClient");
const restockPlanner_1 = require("./restockPlanner");
Object.defineProperty(exports, "RestockSourceDataError", { enumerable: true, get: function () { return restockPlanner_1.RestockSourceDataError; } });
exports.SITE_LABELS = {
    MY: 'Malaysia',
    SG: 'Singapore',
    PH: 'Philippines',
    TH: 'Thailand',
    ID: 'Indonesia',
    CN: 'China',
};
exports.MAX_PLANNING_DAYS = 3650;
exports.MAX_GROWTH_PERCENT = 1000;
exports.MAX_IMPORT_FILE_NAME_LENGTH = 255;
exports.MAX_SITE_LENGTH = 32;
exports.MAX_IMPORT_ID_LENGTH = 100;
exports.MAX_TARGET_SKU_NAME_LENGTH = 500;
exports.YC_STOCK_SKU_MAX_LENGTH = 50;
const normalizeSite = (site) => String(site || '').trim().toUpperCase();
exports.normalizeSite = normalizeSite;
const normalizeSku = (sku) => String(sku || '').trim().toUpperCase();
exports.normalizeSku = normalizeSku;
/** 日志脱敏：YC 客户端错误带结构化字段，其余错误只保留 code */
const logSafeFailure = (context, error) => {
    if (error instanceof ycOpenPlatformClient_1.YcClientError) {
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
exports.logSafeFailure = logSafeFailure;
const parseBoundedQueryNumber = (value, field, fallback, minimum, maximum, integer = false) => {
    if (value === undefined)
        return fallback;
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
        throw new Error(`Invalid ${field}`);
    }
    if (typeof value === 'string' && value.trim() === '')
        throw new Error(`Invalid ${field}`);
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim()))
        throw new Error(`Invalid ${field}`);
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
        throw new Error(`Invalid ${field}`);
    }
    return parsed;
};
exports.parseBoundedQueryNumber = parseBoundedQueryNumber;
const parseDateQuery = (value, field) => {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`Invalid ${field}`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error(`Invalid ${field}`);
    }
    return value;
};
exports.parseDateQuery = parseDateQuery;
const parseRequiredString = (value, field, maxLength) => {
    if (typeof value !== 'string')
        throw new Error(`Invalid ${field}`);
    const parsed = value.trim();
    if (!parsed || parsed.length > maxLength)
        throw new Error(`Invalid ${field}`);
    return parsed;
};
exports.parseRequiredString = parseRequiredString;
const parseNullableBoundedNumber = (value, field, minimum, maximum, integer = false) => {
    if (value === undefined || value === null)
        return null;
    return (0, exports.parseBoundedQueryNumber)(value, field, minimum, minimum, maximum, integer);
};
exports.parseNullableBoundedNumber = parseNullableBoundedNumber;
const warehouseCodesForSite = (warehouses, site) => {
    const normalizedSite = (0, exports.normalizeSite)(site);
    return warehouses
        .filter(warehouse => (0, exports.normalizeSite)(warehouse.siteCode) === normalizedSite)
        .map(warehouse => String(warehouse.code || '').trim())
        .filter(Boolean);
};
exports.warehouseCodesForSite = warehouseCodesForSite;
const mergeWarehouseCodes = (envCodes, remoteCodes) => {
    return Array.from(new Set([...envCodes, ...remoteCodes].filter(Boolean)));
};
exports.mergeWarehouseCodes = mergeWarehouseCodes;
/** 站点 → YC 仓库编码：环境变量映射 ∪ 远端仓库列表（远端失败时降级仅环境变量并带 warning） */
const resolveWarehouseCodesForSite = async (ycClient, site) => {
    const envCodes = (0, ycOpenPlatformClient_1.getYcWarehouseCodesForSite)(site);
    if (!ycClient.isConfigured())
        return { warehouseCodes: envCodes, warnings: [] };
    try {
        const remoteWarehouses = await ycClient.listCustomerWarehouses();
        return {
            warehouseCodes: (0, exports.mergeWarehouseCodes)(envCodes, (0, exports.warehouseCodesForSite)(remoteWarehouses, site)),
            warnings: [],
        };
    }
    catch (error) {
        (0, exports.logSafeFailure)('YC warehouse lookup failed', error);
        return {
            warehouseCodes: envCodes,
            warnings: ['YC warehouse fetch failed'],
        };
    }
};
exports.resolveWarehouseCodesForSite = resolveWarehouseCodesForSite;
/** 并行拉取 YC 库存与在途：任一失败记入 failures（由调用方决定是否 503） */
const fetchRemoteRows = async (ycClient, warehouseCodes, skus) => {
    const [stockResult, inboundResult] = await Promise.allSettled([
        ycClient.listProductInventory({ warehouseCodes, customerSkus: skus }),
        ycClient.listInboundOrders({ warehouseCodes }),
    ]);
    const failures = [];
    if (stockResult.status === 'rejected')
        failures.push({ source: 'stock', error: stockResult.reason });
    if (inboundResult.status === 'rejected')
        failures.push({ source: 'inbound', error: inboundResult.reason });
    return {
        stockRows: stockResult.status === 'fulfilled' ? stockResult.value : undefined,
        inboundOrders: inboundResult.status === 'fulfilled' ? inboundResult.value : undefined,
        failures,
    };
};
exports.fetchRemoteRows = fetchRemoteRows;
/** WarehouseMapping(type='third') → { YC customerSku → ERP SKU } 别名表（仅保留目标 SKU 仍存在的行） */
const buildYcSkuAliasMap = (warehouseMappings, productSkus) => {
    const productSkuSet = new Set(productSkus.map(exports.normalizeSku));
    const aliases = new Map();
    for (const mapping of warehouseMappings) {
        const erpSku = String(mapping.sku || '').trim();
        const ycSku = String(mapping.thirdPartyWarehouseId || '').trim();
        if (!erpSku || !ycSku)
            continue;
        if (mapping.type && mapping.type !== 'third')
            continue;
        if ((0, exports.normalizeSku)(erpSku) === (0, exports.normalizeSku)(ycSku))
            continue;
        if (!productSkuSet.has((0, exports.normalizeSku)(erpSku)))
            continue;
        aliases.set((0, exports.normalizeSku)(ycSku), erpSku);
    }
    return aliases;
};
exports.buildYcSkuAliasMap = buildYcSkuAliasMap;
const withMappedCustomerSku = (rows, aliases) => {
    return rows.map(row => {
        const mappedSku = aliases.get((0, exports.normalizeSku)(row.customerSku));
        return mappedSku ? { ...row, customerSku: mappedSku } : row;
    });
};
exports.withMappedCustomerSku = withMappedCustomerSku;
const withMappedInboundCustomerSku = (orders, aliases) => {
    return orders.map(order => ({
        ...order,
        details: (order.details || []).map(detail => {
            const mappedSku = aliases.get((0, exports.normalizeSku)(detail.customerSku))
                || aliases.get((0, exports.normalizeSku)(detail.productSku));
            return mappedSku ? { ...detail, customerSku: mappedSku } : detail;
        }),
    }));
};
exports.withMappedInboundCustomerSku = withMappedInboundCustomerSku;
const hasRestockPermission = (permissions, permission) => {
    const moduleKey = permission.split('.')[0];
    return permissions.includes('*') || permissions.includes(permission) || permissions.includes(moduleKey);
};
exports.hasRestockPermission = hasRestockPermission;
/** 按模块前缀生成权限守卫中间件（restock-v2 / restock-v3 各自实例化）；
 *  owner 直通，其余实时查库校验 isActive + permissions。
 *  db 以 getter 注入：路由模块从 index 循环导入 prisma，模块加载期不可取值（TDZ），须延迟到请求时 */
const createRestockPermissionGuard = (dbAccessor, modulePrefix) => {
    const requireRestockPermission = (permission) => {
        return async (req, res, next) => {
            if (!req.user)
                return res.status(401).json({ error: 'Unauthorized' });
            if (req.user.role === 'owner')
                return next();
            try {
                const user = await dbAccessor().user.findUnique({
                    where: { id: req.user.id },
                    select: { permissions: true, isActive: true },
                });
                if (!user?.isActive || !(0, exports.hasRestockPermission)(user.permissions || [], permission)) {
                    return res.status(403).json({ error: 'Forbidden' });
                }
                return next();
            }
            catch (error) {
                (0, exports.logSafeFailure)('Restock permission lookup failed', error);
                return res.status(500).json({ error: 'Permission check failed' });
            }
        };
    };
    return requireRestockPermission;
};
exports.createRestockPermissionGuard = createRestockPermissionGuard;
