import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeSseLines, sendProductAnalysisChatStream } from '../modules/product-analysis/services/productAnalysisApi';

function sseResponse(chunks: string[], init?: ResponseInit): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' }, ...init });
}

describe('consumeSseLines', () => {
    it('extracts data payloads and keeps the unfinished tail in the buffer', () => {
        const { events, rest } = consumeSseLines('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":');
        expect(events).toEqual(['{"a":1}', '{"b":2}']);
        expect(rest).toBe('data: {"c":');
    });

    it('ignores non-data lines and [DONE]', () => {
        const { events } = consumeSseLines(': keep-alive\n\ndata: [DONE]\n\n');
        expect(events).toEqual(['[DONE]']);
    });
});

describe('sendProductAnalysisChatStream', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        localStorage.setItem('erp_token', 'token-1');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        localStorage.removeItem('erp_token');
        fetchMock.mockReset();
    });

    it('streams deltas, reports done, and sends stream flag with auth header', async () => {
        fetchMock.mockResolvedValueOnce(
            sseResponse([
                'data: {"delta":"你"}\n\n',
                'data: {"del',
                'ta":"好"}\n\ndata: {"done":true,"model":"glm-5.3"}\n\n',
            ])
        );
        const deltas: string[] = [];
        let doneModel = '';

        await sendProductAnalysisChatStream(
            { shopId: 'shop-1', messages: [{ role: 'user', content: 'hi' }] },
            { onDelta: (delta) => deltas.push(delta), onDone: (model) => { doneModel = model; } }
        );

        expect(deltas).toEqual(['你', '好']);
        expect(doneModel).toBe('glm-5.3');
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toContain('/product-analysis/chat');
        expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });
        expect(JSON.parse(String(init.body)).stream).toBe(true);
    });

    it('throws the backend detail for a non-ok response', async () => {
        fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: '该店铺还没有上传过数据' }), { status: 400 }));

        await expect(
            sendProductAnalysisChatStream({ shopId: 'shop-1', messages: [{ role: 'user', content: 'hi' }] }, { onDelta: () => {} })
        ).rejects.toMatchObject({ response: { data: { detail: '该店铺还没有上传过数据' } } });
    });

    it('throws when an error event arrives mid-stream', async () => {
        fetchMock.mockResolvedValueOnce(
            sseResponse(['data: {"delta":"部分"}\n\ndata: {"error":"余额不足"}\n\n'])
        );

        await expect(
            sendProductAnalysisChatStream({ shopId: 'shop-1', messages: [{ role: 'user', content: 'hi' }] }, { onDelta: () => {} })
        ).rejects.toMatchObject({ response: { data: { detail: '余额不足' } } });
    });

    it('forwards reasoning events separately from content deltas and sends deepThinking flag', async () => {
        fetchMock.mockResolvedValueOnce(
            sseResponse([
                'data: {"reasoning":"先想"}\n\ndata: {"delta":"答"}\n\ndata: {"done":true}\n\n',
                ': keep-alive\n\n',
            ])
        );
        const deltas: string[] = [];
        const reasoning: string[] = [];

        await sendProductAnalysisChatStream(
            { shopId: 'shop-1', messages: [{ role: 'user', content: 'hi' }], deepThinking: false },
            { onDelta: (d) => deltas.push(d), onReasoning: (r) => reasoning.push(r) }
        );

        expect(reasoning).toEqual(['先想']);
        expect(deltas).toEqual(['答']);
        // SSE 注释行（心跳）不产生事件；deepThinking 随请求体下发
        const init = fetchMock.mock.calls[0] as unknown[] as [string, RequestInit];
        expect(JSON.parse(String(init[1].body)).deepThinking).toBe(false);
    });
});
