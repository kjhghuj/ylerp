"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFinanceBackup = startFinanceBackup;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_1 = require("../index");
const BACKUP_PATH = path_1.default.join(__dirname, '../../backups/finance-backup.json');
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 5 * 60 * 1000;
function getStartupDelayMs() {
    const configured = Number(process.env.FINANCE_BACKUP_STARTUP_DELAY_MS);
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_STARTUP_DELAY_MS;
}
function startFinanceBackup() {
    const run = async () => {
        try {
            const records = await index_1.prisma.financeRecord.findMany();
            const dir = path_1.default.dirname(BACKUP_PATH);
            if (!fs_1.default.existsSync(dir))
                fs_1.default.mkdirSync(dir, { recursive: true });
            fs_1.default.writeFileSync(BACKUP_PATH, JSON.stringify(records, null, 2));
            console.log(`[备份] 财务数据已备份，共 ${records.length} 条记录`);
        }
        catch (err) {
            console.error('[备份] 财务数据备份失败:', err);
        }
    };
    setTimeout(run, getStartupDelayMs());
    setInterval(run, INTERVAL_MS);
}
