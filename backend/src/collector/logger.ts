/** 简单文件+控制台日志；敏感值调用方负责不打印。 */
import fs from "node:fs";
import path from "node:path";

let logFile: string | null = null;

export function initLogger(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  logFile = file;
}

export function log(level: "INFO" | "WARN" | "ERROR", scope: string, msg: string) {
  const line = `${new Date().toISOString()} [${level}] [${scope}] ${msg}`;
  if (level === "ERROR") console.error(line);
  else console.log(line);
  // stdout 被重定向到同一文件时避免双写
  if (logFile && process.stdout.isTTY) {
    try {
      fs.appendFileSync(logFile, line + "\n");
    } catch {
      /* 日志写失败不影响主流程 */
    }
  }
}
export const logger = {
  info: (scope: string, msg: string) => log("INFO", scope, msg),
  warn: (scope: string, msg: string) => log("WARN", scope, msg),
  error: (scope: string, msg: string) => log("ERROR", scope, msg),
};
