/** UI-only acceptance fixture; all HTTP and AI traffic is synthetic. Real database acceptance lives in backend/scripts/verify. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../AuthContext';
import { StoreProvider } from '../../StoreContext';
import api from '../../src/api';
import { AiChatPanel } from '../../modules/product-analysis/modals/AiChatPanel';
import type { ChatMessage } from '../../modules/product-analysis/types';
import '../../index.css';
import '../../modules/product-analysis/product-analysis.css';

const histories: Record<string, ChatMessage[]> = { p1: [{ role: 'user', content: '这个商品转化率低，应该先做什么？', analysisFrom: '2026-09-01', analysisTo: '2026-09-30' },
  { role: 'assistant', content: '建议先优化主图和标题，再比较调整前后的点击率与转化率。' }], p2: [] };
api.defaults.adapter = async config => ({ config, status: 200, statusText: 'OK', headers: {},
  data: config.url?.endsWith('/chat-history') ? { messages: histories[config.url.includes('/p1/') ? 'p1' : 'p2'], retentionDays: 30 }
    : config.url === '/auth/me' ? { id: 'fixture', role: 'owner', permissions: ['*'] } : [] });
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  if (!String(input).endsWith('/product-analysis/chat')) throw new Error('Unexpected fixture fetch');
  const body = JSON.parse(String(init?.body));
  const question = body.messages.at(-1).content;
  const answer = `已接着分析：${question}。建议保持同一统计口径，验证优化后的效果。`;
  histories[body.itemId] = [...histories[body.itemId], { role: 'user', content: question }, { role: 'assistant', content: answer }];
  return new Response(`data: ${JSON.stringify({ delta: answer })}\n\ndata: ${JSON.stringify({ done: true, model: 'synthetic' })}\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};
function Fixture() {
  const [open, setOpen] = useState(true), [item, setItem] = useState('p1');
  return <main className="pa-shell" style={{ padding: 32, minHeight: '100vh' }}>
    <h1 className="text-2xl font-bold" style={{ marginBottom: 8 }}>商品 AI 分析 · 保存与续聊验收</h1>
    <p style={{ marginBottom: 24 }}>本页使用测试数据，不调用真实模型。</p>
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <button onClick={() => setOpen(value => !value)}>{open ? '关闭商品分析' : '打开商品分析'}</button>
      <select aria-label="验收商品" value={item} onChange={event => setItem(event.target.value)}><option value="p1">商品 A</option><option value="p2">商品 B</option></select>
    </div>
    {open && <div style={{ maxWidth: 1000 }}><AiChatPanel shopId="fixture-shop" itemId={item} itemTitle={item === 'p1' ? '商品 A' : '商品 B'} from="2026-09-03" to="2026-10-02" /></div>}
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<AuthProvider><StoreProvider><Fixture /></StoreProvider></AuthProvider>);
if (import.meta.hot) import.meta.hot.dispose(() => { root.unmount(); window.fetch = originalFetch; });
