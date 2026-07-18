import { hasRuntimeGraphClaim } from './graphNodeSavePreparation';
import {
    DEFAULT_NODE_DATA,
    DEFAULT_SITE_INPUTS,
    type NodeData,
    type PlatformNode,
    type ProfitGlobalInputs,
    type SiteLevelInputs,
} from './types';

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export const MAX_STANDARD_PROFIT_INPUT_ABS = Number.MAX_SAFE_INTEGER;

export type ProfitInputErrorCode = 'required' | 'not_finite' | 'min' | 'max' | 'invalid_enum';

export interface ProfitInputError {
    field: string;
    code: ProfitInputErrorCode;
    min?: number;
    max?: number;
}

const STANDARD_NODE_NUMBER_OPTIONS: Partial<Record<keyof NodeData, Omit<CanonicalProfitNumberOptions, 'field'>>> = {
    baseShippingFee: { min: 0 },
    extraShippingFee: { min: 0 },
    crossBorderFee: { min: 0 },
    firstWeight: { min: 0 },
    platformCoupon: { min: 0 },
    warehouseOperationFee: { min: 0 },
    lastMileFee: { min: 0 },
    platformCommissionRate: { min: 0, max: 100 },
    transactionFeeRate: { min: 0, max: 100 },
    damageReturnRate: { min: 0, max: 100 },
    mdvServiceFeeRate: { min: 0, max: 100 },
    fssServiceFeeRate: { min: 0, max: 100 },
    ccbServiceFeeRate: { min: 0, max: 100 },
};

export type ProfitInputNormalizationResult<T> =
    | { ok: true; value: T }
    | { ok: false; errors: ProfitInputError[] };

export type CanonicalProfitNumberResult =
    | { ok: true; value: number }
    | { ok: false; error: ProfitInputError };

interface CanonicalProfitNumberOptions {
    field: string;
    defaultValue?: number;
    min?: number;
    max?: number;
}

const parseFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || !DECIMAL_NUMBER_PATTERN.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
};

export const parseCanonicalProfitNumber = (
    value: unknown,
    options: CanonicalProfitNumberOptions,
): CanonicalProfitNumberResult => {
    if (value === null || value === undefined) {
        if (options.defaultValue !== undefined) {
            return { ok: true, value: options.defaultValue };
        }
        return { ok: false, error: { field: options.field, code: 'required' } };
    }
    if (typeof value === 'string' && !value.trim()) {
        return { ok: false, error: { field: options.field, code: 'required' } };
    }
    const parsed = parseFiniteNumber(value);
    if (parsed === null) {
        return { ok: false, error: { field: options.field, code: 'not_finite' } };
    }
    if (options.min !== undefined && parsed < options.min) {
        return { ok: false, error: { field: options.field, code: 'min', min: options.min } };
    }
    if (options.max !== undefined && parsed > options.max) {
        return { ok: false, error: { field: options.field, code: 'max', max: options.max } };
    }
    if (parsed < -MAX_STANDARD_PROFIT_INPUT_ABS) {
        return {
            ok: false,
            error: {
                field: options.field,
                code: 'min',
                min: -MAX_STANDARD_PROFIT_INPUT_ABS,
            },
        };
    }
    if (parsed > MAX_STANDARD_PROFIT_INPUT_ABS) {
        return {
            ok: false,
            error: {
                field: options.field,
                code: 'max',
                max: MAX_STANDARD_PROFIT_INPUT_ABS,
            },
        };
    }
    return { ok: true, value: parsed };
};

export const parseCanonicalPositiveRate = (
    value: unknown,
    field = 'exchangeRate',
): CanonicalProfitNumberResult => parseCanonicalProfitNumber(value, {
    field,
    min: Number.MIN_VALUE,
});

export const readHistoricalProfitNumber = (
    value: unknown,
    fallback: number,
    options: Omit<CanonicalProfitNumberOptions, 'field' | 'defaultValue'> = {},
): number => {
    const parsed = parseCanonicalProfitNumber(value, {
        ...options,
        field: 'historicalValue',
        defaultValue: fallback,
    });
    return parsed.ok ? parsed.value : fallback;
};

