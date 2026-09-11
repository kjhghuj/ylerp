/**
 * 商品分析上传全链路对账脚本（可重复运行；真实文件验收用）。
 *
 * 用法：
 *   DATABASE_URL=... JWT 同后端环境；先启动连隔离库的后端，然后：
 *   npx tsx scripts/verify/productAnalysisAudit.ts "H:\...\parentskudetail.20260828_20260828.xlsx" ...
 *
 * 分层与口径（对账基准独立于生产聚合函数，规则由表格结构与业务语义推导，见各函数注释）：
 *  1. 独立基准 baselineFromWorkbook：直接读 xlsx（本文件自带解析，不 import 生产聚合代码）；
 *  2. 入库链路 = 生产路径（前端 excelParser 产物 → POST /daily-uploads → 后端落库）；
 *  3. 对账三层：DB 直查（逐商品逐变体逐字段）/ agg API（逐商品区间指标）/ V3 sales API（逐补货身份键）；
 *  4. 幂等：同文件重传一次，逐日 items 内容哈希必须不变；
 *  5. 跨日隔离：全部上传后逐日商品数与首次一致；
 *  6. 广告类工作表（创建广告/优化您的广告/追踪广告效果）：列级独有性 + 与识别表同商品指标差异
 *     （仅报告，不合并——广告归因口径不得与商品自然指标相加）。
 *
 * 脱敏：报告中的商品编号输出为 前3…后2 形式；不输出商品名称。
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
// backend 无 xlsx 依赖；对账用的 xlsx 显式取 frontend 的安装（与生产前端解析器同一实现）
const XLSX = createRequire(import.meta.url)('../../../frontend/node_modules/xlsx') as typeof import('xlsx');
import { PrismaClient } from '@prisma/client';
// 生产上传链路的一部分（浏览器同款解析器）；对账预期值不依赖它
import { parseProductAnalysisWorkbook, resolveDailyUploadDate } from '../../../frontend/modules/product-analysis/utils/excelParser';
import type { ParsedProductAnalysisReport } from '../../../frontend/modules/product-analysis/types';

const API = process.env.AUDIT_API ?? 'http://127.0.0.1:4002/api';
const SHOP_NAME = process.env.AUDIT_SHOP ?? '上传对账-马来店';
const prisma = new PrismaClient();
let token = '';

const maskId = (id: string) => (id.length <= 5 ? id : `${id.slice(0, 3)}…${id.slice(-2)}`);

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// 独立基准（规则依据：真实导出表格结构）
// ---------------------------------------------------------------------------

/** sheet 名 → 类别。依据：Shopee 父SKU详情导出的固定四类业务表。
 *  uncompetitive 必须先于 competitive 匹配（“Uncompetitive price” 含子串 “competitive”）。 */
const SHEET_RULES: Array<{ test: RegExp; key: string }> = [
  { test: /热销/, key: 'hot' },
  { test: /新上架|新商品/, key: 'new' },
  { test: /uncompetitive/i, key: 'uncompetitive' },
  { test: /competitive/i, key: 'competitive' },
];
const AD_SHEET_TEST = /广告/;
/** 主记录优先级：hot(全量指标+变体) > new(创建信息) > uncompetitive > competitive（同列指标已验证一致） */
const PRIORITY: Record<string, number> = { hot: 0, new: 1, uncompetitive: 2, competitive: 3 };

