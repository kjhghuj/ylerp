import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { prisma } from '../index';
import { canViewUsage, canExportUsage, csvCell, parseUsageFilter } from '../services/usagePolicy';
import { getUsageReport } from '../services/usageReport';
import { getUsageDetails, parseDetailsOptions } from '../services/usageDetails';

const router = Router();
router.use(authenticate);
export function requireUsagePermission(action: 'view' | 'export') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user && await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, isActive: true, permissions: true } });
      if (!(action === 'export' ? canExportUsage(user || null) : canViewUsage(user || null))) { res.status(403).json({ error: '没有使用统计权限' }); return; }
      next();
    } catch { res.status(503).json({ error: '无法验证当前权限，请稍后重试' }); }
  };
}
function reportHandler(kind: 'report' | 'stats' | 'timeline' | 'export') {
  return async (req: Request, res: Response) => {
    let filter;
    try { filter = parseUsageFilter(req.query); }
    catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
    try {
      const report = await getUsageReport(prisma, filter);
      if (kind === 'stats') { res.json({ users: report.users.map(u => ({ ...u, generationCost: Number(u.generationCost), lastLoginIp: null, actions: { login: u.loginCount, image_generate: u.generationCount } })), meta: report.meta, quality: report.quality }); return; }
      if (kind === 'timeline') { res.json({ timeline: report.timeline.map(d => ({ ...d, login: d.loginCount, image_generate: d.generationCount })), meta: report.meta, quality: report.quality }); return; }
      if (kind === 'export') {
        const headers = ['账号ID','账号','姓名','角色','启用','活跃天数','登录次数','业务操作','影响条数','生成调用','生成图片','分析调用','当前图库','人民币预估费用','分析预估费用','生成预估费用','未计价调用','处理中','失败','结果未知','最后登录','最后活动','开始日期','结束日期','时区','截止时间','币种','可信度','口径版本'];
        const rows: unknown[][] = report.users.map(u => [u.userId,u.username,u.displayName,u.role,u.isActive,u.activeDays,u.loginCount,u.operationCount,u.affectedCount,u.generationCount,u.imageCount,u.analysisCount,u.currentGalleryCount,u.estimatedCost,u.analysisCost,u.generationCost,u.unpricedCount,u.pendingCount,u.failedCount,u.unknownCount,u.lastLogin,u.lastActivity,report.meta.startDate,report.meta.endDate,report.meta.timezone,report.meta.asOf,report.meta.currency,'新口径；未含历史参考值',report.meta.version]);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="usage-${report.meta.startDate}-${report.meta.endDate}.csv"`);
        res.send('\uFEFF' + [headers,...rows].map(row => row.map(csvCell).join(',')).join('\r\n')); return;
      }
      res.json(report);
    } catch (error) { console.error('[usage] report failed', { code: (error as {code?:string}).code || 'QUERY_FAILED' }); res.status(503).json({ error: '统计暂不可用，请确认数据库迁移完成后重试' }); }
  };
}
router.get('/report', requireUsagePermission('view'), reportHandler('report'));
router.get('/stats', requireUsagePermission('view'), reportHandler('stats'));
router.get('/timeline', requireUsagePermission('view'), reportHandler('timeline'));
router.get('/export', requireUsagePermission('export'), reportHandler('export'));
router.get('/details', requireUsagePermission('view'), async (req, res) => {
  let filter, options;
  try { filter = parseUsageFilter(req.query); options = parseDetailsOptions(req.query); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  try { res.json(await getUsageDetails(prisma, filter, options)); }
  catch { res.status(503).json({ error: '明细暂不可用，请稍后重试' }); }
});
router.delete('/activity', requireUsagePermission('view'), (_req, res) => { res.status(410).json({ error: '活动记录为审计依据，已停用清空接口' }); });
export default router;
