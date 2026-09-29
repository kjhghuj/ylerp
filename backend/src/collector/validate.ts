/**
 * 文件校验：非空、签名/可解析性、格式与必要字段。
 * HTML 登录页、错误 JSON、损坏文件不能因扩展名通过。
 */
import fs from "node:fs";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import path from "node:path";

export type ValidateResult =
  | { ok: true; rows: number; format: "csv"; header: string[]; worksheets?: never }
  | { ok: true; rows: null; format: "xlsx"; header: []; worksheets: number }
  | { ok: false; reason: string };

const MAX_REPORT_BYTES = 200 * 1024 * 1024;

export function checksumOf(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export type CsvParseResult = { ok: true; rows: string[][] } | { ok: false; reason: string };

/**
 * 严格 CSV 解析（RFC4180 子集，R7）：
 * - 未闭合引号（文件被截断）→ 判非法；
 * - 引号内的逗号、换行、转义引号（""）必须正确解析；
 * - 行列一致性由 validateReportFile 按表头严格核对。
 */
export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldTouched = false; // 当前字段是否出现过内容（区分空行与空字段）
  const endRow = () => {
    cur.push(field);
    // 跳过完全空行（文件末尾多余换行等）
    if (!(cur.length === 1 && cur[0] === "" && !fieldTouched)) rows.push(cur);
    cur = [];
    field = "";
    fieldTouched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch; // 引号内任意字符（含换行、逗号）原样保留
    } else if (ch === '"') {
      inQuotes = true;
      fieldTouched = true;
    } else if (ch === ",") {
      cur.push(field);
      field = "";
      fieldTouched = false;
    } else if (ch === "\n") {
      endRow();
    } else if (ch !== "\r") {
      field += ch;
      fieldTouched = true;
    }
  }
  if (inQuotes) return { ok: false, reason: "存在未闭合引号（文件可能被截断）" };
  if (field.length > 0 || cur.length > 0 || fieldTouched) endRow();
  return { ok: true, rows };
}

export function validateReportFile(filePath: string): ValidateResult {
  let buf: Buffer;
  try {
    if (fs.statSync(filePath).size > MAX_REPORT_BYTES) return { ok: false, reason: "文件超过 200MB 上限" };
    buf = fs.readFileSync(filePath);
  } catch {
    return { ok: false, reason: "文件不存在或不可读" };
  }
  if (buf.length === 0) return { ok: false, reason: "文件为空" };
  if (buf.length > MAX_REPORT_BYTES) return { ok: false, reason: `文件超过 ${MAX_REPORT_BYTES / 1024 / 1024}MB 上限` };

  // HTML / JSON 错误页检测（不看扩展名看内容）
  const head = buf.subarray(0, 4096).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<script")) {
    return { ok: false, reason: "内容是 HTML 页面（可能登录过期），不是报表文件" };
  }
  if (head.startsWith("{") || head.startsWith("[")) {
    try {
      const j = JSON.parse(buf.toString("utf8"));
      if (j && typeof j === "object" && ("error" in j || "message" in j)) {
        return { ok: false, reason: `内容是错误 JSON: ${JSON.stringify(j).slice(0, 200)}` };
      }
      return { ok: false, reason: "内容是 JSON，不是报表文件" };
    } catch {
      /* 不是 JSON，继续 */
    }
  }
  // 常见二进制签名拦截（xlsx 应为 zip: 50 4B；但我们 demo 报表是 CSV，直接拒绝二进制 zip 以外的未知签名）
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    try {
      const zip = new AdmZip(buf);
      if (!zip.getEntry("[Content_Types].xml") || !zip.getEntry("xl/workbook.xml")) {
        return { ok: false, reason: "ZIP 缺少 XLSX 工作簿结构" };
      }
      const entries = zip.getEntries();
      if (entries.reduce((n, e) => n + e.header.size, 0) > MAX_REPORT_BYTES ||
          entries.some((e) => e.header.size > 32 * 1024 * 1024)) throw new Error("XLSX 解压大小超限");
      const parser = new XMLParser({ ignoreAttributes: false, processEntities: false });
      const readXml = (name: string) => {
        const entry = zip.getEntry(name);
        if (!entry) throw new Error(`缺少 ${name}`);
        const xml = entry.getData().toString("utf8");
        if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error(`XML 无效：${name}`);
        return parser.parse(xml);
      };
      if (!readXml("[Content_Types].xml").Types) throw new Error("内容类型结构无效");
      const workbook = readXml("xl/workbook.xml").workbook;
      const sheetList = workbook?.sheets?.sheet;
      const sheets = sheetList ? (Array.isArray(sheetList) ? sheetList : [sheetList]) : [];
      if (!sheets.length) throw new Error("XLSX 不包含工作表");
      const relList = readXml("xl/_rels/workbook.xml.rels").Relationships?.Relationship;
      const rels = relList ? (Array.isArray(relList) ? relList : [relList]) : [];
      for (const sheet of sheets) {
        const rel = rels.find((r: Record<string, string>) => r["@_Id"] === sheet["@_r:id"]);
        if (!rel || rel["@_TargetMode"] === "External" || !String(rel["@_Type"]).endsWith("/worksheet")) throw new Error("工作表关联无效");
        const target = String(rel["@_Target"]);
        const name = path.posix.normalize(target.startsWith("/") ? target.slice(1) : "xl/" + target);
        if (!name.startsWith("xl/") || !Object.hasOwn(readXml(name), "worksheet")) throw new Error("工作表内容无效");
      }
      return { ok: true, rows: null, format: "xlsx", header: [], worksheets: sheets.length };
    } catch (e) {
      return { ok: false, reason: `XLSX 解析失败：${(e as Error).message}` };
    }
  }
  if (buf.subarray(0, 2048).includes(0x00)) {
    return { ok: false, reason: "检测到二进制内容，不是文本报表" };
  }

  const parsed = parseCsv(buf.toString("utf8"));
  if (!parsed.ok) return { ok: false, reason: `CSV 解析失败：${parsed.reason}` };
  const rows = parsed.rows;
  if (rows.length < 2) return { ok: false, reason: "CSV 仅有表头或为空，无数据行" };
  const header = rows[0].map((h) => h.trim());
  if (header.length < 3) return { ok: false, reason: `表头字段过少（${header.length}），疑似损坏` };
  // 行列严格一致：任何数据行列数与表头不符都视为损坏/截断（R7，不再允许差一列）
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== header.length) {
      return { ok: false, reason: `第 ${i + 1} 行列数（${rows[i].length}）与表头（${header.length}）不一致，文件疑似损坏或被截断` };
    }
  }
  return { ok: true, rows: rows.length - 1, format: "csv", header };
}
