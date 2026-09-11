"use strict";
/**
 * 每日上传 payload 的结构与周期校验（服务端独立于前端，纯函数无 DB 依赖）。
 * - 结构：Zod 校验 fileName / sheets / sheetKey / items / 数值 / 字符串长度 / 数量上限；
 *   数值仅要求有限数（允许 0 与负数，销售额可能为退款负值），缺失指标合法（null 语义）。
 * - 周期：每日数据仅接受单日报表 —— 文件名周期起止不同 / 倒置 / 非真实日历日 / 与上传 date 不一致均拒绝。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyUploadPayloadSchema = exports.MAX_SOURCE_CELLS = exports.MAX_SOURCE_COLUMNS = exports.MAX_SOURCE_ROWS = exports.MAX_SOURCE_SHEETS = exports.MAX_UPLOAD_VARIATIONS_PER_ITEM = exports.MAX_UPLOAD_ITEMS_PER_SHEET = exports.MAX_UPLOAD_SHEETS = exports.MAX_UPLOAD_ITEM_NAME_LENGTH = exports.MAX_UPLOAD_ITEM_ID_LENGTH = exports.MAX_UPLOAD_FILE_NAME_LENGTH = exports.SHEET_KEYS = void 0;
exports.isValidCalendarDate = isValidCalendarDate;
exports.validateDailyUploadPayload = validateDailyUploadPayload;
exports.extractPeriodFromUploadFileName = extractPeriodFromUploadFileName;
exports.isSuspectedRangeFileName = isSuspectedRangeFileName;
exports.validatePeriodMatchesDate = validatePeriodMatchesDate;
const zod_1 = require("zod");
const productAnalysisAggregation_1 = require("./productAnalysisAggregation");
exports.SHEET_KEYS = ['hot', 'new', 'uncompetitive', 'competitive'];
exports.MAX_UPLOAD_FILE_NAME_LENGTH = 255;
exports.MAX_UPLOAD_ITEM_ID_LENGTH = 100;
exports.MAX_UPLOAD_ITEM_NAME_LENGTH = 500;
exports.MAX_UPLOAD_SHEETS = 8;
exports.MAX_UPLOAD_ITEMS_PER_SHEET = 20_000;
exports.MAX_UPLOAD_VARIATIONS_PER_ITEM = 5_000;
exports.MAX_SOURCE_SHEETS = 64;
exports.MAX_SOURCE_ROWS = 50_000;
exports.MAX_SOURCE_COLUMNS = 512;
exports.MAX_SOURCE_CELLS = 1_000_000;
const isoDate = zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期需为 YYYY-MM-DD');
/** 真实日历日：解析后回比原字符串，2026-02-31 这类溢出日期不合法 */
function isValidCalendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
const numericField = zod_1.z.number().finite();
const variationSchema = zod_1.z.object({
    variationSku: zod_1.z.string().max(500).optional(),
    variationName: zod_1.z.string().max(500).optional(),
    variationStatus: zod_1.z.string().max(64).optional(),
    modelCode: zod_1.z.string().max(500).optional(),
    modelId: zod_1.z.string().max(500).optional(),
    salesOrdered: numericField.nullable().optional(),
    salesConfirmed: numericField.nullable().optional(),
    ordersOrdered: numericField.nullable().optional(),
    ordersConfirmed: numericField.nullable().optional(),
    unitsOrdered: numericField.nullable().optional(),
    unitsConfirmed: numericField.nullable().optional(),
    buyersOrdered: numericField.nullable().optional(),
    buyersConfirmed: numericField.nullable().optional(),
    cartVisitors: numericField.nullable().optional(),
    cartUnits: numericField.nullable().optional(),
}).strict();
const itemSchema = zod_1.z
    .object({
    itemId: zod_1.z.string().trim().min(1, '商品编号不能为空').max(exports.MAX_UPLOAD_ITEM_ID_LENGTH),
    itemName: zod_1.z.string().max(exports.MAX_UPLOAD_ITEM_NAME_LENGTH),
    status: zod_1.z.string().max(64).optional(),
    variations: zod_1.z
        .array(variationSchema)
        .max(exports.MAX_UPLOAD_VARIATIONS_PER_ITEM, `变体数量超过上限 ${exports.MAX_UPLOAD_VARIATIONS_PER_ITEM}`)
        .optional(),
})
    .passthrough();