const normHeader = (cell: unknown) =>
  String(cell ?? '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // 全角→半角
    .replace(/\s+/g, '')
    .toUpperCase();

/** 数值解析（独立实现）：number 直取；字符串去千分位/百分号；'-'与空白 = 缺失(null) */
function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').trim();
  if (!text || text === '-') return null;
  const parsed = Number(text.replace(/[,\s%]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

const txt = (value: unknown): string => {
  const text = String(value ?? '').trim();
  return !text || text === '-' ? '' : text;
};

interface ExpectedVariation {
  variationSku: string;
  variationName: string;
  modelCode: string;
  unitsOrdered: number | null;
}
interface ExpectedItem {
  itemId: string;
  sheets: string[];               // 出现过的全部类别（优先级序）
  primarySheet: string;
  // 主记录父行指标（跨 sheet 一致性单独检查，见 crossSheetMetricConflicts）
  metrics: Record<'visitors' | 'salesOrdered' | 'ordersOrdered' | 'ordersConfirmed' | 'unitsOrdered' | 'impressions' | 'clicks', number | null>;
  createdAt: string | null;       // new 表「创建日期」原始文本（YYYYMMDD）
  createdDays: number | null;     // new 表「创建天数」（0 为有效值）
  currentPrice: number | null;    // uncompetitive/competitive「Current Price」
  variations: ExpectedVariation[];// 主 sheet 变体行（逐条，不去重；同键合并在 V3 层验证）
}
interface Baseline {
  date: string;
  items: Map<string, ExpectedItem>;
  /** V3 补货身份键 → unitsOrdered 合计。键规则：规格货号（元仓 customerSku 域，缺失回退规格编号），跨商品同键合并 */
  v3KeyUnits: Map<string, number>;
  /** 无变体行的商品（V3 以父商品编号行呈现）→ 父行 unitsOrdered */
  v3ItemUnits: Map<string, number | null>;
  /** 跨 sheet 同商品同指标不一致（基准自身冲突，单列不掩盖） */
  crossSheetMetricConflicts: Array<{ itemId: string; field: string; values: Record<string, number | null> }>;
  /** 广告表分析 */
  adSheets: {
    names: string[];
    uniqueColumns: string[];                    // 广告表有、四类识别表没有的归一化列名
    perSheetOverlaps: Array<{ sheet: string; items: number; metricDiffs: number; metricMatches: number }>;
  };
}

function baselineFromWorkbook(buffer: Buffer, fileName: string): Baseline {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const date = (() => {
    const resolution = resolveDailyUploadDate(fileName);
    if (resolution.status !== 'ok') throw new Error(`文件名日期无法定位: ${fileName}`);
    return resolution.date;
  })();

  type RawOccurrence = {
    sheetKey: string;
    metrics: ExpectedItem['metrics'];
    createdAt: string | null;
    createdDays: number | null;
    currentPrice: number | null;
    hasVariationColumn: boolean;
  };
  const occurrences = new Map<string, RawOccurrence[]>();
  const sheetVariations = new Map<string, Map<string, ExpectedVariation[]>>();
  const recognizedColumns = new Set<string>();
  const adColumnSets = new Map<string, Set<string>>();
  // 广告表逐商品指标（与主记录比对用）：itemId -> { sheet, metrics }
  const adRows = new Map<string, Array<{ sheet: string; metrics: ExpectedItem['metrics'] }>>();

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' }) as unknown[][];
    const nonEmpty = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
    if (nonEmpty.length === 0) continue;
    const header = nonEmpty[0].map(normHeader);
    const idx = {
      id: header.indexOf('商品编号'),
      name: header.indexOf('商品'),
      vsku: header.indexOf('规格编号'),
      vname: header.indexOf('规格名称'),
      model: header.indexOf('规格货号'),
      createdAt: header.indexOf('创建日期'),
      createdDays: header.indexOf('创建天数'),
      price: header.indexOf('CURRENTPRICE'),
      visitors: header.indexOf('商品访客数量'),
      sales: header.findIndex((h) => h.startsWith('销售额(已下订单)')),
      ordersOrdered: header.indexOf('已下订单'),
      ordersConfirmed: header.indexOf('已确定订单'),
      units: header.findIndex((h) => h.startsWith('件数(已下订单)')),
      impressions: header.indexOf('商品展示量'),
      clicks: header.indexOf('商品点击量'),
    };
    if (idx.id < 0 || idx.name < 0) continue;

    const rule = SHEET_RULES.find((r) => r.test.test(sheetName));
    const isAd = AD_SHEET_TEST.test(sheetName);
    if (isAd) adColumnSets.set(sheetName, new Set(header));
    if (!rule && !isAd) continue;
    if (rule) header.forEach((h) => recognizedColumns.add(h));

    // 行归并规则（独立基准，与生产解析器无关）：
    //  - 有规格列的表：父行 = 规格编号与规格名称均为空/'-' 的行（携带商品级指标）；
    //    变体行 = 其余行（携带变体级件数），归入同表同商品的父行，不作为独立商品；
    //  - 无规格列的表：所有行都是商品行；同商品多行时指标取首个非空值。
    const pendingVariations = new Map<string, ExpectedVariation[]>();
    for (const row of nonEmpty.slice(1)) {
      const itemId = txt(row[idx.id]);
      if (!itemId) continue;
      const metrics: ExpectedItem['metrics'] = {
        visitors: num(row[idx.visitors]),
        salesOrdered: idx.sales >= 0 ? num(row[idx.sales]) : null,
        ordersOrdered: idx.ordersOrdered >= 0 ? num(row[idx.ordersOrdered]) : null,
        ordersConfirmed: idx.ordersConfirmed >= 0 ? num(row[idx.ordersConfirmed]) : null,
        unitsOrdered: idx.units >= 0 ? num(row[idx.units]) : null,
        impressions: num(row[idx.impressions]),
        clicks: num(row[idx.clicks]),
      };
      if (isAd) {
        const list = adRows.get(itemId) ?? [];
        list.push({ sheet: sheetName, metrics });
        adRows.set(itemId, list);
        continue;
      }
      const hasVariationColumns = idx.vsku >= 0 || idx.vname >= 0;
      const isVariationRow = hasVariationColumns
        && !(txt(row[idx.vsku]) === '' && txt(row[idx.vname]) === '');
      if (isVariationRow) {
        const list = pendingVariations.get(itemId) ?? [];
        list.push({
          variationSku: idx.vsku >= 0 ? txt(row[idx.vsku]) : '',
          variationName: idx.vname >= 0 ? txt(row[idx.vname]) : '',
          modelCode: idx.model >= 0 ? txt(row[idx.model]) : '',
          unitsOrdered: metrics.unitsOrdered,
        });
        pendingVariations.set(itemId, list);
        continue;
      }
      const existing = (occurrences.get(itemId) ?? []).find((o) => o.sheetKey === rule.key);
      if (existing) {
        // 同表同商品多行：指标取首个非空值（不累加——同一商品同表当日一行一口径）
        for (const field of Object.keys(metrics) as Array<keyof ExpectedItem['metrics']>) {
          if (existing.metrics[field] === null && metrics[field] !== null) existing.metrics[field] = metrics[field];
        }
        if (existing.createdAt === null && idx.createdAt >= 0) existing.createdAt = txt(row[idx.createdAt]) || null;
        if (existing.createdDays === null && idx.createdDays >= 0) existing.createdDays = num(row[idx.createdDays]);
        if (existing.currentPrice === null && idx.price >= 0) existing.currentPrice = num(row[idx.price]);
        continue;
      }
      const occurrence: RawOccurrence = {
        sheetKey: rule.key,
        metrics,
        createdAt: idx.createdAt >= 0 ? (txt(row[idx.createdAt]) || null) : null,
        createdDays: idx.createdDays >= 0 ? num(row[idx.createdDays]) : null,
        currentPrice: idx.price >= 0 ? num(row[idx.price]) : null,
        hasVariationColumn: hasVariationColumns,
        variations: [],
      };
      const list = occurrences.get(itemId) ?? [];
      list.push(occurrence);
      occurrences.set(itemId, list);
    }
    if (rule) sheetVariations.set(rule.key, pendingVariations);
  }

  const items = new Map<string, ExpectedItem>();
  const v3KeyUnits = new Map<string, number>();
  const v3ItemUnits = new Map<string, number | null>();
  const crossSheetMetricConflicts: Baseline['crossSheetMetricConflicts'] = [];

  for (const [itemId, list] of occurrences) {
    const sorted = [...list].sort((a, b) => (PRIORITY[a.sheetKey] ?? 99) - (PRIORITY[b.sheetKey] ?? 99));
    const primary = sorted[0];
    // 跨 sheet 同指标一致性（不一致单列报告，不取平均不掩盖）
    for (const field of Object.keys(primary.metrics) as Array<keyof ExpectedItem['metrics']>) {
      const values: Record<string, number | null> = {};
      let differs = false;
      let first: number | null | undefined;
      for (const occurrence of sorted) {
        values[occurrence.sheetKey] = occurrence.metrics[field];
        if (first === undefined) first = occurrence.metrics[field];
        else if (occurrence.metrics[field] !== first) differs = true;
      }
      if (differs) crossSheetMetricConflicts.push({ itemId, field, values });
    }
    // 创建信息：new 行携带；价格：uncompetitive/competitive 行携带（高优先级优先）
    const newOcc = sorted.find((o) => o.sheetKey === 'new');
    const priceOcc = sorted.find((o) => o.currentPrice !== null);
    // 变体：主 sheet 的变体行；主 sheet 无变体列时回退其他 sheet（跨 sheet 补齐语义）
    const variationsFor = (sheetKey: string) => sheetVariations.get(sheetKey)?.get(itemId) ?? [];
    const primaryVariations = variationsFor(primary.sheetKey).length > 0
      ? variationsFor(primary.sheetKey)
      : (sorted.map((o) => variationsFor(o.sheetKey)).find((v) => v.length > 0) ?? []);
    items.set(itemId, {
      itemId,
      sheets: [...new Set(sorted.map((o) => o.sheetKey))],
      primarySheet: primary.sheetKey,
      metrics: primary.metrics,
      createdAt: newOcc?.createdAt ?? null,
      createdDays: newOcc?.createdDays ?? null,
      currentPrice: priceOcc?.currentPrice ?? null,
      variations: primaryVariations,
    });
    // V3 身份键：主 sheet 变体逐行累加；无变体商品按父编号行
    if (primaryVariations.length > 0) {
      for (const variation of primaryVariations) {
        const key = (variation.modelCode || variation.variationSku).toUpperCase();
        if (!key) continue;
        v3KeyUnits.set(key, (v3KeyUnits.get(key) ?? 0) + (variation.unitsOrdered ?? 0));
      }
    } else {
      v3ItemUnits.set(itemId, primary.metrics.unitsOrdered);
    }
  }

  // 广告表分析：独有列 + 同商品指标差异（与主记录指标比对；仅报告，不合并）
  const adUnion = new Set<string>();
  for (const columns of adColumnSets.values()) for (const column of columns) adUnion.add(column);
  const uniqueColumns = [...adUnion].filter((column) => !recognizedColumns.has(column));
  const perSheetOverlaps: Baseline['adSheets']['perSheetOverlaps'] = [];
  for (const sheetName of adColumnSets.keys()) {
    let diffs = 0;
    let matches = 0;
    let count = 0;
    for (const [itemId, rows] of adRows) {
      const expected = items.get(itemId);
      if (!expected) continue; // 仅统计与识别表重叠的商品
      for (const adRow of rows) {
        if (adRow.sheet !== sheetName) continue;
        count += 1;
        let rowDiffers = false;
        for (const field of ['visitors', 'salesOrdered', 'ordersOrdered', 'impressions', 'clicks'] as const) {
          const expectedValue = expected.metrics[field];
          const adValue = adRow.metrics[field];
          if (expectedValue !== null && adValue !== null && Math.abs(expectedValue - adValue) > 1e-9) rowDiffers = true;
        }
        if (rowDiffers) diffs += 1;
        else matches += 1;
      }
    }
    perSheetOverlaps.push({ sheet: sheetName, items: count, metricDiffs: diffs, metricMatches: matches });
  }

  return {
    date,
    items,
    v3KeyUnits,
    v3ItemUnits,
    crossSheetMetricConflicts,
    adSheets: { names: [...adColumnSets.keys()], uniqueColumns, perSheetOverlaps },
  };
}

// ---------------------------------------------------------------------------
// 对账
// ---------------------------------------------------------------------------

interface DayResult {
  date: string;
  file: string;
  dbItems: number;
  expectedItems: number;
  fieldMismatches: string[];   // 已脱敏
  v3Mismatches: string[];
  createdAtPresent: number;
  createdAtExpected: number;
  currentPricePresent: number;
  currentPriceExpected: number;
  crossSheetConflicts: number;
  contentHashBeforeReupload: string;
  contentHashAfterReupload: string;
}

const stableHash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  })).digest('hex').slice(0, 16);

