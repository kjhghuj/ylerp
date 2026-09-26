"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEstablishedTrends = buildEstablishedTrends;
const productAnalysisPotential_1 = require("./productAnalysisPotential");
/** 区间内未出现在新品表、且前后两段均有订单观测的商品。按两段日均订单比较。 */
function buildEstablishedTrends(rows, range, limit = 100) {
    const windows = (0, productAnalysisPotential_1.buildGrowthWindows)(range);
    if (windows.windowDays === 0)
        return { windowDays: 0, items: [] };
    const byItem = new Map();
    for (const row of rows) {
        const list = byItem.get(row.itemId) ?? [];
        list.push(row);
        byItem.set(row.itemId, list);
    }
    const items = [];
    for (const itemRows of byItem.values()) {
        const sheetKeys = itemRows.flatMap((row) => {
            const extraKeys = row.extra?.sheetKeys;
            return [row.sheetKey, ...(Array.isArray(extraKeys) ? extraKeys : [])];
        });
        if (sheetKeys.includes('new'))
            continue;
        const observed = [...itemRows]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((row) => ({ date: row.date, orders: typeof row.ordersOrdered === 'number' ? row.ordersOrdered : null }));
        const previous = observed.filter((row) => windows.previousDays.has(row.date) && row.orders !== null);
        const recent = observed.filter((row) => windows.recentDays.has(row.date) && row.orders !== null);
        if (previous.length === 0 || recent.length === 0)
            continue;
        const previousTotal = previous.reduce((sum, row) => sum + (row.orders ?? 0), 0);
        const recentTotal = recent.reduce((sum, row) => sum + (row.orders ?? 0), 0);
        const previousDailyOrders = previousTotal / previous.length;
        const recentDailyOrders = recentTotal / recent.length;
        const latest = [...itemRows].sort((a, b) => b.date.localeCompare(a.date))[0];
        items.push({
            itemId: latest.itemId,
            itemName: latest.itemName,
            previousDailyOrders,
            recentDailyOrders,
            changePercent: previousDailyOrders === 0 ? null : ((recentDailyOrders - previousDailyOrders) / previousDailyOrders) * 100,
            previousObservedDays: previous.length,
            recentObservedDays: recent.length,
            dailyOrders: observed,
            totalOrders: previousTotal + recentTotal,
        });
    }
    items.sort((a, b) => b.totalOrders - a.totalOrders || a.itemId.localeCompare(b.itemId));
    return {
        windowDays: windows.windowDays,
        items: items.slice(0, limit).map(({ totalOrders: _totalOrders, ...item }) => item),
    };
}
