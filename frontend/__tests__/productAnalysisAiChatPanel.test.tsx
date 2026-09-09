import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendProductAnalysisChatStream } from '../modules/product-analysis/services/productAnalysisApi';

beforeAll(() => {
    // jsdom 未实现 scrollIntoView（面板消息区自动滚动）
    Element.prototype.scrollIntoView = vi.fn();
});

vi.mock('../AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u1', role: 'owner', permissions: ['*'] } }),
}));
vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));
vi.mock('../components/PermissionTree', () => ({ hasPermission: () => true }));
vi.mock('../modules/product-analysis/services/productAnalysisApi', () => ({
    getApiErrorDetail: (error: any) => error?.response?.data?.detail || String(error?.message || error),
    sendProductAnalysisChatStream: vi.fn(),
}));

import { AiChatPanel } from '../modules/product-analysis/modals/AiChatPanel';

const mockStream = sendProductAnalysisChatStream as unknown as ReturnType<typeof vi.fn>;

async function send(text: string) {
    fireEvent.change(screen.getByPlaceholderText('问问 AI 关于这个商品或店铺的问题…'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
}

describe('AiChatPanel streaming', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('appends streamed deltas into the assistant bubble', async () => {
        mockStream.mockImplementation(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('你');
            events.onDelta('好');
        });

        render(<AiChatPanel shopId="shop-1" />);
        await send('总结一下');

        await waitFor(() => {
            expect(screen.getByText('你好')).toBeInTheDocument();
        });
        expect(mockStream).toHaveBeenCalledWith(
            expect.objectContaining({ shopId: 'shop-1', messages: [{ role: 'user', content: '总结一下' }] }),
            expect.objectContaining({ onDelta: expect.any(Function) }),
            expect.objectContaining({ signal: expect.anything() })
        );
        // 发送完成后输入区恢复可用
        await waitFor(() => {
            expect(screen.getByPlaceholderText('问问 AI 关于这个商品或店铺的问题…')).toBeEnabled();
        });
    });

    it('removes the empty assistant placeholder and shows the error detail on failure', async () => {
        mockStream.mockRejectedValue(
            Object.assign(new Error('余额不足'), { response: { data: { detail: '余额不足或无可用资源包' } } })
        );

        const { container } = render(<AiChatPanel shopId="shop-1" />);
        await send('分析');

        expect(await screen.findByText('余额不足或无可用资源包')).toBeInTheDocument();
        // 空的助手气泡不应残留：只剩用户消息一条
        await waitFor(() => {
            expect(container.querySelectorAll('.self-start')).toHaveLength(0);
        });
        expect(container.querySelectorAll('.self-end')).toHaveLength(1);
    });

    it('keeps partial content when the stream fails midway', async () => {
        mockStream.mockImplementation(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('部分结论');
            throw Object.assign(new Error('中断'), { response: { data: { detail: '连接中断' } } });
        });

        render(<AiChatPanel shopId="shop-1" itemId="10001" />);
        await send('分析');

        expect(await screen.findByText('连接中断')).toBeInTheDocument();
        expect(screen.getByText('部分结论')).toBeInTheDocument();
    });

    it('shows streaming reasoning, then collapses it once the answer starts', async () => {
        mockStream.mockImplementation(async (_request: unknown, events: { onDelta: (d: string) => void; onReasoning?: (r: string) => void }) => {
            events.onReasoning?.('先分析流量结构');
            await new Promise((resolve) => setTimeout(resolve, 30));
            events.onDelta('答案');
        });

        render(<AiChatPanel shopId="shop-1" />);
        await send('分析');

        // 思考阶段：思考区展开且逐字显示
        expect(await screen.findByText('先分析流量结构')).toBeInTheDocument();
        // 正文出现后：思考区自动折叠为摘要条，可再次展开
        await waitFor(() => expect(screen.getByText('答案')).toBeInTheDocument());
        expect(screen.getByText(/已深度思考 \d+ 秒/)).toBeInTheDocument();
        expect(screen.queryByText('先分析流量结构')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /已深度思考/ }));
        expect(screen.getByText('先分析流量结构')).toBeInTheDocument();
    });

    it('renders the assistant reply as markdown (headings/bold, no raw symbols)', async () => {
        mockStream.mockImplementation(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('## 结论\n\n**重点**：转化率偏低');
        });

        render(<AiChatPanel shopId="shop-1" />);
        await send('分析');

        await waitFor(() => expect(screen.getByText('结论')).toBeInTheDocument());
        expect(screen.getByText('重点').tagName).toBe('STRONG');
        expect(screen.queryByText(/##/)).toBeNull();
        expect(screen.queryByText(/\*\*/)).toBeNull();
    });

    it('sends deepThinking:false after toggling the switch off', async () => {
        mockStream.mockImplementation(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('快');
        });

        render(<AiChatPanel shopId="shop-1" />);
        fireEvent.click(screen.getByRole('button', { name: /深度思考/ }));
        await send('分析');

        await waitFor(() => {
            expect(mockStream).toHaveBeenCalledWith(
                expect.objectContaining({ deepThinking: false }),
                expect.objectContaining({ onDelta: expect.any(Function) }),
            expect.objectContaining({ signal: expect.anything() })
            );
        });
        expect(await screen.findByText('快')).toBeInTheDocument();
    });
});

