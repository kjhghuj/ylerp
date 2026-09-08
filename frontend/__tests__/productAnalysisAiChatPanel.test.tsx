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
            expect.objectContaining({ onDelta: expect.any(Function) })
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
                expect.objectContaining({ onDelta: expect.any(Function) })
            );
        });
        expect(await screen.findByText('快')).toBeInTheDocument();
    });
});
