import { roundCurrencyAmount } from './currencyRounding';
import { DEFAULT_NODE_DATA, genId, type CurrencyCode, type NodeData, type PlatformNode, type SiteLevelInputs } from './types';
import { supportsTiktokShippingCurrency } from './tiktokShippingRates';
import { hasRuntimeGraphClaim } from './graphNodeSavePreparation';

export interface TiktokFeePolicy {
    version: 1;
    presetId: 'MYR' | 'SGD' | 'PHP' | 'THB' | 'USD' | 'manual';
    verifiedAt: string | null;
    presetProfile?: 'us-cross-border';
}
export interface ProfitCalculationContext {
    platform?: string;
    tiktokFeePolicy?: TiktokFeePolicy;
}

const university = (region: string, id: string) => `https://seller-${region}.tiktok.com/university/essay?knowledge_id=${id}&lang=en`;
export const TIKTOK_RULE_DATE = '2026-10-04';
export const TIKTOK_US_CROSS_BORDER_NODE_NAME = '跨境';
export const TIKTOK_US_CROSS_BORDER_FEE_SOURCE = 'https://seller.tiktokshopglobalselling.com/university/essay?knowledge_id=140687984494338&role=1&course_type=1&from=search&identity=1';
export const TIKTOK_US_CAMPAIGN_FEE_SOURCE = 'https://seller.tiktokshopglobalselling.com/university/essay?knowledge_id=2333066828973825&role=1&course_type=1&from=search&identity=1';
export const TIKTOK_US_STANDARD_CAMPAIGN_SOURCE = 'https://seller.tiktokshopglobalselling.com/university/essay?knowledge_id=2519691026401041&role=1&course_type=1&from=search&identity=1';
const US_CROSS_BORDER_DEFAULT_FEES: Partial<NodeData> = {
    platformCommissionRate: 6, transactionFeeRate: 0, tiktokOrderFee: 0,
    growthServiceFeeRate: 0, growthServiceFeeCap: 0,
    shippingServiceFeeRate: 0, shippingServiceFeeCap: 0,
    campaignServiceFeeRate: 0, campaignServiceFeeCap: 0,
};
export const TIKTOK_AFFILIATE_SOURCE = university('my', '6837846988539650');
export const TIKTOK_US_SETTLEMENT_SOURCE = university('us', '2336057241700098');
export const getTiktokAffiliateSource = (currency: string): string => currency === 'USD' ? TIKTOK_US_SETTLEMENT_SOURCE : TIKTOK_AFFILIATE_SOURCE;
export const TIKTOK_PRESETS: Partial<Record<CurrencyCode, { data: Partial<NodeData>; sources: { label: string; url: string }[] }>> = {
    // US referral fees replace the historical separate transaction fee. Category
    // rates and promotion eligibility remain manual, just like the SEA presets.
    USD: { data: { transactionFeeRate: 0 }, sources: [
        { label: 'category', url: university('us', '5988482086864682') },
        { label: 'referral', url: university('us', '5982454398175018') },
        { label: 'settlement', url: TIKTOK_US_SETTLEMENT_SOURCE },
    ] },
    MYR: { data: { transactionFeeRate: 3.78, tiktokOrderFee: 0.54 }, sources: [
        { label: 'transaction', url: 'https://seller.tiktokglobalshop.com/university/new-articles?content_id=852963913090833&course_type=1&knowledge_id=6837845927446273' },
        { label: 'order', url: 'https://seller-my.tiktok.com/university/course?content_id=7992113007347457&lang=en&learning_id=7692879306114818' },
        { label: 'category', url: university('my', '6907739532281602') },
        { label: 'bxp', url: university('my', '6907739532281602') },
    ] },
    THB: { data: { transactionFeeRate: 3.21, tiktokOrderFee: 1.07, growthServiceFeeRate: 8.03, growthServiceFeeCap: 199 }, sources: [
        { label: 'transaction', url: university('th', '10011830') },
        { label: 'services', url: university('th', '4831419884979969') },
        { label: 'category', url: university('th', '6837808312370945') },
    ] },
    PHP: { data: { transactionFeeRate: 2.24, tiktokOrderFee: 5, growthServiceFeeRate: 1.5, shippingServiceFeeRate: 5.5, shippingServiceFeeCap: 100 }, sources: [
        { label: 'transaction', url: university('ph', '3161439284496130') },
        { label: 'order', url: university('ph', '6374416701966081') },
        { label: 'shipping', url: 'https://seller.tiktokglobalshop.com/university/essay?default_language=zh-CN&knowledge_id=2501415638206225' },
        { label: 'growth', url: university('ph', '7913173433534224') },
        { label: 'category', url: university('ph', '3157977859229442') },
    ] },
    SGD: { data: { transactionFeeRate: 3.27 }, sources: [
        { label: 'transaction', url: university('sg', '780268081530625') },
        { label: 'category', url: university('sg', '2161524467910401') },
        { label: 'bxp', url: university('sg', '2192573259400976') },
    ] },
};

