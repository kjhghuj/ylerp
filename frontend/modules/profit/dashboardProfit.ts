import type { ProductCalcData } from '../../types';
import { createProductTemplateProfitViewModel } from '../productTemplateProfitViewModel';
import { normalizeProductTemplateData, toStandardNodeData } from '../productTemplateImport';
import { calculateProfit } from './calculateProfit';
import { resolveProfitExchangeRate } from './exchangeRateSnapshot';
import {
    normalizeProfitGlobalInputs,
    normalizeSiteInputs,
    normalizeStandardNodeData,
    validateCouponRevenueBudget,
} from './profitInputNormalization';
import { createProductSiteViewModel } from './productSiteViewModel';
import {
    DEFAULT_NODE_DATA,
    type CurrencyCode,
    normalizeCurrencyCode,
    type ProductProfitTemplate,
    type ProductTemplateData,
} from './types';

export interface PrimaryProfitTemplateRecord extends ProductProfitTemplate {
    product: ProductCalcData;
}

export type DashboardProfitExclusionReason =
    | 'not_primary'
    | 'invalid_record'
    | 'unsupported_site'
    | 'invalid_template'
    | 'invalid_input'
    | 'invalid_exchange_rate'
    | 'graph_execution_error'
    | 'missing_net_profit_metric'
    | 'invalid_net_profit_metric'
    | 'no_post_coupon_revenue'
    | 'aggregate_overflow';

export interface DashboardProfitRow {
    templateId: string;
    productId: string;
    productName: string;
    country: string;
    netProfitCNY: number;
    postCouponRevenueCNY: number;
    marginPercent: number;
    templateKind: 'standard' | 'graph';
}

export interface DashboardProfitAggregation {
    totalNetProfitCNY: number;
    totalPostCouponRevenueCNY: number;
    marginPercent: number | null;
    rows: DashboardProfitRow[];
    excluded: Array<{ templateId: string; reason: DashboardProfitExclusionReason }>;
}

