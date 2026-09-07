"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRequestHash = aiRequestHash;
exports.runAiCall = runAiCall;
exports.setAiDelivery = setAiDelivery;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const index_1 = require("../index");
const config_1 = require("./chroma/config");
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object')
        return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
    return JSON.stringify(value) ?? 'null';
}
function aiRequestHash(input) {
    return (0, crypto_1.createHash)('sha256').update(canonical({ mode: input.mode, model: input.model, kind: input.kind, operationId: input.operationId, payload: input.payload })).digest('hex');
}
async function runAiCall(input, provider) {
    if (![input.requestKey, input.operationId].every(x => typeof x === 'string' && /^[\w-]{1,128}$/.test(x))) {
        throw new config_1.ApiError(400, '请升级客户端：必须提供有效的 requestKey 和 operationId');
    }
    const models = input.kind === 'analysis'
        ? ['doubao-seed-2-0-lite', 'doubao-seed-2-0-mini', 'doubao-seed-2-0-pro']
        : ['doubao-seedream-4.5', 'doubao-seedream-5.0-lite'];
    if (!models.includes(input.model))
        throw new config_1.ApiError(400, 'Unsupported model');
    const requestHash = aiRequestHash(input);
    let call;
    try {
        call = await index_1.prisma.aiUsageCall.create({ data: {
                userId: input.userId, actorName: input.actorName, requestKey: input.requestKey,
                operationId: input.operationId, requestHash, mode: input.mode, kind: input.kind, model: input.model,
            } });
    }
    catch (error) {
        if (error.code !== 'P2002')
            throw error;
        const existing = await index_1.prisma.aiUsageCall.findUnique({ where: { userId_requestKey: { userId: input.userId, requestKey: input.requestKey } } });
        if (!existing || existing.requestHash !== requestHash)
            throw new config_1.ApiError(409, '同一 requestKey 对应不同请求内容');
        if (existing.status !== 'success' || !existing.result)
            throw new config_1.ApiError(409, `调用 ${existing.id} 状态为 ${existing.status}，不会重复请求供应商；请在记录中核对结果`);
        return { call: existing, result: existing.result };
    }
    let result;
    try {
        result = await provider();
        const valid = input.kind === 'generation'
            ? Array.isArray(result?.data) && result.data.length > 0 && result.data.every((v) => typeof v.url === 'string' && /^https:\/\//.test(v.url))
            : typeof result?.choices?.[0]?.message?.content === 'string' && result.choices[0].message.content.trim().length > 0;
        if (!valid)
            throw new config_1.ApiError(502, '供应商未返回有效产出，结果需核实');
    }
    catch (error) {
        // Only explicit client rejections prove the provider did not complete work.
        const notSubmitted = error instanceof config_1.ApiError && error.notSubmitted;
        const failed = notSubmitted || (error instanceof config_1.ApiError && error.status_code >= 400 && error.status_code < 500 && ![408, 429].includes(error.status_code));
        await index_1.prisma.aiUsageCall.update({ where: { id: call.id }, data: {
                status: failed ? 'failed' : 'unknown', completedAt: new Date(), estimatedCost: null,
                errorCode: notSubmitted ? 'NOT_SUBMITTED' : failed ? 'PROVIDER_REJECTED' : 'PROVIDER_RESULT_UNKNOWN',
                errorMessage: failed ? '供应商拒绝请求' : '调用结果未知，请核实后再发起新的生成',
            } });
        throw new config_1.ApiError(failed ? 422 : 502, failed ? '供应商拒绝请求' : '调用结果未知或无有效产出；请核对调用记录，不要盲目重新生成');
    }
    const outputCount = input.kind === 'generation' ? result.data.length : 0;
    const price = config_1.MODEL_COSTS[input.model];
    const estimatedCost = price == null ? null : new client_1.Prisma.Decimal(String(price)).mul(input.kind === 'generation' ? outputCount : 1);
    // Store only provider output, never the submitted image or prompt. Image outputs remain URLs.
    const replay = input.kind === 'generation'
        ? { data: result.data.map((item) => ({ url: item.url })) }
        : { choices: [{ message: { content: result.choices[0].message.content } }] };
    call = await index_1.prisma.aiUsageCall.update({ where: { id: call.id }, data: {
            status: 'success', completedAt: new Date(), outputCount, estimatedCost, currency: 'CNY',
            pricingVersion: price == null ? null : 'cny-estimate-2026-09-v1',
            providerRequestId: typeof result.id === 'string' ? result.id : null,
            result: replay, deliveryStatus: input.kind === 'analysis' ? 'ready' : 'pending',
            storageStatus: input.kind === 'analysis' ? 'not_applicable' : 'pending',
        } });
    return { call, result: replay };
}
async function setAiDelivery(callId, status) {
    await index_1.prisma.aiUsageCall.update({ where: { id: callId }, data: { deliveryStatus: status } });
}
