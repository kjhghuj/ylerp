"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireUsagePermission = requireUsagePermission;
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const index_1 = require("../index");
const usagePolicy_1 = require("../services/usagePolicy");
const usageReport_1 = require("../services/usageReport");
const usageDetails_1 = require("../services/usageDetails");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticate);
function requireUsagePermission(action) {
    return async (req, res, next) => {
        try {
            const user = req.user && await index_1.prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, isActive: true, permissions: true } });
            if (!(action === 'export' ? (0, usagePolicy_1.canExportUsage)(user || null) : (0, usagePolicy_1.canViewUsage)(user || null))) {
                res.status(403).json({ error: '没有使用统计权限' });
                return;
            }
            next();
        }
        catch {
            res.status(503).json({ error: '无法验证当前权限，请稍后重试' });
        }
    };
}
function reportHandler(kind) {
    return async (req, res) => {
        let filter;
        try {
            filter = (0, usagePolicy_1.parseUsageFilter)(req.query);
        }
        catch (error) {
            res.status(400).json({ error: error.message });
            return;
        }
        try {
            const report = await (0, usageReport_1.getUsageReport)(index_1.prisma, filter);
            if (kind === 'stats') {
                res.json({ users: report.users.map(u => ({ ...u, generationCost: Number(u.generationCost), lastLoginIp: null, actions: { login: u.loginCount, image_generate: u.generationCount } })), meta: report.meta, quality: report.quality });
                return;
            }
            if (kind === 'timeline') {
                res.json({ timeline: report.timeline.map(d => ({ ...d, login: d.loginCount, image_generate: d.generationCount })), meta: report.meta, quality: report.quality });
                return;
            }
            if (kind === 'export') {
                const headers = ['账号ID', '账号', '姓名', '角色', '启用', '活跃天数', '登录次数', '业务操作', '影响条数', '生成调用', '生成图片', '分析调用', '当前图库', '人民币预估费用', '分析预估费用', '生成预估费用', '未计价调用', '处理中', '失败', '结果未知', '最后登录', '最后活动', '开始日期', '结束日期', '时区', '截止时间', '币种', '可信度', '口径版本'];
                const rows = report.users.map(u => [u.userId, u.username, u.displayName, u.role, u.isActive, u.activeDays, u.loginCount, u.operationCount, u.affectedCount, u.generationCount, u.imageCount, u.analysisCount, u.currentGalleryCount, u.estimatedCost, u.analysisCost, u.generationCost, u.unpricedCount, u.pendingCount, u.failedCount, u.unknownCount, u.lastLogin, u.lastActivity, report.meta.startDate, report.meta.endDate, report.meta.timezone, report.meta.asOf, report.meta.currency, '新口径；未含历史参考值', report.meta.version]);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="usage-${report.meta.startDate}-${report.meta.endDate}.csv"`);
                res.send('\uFEFF' + [headers, ...rows].map(row => row.map(usagePolicy_1.csvCell).join(',')).join('\r\n'));
                return;
            }
            res.json(report);
        }
        catch (error) {
            console.error('[usage] report failed', { code: error.code || 'QUERY_FAILED' });
            res.status(503).json({ error: '统计暂不可用，请确认数据库迁移完成后重试' });
        }
    };
}
router.get('/report', requireUsagePermission('view'), reportHandler('report'));
router.get('/stats', requireUsagePermission('view'), reportHandler('stats'));
router.get('/timeline', requireUsagePermission('view'), reportHandler('timeline'));
router.get('/export', requireUsagePermission('export'), reportHandler('export'));
router.get('/details', requireUsagePermission('view'), async (req, res) => {
    let filter, options;
    try {
        filter = (0, usagePolicy_1.parseUsageFilter)(req.query);
        options = (0, usageDetails_1.parseDetailsOptions)(req.query);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
        return;
    }
    try {
        res.json(await (0, usageDetails_1.getUsageDetails)(index_1.prisma, filter, options));
    }
    catch {
        res.status(503).json({ error: '明细暂不可用，请稍后重试' });
    }
});
router.delete('/activity', requireUsagePermission('view'), (_req, res) => { res.status(410).json({ error: '活动记录为审计依据，已停用清空接口' }); });
exports.default = router;
