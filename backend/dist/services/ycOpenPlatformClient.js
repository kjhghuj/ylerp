"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getYcWarehouseCodesForSite = exports.createYcOpenPlatformClient = exports.HttpYcOpenPlatformClient = exports.YcClientError = exports.YC_CLIENT_LIMITS = void 0;
exports.YC_CLIENT_LIMITS = Object.freeze({
    maxWarehouseCodes: 100,
    maxCustomerSkus: 5000,
    maxListRows: 2000,
    maxRequestBatches: 200,
    maxInboundDetails: 10000,
    inboundDetailConcurrency: 5,
    maxIdentifierLength: 128,
    requestTimeoutMs: 15000,
});
class YcClientError extends Error {
    code;
    path;
    httpStatus;
    constructor(message, code, path, httpStatus) {
        super(message);
        this.code = code;
        this.path = path;
        this.httpStatus = httpStatus;
        this.name = 'YcClientError';
    }
}
exports.YcClientError = YcClientError;
const DEFAULT_BASE_URL = 'https://yc-client.anestcang.com';
const SUCCESS_STATE = '000001';
const TOKEN_REFRESH_WINDOW_MS = 12 * 60 * 60 * 1000;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 20;
const compactBaseUrl = (baseUrl) => baseUrl.replace(/\/+$/, '');
const chunk = (items, size) => {
    if (items.length === 0)
        return [[]];
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
};
const validateScope = (values, maximum) => {
    if (values.length > maximum) {
        throw new YcClientError('YC request scope is too large', 'SCOPE_LIMIT');
    }
    const normalized = values.map(value => String(value).trim());
    if (normalized.some(value => !value || value.length > exports.YC_CLIENT_LIMITS.maxIdentifierLength)) {
        throw new YcClientError('YC request scope contains an invalid identifier', 'INVALID_IDENTIFIER');
    }
    return Array.from(new Set(normalized));
};
const mapWithConcurrency = async (items, concurrency, mapper) => {
    const results = new Array(items.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
};
const isActiveInboundStatus = (status) => {
    const parsed = Number(status);
    return parsed === 2 || parsed === 3;
};
const flattenInboundDetails = (details) => {
    const flattened = [];
    for (const entry of details || []) {
        if ('detail' in entry && Array.isArray(entry.detail)) {
            flattened.push(...entry.detail);
        }
        else if ('customerSku' in entry || 'productSku' in entry) {
            flattened.push(entry);
        }
    }
    return flattened;
};
class HttpYcOpenPlatformClient {
    baseUrl;
    appKey;
    appSecret;
    requestTimeoutMs;
    tokenCache = null;
    constructor(options = {}) {
        this.baseUrl = compactBaseUrl(options.baseUrl || process.env.YC_API_BASE_URL || DEFAULT_BASE_URL);
        this.appKey = options.appKey || process.env.YC_APP_KEY || '';
        this.appSecret = options.appSecret || process.env.YC_APP_SECRET || '';
        const requestedTimeout = Number(options.requestTimeoutMs ?? exports.YC_CLIENT_LIMITS.requestTimeoutMs);
        this.requestTimeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout >= 1 && requestedTimeout <= 120000
            ? requestedTimeout
            : exports.YC_CLIENT_LIMITS.requestTimeoutMs;
    }
    isConfigured() {
        return Boolean(this.appKey && this.appSecret);
    }
    async listProductInventory({ warehouseCodes = [], customerSkus = [] }) {
        const rows = [];
        const validWarehouseCodes = validateScope(warehouseCodes, exports.YC_CLIENT_LIMITS.maxWarehouseCodes);
        const validCustomerSkus = validateScope(customerSkus, exports.YC_CLIENT_LIMITS.maxCustomerSkus);
        const warehouseScope = validWarehouseCodes.length > 0 ? validWarehouseCodes : [undefined];
        const skuChunks = chunk(validCustomerSkus, 100);
        if (warehouseScope.length * skuChunks.length > exports.YC_CLIENT_LIMITS.maxRequestBatches) {
            throw new YcClientError('YC request batch limit exceeded', 'BATCH_LIMIT');
        }
        for (const warehouseCode of warehouseScope) {
            for (const skuChunk of skuChunks) {
                const pageRows = await this.paginate('/api/openPlatform/stock/list', {
                    ...(warehouseCode ? { warehouseCode } : {}),
                    ...(skuChunk.length > 0 ? { customerSku: skuChunk } : {}),
                });
                if (rows.length + pageRows.length > exports.YC_CLIENT_LIMITS.maxListRows) {
                    throw new YcClientError('YC inventory row limit exceeded', 'ROW_LIMIT', '/api/openPlatform/stock/list');
                }
                rows.push(...pageRows);
            }
        }
        return rows;
    }
    async listCustomerWarehouses() {
        const data = await this.request('/api/openPlatform/baseData/customerWarehouse', {});
        const warehouses = Array.isArray(data) ? data : [];
        if (warehouses.length > exports.YC_CLIENT_LIMITS.maxWarehouseCodes) {
            throw new YcClientError('YC warehouse limit exceeded', 'WAREHOUSE_LIMIT', '/api/openPlatform/baseData/customerWarehouse');
        }
        return warehouses;
    }
    async listInboundOrders({ warehouseCodes = [] }) {
        const listedRows = [];
        const validWarehouseCodes = validateScope(warehouseCodes, exports.YC_CLIENT_LIMITS.maxWarehouseCodes);
        const warehouseScope = validWarehouseCodes.length > 0 ? validWarehouseCodes : [undefined];
        for (const warehouseCode of warehouseScope) {
            const listedOrders = await this.paginate('/api/openPlatform/inOrder/list', {
                ...(warehouseCode ? { destinationWarehouseCode: warehouseCode } : {}),
            });
            if (listedRows.length + listedOrders.length > exports.YC_CLIENT_LIMITS.maxListRows) {
                throw new YcClientError('YC inbound order limit exceeded', 'ROW_LIMIT', '/api/openPlatform/inOrder/list');
            }
            listedRows.push(...listedOrders);
        }
        let totalDetails = 0;
        return mapWithConcurrency(listedRows, exports.YC_CLIENT_LIMITS.inboundDetailConcurrency, async (order) => {
            if (!isActiveInboundStatus(order.status))
                return { ...order, details: [] };
            const customerWarehouseOrderNo = String(order.customerWarehouseOrderNo || '').trim();
            if (!customerWarehouseOrderNo || customerWarehouseOrderNo.length > exports.YC_CLIENT_LIMITS.maxIdentifierLength) {
                throw new YcClientError('YC inbound detail identifier is invalid', 'INVALID_IDENTIFIER', '/api/openPlatform/inOrder/detail');
            }
            const detail = await this.request('/api/openPlatform/inOrder/detail', {
                customerWarehouseOrderNo,
            });
            const details = flattenInboundDetails(detail?.details);
            totalDetails += details.length;
            if (totalDetails > exports.YC_CLIENT_LIMITS.maxInboundDetails) {
                throw new YcClientError('YC inbound detail limit exceeded', 'DETAIL_LIMIT', '/api/openPlatform/inOrder/detail');
            }
            return { ...order, ...detail, details };
        });
    }
    async paginate(path, body) {
        const rows = [];
        let completed = false;
        for (let page = 1; page <= MAX_PAGES; page += 1) {
            const data = await this.request(path, {
                ...body,
                page,
                prePage: DEFAULT_PAGE_SIZE,
            });
            const list = Array.isArray(data?.list) ? data.list : [];
            const total = Number(data?.total || 0);
            if (!Number.isFinite(total) || total < 0 || total > exports.YC_CLIENT_LIMITS.maxListRows) {
                throw new YcClientError('YC list row limit exceeded', 'ROW_LIMIT', path);
            }
            if (rows.length + list.length > exports.YC_CLIENT_LIMITS.maxListRows) {
                throw new YcClientError('YC list row limit exceeded', 'ROW_LIMIT', path);
            }
            rows.push(...list);
            if (list.length < DEFAULT_PAGE_SIZE || (total > 0 && rows.length >= total)) {
                completed = true;
                break;
            }
        }
        if (!completed)
            throw new YcClientError('YC pagination limit reached', 'PAGE_LIMIT', path);
        return rows;
    }
    async getToken() {
        if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
            return this.tokenCache;
        }
        const data = await this.request('/api/openPlatform/authorization/login', { appKey: this.appKey, appSecret: this.appSecret }, false);
        if (!data?.token) {
            throw new YcClientError('YC authorization failed', 'AUTH_RESPONSE_INVALID', '/api/openPlatform/authorization/login');
        }
        this.tokenCache = {
            token: data.token,
            tokenType: data.tokenType || 'Bearer',
            expiresAt: Date.now() + TOKEN_REFRESH_WINDOW_MS,
        };
        return this.tokenCache;
    }
    async request(path, body, withAuth = true) {
        if (!this.isConfigured()) {
            throw new YcClientError('YC credentials are not configured', 'NOT_CONFIGURED', path);
        }
        const headers = {
            'Content-Type': 'application/json',
        };
        if (withAuth) {
            const token = await this.getToken();
            headers.Authorization = `${token.tokenType} ${token.token}`;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        let response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        }
        catch (error) {
            if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
                throw new YcClientError('YC request timed out', 'TIMEOUT', path);
            }
            throw new YcClientError('YC request failed', 'NETWORK_ERROR', path);
        }
        finally {
            clearTimeout(timeout);
        }
        if (!response.ok) {
            throw new YcClientError('YC request failed', 'HTTP_ERROR', path, response.status);
        }
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            throw new YcClientError('YC response was invalid', 'INVALID_RESPONSE', path, response.status);
        }
        if (payload.state && payload.state !== SUCCESS_STATE) {
            throw new YcClientError('YC request was rejected', 'REMOTE_REJECTED', path, response.status);
        }
        return (payload.data ?? payload);
    }
}
exports.HttpYcOpenPlatformClient = HttpYcOpenPlatformClient;
const createYcOpenPlatformClient = () => new HttpYcOpenPlatformClient();
exports.createYcOpenPlatformClient = createYcOpenPlatformClient;
const getYcWarehouseCodesForSite = (site) => {
    const normalizedSite = site.trim().toUpperCase();
    const mapValue = process.env.YC_SITE_WAREHOUSE_MAP;
    if (mapValue) {
        try {
            const parsed = JSON.parse(mapValue);
            const mapped = parsed[normalizedSite];
            if (Array.isArray(mapped)) {
                return mapped.map(String).map(value => value.trim()).filter(Boolean);
            }
            if (typeof mapped === 'string') {
                return mapped.split(',').map(value => value.trim()).filter(Boolean);
            }
        }
        catch {
            return [];
        }
    }
    const siteEnv = process.env[`YC_WAREHOUSE_CODES_${normalizedSite}`] || process.env[`YC_WAREHOUSES_${normalizedSite}`] || '';
    return siteEnv.split(',').map(value => value.trim()).filter(Boolean);
};
exports.getYcWarehouseCodesForSite = getYcWarehouseCodesForSite;