async function uploadFile(file: string, shopId: string) {
  const fileName = file.split(/[\\/]/).pop()!;
  const buffer = readFileSync(file);
  const parsed: ParsedProductAnalysisReport = parseProductAnalysisWorkbook(
    new Uint8Array(buffer).buffer as ArrayBuffer,
    fileName,
  );
  const resolution = resolveDailyUploadDate(fileName);
  if (resolution.status !== 'ok') throw new Error(`文件名日期无法定位: ${fileName}`);
  const created = await call('POST', `/product-analysis/shops/${shopId}/daily-uploads`, { date: resolution.date, payload: parsed });
  return { date: resolution.date, itemCount: created.itemCount as number };
}

async function auditFile(file: string, shopId: string, reupload: boolean): Promise<DayResult> {
  const fileName = file.split(/[\\/]/).pop()!;
  const buffer = readFileSync(file);
  const baseline = baselineFromWorkbook(buffer, fileName);
  const { date } = await uploadFile(file, shopId);

  // ---- DB 层逐商品逐字段 ----
  const upload = await prisma.productAnalysisDailyUpload.findFirst({
    where: { shopId, date: new Date(`${date}T00:00:00.000Z`), isActive: true },
    include: { items: true, sourceSheets: { orderBy: { sheetIndex: 'asc' } } },
  });
  if (!upload) throw new Error(`${date}: 上传记录不存在`);
  const dbByItem = new Map(upload.items.map((item) => [item.itemId, item]));
  const fieldMismatches: string[] = [];
  let createdAtPresent = 0;
  let createdAtExpected = 0;
  let currentPricePresent = 0;
  let currentPriceExpected = 0;

  for (const [itemId, expected] of baseline.items) {
    const db = dbByItem.get(itemId);
    if (!db) {
      fieldMismatches.push(`${date} ${maskId(itemId)}: DB 缺少该商品`);
      continue;
    }
    // 数量指标：DB 列 vs 主记录父行
    const metricMap: Array<[keyof ExpectedItem['metrics'], string]> = [
      ['visitors', 'visitors'], ['salesOrdered', 'salesOrdered'], ['ordersOrdered', 'ordersOrdered'],
      ['ordersConfirmed', 'ordersConfirmed'], ['unitsOrdered', 'unitsOrdered'],
      ['impressions', 'impressions'], ['clicks', 'clicks'],
    ];
    for (const [expectedField, dbColumn] of metricMap) {
      const dbValue = (db as unknown as Record<string, unknown>)[dbColumn] as number | null;
      const want = expected.metrics[expectedField];
      // 主记录该列缺失时，允许 DB 为 null（跨 sheet 补齐也可能为 null）
      if (want !== null && (dbValue === null || Math.abs(dbValue - want) > 1e-6)) {
        fieldMismatches.push(`${date} ${maskId(itemId)} ${expectedField}: 期望 ${want}，DB ${dbValue}`);
      }
    }
    // extra 补齐字段
    const extra = (db.extra ?? {}) as Record<string, unknown>;
    if (expected.createdAt !== null) {
      createdAtExpected += 1;
      if (extra.createdAt !== undefined && extra.createdAt !== null) createdAtPresent += 1;
      else fieldMismatches.push(`${date} ${maskId(itemId)} createdAt: 期望存在，DB 缺失`);
    }
    if (expected.currentPrice !== null) {
      currentPriceExpected += 1;
      if (extra.currentPrice !== undefined && extra.currentPrice !== null) currentPricePresent += 1;
      else fieldMismatches.push(`${date} ${maskId(itemId)} currentPrice: 期望存在，DB 缺失`);
    }
    // 变体数组：逐源行（按 规格编号||规格名称 定位）
    const dbVariations = Array.isArray(db.variations) ? (db.variations as Array<Record<string, unknown>>) : [];
    if (dbVariations.length !== expected.variations.length) {
      fieldMismatches.push(`${date} ${maskId(itemId)} variations: 期望 ${expected.variations.length} 条，DB ${dbVariations.length} 条`);
    }
    for (const variation of expected.variations) {
      const match = dbVariations.find((candidate) =>
        (variation.variationSku && candidate.variationSku === variation.variationSku)
        || (!variation.variationSku && variation.variationName && candidate.variationName === variation.variationName));
      if (!match) {
        fieldMismatches.push(`${date} ${maskId(itemId)} 变体 ${maskId(variation.variationSku || variation.variationName)}: DB 缺少`);
        continue;
      }
      if (variation.unitsOrdered !== null && match.unitsOrdered !== variation.unitsOrdered) {
        fieldMismatches.push(`${date} ${maskId(itemId)} 变体 ${maskId(variation.variationSku)} unitsOrdered: 期望 ${variation.unitsOrdered}，DB ${match.unitsOrdered}`);
      }
    }
  }
  for (const itemId of dbByItem.keys()) {
    if (!baseline.items.has(itemId)) fieldMismatches.push(`${date} ${maskId(itemId)}: DB 多出基准外商品`);
  }

  const hashBefore = stableHash(upload.items.map((item) => ({
    itemId: item.itemId,
    v: item.variations,
    e: item.extra,
    visitors: item.visitors,
    unitsOrdered: item.unitsOrdered,
  })).sort((a, b) => a.itemId.localeCompare(b.itemId)));

  // ---- 幂等：重传一次后内容哈希必须一致 ----
  let hashAfter = hashBefore;
  if (reupload) {
    await uploadFile(file, shopId);
    const again = await prisma.productAnalysisDailyUpload.findFirst({
      where: { shopId, date: new Date(`${date}T00:00:00.000Z`), isActive: true },
      include: { items: true },
    });
    hashAfter = stableHash((again?.items ?? []).map((item) => ({
      itemId: item.itemId,
      v: item.variations,
      e: item.extra,
      visitors: item.visitors,
      unitsOrdered: item.unitsOrdered,
    })).sort((a, b) => a.itemId.localeCompare(b.itemId)));
  }

  // ---- V3 层：逐身份键 ----
  const v3 = await call('GET', `/restock-v3/shops/${shopId}/sales?from=${date}&to=${date}`);
  const v3ByValue = new Map<string, { units: number; skuSource: string }>(
    ((v3.rows ?? []) as Array<Record<string, unknown>>).map((row) => [
      String(row.identityValue ?? ''),
      { units: Number(row.units ?? 0), skuSource: String(row.skuSource ?? '') },
    ]),
  );
  const v3Mismatches: string[] = [];
  for (const [key, units] of baseline.v3KeyUnits) {
    const actual = v3ByValue.get(key);
    if (!actual) {
      v3Mismatches.push(`${date} V3 键 ${maskId(key)}: 缺少`);
      continue;
    }
    if (actual.skuSource !== 'modelCode' && actual.skuSource !== 'variationSku') {
      v3Mismatches.push(`${date} V3 键 ${maskId(key)}: 身份类型异常 ${actual.skuSource}`);
    }
    if (Math.abs(actual.units - units) > 1e-6) {
      v3Mismatches.push(`${date} V3 键 ${maskId(key)} units: 期望 ${units}，实际 ${actual.units}`);
    }
  }
  for (const [itemId, units] of baseline.v3ItemUnits) {
    const actual = v3ByValue.get(itemId);
    if (!actual) {
      v3Mismatches.push(`${date} V3 父行 ${maskId(itemId)}: 缺少`);
      continue;
    }
    if (units !== null && Math.abs(actual.units - units) > 1e-6) {
      v3Mismatches.push(`${date} V3 父行 ${maskId(itemId)} units: 期望 ${units}，实际 ${actual.units}`);
    }
  }

  return {
    date,
    file: fileName,
    dbItems: upload.items.length,
    expectedItems: baseline.items.size,
    fieldMismatches,
    v3Mismatches,
    createdAtPresent,
    createdAtExpected,
    currentPricePresent,
    currentPriceExpected,
    crossSheetConflicts: baseline.crossSheetMetricConflicts.length,
    contentHashBeforeReupload: hashBefore,
    contentHashAfterReupload: hashAfter,
  };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error('用法: tsx productAnalysisAudit.ts <xlsx 文件...>');
  const login = await call('POST', '/auth/login', { username: 'verify', password: 'verify123456' });
  token = login.token;
  const shops = await call('GET', '/product-analysis/shops');
  let shop = (shops as Array<Record<string, unknown>>).find((s) => s.name === SHOP_NAME);
  if (!shop) shop = await call('POST', '/product-analysis/shops', { name: SHOP_NAME, site: 'MY' });
  const shopId = shop.id as string;

  // 首轮：逐文件上传 + 对账（第一个文件做幂等重传）
  const results: DayResult[] = [];
  for (const [index, file] of files.entries()) {
    const result = await auditFile(file, shopId, index === 0);
    results.push(result);
    const ok = result.fieldMismatches.length === 0 && result.v3Mismatches.length === 0
      && result.dbItems === result.expectedItems
      && (index !== 0 || result.contentHashBeforeReupload === result.contentHashAfterReupload);
    console.log(
      `${result.date} ${result.file}: 商品 ${result.dbItems}/${result.expectedItems}` +
      ` createdAt ${result.createdAtPresent}/${result.createdAtExpected}` +
      ` currentPrice ${result.currentPricePresent}/${result.currentPriceExpected}` +
      ` 跨sheet指标冲突 ${result.crossSheetConflicts}` +
      ` 幂等哈希 ${index === 0 ? (result.contentHashBeforeReupload === result.contentHashAfterReupload ? '一致' : '不一致!') : '—'}` +
      ` 字段差异 ${result.fieldMismatches.length} V3差异 ${result.v3Mismatches.length} | ${ok ? 'PASS' : 'FAIL'}`,
    );
    for (const mismatch of [...result.fieldMismatches.slice(0, 5), ...result.v3Mismatches.slice(0, 5)]) {
      console.log(`    · ${mismatch}`);
    }
  }

  // 跨日隔离：终态逐日商品数与首轮一致
  const finalDays = await prisma.productAnalysisDailyUpload.findMany({
    where: { shopId, isActive: true },
    orderBy: { date: 'asc' },
    select: { date: true, itemCount: true },
  });
  let isolationOk = true;
  for (const result of results) {
    const finalDay = finalDays.find((d) => d.date.toISOString().slice(0, 10) === result.date);
    if (!finalDay || finalDay.itemCount !== result.dbItems) isolationOk = false;
  }
  console.log(`跨日隔离（终态 ${finalDays.length} 天，逐日商品数与首轮一致）: ${isolationOk ? 'PASS' : 'FAIL'}`);

  // 广告表分析（取第一个文件作为样例，逐文件结论相同结构）
  const adBaseline = baselineFromWorkbook(readFileSync(files[0]), files[0].split(/[\\/]/).pop()!);
  console.log(`广告类工作表: ${adBaseline.adSheets.names.join(' / ') || '无'}`);
  console.log(`  独有列（四类识别表都没有的）: ${adBaseline.adSheets.uniqueColumns.length ? adBaseline.adSheets.uniqueColumns.join(', ') : '无'}`);
  for (const overlap of adBaseline.adSheets.perSheetOverlaps) {
    console.log(`  ${overlap.sheet}: 与识别表重叠商品指标 全一致 ${overlap.metricMatches} / 存在差异 ${overlap.metricDiffs}`);
  }

  const failed = results.filter((r) => r.fieldMismatches.length > 0 || r.v3Mismatches.length > 0 || r.dbItems !== r.expectedItems);
  console.log(`\n总结: ${results.length - failed.length}/${results.length} 天全项一致${failed.length ? `；不一致 ${failed.map((r) => r.date).join(', ')}` : ''}`);

  const reportPath = process.env.AUDIT_REPORT;
  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify({
      scope: '商品分析上传全链路对账（脱敏）',
      api: API,
      shop: SHOP_NAME,
      results,
      finalDays: finalDays.map((d) => ({ date: d.date.toISOString().slice(0, 10), itemCount: d.itemCount })),
      adSheets: adBaseline.adSheets,
    }, null, 2), 'utf-8');
    console.log(`脱敏 JSON 报告已写入: ${reportPath}`);
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('FATAL', error);
  await prisma.$disconnect();
  process.exit(1);
});