const sheetSchema = zod_1.z
    .object({
    sheetKey: zod_1.z.enum(exports.SHEET_KEYS, { message: 'sheetKey 必须是 hot / new / uncompetitive / competitive 之一' }),
    items: zod_1.z.array(itemSchema).max(exports.MAX_UPLOAD_ITEMS_PER_SHEET, `单工作表商品数超过上限 ${exports.MAX_UPLOAD_ITEMS_PER_SHEET}`),
})
    .passthrough();
const sourceCellSchema = zod_1.z.object({
    column: zod_1.z.number().int().min(1).max(exports.MAX_SOURCE_COLUMNS),
    type: zod_1.z.enum(['string', 'number', 'boolean', 'date', 'error', 'blank']),
    value: zod_1.z.union([zod_1.z.string().max(100_000), zod_1.z.number().finite(), zod_1.z.boolean(), zod_1.z.null()]),
    formattedValue: zod_1.z.string().max(100_000).optional(),
    formula: zod_1.z.string().max(100_000).optional(),
}).strict().superRefine((cell, context) => {
    const valid = ((cell.type === 'string' && typeof cell.value === 'string')
        || (cell.type === 'number' && (typeof cell.value === 'number' || cell.value === null))
        || (cell.type === 'boolean' && typeof cell.value === 'boolean')
        || ((cell.type === 'date' || cell.type === 'error') && typeof cell.value === 'string')
        || (cell.type === 'blank' && cell.value === null));
    if (!valid)
        context.addIssue({ code: 'custom', message: `单元格类型 ${cell.type} 与 value 不一致` });
});
const sourceRowSchema = zod_1.z.object({
    rowNumber: zod_1.z.number().int().min(1).max(exports.MAX_SOURCE_ROWS),
    cells: zod_1.z.array(sourceCellSchema).max(exports.MAX_SOURCE_COLUMNS),
}).strict();
const sourceSheetSchema = zod_1.z.object({
    sheetIndex: zod_1.z.number().int().min(0).max(exports.MAX_SOURCE_SHEETS - 1),
    sheetName: zod_1.z.string().min(1).max(255),
    category: zod_1.z.enum(['hot', 'new', 'uncompetitive', 'competitive', 'ads-create', 'ads-optimize', 'ads-track', 'other']),
    range: zod_1.z.string().max(100).nullable(),
    headerRowNumber: zod_1.z.number().int().min(1).max(exports.MAX_SOURCE_ROWS).nullable(),
    rowCount: zod_1.z.number().int().min(0).max(exports.MAX_SOURCE_ROWS),
    columnCount: zod_1.z.number().int().min(0).max(exports.MAX_SOURCE_COLUMNS),
    rows: zod_1.z.array(sourceRowSchema).max(exports.MAX_SOURCE_ROWS),
}).strict();
function excelColumnNumber(label) {
    return label.toUpperCase().split('').reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}
