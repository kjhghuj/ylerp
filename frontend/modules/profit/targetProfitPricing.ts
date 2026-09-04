import { calculateProfit, type ProfitResult } from './calculateProfit';
import { hasRuntimeGraphClaim } from './graphNodeSavePreparation';
import { normalizeProfitGlobalInputs, normalizeSiteInputs, normalizeStandardNodeData,
  parseCanonicalPositiveRate, validateCouponRevenueBudget, type ProfitInputError } from './profitInputNormalization';
import { normalizeCurrencyCode, type CurrencyCode, type PlatformNode, type ProfitGlobalInputs, type SiteLevelInputs } from './types';

export const PRICING_LIMITS = { minCents: 1, maxCents: 100_000_000, maxEvaluations: 256 } as const;
export const parseTargetMargin = (value: string): number | null => {
  const text = value.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 99.99 ? number : null;
};
export const isPricingNode = (node: PlatformNode, currency: string): boolean => (
  Boolean(normalizeCurrencyCode(currency)) && normalizeCurrencyCode(node.currency) === normalizeCurrencyCode(currency)
  && node.persistedData?.kind !== 'invalid' && node.persistedData?.kind !== 'graph' && !hasRuntimeGraphClaim(node)
);
export interface TargetPricingInput {
  targetMargin: string;
  currency: string;
  exchangeRate: number;
  node: PlatformNode;
  globalInputs: ProfitGlobalInputs;
  siteInputs: SiteLevelInputs;
}
export type TargetPricingResult =
  | { ok: true; totalRevenue: number; profit: ProfitResult; evaluations: number }
  | { ok: false; reason: 'invalid_target' | 'unsupported_node' | 'invalid_rate' | 'invalid_inputs' | 'no_result';
      errors?: ProfitInputError[]; evaluations: number };

/** Bounded scan with subdivision: never assumes the rounded margin is monotone. */
export const solveTargetProfitPrice = (input: TargetPricingInput): TargetPricingResult => {
  let evaluations = 0;
  const fail = (reason: Extract<TargetPricingResult, { ok: false }>['reason'], errors?: ProfitInputError[]): TargetPricingResult => (
    { ok: false, reason, errors, evaluations }
  );
  const target = parseTargetMargin(input.targetMargin);
  if (target === null) return fail('invalid_target');
  if (!isPricingNode(input.node, input.currency)) return fail('unsupported_node');
  const rate = parseCanonicalPositiveRate(input.exchangeRate);
  if (!rate.ok) return fail('invalid_rate');
  const global = normalizeProfitGlobalInputs(input.globalInputs as unknown as Record<string, unknown>, { requireIdentity: false });
  const data = normalizeStandardNodeData(input.node.data as unknown as Record<string, unknown>);
  // The existing sale price is the unknown, not a prerequisite for reverse pricing.
  const site = normalizeSiteInputs({ ...input.siteInputs, totalRevenue: Number.MAX_SAFE_INTEGER });
  if (global.ok === false || data.ok === false || site.ok === false) return fail('invalid_inputs', [
    ...(global.ok === false ? global.errors : []), ...(data.ok === false ? data.errors : []), ...(site.ok === false ? site.errors : []),
  ]);
  const currency = normalizeCurrencyCode(input.currency) as CurrencyCode;
  const platformCouponCNY = data.value.platformCoupon / rate.value;
  const percentCoupon = site.value.sellerCouponType === 'percent';
  const fraction = percentCoupon ? site.value.sellerCoupon / 100 : 0;
  if (fraction === 1 && (platformCouponCNY > 0 || site.value.sellerCouponPlatformRatio === 0)) return fail('no_result');
  const couponFloor = percentCoupon
    ? fraction < 1 ? platformCouponCNY / (1 - fraction) : 0
    : site.value.sellerCoupon + platformCouponCNY;
  const lower = Math.max(PRICING_LIMITS.minCents, Math.ceil(couponFloor * 100));
  if (!Number.isFinite(lower) || lower > PRICING_LIMITS.maxCents) return fail('no_result');

  const evaluate = (cents: number): ProfitResult | null => {
    if (evaluations >= PRICING_LIMITS.maxEvaluations) return null;
    evaluations++;
    const candidate = { ...site.value, totalRevenue: cents / 100 };
    if (validateCouponRevenueBudget(data.value, candidate, rate.value).length > 0) return null;
    try {
      const result = calculateProfit(data.value, global.value, candidate, rate.value, currency);
      return result.revenueAfterSellerCoupon > 0 && result.margin >= target ? result : null;
    } catch { return null; }
  };
  let left = lower;
  let right: number | null = null;
  // Logarithmic samples span cents through the upper bound, including both endpoints.
  let lastProbe = -1;
  for (let index = 0; index <= 128; index++) {
    const probe = index === 128 ? PRICING_LIMITS.maxCents
      : Math.min(PRICING_LIMITS.maxCents, Math.round(lower * (PRICING_LIMITS.maxCents / lower) ** (index / 128)));
    if (probe === lastProbe) continue;
    lastProbe = probe;
    if (evaluate(probe)) { right = probe; break; }
    left = probe;
  }
  if (right === null) return fail('no_result');
  // Keep a verified passing endpoint. Scan subdivisions in price order rather than
  // deciding that an entire half-interval passes/fails from a single midpoint.
  while (right - left > 1 && evaluations < PRICING_LIMITS.maxEvaluations - 9) {
    const start = left;
    const end = right;
    for (let part = 1; part <= 8; part++) {
      const probe = Math.floor(start + (end - start) * part / 8);
      if (probe <= left) continue;
      if (probe === end || evaluate(probe)) { right = probe; break; }
      left = probe;
    }
  }
  const profit = evaluate(right);
  return profit ? { ok: true, totalRevenue: right / 100, profit, evaluations } : fail('no_result');
};
