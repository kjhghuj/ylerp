export interface UsageMetrics {
  activeUsers: number; activeDays: number; loginCount: number; operationCount: number;
  affectedCount: number; generationCount: number; imageCount: number; analysisCount: number;
  currentGalleryCount: number; estimatedCost: string; analysisCost: string; generationCost: string;
  pendingCount: number; failedCount: number; unknownCount: number; unpricedCount: number;
}
export interface UsageMeta {
  timezone: 'Asia/Shanghai'; currency: 'CNY'; version: 'usage-v2';
  asOf: string; startDate: string; endDate: string; startAt: string; endAt: string;
}
export interface UsageReport {
  meta: UsageMeta;
  summary: UsageMetrics;
  timeline: Array<Omit<UsageMetrics, 'currentGalleryCount'> & { date: string }>;
  users: Array<UsageMetrics & { userId: string; username: string; displayName: string; role: string; isActive: boolean; lastLogin: string | null; lastActivity: string | null }>;
  modules: Array<{ module: string; operationCount: number; affectedCount: number; generationCount: number; analysisCount: number }>;
  quality: { legacyEventCount: number; legacyGenerationCount: number; legacyEstimatedCost: string; unpricedCalls: number; stalePendingCalls: number; unknownCalls: number; nativeRecordingSince: string | null; notes: string[] };
}