const collectNumber = (
    source: Record<string, unknown>,
    target: Record<string, number>,
    errors: ProfitInputError[],
    key: string,
    options: Omit<CanonicalProfitNumberOptions, 'field'> = {},
): void => {
    const result = parseCanonicalProfitNumber(source[key], { field: key, ...options });
    if (result.ok === true) target[key] = result.value;
    else errors.push(result.error);
};

export const normalizeProfitGlobalInputs = (
    input: Record<string, unknown>,
    options: { requireIdentity?: boolean } = {},
): ProfitInputNormalizationResult<ProfitGlobalInputs> => {
    const values: Record<string, number> = {};
    const errors: ProfitInputError[] = [];
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const sku = typeof input.sku === 'string' ? input.sku.trim() : '';
    const supplierInvoice = input.supplierInvoice ?? 'no';
    if (options.requireIdentity !== false) {
        if (!name) errors.push({ field: 'name', code: 'required' });
        if (!sku) errors.push({ field: 'sku', code: 'required' });
    }
    if (supplierInvoice !== 'yes' && supplierInvoice !== 'no') {
        errors.push({ field: 'supplierInvoice', code: 'invalid_enum' });
    }
    collectNumber(input, values, errors, 'purchaseCost', { min: 0 });
    collectNumber(input, values, errors, 'productWeight', { min: 0 });
    collectNumber(input, values, errors, 'supplierTaxPoint', { min: 0, max: 100 });
    collectNumber(input, values, errors, 'vatRate');
    collectNumber(input, values, errors, 'corporateIncomeTaxRate');
    if (errors.length > 0) return { ok: false, errors };
    return {
        ok: true,
        value: {
            name,
            sku,
            purchaseCost: values.purchaseCost,
            productWeight: values.productWeight,
            supplierTaxPoint: values.supplierTaxPoint,
            supplierInvoice: supplierInvoice as ProfitGlobalInputs['supplierInvoice'],
            vatRate: values.vatRate,
            corporateIncomeTaxRate: values.corporateIncomeTaxRate,
        },
    };
};

export const normalizeSiteInputs = (
    input: Record<string, unknown>,
): ProfitInputNormalizationResult<SiteLevelInputs> => {
    const errors: ProfitInputError[] = [];
    const values: Record<string, number> = {};
    const couponType = input.sellerCouponType ?? DEFAULT_SITE_INPUTS.sellerCouponType;
    if (couponType !== 'fixed' && couponType !== 'percent') {
        errors.push({ field: 'sellerCouponType', code: 'invalid_enum' });
    }
    collectNumber(input, values, errors, 'totalRevenue', { min: 0, defaultValue: DEFAULT_SITE_INPUTS.totalRevenue });
    collectNumber(input, values, errors, 'sellerCoupon', {
        min: 0,
        ...(couponType === 'percent' ? { max: 100 } : {}),
        defaultValue: DEFAULT_SITE_INPUTS.sellerCoupon,
    });
    collectNumber(input, values, errors, 'sellerCouponPlatformRatio', {
        min: 0,
        max: 100,
        defaultValue: DEFAULT_SITE_INPUTS.sellerCouponPlatformRatio,
    });
    collectNumber(input, values, errors, 'platformInfrastructureFee', {
        min: 0,
        defaultValue: DEFAULT_SITE_INPUTS.platformInfrastructureFee,
    });
    collectNumber(input, values, errors, 'adROI', {
        min: 0,
        defaultValue: DEFAULT_SITE_INPUTS.adROI,
    });
    if (
        couponType === 'fixed'
        && values.sellerCoupon !== undefined
        && values.totalRevenue !== undefined
        && values.sellerCoupon > values.totalRevenue
    ) {
        errors.push({
            field: 'sellerCoupon',
            code: 'max',
            max: values.totalRevenue,
        });
    }
    if (errors.length > 0) return { ok: false, errors };
    return {
        ok: true,
        value: {
            totalRevenue: values.totalRevenue,
            sellerCoupon: values.sellerCoupon,
            sellerCouponType: couponType as SiteLevelInputs['sellerCouponType'],
            sellerCouponPlatformRatio: values.sellerCouponPlatformRatio,
            platformInfrastructureFee: values.platformInfrastructureFee,
            adROI: values.adROI,
        },
    };
};

