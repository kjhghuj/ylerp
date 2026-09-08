import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../index';
import { ApiError, MODEL_COSTS } from './chroma/config';

export interface AiCallInput {
  userId: string; actorName?: string; requestKey: string; operationId: string;
  kind: 'analysis' | 'generation'; mode: string; model: string; payload: unknown; module?: string;
  /** 模型白名单覆盖（用户级 AI 配置的自定义模型名）；缺省用环境变量/内置白名单 */
  allowedModels?: string[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function aiRequestHash(input: AiCallInput): string {
  return createHash('sha256').update(canonical({ module: input.module || 'chroma', mode: input.mode, model: input.model, kind: input.kind, operationId: input.operationId, payload: input.payload })).digest('hex');
}

export async function runAiCall(input: AiCallInput, provider: () => Promise<any>) {
  if (![input.requestKey, input.operationId].every(x => typeof x === 'string' && /^[\w-]{1,128}$/.test(x))) {
    throw new ApiError(400, '请升级客户端：必须提供有效的 requestKey 和 operationId');
  }
  const models = input.module === 'product-analysis'
    ? input.allowedModels ?? [process.env.GLM_MODEL || 'glm-5.3-flash']
    : input.kind === 'analysis'
    ? ['doubao-seed-2-0-lite', 'doubao-seed-2-0-mini', 'doubao-seed-2-0-pro']
    : ['doubao-seedream-4.5', 'doubao-seedream-5.0-lite'];
  if (!models.includes(input.model)) throw new ApiError(400, 'Unsupported model');
  const requestHash = aiRequestHash(input);
  let call;
  try {
    call = await prisma.aiUsageCall.create({ data: {
      userId: input.userId, actorName: input.actorName, requestKey: input.requestKey,
      operationId: input.operationId, requestHash, module: input.module || 'chroma', mode: input.mode, kind: input.kind, model: input.model,
    } });
  } catch (error: any) {
    if (error.code !== 'P2002') throw error;
    const existing = await prisma.aiUsageCall.findUnique({ where: { userId_requestKey: { userId: input.userId, requestKey: input.requestKey } } });
    if (!existing || existing.requestHash !== requestHash) throw new ApiError(409, '同一 requestKey 对应不同请求内容');
    if (existing.status !== 'success' || !existing.result) throw new ApiError(409, `调用 ${existing.id} 状态为 ${existing.status}，不会重复请求供应商；请在记录中核对结果`);
    return { call: existing, result: existing.result as any };
  }

  let result: any;
  try {
    result = await provider();
    const valid = input.kind === 'generation'
      ? Array.isArray(result?.data) && result.data.length > 0 && result.data.every((v: any) => typeof v.url === 'string' && /^https:\/\//.test(v.url))
      : (typeof result?.choices?.[0]?.message?.content === 'string' && result.choices[0].message.content.trim().length > 0)
        || (typeof result?.content === 'string' && result.content.trim().length > 0);
    if (!valid) throw new ApiError(502, '供应商未返回有效产出，结果需核实');
  } catch (error: any) {
    // Only explicit client rejections prove the provider did not complete work.
    const notSubmitted = (error instanceof ApiError && error.notSubmitted) || error?.notSubmitted === true;
    const failed = notSubmitted || (error instanceof ApiError && error.status_code >= 400 && error.status_code < 500 && ![408, 429].includes(error.status_code));
    await prisma.aiUsageCall.update({ where: { id: call.id }, data: {
      status: failed ? 'failed' : 'unknown', completedAt: new Date(), estimatedCost: null,
      errorCode: notSubmitted ? 'NOT_SUBMITTED' : failed ? 'PROVIDER_REJECTED' : 'PROVIDER_RESULT_UNKNOWN',
      errorMessage: failed ? '供应商拒绝请求' : '调用结果未知，请核实后再发起新的生成',
    } });
    // 把供应商/上游的具体原因（如"余额不足"）带给前端，避免只有通用文案
    const reason = error instanceof ApiError
      ? error.detail
      : typeof error?.message === 'string' && error.message
        ? error.message.slice(0, 200)
        : '';
    const baseDetail = failed ? '供应商拒绝请求' : '调用结果未知或无有效产出；请核对调用记录，不要盲目重新生成';
    throw new ApiError(failed ? 422 : 502, reason ? `${baseDetail}（${reason}）` : baseDetail);
  }

  const outputCount = input.kind === 'generation' ? result.data.length : 0;
  const configuredGlmPrice = input.module === 'product-analysis' && process.env.GLM_ESTIMATED_COST_CNY !== undefined
    ? Number(process.env.GLM_ESTIMATED_COST_CNY) : null;
  const price = input.module === 'product-analysis'
    ? (configuredGlmPrice !== null && Number.isFinite(configuredGlmPrice) && configuredGlmPrice >= 0 ? configuredGlmPrice : undefined)
    : MODEL_COSTS[input.model];
  const estimatedCost = price == null ? null : new Prisma.Decimal(String(price)).mul(input.kind === 'generation' ? outputCount : 1);
  // Store only provider output, never the submitted image or prompt. Image outputs remain URLs.
  const replay = input.kind === 'generation'
    ? { data: result.data.map((item: any) => ({ url: item.url })) }
    : typeof result?.content === 'string'
      ? { content: result.content, model: typeof result.model === 'string' ? result.model : input.model }
      : { choices: [{ message: { content: result.choices[0].message.content } }] };
  call = await prisma.aiUsageCall.update({ where: { id: call.id }, data: {
    status: 'success', completedAt: new Date(), outputCount, estimatedCost, currency: 'CNY',
    pricingVersion: price == null ? null : input.module === 'product-analysis'
      ? (process.env.GLM_PRICING_VERSION || 'glm-cny-estimate-v1')
      : 'cny-estimate-2026-09-v1',
    providerRequestId: typeof result.id === 'string' ? result.id : null,
    result: replay, deliveryStatus: input.kind === 'analysis' ? 'ready' : 'pending',
    storageStatus: input.kind === 'analysis' ? 'not_applicable' : 'pending',
  } });
  return { call, result: replay };
}

export async function setAiDelivery(callId: string, status: 'ready' | 'failed') {
  await prisma.aiUsageCall.update({ where: { id: callId }, data: { deliveryStatus: status } });
}
