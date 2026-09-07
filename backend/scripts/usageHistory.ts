import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { auditUsageHistory, rebuildUsageHistory } from '../src/services/usageHistory';

async function main() {
  const args = process.argv.slice(2);
  if (args.some((a,i) => !['--dry-run','--apply','--batch'].includes(a) && args[i-1] !== '--batch')) throw new Error('仅支持 --dry-run 或 --apply --batch <批次>');
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('不能同时使用 --apply 和 --dry-run');
  const batch = args[args.indexOf('--batch')+1];
  if (args.includes('--apply') && (!args.includes('--batch') || !batch || batch.startsWith('--'))) throw new Error('--apply 需要 --batch <批次>');
  const db = new PrismaClient();
  try {
    console.log(JSON.stringify(await auditUsageHistory(db), null, 2));
    if (args.includes('--apply')) console.log(JSON.stringify(await rebuildUsageHistory(db,batch), null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error('历史核对失败:', error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[database]') : 'unknown'); process.exitCode = 1; });
