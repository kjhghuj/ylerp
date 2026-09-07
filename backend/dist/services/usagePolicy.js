"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canExportUsage = exports.canViewUsage = exports.shanghaiDay = exports.USAGE_VERSION = void 0;
exports.parseUsageFilter = parseUsageFilter;
exports.csvCell = csvCell;
exports.USAGE_VERSION = 'usage-v2';
const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
const shanghaiDay = (date) => new Date(date.getTime() + OFFSET).toISOString().slice(0, 10);
exports.shanghaiDay = shanghaiDay;
function dateValue(value, name) {
    if (value === undefined || value === '')
        return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new Error(`${name} 必须为 YYYY-MM-DD`);
    const parsed = new Date(`${value}T00:00:00+08:00`);
    if (!Number.isFinite(parsed.getTime()) || (0, exports.shanghaiDay)(parsed) !== value)
        throw new Error(`${name} 无效`);
    return value;
}
function parseUsageFilter(query, now = new Date()) {
    if (query.days !== undefined && (typeof query.days !== 'string' || !/^\d+$/.test(query.days)))
        throw new Error('days 必须为整数');
    const days = query.days === undefined ? 30 : Number(query.days);
    if (!Number.isInteger(days) || days < 1 || days > 365)
        throw new Error('days 必须为 1 至 365 的整数');
    const today = (0, exports.shanghaiDay)(now);
    const requestedEnd = dateValue(query.endDate, 'endDate') || today;
    const endDate = requestedEnd > today ? today : requestedEnd;
    const startDate = dateValue(query.startDate, 'startDate') || (0, exports.shanghaiDay)(new Date(new Date(`${endDate}T00:00:00+08:00`).getTime() - (days - 1) * DAY));
    const startAt = new Date(`${startDate}T00:00:00+08:00`);
    const endExclusive = new Date(new Date(`${endDate}T00:00:00+08:00`).getTime() + DAY);
    if (startDate > endDate || startDate > today || (endExclusive.getTime() - startAt.getTime()) / DAY > 365)
        throw new Error('日期范围无效或超过 365 天');
    const endAt = new Date(Math.min(endExclusive.getTime(), now.getTime()));
    const dates = [];
    for (let t = startAt.getTime(); t < endExclusive.getTime(); t += DAY)
        dates.push((0, exports.shanghaiDay)(new Date(t)));
    const result = { startAt, endAt, startDate, endDate: endDate > today ? today : endDate, asOf: now, dates };
    for (const key of ['userId', 'module', 'status']) {
        const value = query[key];
        if (value !== undefined && value !== '') {
            if (typeof value !== 'string' || value.length > 100)
                throw new Error(`${key} 无效`);
            result[key] = value;
        }
    }
    if (result.status && !['pending', 'success', 'failed', 'unknown'].includes(result.status))
        throw new Error('status 无效');
    return result;
}
function permitted(user, action) {
    return !!user?.isActive && (user.role === 'owner' || (user.role === 'admin' && ['*', 'usage-stats', `usage-stats.${action}`].some(p => user.permissions.includes(p))));
}
const canViewUsage = (user) => permitted(user, 'view');
exports.canViewUsage = canViewUsage;
const canExportUsage = (user) => (0, exports.canViewUsage)(user) && permitted(user, 'export');
exports.canExportUsage = canExportUsage;
function csvCell(value) {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^\s*[=+@-]/.test(s) || /^[\t\r\n]/.test(s))
        s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
}
