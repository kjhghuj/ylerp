import { prisma } from '../infrastructure/runtimeResources';
import { startScheduledTask } from '../infrastructure/scheduledTask';

const RETENTION_DAYS = 30;
const cutoff = (now: Date) => new Date(now.getTime() - RETENTION_DAYS * 86_400_000);

/** 调用方先检查店铺所有权和 AI 权限；查询始终同时限定账号、店铺、商品。 */
export async function readProductChatHistory(userId: string, shopId: string, itemId: string, now = new Date()) {
  const turns = await prisma.productAnalysisChatTurn.findMany({
    where: { userId, shopId, itemId, createdAt: { gte: cutoff(now) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { userContent: true, assistantContent: true, createdAt: true, from: true, to: true },
  });
  return {
    retentionDays: RETENTION_DAYS,
    messages: turns.flatMap(turn => {
      const metadata = { createdAt: turn.createdAt.toISOString(), analysisFrom: turn.from, analysisTo: turn.to };
      return [
        { role: 'user' as const, content: turn.userContent, ...metadata },
        { role: 'assistant' as const, content: turn.assistantContent, ...metadata },
      ];
    }),
  };
}

/** 完整问答作为一个原子轮次保存；重复 HTTP 请求不会追加重复记录。 */
export async function saveProductChatTurn(data: {
  userId: string; shopId: string; itemId: string; requestKey: string;
  userContent: string; assistantContent: string; from: string; to: string;
}) {
  if (!data.userContent.trim() || !data.assistantContent.trim()) throw new Error('Cannot save an empty conversation turn');
  await prisma.productAnalysisChatTurn.createMany({ data, skipDuplicates: true });
}

export async function pruneProductChatHistory(now = new Date()) {
  return prisma.productAnalysisChatTurn.deleteMany({ where: { createdAt: { lt: cutoff(now) } } });
}

export function startProductChatHistoryCleanup() {
  return startScheduledTask(() => pruneProductChatHistory(), {
    intervalMs: 60 * 60 * 1000, immediate: true,
    onError: () => console.error('Product chat history cleanup failed'),
  });
}