const resolveRate = (
    data: unknown,
    currency: string,
    liveRates: Readonly<Record<string, unknown>>,
): number | null => {
    if (currency === 'CNY') return 1;
    try {
        return resolveProfitExchangeRate(data, liveRates[currency], false).rate;
    } catch {
        return null;
    }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const MAX_DASHBOARD_AMOUNT = Number.MAX_SAFE_INTEGER;

const isDashboardAmount = (value: unknown): value is number => (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_DASHBOARD_AMOUNT
);

const readTemplateId = (value: unknown): string => (
    isRecord(value) && typeof value.id === 'string' && value.id.trim()
        ? value.id
        : '(unknown)'
);

const isPrimaryProfitTemplateRecord = (
    value: unknown,
): value is PrimaryProfitTemplateRecord => {
    if (!isRecord(value) || !isRecord(value.product) || !isRecord(value.data)) return false;
    return (
        typeof value.id === 'string' && value.id.trim().length > 0 &&
        typeof value.productId === 'string' && value.productId.trim().length > 0 &&
        typeof value.name === 'string' &&
        typeof value.country === 'string' && value.country.trim().length > 0 &&
        typeof value.isPrimary === 'boolean' &&
        typeof value.product.id === 'string' && value.product.id.trim().length > 0 &&
        typeof value.product.name === 'string'
    );
};

const normalizeDashboardTemplateData = (value: unknown): ProductTemplateData => {
    if (!isRecord(value)) return normalizeProductTemplateData({});
    if (
        (value.kind === 'standard' || value.kind === 'graph') &&
        isRecord(value.nodeData) &&
        isRecord(value.extraData)
    ) {
        return value as unknown as ProductTemplateData;
    }
    if (value.kind === 'invalid' && isRecord(value.rawData)) {
        return value as unknown as ProductTemplateData;
    }
    return normalizeProductTemplateData(value);
};

export const aggregatePrimaryProfitTemplates = (
    records: readonly unknown[],
    liveRates: Readonly<Record<string, unknown>>,
): DashboardProfitAggregation => {
    const rows: DashboardProfitRow[] = [];
    const excluded: DashboardProfitAggregation['excluded'] = [];
    let totalNetProfitCNY = 0;
    let totalPostCouponRevenueCNY = 0;

    for (const candidate of records) {
        const templateId = readTemplateId(candidate);
        if (!isPrimaryProfitTemplateRecord(candidate)) {
            excluded.push({ templateId, reason: 'invalid_record' });
            continue;
        }
        const record = candidate;
        if (record.isPrimary !== true) {
            excluded.push({ templateId: record.id, reason: 'not_primary' });
            continue;
        }

        const canonicalCurrency = normalizeCurrencyCode(record.country);
        if (!canonicalCurrency) {
            excluded.push({ templateId: record.id, reason: 'unsupported_site' });
            continue;
        }

        const data = normalizeDashboardTemplateData(record.data);
        if (data.kind === 'invalid') {
            excluded.push({ templateId: record.id, reason: 'invalid_template' });
            continue;
        }

        const productSite = createProductSiteViewModel(record.product, canonicalCurrency);
        const globalInputs = normalizeProfitGlobalInputs(
            productSite.globalInputs as unknown as Record<string, unknown>,
        );
        const siteInputs = normalizeSiteInputs(
            productSite.siteInputs as unknown as Record<string, unknown>,
        );
        if (!globalInputs.ok || !siteInputs.ok) {
            excluded.push({ templateId: record.id, reason: 'invalid_input' });
            continue;
        }

        const rate = resolveRate(data, productSite.currency, liveRates);
        if (rate === null) {
            excluded.push({ templateId: record.id, reason: 'invalid_exchange_rate' });
            continue;
        }
        const currency = productSite.currency as CurrencyCode;

        let postCouponRevenueCNY: number;
        try {
            postCouponRevenueCNY = calculateProfit(
                DEFAULT_NODE_DATA,
                globalInputs.value,
                siteInputs.value,
                rate,
                currency,
            ).revenueAfterSellerCoupon;
        } catch {
            excluded.push({ templateId: record.id, reason: 'invalid_input' });
            continue;
        }
        if (!isDashboardAmount(postCouponRevenueCNY) || !(postCouponRevenueCNY > 0)) {
            excluded.push({ templateId: record.id, reason: 'no_post_coupon_revenue' });
            continue;
        }

        let netProfitCNY: number;
        let templateKind: DashboardProfitRow['templateKind'];
        if (data.kind === 'standard') {
            const nodeData = normalizeStandardNodeData(
                toStandardNodeData(data) as unknown as Record<string, unknown>,
            );
            if (!nodeData.ok || validateCouponRevenueBudget(
                nodeData.ok ? nodeData.value : DEFAULT_NODE_DATA,
                siteInputs.value,
                rate,
            ).length > 0) {
                excluded.push({ templateId: record.id, reason: 'invalid_input' });
                continue;
            }
            try {
                netProfitCNY = calculateProfit(
                    nodeData.value,
                    globalInputs.value,
                    siteInputs.value,
                    rate,
                    currency,
                ).finalRevenueCNY;
            } catch {
                excluded.push({ templateId: record.id, reason: 'invalid_input' });
                continue;
            }
            templateKind = 'standard';
        } else {
            let viewModel: ReturnType<typeof createProductTemplateProfitViewModel<null>>;
            try {
                viewModel = createProductTemplateProfitViewModel<null>(data, () => null);
            } catch {
                excluded.push({ templateId: record.id, reason: 'graph_execution_error' });
                continue;
            }
            if (viewModel.kind !== 'graph') {
                excluded.push({ templateId: record.id, reason: 'graph_execution_error' });
                continue;
            }
            const metrics = viewModel.outputs.filter(output => output.metricKey === 'netProfitCNY');
            if (metrics.length === 0) {
                excluded.push({ templateId: record.id, reason: 'missing_net_profit_metric' });
                continue;
            }
            if (metrics.length !== 1 || !isDashboardAmount(metrics[0].value)) {
                excluded.push({ templateId: record.id, reason: 'invalid_net_profit_metric' });
                continue;
            }
            netProfitCNY = metrics[0].value;
            templateKind = 'graph';
        }

        if (!isDashboardAmount(netProfitCNY)) {
            excluded.push({ templateId: record.id, reason: 'invalid_net_profit_metric' });
            continue;
        }
        const marginPercent = (netProfitCNY / postCouponRevenueCNY) * 100;
        const nextNetProfit = totalNetProfitCNY + netProfitCNY;
        const nextRevenue = totalPostCouponRevenueCNY + postCouponRevenueCNY;
        if (
            !isDashboardAmount(marginPercent) ||
            !isDashboardAmount(nextNetProfit) ||
            !isDashboardAmount(nextRevenue)
        ) {
            excluded.push({ templateId: record.id, reason: 'aggregate_overflow' });
            continue;
        }

        rows.push({
            templateId: record.id,
            productId: record.productId,
            productName: record.product.name,
            country: productSite.currency,
            netProfitCNY,
            postCouponRevenueCNY,
            marginPercent,
            templateKind,
        });
        totalNetProfitCNY = nextNetProfit;
        totalPostCouponRevenueCNY = nextRevenue;
    }

    const aggregateMargin = totalPostCouponRevenueCNY > 0
        ? (totalNetProfitCNY / totalPostCouponRevenueCNY) * 100
        : null;
    return {
        totalNetProfitCNY,
        totalPostCouponRevenueCNY,
        marginPercent: aggregateMargin !== null && isDashboardAmount(aggregateMargin)
            ? aggregateMargin
            : null,
        rows,
        excluded,
    };
};