function parseSourceRange(range) {
    const match = range.match(/^([A-Z]+)([1-9]\d*)(?::([A-Z]+)([1-9]\d*))?$/i);
    if (!match)
        return null;
    const startColumn = excelColumnNumber(match[1]);
    const startRow = Number(match[2]);
    const endColumn = excelColumnNumber(match[3] ?? match[1]);
    const endRow = Number(match[4] ?? match[2]);
    if (endColumn < startColumn || endRow < startRow)
        return null;
    return { startRow, endRow, startColumn, endColumn };
}
exports.dailyUploadPayloadSchema = zod_1.z
    .object({
    fileName: zod_1.z.string().trim().min(1, '缺少 fileName').max(exports.MAX_UPLOAD_FILE_NAME_LENGTH),
    periodStart: isoDate.nullable().optional(),
    periodEnd: isoDate.nullable().optional(),
    currency: zod_1.z.string().trim().min(1).max(8).nullable().optional(),
    warnings: zod_1.z.array(zod_1.z.string().max(500)).max(100).optional(),
    sheets: zod_1.z.array(sheetSchema, { message: 'sheets 需为工作表数组' }).min(1, '缺少 sheets').max(exports.MAX_UPLOAD_SHEETS),
    sourceSheets: zod_1.z.array(sourceSheetSchema, { message: 'sourceSheets 需为完整工作表快照数组' })
        .min(1, '缺少完整工作表快照 sourceSheets')
        .max(exports.MAX_SOURCE_SHEETS),
})
    .passthrough();