export const normalizeHistoricalSiteInputs = (
    input: Record<string, unknown> = {},
): SiteLevelInputs => {
    const couponType = input.sellerCouponType === 'percent' ? 'percent' : 'fixed';
    return {
        totalRevenue: readHistoricalProfitNumber(input.totalRevenue, DEFAULT_SITE_INPUTS.totalRevenue, { min: 0 }),
        sellerCoupon: readHistoricalProfitNumber(input.sellerCoupon, DEFAULT_SITE_INPUTS.sellerCoupon, {
            min: 0,
            ...(couponType === 'percent' ? { max: 100 } : {}),
        }),
        sellerCouponType: couponType,
        sellerCouponPlatformRatio: readHistoricalProfitNumber(
            input.sellerCouponPlatformRatio,
            DEFAULT_SITE_INPUTS.sellerCouponPlatformRatio,
            { min: 0, max: 100 },
        ),
        platformInfrastructureFee: readHistoricalProfitNumber(
            input.platformInfrastructureFee,
            DEFAULT_SITE_INPUTS.platformInfrastructureFee,
            { min: 0 },
        ),
        adROI: readHistoricalProfitNumber(input.adROI, DEFAULT_SITE_INPUTS.adROI, { min: 0 }),
    };
};

export const normalizeStandardNodeData = (
    input: Record<string, unknown>,
): ProfitInputNormalizationResult<NodeData> => {
    const values: Record<string, number> = {};
    const errors: ProfitInputError[] = [];
    for (const [key, defaultValue] of Object.entries(DEFAULT_NODE_DATA)) {
        collectNumber(input, values, errors, key, {
            ...STANDARD_NODE_NUMBER_OPTIONS[key as keyof NodeData],
            defaultValue,
        });
    }
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, value: values as NodeData };
};

export const validateCouponRevenueBudget = (
    nodeData: NodeData,
    siteInputs: SiteLevelInputs,
    rateToLocal: unknown,
): ProfitInputError[] => {
    const parsedRate = parseCanonicalPositiveRate(rateToLocal);
    if (parsedRate.ok === false) {
        return nodeData.platformCoupon > 0
            ? [{ field: 'platformCoupon', code: 'not_finite' }]
            : [];
    }

    const grossSellerCoupon = siteInputs.sellerCouponType === 'percent'
        ? siteInputs.totalRevenue * (siteInputs.sellerCoupon / 100)
        : siteInputs.sellerCoupon;
    const sellerContribution = grossSellerCoupon * (1 - siteInputs.sellerCouponPlatformRatio / 100);
    const availableRevenueCNY = Math.max(0, siteInputs.totalRevenue - sellerContribution);
    const maxPlatformCouponLocal = availableRevenueCNY * parsedRate.value;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(maxPlatformCouponLocal));
    if (nodeData.platformCoupon > maxPlatformCouponLocal + tolerance) {
        return [{
            field: 'platformCoupon',
            code: 'max',
            max: maxPlatformCouponLocal,
        }];
    }
    return [];
};

export const normalizeStandardNodesForSave = (
    nodes: PlatformNode[],
): ProfitInputNormalizationResult<PlatformNode[]> => {
    const normalizedNodes: PlatformNode[] = [];
    const errors: ProfitInputError[] = [];
    for (const node of nodes) {
        const isGraph = node.persistedData?.kind === 'graph' || hasRuntimeGraphClaim(node);
        if (node.persistedData?.kind === 'invalid' || isGraph) {
            normalizedNodes.push(node);
            continue;
        }
        const normalized = normalizeStandardNodeData(node.data as unknown as Record<string, unknown>);
        if (normalized.ok === false) {
            errors.push(...normalized.errors.map(error => ({
                ...error,
                field: `nodes.${node.id}.${error.field}`,
            })));
            normalizedNodes.push(node);
            continue;
        }
        normalizedNodes.push({ ...node, data: normalized.value });
    }
    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, value: normalizedNodes };
};