describe('AiChatPanel detail-range context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('passes the current detail range (30d / custom) verbatim into the AI request and shows it', async () => {
        mockStream.mockImplementation(async () => {});
        render(<AiChatPanel shopId="shop-1" itemId="10001" from="2026-08-08" to="2026-09-06" />);
        // 界面明确展示分析日期
        expect(screen.getByText('2026-08-08 ~ 2026-09-06')).toBeInTheDocument();
        await send('分析');
        await waitFor(() => {
            expect(mockStream).toHaveBeenCalledWith(
                expect.objectContaining({ shopId: 'shop-1', itemId: '10001', from: '2026-08-08', to: '2026-09-06' }),
                expect.objectContaining({ onDelta: expect.any(Function) }),
                expect.objectContaining({ signal: expect.anything() })
            );
        });
    });

    it('omits from/to when the caller did not provide a range (legacy compatible path)', async () => {
        mockStream.mockImplementation(async () => {});
        render(<AiChatPanel shopId="shop-1" />);
        await send('分析');
        await waitFor(() => expect(mockStream).toHaveBeenCalled());
        const request = mockStream.mock.calls[0][0] as Record<string, unknown>;
        expect(request.from).toBeUndefined();
        expect(request.to).toBeUndefined();
    });

    it('clears the conversation when shop, item or range changes', async () => {
        mockStream.mockImplementation(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('旧区间的结论');
        });
        const { rerender } = render(<AiChatPanel shopId="shop-1" itemId="10001" from="2026-08-08" to="2026-09-06" />);
        await send('分析');
        await waitFor(() => {
            expect(screen.getByText('旧区间的结论')).toBeInTheDocument();
        });

        // 区间变化 → 旧对话清空
        rerender(<AiChatPanel shopId="shop-1" itemId="10001" from="2026-09-01" to="2026-09-06" />);
        expect(screen.queryByText('旧区间的结论')).toBeNull();
        expect(screen.getByPlaceholderText('问问 AI 关于这个商品或店铺的问题…')).toHaveValue('');

        // 重新发送后再换商品 → 同样清空
        mockStream.mockImplementation(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('另一个商品的结论');
        });
        await send('继续');
        await waitFor(() => {
            expect(screen.getByText('另一个商品的结论')).toBeInTheDocument();
        });
        rerender(<AiChatPanel shopId="shop-1" itemId="20002" from="2026-09-01" to="2026-09-06" />);
        expect(screen.queryByText('另一个商品的结论')).toBeNull();
    });

    it('aborts and discards the in-flight stream when the range changes mid-stream', async () => {
        let releaseFirst: ((value: void) => void) | null = null;
        let firstEvents: { onDelta: (d: string) => void } | null = null;
        mockStream.mockImplementationOnce(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            firstEvents = events;
            return new Promise<void>((resolve) => { releaseFirst = resolve; });
        });
        const { rerender } = render(<AiChatPanel shopId="shop-1" itemId="10001" from="2026-08-08" to="2026-09-06" />);
        await send('分析');
        await waitFor(() => expect(screen.getByText('分析')).toBeInTheDocument());

        // 区间切换：旧流被中止，对话清空
        rerender(<AiChatPanel shopId="shop-1" itemId="10001" from="2026-09-01" to="2026-09-06" />);

        // 旧流的迟到增量：不得写入新上下文
        firstEvents!.onDelta('迟到的旧流内容');
        releaseFirst!();
        await waitFor(() => expect(screen.queryByText('迟到的旧流内容')).toBeNull());
    });
});