/** 结构校验：失败返回可直接用于 400 响应的 detail（首个问题 + 定位信息） */
function validateDailyUploadPayload(payload) {
    const parsed = exports.dailyUploadPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue.path.length > 0 ? `（${issue.path.join('.')}）` : '';
        return { ok: false, detail: `报表结构非法${path}：${issue.message}` };
    }
    const value = parsed.data;
    const totalItems = value.sheets.reduce((sum, sheet) => sum + sheet.items.length, 0);
    if (totalItems > exports.MAX_UPLOAD_ITEMS_PER_SHEET) {
        return { ok: false, detail: `商品总数超过上限 ${exports.MAX_UPLOAD_ITEMS_PER_SHEET}` };
    }
    const indexes = new Set();
    let totalSourceRows = 0;
    let totalSourceCells = 0;
    for (const sheet of value.sourceSheets) {
        if (indexes.has(sheet.sheetIndex)) {
            return { ok: false, detail: `原始工作表索引重复：${sheet.sheetIndex}` };
        }
        indexes.add(sheet.sheetIndex);
        if (sheet.rows.length !== sheet.rowCount) {
            return { ok: false, detail: `原始工作表「${sheet.sheetName}」行数声明与实际不一致` };
        }
        const sourceRange = sheet.range === null ? null : parseSourceRange(sheet.range);
        if (sheet.range !== null && sourceRange === null) {
            return { ok: false, detail: `原始工作表「${sheet.sheetName}」有效区域格式非法` };
        }
        if (sourceRange === null) {
            if (sheet.rowCount !== 0 || sheet.columnCount !== 0 || sheet.rows.length !== 0 || sheet.headerRowNumber !== null) {
                return { ok: false, detail: `原始工作表「${sheet.sheetName}」空表范围与计数不一致` };
            }
        }
        else {
            const expectedRows = sourceRange.endRow - sourceRange.startRow + 1;
            const expectedColumns = sourceRange.endColumn - sourceRange.startColumn + 1;
            if (sheet.rowCount !== expectedRows || sheet.columnCount !== expectedColumns) {
                return { ok: false, detail: `原始工作表「${sheet.sheetName}」有效区域与行列计数不一致` };
            }
            if (sheet.headerRowNumber !== null
                && (sheet.headerRowNumber < sourceRange.startRow || sheet.headerRowNumber > sourceRange.endRow)) {
                return { ok: false, detail: `原始工作表「${sheet.sheetName}」表头行不在有效区域内` };
            }
        }
        totalSourceRows += sheet.rows.length;
        const rowNumbers = new Set();
        for (const [rowIndex, row] of sheet.rows.entries()) {
            if (sourceRange && row.rowNumber !== sourceRange.startRow + rowIndex) {
                return { ok: false, detail: `原始工作表「${sheet.sheetName}」原始行号不连续` };
            }
            if (rowNumbers.has(row.rowNumber)) {
                return { ok: false, detail: `原始工作表「${sheet.sheetName}」存在重复行号 ${row.rowNumber}` };
            }
            rowNumbers.add(row.rowNumber);
            const columns = new Set();
            for (const cell of row.cells) {
                if (columns.has(cell.column)
                    || (sourceRange !== null && (cell.column < sourceRange.startColumn || cell.column > sourceRange.endColumn))) {
                    return { ok: false, detail: `原始工作表「${sheet.sheetName}」第 ${row.rowNumber} 行列位置非法或重复` };
                }
                columns.add(cell.column);
                totalSourceCells += 1;
            }
        }
    }
    if (totalSourceRows > exports.MAX_SOURCE_ROWS || totalSourceCells > exports.MAX_SOURCE_CELLS) {
        return { ok: false, detail: '原始工作表快照超过安全行数或单元格数量上限' };
    }
    for (const sheet of value.sheets) {
        for (const [index, item] of sheet.items.entries()) {
            for (const field of productAnalysisAggregation_1.SUMMABLE_FIELDS) {
                const raw = item[field];
                if (raw === undefined || raw === null)
                    continue; // 合法空指标
                if (!numericField.safeParse(raw).success) {
                    return { ok: false, detail: `报表结构非法（sheets.${sheet.sheetKey}.items.${index}.${field}）：需为数值` };
                }
            }
            for (const field of productAnalysisAggregation_1.EXTRA_FIELDS) {
                const raw = item[field];
                if (raw === undefined || raw === null || raw === '')
                    continue;
                const textField = field === 'modelId' || field === 'createdAt' || field === 'priceFlag';
                if ((textField && typeof raw !== 'string') || (!textField && (typeof raw !== 'number' || !Number.isFinite(raw)))) {
                    return { ok: false, detail: `报表结构非法（sheets.${sheet.sheetKey}.items.${index}.${field}）：字段类型非法` };
                }
            }
        }
    }
    return {
        ok: true,
        value: {
            fileName: value.fileName,
            periodStart: value.periodStart ?? null,
            periodEnd: value.periodEnd ?? null,
            currency: value.currency ?? null,
            warnings: value.warnings ?? [],
            sheets: value.sheets,
            sourceSheets: value.sourceSheets,
        },
    };
}
const RANGE_FILE_NAME_PATTERN = /(\d{8})[_-](\d{8})/;
const SINGLE_DATE_FILE_NAME_PATTERN = /(?<!\d)(\d{8})(?!\d)/;
function toIsoDate(yyyymmdd) {
    return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
/** 从文件名解析周期（与前端 excelParser 语义一致，但后端独立实现，不信任前端声明） */
function extractPeriodFromUploadFileName(fileName) {
    const rangeMatch = fileName.match(RANGE_FILE_NAME_PATTERN);
    if (rangeMatch) {
        return { kind: 'range', start: toIsoDate(rangeMatch[1]), end: toIsoDate(rangeMatch[2]) };
    }
    const singleMatch = fileName.match(SINGLE_DATE_FILE_NAME_PATTERN);
    if (singleMatch) {
        return { kind: 'single', date: toIsoDate(singleMatch[1]) };
    }
    return { kind: 'unknown' };
}
/** 只读排查：文件名带起止不同的 8 位日期对 → 疑似按结束日混入每日表的区间报表（仅标记，不改写数据）。
 *  能力边界：只能识别文件名中可见的、起止不同的日期区间；文件被改成单日文件名后，
 *  本标记无法识别其真实内容周期——周期校验约束的是文件名与声明日期的一致性，
 *  不能证明文件内容一定属于单日数据。 */
function isSuspectedRangeFileName(fileName) {
    const period = extractPeriodFromUploadFileName(fileName);
    if (period.kind !== 'range')
        return false;
    return isValidCalendarDate(period.start) && isValidCalendarDate(period.end) && period.start !== period.end;
}
/** 周期与单日 date 的三方交叉校验（文件名 × 声明周期 × 上传 date）：返回错误文案，null 表示通过。
 *  规则（缺一不可，均在校验通过后才允许删除旧上传 / 写入）：
 *  1. 文件名可识别为多日区间（起止不同）→ 一律拒绝，无论声明周期是否省略或伪造；
 *  2. 文件名可识别为单日（单日期或起止相同）→ 其日期必须等于上传 date；
 *  3. 声明周期一旦存在必须真实、同日且等于上传 date；与文件名冲突 → 拒绝；
 *  4. 日期依据至少一种完整：文件名无法识别日期且未声明周期 → 拒绝（收紧，原兼容放行）；
 *     文件名无法识别但声明为合法同日周期且等于上传 date → 允许。
 *  注意：该校验只能约束「日期依据」，不能证明文件内容一定是单日数据。 */
function validatePeriodMatchesDate(fileName, declared, date) {
    const { periodStart, periodEnd } = declared;
    // 声明周期自检：成对、真实、有序、同日、等于 date
    const declaredError = validateDeclaredPeriod(declared, date);
    if (declaredError)
        return declaredError;
    const period = extractPeriodFromUploadFileName(fileName);
    if (period.kind === 'range') {
        if (!isValidCalendarDate(period.start) || !isValidCalendarDate(period.end)) {
            return `文件名中的周期日期非法（${period.start} ~ ${period.end}）：需为真实存在的 YYYY-MM-DD`;
        }
        if (period.start > period.end) {
            return `文件名中的周期起止倒置（${period.start} ~ ${period.end}）`;
        }
        if (period.start !== period.end) {
            return `文件名识别为多日报表（${period.start} ~ ${period.end}）：每日数据仅支持单日报表，请导出单日数据后重传`;
        }
        if (period.end !== date) {
            return `文件名日期（${period.end}）与上传日期（${date}）不一致`;
        }
        if (periodStart !== null && periodStart !== period.end) {
            return `声明周期（${periodStart}）与文件名日期（${period.end}）不一致`;
        }
        return null;
    }
    if (period.kind === 'single') {
        if (!isValidCalendarDate(period.date)) {
            return `文件名中的日期（${period.date}）不是真实存在的日历日期`;
        }
        if (period.date !== date) {
            return `文件名日期（${period.date}）与上传日期（${date}）不一致`;
        }
        if (periodStart !== null && periodStart !== period.date) {
            return `声明周期（${periodStart}）与文件名日期（${period.date}）不一致`;
        }
        return null;
    }
    // 文件名无法识别日期：必须提供完整的同日声明周期（已按上方规则校验须等于上传 date）；
    // 两种依据都缺失 → 拒绝（不做无日期依据的写入）
    if (periodStart === null && periodEnd === null) {
        return '文件名无可识别日期且未声明报表周期：请把日期写进文件名（如 20260906），或在 payload 中提供等于上传日期的 periodStart / periodEnd';
    }
    return null;
}
/** 声明周期校验：均空 → 放行（兼容不带日期的文件名）；一旦存在必须成对、真实、有序、同日且等于上传 date */
function validateDeclaredPeriod(declared, date) {
    const { periodStart, periodEnd } = declared;
    if (periodStart === null && periodEnd === null)
        return null;
    if (periodStart === null || periodEnd === null) {
        return '报表周期不完整：periodStart / periodEnd 需成对出现';
    }
    if (!isValidCalendarDate(periodStart) || !isValidCalendarDate(periodEnd)) {
        return `报表周期日期非法（${periodStart} ~ ${periodEnd}）：需为真实存在的 YYYY-MM-DD`;
    }
    if (periodStart > periodEnd) {
        return `报表周期起止倒置（${periodStart} ~ ${periodEnd}）`;
    }
    if (periodStart !== periodEnd) {
        return `检测到多日报表（${periodStart} ~ ${periodEnd}）：每日数据仅支持单日报表，请导出单日数据后重传`;
    }
    if (periodStart !== date) {
        return `报表周期（${periodStart}）与上传日期（${date}）不一致`;
    }
    return null;
}
