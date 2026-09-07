export type UsagePermissionUser = { role: string; permissions: string[]; isActive?: boolean } | null;
export const canViewUsage = (user: UsagePermissionUser): boolean => !!user && user.isActive !== false && (user.role === 'owner' || (user.role === 'admin' && ['*', 'usage-stats', 'usage-stats.view'].some(p => user.permissions.includes(p))));
export const canExportUsage = (user: UsagePermissionUser): boolean => canViewUsage(user) && !!user && (user.role === 'owner' || ['*', 'usage-stats', 'usage-stats.export'].some(p => user.permissions.includes(p)));
export const usageDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '无记录';
export const usageMoney = (value: string | null | undefined) => value == null ? '未计价' : `¥${value}`;
export const USAGE_MODULES: Record<string, string> = { auth: '账号登录', chroma: '图片制作', product: '商品', profit: '利润模板', finance: '财务', inventory: '库存', warehouse: '仓库', schedule: '日程', 'restock-v2': '补货 V2', restock: '历史补货', node: '历史节点模板', 'product-analysis': '商品分析' };
export const USAGE_STATUSES: Record<string, string> = { success: '成功', pending: '处理中', failed: '失败', unknown: '结果未知' };
export interface UsageDetail {
  id: string; type: string; userId: string; actorName?: string; module: string; action: string; status: string; occurredAt: string;
  objectType?: string; objectId?: string; affectedCount?: number; outputCount?: number; source: string; provenance: string;
  model?: string; estimatedCost?: string | null; currency?: string; pricingVersion?: string; deliveryStatus?: string; storageStatus?: string;
  operationId?: string; providerRequestId?: string; legacySource?: string; legacyId?: string; migrationBatch?: string; ruleVersion?: string;
}
export interface UsageDetails { items: UsageDetail[]; total: number; page: number; pageSize: number }
