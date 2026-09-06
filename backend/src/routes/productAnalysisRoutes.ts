import { Router, Request, Response } from 'express';
import { prisma } from '../index';
import { GlmApiError } from '../services/glm/glmConfig';
import { glmChat, GlmChatMessage } from '../services/glm/glmClient';
import {
  buildProductAnalysisSystemPrompt,
  serializeItemForPrompt,
  serializeReportOverview,
} from '../services/glm/prompts';
import { logActivity } from '../services/activityLogger';

const router = Router();

const MAX_REPORT_JSON_LENGTH = 20 * 1024 * 1024; // 20MB
const MAX_CHAT_HISTORY_MESSAGES = 8;

function errorResponse(error: unknown, res: Response): void {
  if (error instanceof GlmApiError) {
    res.status(error.status_code).json({ detail: error.detail });
  } else {
    res.status(500).json({ detail: String(error) });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 服务端重算商品总数，不信任客户端传入 */
function countReportItems(sheets: unknown): number {
  if (!Array.isArray(sheets)) return 0;
  return sheets.reduce((total, sheet) => {
    if (!isRecord(sheet) || !Array.isArray(sheet.items)) return total;
    return total + sheet.items.length;
  }, 0);
}

function sanitizeChatMessages(raw: unknown): GlmChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((message): message is { role: 'user' | 'assistant'; content: string } => {
      const role = message.role;
      const content = message.content;
      return (
        (role === 'user' || role === 'assistant') &&
        typeof content === 'string' &&
        content.trim().length > 0
      );
    })
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .slice(-MAX_CHAT_HISTORY_MESSAGES);
}

// ---- 报告 CRUD ----

router.post('/reports', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fileName = body?.fileName;
    const sheets = body?.sheets;
    if (typeof fileName !== 'string' || fileName.trim().length === 0) {
      return res.status(400).json({ detail: 'Missing required field: fileName' });
    }
    if (!Array.isArray(sheets) || sheets.length === 0) {
      return res.status(400).json({ detail: 'Missing required field: sheets' });
    }
    const serializedLength = JSON.stringify(body).length;
    if (serializedLength > MAX_REPORT_JSON_LENGTH) {
      return res.status(400).json({ detail: 'Report payload too large (limit 20MB)' });
    }
    const itemCount = countReportItems(sheets);
    if (itemCount === 0) {
      return res.status(400).json({ detail: 'Report contains no product items' });
    }
    const currency = typeof body.currency === 'string' && body.currency ? body.currency : 'MYR';
    const periodStart = typeof body.periodStart === 'string' ? body.periodStart : null;
    const periodEnd = typeof body.periodEnd === 'string' ? body.periodEnd : null;
    const created = await prisma.productAnalysisReport.create({
      data: {
        fileName: fileName.trim(),
        periodStart,
        periodEnd,
        currency,
        itemCount,
        data: body as object,
        userId: req.user!.id,
      },
      select: {
        id: true,
        fileName: true,
        periodStart: true,
        periodEnd: true,
        currency: true,
        itemCount: true,
        createdAt: true,
      },
    });
    logActivity(req.user!.id, 'product_analysis_upload', 'product-analysis', {
      fileName: created.fileName,
      itemCount,
    }).catch((err: unknown) => console.error('活动记录失败:', err));
    return res.status(201).json(created);
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.get('/reports', async (req: Request, res: Response) => {
  try {
    const reports = await prisma.productAnalysisReport.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        fileName: true,
        periodStart: true,
        periodEnd: true,
        currency: true,
        itemCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(reports);
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.get('/reports/:id', async (req: Request, res: Response) => {
  try {
    const report = await prisma.productAnalysisReport.findFirst({
      where: { id: String(req.params.id ?? ''), userId: req.user!.id },
    });
    if (!report) return res.status(404).json({ detail: 'Report not found' });
    return res.json(report);
  } catch (error) {
    return errorResponse(error, res);
  }
});

router.delete('/reports/:id', async (req: Request, res: Response) => {
  try {
    const result = await prisma.productAnalysisReport.deleteMany({
      where: { id: String(req.params.id ?? ''), userId: req.user!.id },
    });
    if (result.count === 0) return res.status(404).json({ detail: 'Report not found' });
    return res.json({ ok: true });
  } catch (error) {
    return errorResponse(error, res);
  }
});

// ---- GLM AI 对话 ----

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const reportId = body?.reportId;
    if (typeof reportId !== 'string' || reportId.length === 0) {
      return res.status(400).json({ detail: 'Missing required field: reportId' });
    }
    const history = sanitizeChatMessages(body?.messages);
    if (history.length === 0) {
      return res.status(400).json({ detail: 'Missing required field: messages' });
    }
    const report = await prisma.productAnalysisReport.findFirst({
      where: { id: reportId, userId: req.user!.id },
    });
    if (!report) return res.status(404).json({ detail: 'Report not found' });

    const sheetKey = typeof body.sheetKey === 'string' ? body.sheetKey : '';
    const itemId = typeof body.itemId === 'string' && body.itemId ? body.itemId : null;
    let itemSnapshot = '';
    let mode: 'item' | 'report' = 'report';
    if (itemId) {
      const snapshot = serializeItemForPrompt(report.data, sheetKey, itemId);
      if (snapshot) {
        itemSnapshot = snapshot;
        mode = 'item';
      }
    }
    const context = mode === 'item' ? itemSnapshot : serializeReportOverview(report.data);

    const systemPrompt = [
      buildProductAnalysisSystemPrompt({
        fileName: report.fileName,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        currency: report.currency,
        mode,
      }),
      '===== 分析数据 =====',
      context || '（报告中无可用数据）',
    ].join('\n\n');

    const result = await glmChat([
      { role: 'system', content: systemPrompt },
      ...history,
    ]);
    logActivity(req.user!.id, 'product_analysis_chat', 'product-analysis', {
      reportId,
      ...(itemId ? { itemId } : {}),
      mode,
    }).catch((err: unknown) => console.error('活动记录失败:', err));
    return res.json(result);
  } catch (error) {
    return errorResponse(error, res);
  }
});

export default router;