/** Metadata is opt-in: absent metadata intentionally keeps historical calculations. */
export const getProfitCalculationContext = (platform: string | undefined, templateData: unknown): ProfitCalculationContext => {
    if (platform !== 'tiktok') return { platform };
    const record = templateData && typeof templateData === 'object' ? templateData as Record<string, unknown> : {};
    const extras = record.kind === 'standard' && record.extraData && typeof record.extraData === 'object' && !Array.isArray(record.extraData)
        ? record.extraData as Record<string, unknown> : record;
    if (!extras || !Object.prototype.hasOwnProperty.call(extras, 'tiktokFeePolicy')) return { platform };
    const policy = extras.tiktokFeePolicy as TiktokFeePolicy | null;
    if (!policy || policy.version !== 1 || !['MYR', 'SGD', 'PHP', 'THB', 'USD', 'manual'].includes(policy.presetId)
        || (policy.presetProfile !== undefined && (policy.presetProfile !== 'us-cross-border' || policy.presetId !== 'USD'))
        || (policy.presetId === 'manual' ? policy.verifiedAt !== null : !/^\d{4}-\d{2}-\d{2}$/.test(policy.verifiedAt ?? '')
            || !Number.isFinite(Date.parse(policy.verifiedAt ?? '')) || new Date(policy.verifiedAt!).toISOString().slice(0, 10) !== policy.verifiedAt)) {
        throw new Error('Invalid or unsupported TikTok fee policy');
    }
    return { platform, tiktokFeePolicy: { version: 1, presetId: policy.presetId, verifiedAt: policy.verifiedAt,
        ...(policy.presetProfile ? { presetProfile: policy.presetProfile } : {}) } };
};

/** Apply once to the explicitly named US cross-border node; later manual edits remain authoritative. */
export const applyTiktokUSCrossBorderDefaults = (node: PlatformNode, site?: SiteLevelInputs, exchangeRate?: number): PlatformNode => {
    if (node.platform !== 'tiktok' || node.currency !== 'USD' || typeof node.name !== 'string' || node.name.trim() !== TIKTOK_US_CROSS_BORDER_NODE_NAME
        || hasRuntimeGraphClaim(node) || node.persistedData?.kind === 'graph' || node.persistedData?.kind === 'invalid') return node;
    let existingPolicy: TiktokFeePolicy | undefined;
    try {
        existingPolicy = getProfitCalculationContext(node.platform, node.persistedData).tiktokFeePolicy;
        if (existingPolicy?.presetProfile === 'us-cross-border') return node;
    } catch { return node; }
    // Historical calculations charged the shared CNY fee. Preserve that actual
    // input when opting into TK fees, which no longer charge the shared field.
    const legacyOrderFeeCNY = existingPolicy ? 0 : site?.platformInfrastructureFee ?? 0;
    if (!Number.isFinite(legacyOrderFeeCNY) || legacyOrderFeeCNY < 0
        || legacyOrderFeeCNY > 0 && (!Number.isFinite(exchangeRate) || exchangeRate! <= 0)) return node;
    const data = { ...DEFAULT_NODE_DATA, ...node.data, ...US_CROSS_BORDER_DEFAULT_FEES };
    if (legacyOrderFeeCNY > 0) {
        const localOrderFee = legacyOrderFeeCNY * exchangeRate!;
        if (!Number.isFinite(localOrderFee) || localOrderFee > Number.MAX_SAFE_INTEGER) return node;
        data.tiktokOrderFee = roundCurrencyAmount(localOrderFee, 'USD');
    }
    const policy: TiktokFeePolicy = { version: 1, presetId: 'USD', verifiedAt: TIKTOK_RULE_DATE, presetProfile: 'us-cross-border' };
    return { ...node, data, persistedData: { kind: 'standard', schemaVersion: 2, nodeData: { ...data },
        extraData: { ...(node.persistedData?.extraData ?? {}), tiktokFeePolicy: policy } } };
};

export const createTiktokNode = (currency: string, name: string): PlatformNode => {
    const preset = TIKTOK_PRESETS[currency as CurrencyCode];
    const data = { ...DEFAULT_NODE_DATA, ...preset?.data, shippingCalculationMode: supportsTiktokShippingCurrency(currency) ? 1 : 2 };
    const policy: TiktokFeePolicy = { version: 1, presetId: preset ? currency as TiktokFeePolicy['presetId'] : 'manual', verifiedAt: preset ? TIKTOK_RULE_DATE : null };
    return applyTiktokUSCrossBorderDefaults({ id: genId(), platform: 'tiktok', currency, name, data,
        persistedData: { kind: 'standard', schemaVersion: 2, nodeData: { ...data }, extraData: { tiktokFeePolicy: policy } } });
};

export const upgradeTiktokNode = (node: PlatformNode, site: SiteLevelInputs, exchangeRate: number): PlatformNode => {
    if (node.platform !== 'tiktok' || node.persistedData?.kind === 'graph' || node.persistedData?.kind === 'invalid') throw new Error('Only standard TikTok templates can be upgraded');
    if (getProfitCalculationContext(node.platform, node.persistedData).tiktokFeePolicy) return applyTiktokUSCrossBorderDefaults(node, site, exchangeRate);
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error('Invalid exchange rate');
    const crossBorderDefaults = applyTiktokUSCrossBorderDefaults(node, site, exchangeRate);
    if (crossBorderDefaults !== node) return crossBorderDefaults;
    const fresh = createTiktokNode(node.currency, node.name ?? 'TikTok');
    const newKeys = ['buyerShippingFee', 'shippingSubsidy', 'tiktokOrderFee', 'affiliateCommissionRate', 'affiliateProductTax', 'growthServiceFeeRate', 'growthServiceFeeCap', 'shippingServiceFeeRate', 'shippingServiceFeeCap', 'campaignServiceFeeRate', 'campaignServiceFeeCap'] as const;
    const data = { ...node.data };
    newKeys.forEach(key => { data[key] = fresh.data[key]; });
    if (site.platformInfrastructureFee > 0) data.tiktokOrderFee = roundCurrencyAmount(site.platformInfrastructureFee * exchangeRate, node.currency as CurrencyCode);
    return { ...node, data, persistedData: { kind: 'standard', schemaVersion: 2, nodeData: { ...data },
        extraData: { ...(node.persistedData?.extraData ?? {}), ...fresh.persistedData?.extraData } } };
};
