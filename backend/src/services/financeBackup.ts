import fs from 'fs';
import path from 'path';
import { prisma } from '../index';

const BACKUP_PATH = path.join(__dirname, '../../backups/finance-backup.json');
const INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startFinanceBackup() {
    const run = async () => {
        try {
            const records = await prisma.financeRecord.findMany();
            const dir = path.dirname(BACKUP_PATH);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(BACKUP_PATH, JSON.stringify(records, null, 2));
            console.log(`[备份] 财务数据已备份，共 ${records.length} 条记录`);
        } catch (err) {
            console.error('[备份] 财务数据备份失败:', err);
        }
    };

    run();
    setInterval(run, INTERVAL_MS);
}
