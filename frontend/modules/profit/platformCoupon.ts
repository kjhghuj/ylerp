const isFiniteNonNegative = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const isFinitePositive = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
);

export const derivePlatformCouponRate = (
    platformCouponLocal: unknown,
    totalRevenueCNY: unknown,
    cnyToLocalRate: unknown,
): number | null => {
    if (
        !isFiniteNonNegative(platformCouponLocal)
        || !isFinitePositive(totalRevenueCNY)
        || !isFinitePositive(cnyToLocalRate)
    ) {
        return null;
    }
    const percentage = ((platformCouponLocal / cnyToLocalRate) / totalRevenueCNY) * 100;
    return Number.isFinite(percentage) ? percentage : null;
};

export const derivePlatformCouponAmountLocal = (
    percentage: unknown,
    totalRevenueCNY: unknown,
    cnyToLocalRate: unknown,
): number | null => {
    if (
        !isFiniteNonNegative(percentage)
        || percentage > 100
        || !isFinitePositive(totalRevenueCNY)
        || !isFinitePositive(cnyToLocalRate)
    ) {
        return null;
    }
    const amount = totalRevenueCNY * (percentage / 100) * cnyToLocalRate;
    return Number.isFinite(amount) ? amount : null;
};