describe('AiChatPanel resume after context switch', () => {
    const PLACEHOLDER = '问问 AI 关于这个商品或店铺的问题…';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('can send again immediately after switching shop/item/range while the old stream hangs', async () => {
        // 旧流悬挂（不 resolve），期间发起提问 → 输入禁用
        let oldEvents: { onDelta: (d: string) => void } | null = null;
        let releaseOld: ((value: void) => void) | null = null;
        mockStream.mockImplementationOnce(
            (_request: unknown, events: { onDelta: (d: string) => void }) =>
                new Promise<void>((resolve) => { oldEvents = events; releaseOld = resolve; })
        );
        const { rerender } = render(
            <AiChatPanel shopId="shop-1" itemId="10001" from="2026-08-08" to="2026-09-06" />
        );
        await send('第一个问题');
        await waitFor(() => expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeDisabled());

        // 切换区间：输入立即恢复，可以发送第二个问题并收到回答
        mockStream.mockImplementationOnce(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('区间切换后的回答');
        });
        rerender(<AiChatPanel shopId="shop-1" itemId="10001" from="2026-09-01" to="2026-09-06" />);
        await waitFor(() => expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeEnabled());
        await send('第二个问题');
        await waitFor(() => expect(screen.getByText('区间切换后的回答')).toBeInTheDocument());

        // 切换商品：继续提问
        mockStream.mockImplementationOnce(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('商品切换后的回答');
        });
        rerender(<AiChatPanel shopId="shop-1" itemId="20002" from="2026-09-01" to="2026-09-06" />);
        await waitFor(() => expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeEnabled());
        await send('第三个问题');
        await waitFor(() => expect(screen.getByText('商品切换后的回答')).toBeInTheDocument());

        // 切换店铺：继续提问
        mockStream.mockImplementationOnce(async (_request: unknown, events: { onDelta: (d: string) => void }) => {
            events.onDelta('店铺切换后的回答');
        });
        rerender(<AiChatPanel shopId="shop-2" itemId="20002" from="2026-09-01" to="2026-09-06" />);
        await waitFor(() => expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeEnabled());
        await send('第四个问题');
        await waitFor(() => expect(screen.getByText('店铺切换后的回答')).toBeInTheDocument());

        // 旧流此时才 resolve，且其迟到增量不写入新上下文
        oldEvents!.onDelta('旧流迟到内容');
        releaseOld!();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.queryByText('旧流迟到内容')).toBeNull();
        expect(screen.queryByText('第一个问题')).toBeNull();
    });

    it('a late rejection of the old request does not disturb the new in-flight request', async () => {
        let rejectOld: ((reason?: unknown) => void) | null = null;
        let releaseNew: ((value: void) => void) | null = null;
        mockStream.mockImplementationOnce(
            () => new Promise<void>((_resolve, reject) => { rejectOld = reject; })
        );
        const { rerender } = render(
            <AiChatPanel shopId="shop-1" itemId="10001" from="2026-08-08" to="2026-09-06" />
        );
        await send('第一个问题');

        // 切换区间并发送新问题（新请求悬挂中）
        rerender(<AiChatPanel shopId="shop-1" itemId="10001" from="2026-09-01" to="2026-09-06" />);
        await waitFor(() => expect(screen.getByPlaceholderText('问问 AI 关于这个商品或店铺的问题…')).toBeEnabled());
        mockStream.mockImplementationOnce(
            (_request: unknown, events: { onDelta: (d: string) => void }) =>
                new Promise<void>((resolve) => {
                    events.onDelta('新请求的部分回答');
                    releaseNew = resolve;
                })
        );
        await send('第二个问题');
        await waitFor(() => expect(screen.getByText('新请求的部分回答')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: '发送' }).querySelector('svg')).toBeTruthy();

        // 旧请求此时才 reject：新请求的加载状态与内容不受影响，也不产生错误提示
        rejectOld!(new Error('旧请求失败'));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.getByText('新请求的部分回答')).toBeInTheDocument();
        expect(screen.queryByText(/旧请求失败/)).toBeNull();
        // 仍处于发送中（旧请求的 finally 不得复位新请求状态）
        expect(screen.getByPlaceholderText('问问 AI 关于这个商品或店铺的问题…')).toBeDisabled();

        releaseNew!();
        await waitFor(() => expect(screen.getByPlaceholderText('问问 AI 关于这个商品或店铺的问题…')).toBeEnabled());
    });
});
