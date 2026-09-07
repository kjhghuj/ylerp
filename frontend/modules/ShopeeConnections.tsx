import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../src/api';

interface Connection {
  id: string; shopId: string; shopName?: string; region?: string;
  environment: string; status: string; expiresAt: string; lastError?: string;
}
interface Status {
  configuration: { ready: boolean; error?: string; environment?: string; frontendOrigin?: string };
  connections: Connection[];
}
interface Confirmation { type: 'shopee-authorized'; sessionId: string; confirmationToken: string; }
function isConfirmation(value: unknown): value is Confirmation {
  const item = value as Partial<Confirmation> | null;
  return !!item && item.type === 'shopee-authorized' && typeof item.sessionId === 'string'
    && /^[a-f0-9-]{36}$/i.test(item.sessionId) && typeof item.confirmationToken === 'string'
    && /^[a-f0-9]{64}$/.test(item.confirmationToken);
}
const errorText = (error: any) => error.response?.data?.error || error.message || '请求失败，请稍后重试。';

export const ShopeeConnections: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const flow = useRef<{ popup: Window; sessionId: string; redirectOrigin: string } | null>(null);
  const confirming = useRef(false);
  const consumedHash = useRef(false);
  const load = useCallback(async () => {
    try { setStatus((await api.get('/shopee/manage/connections')).data); }
    catch (error) { setMessage(errorText(error)); }
  }, []);
  const confirm = useCallback(async (result: Confirmation) => {
    if (confirming.current) return;
    confirming.current = true;
    setBusy(true);
    try {
      await api.post('/shopee/manage/confirm', { sessionId: result.sessionId, confirmationToken: result.confirmationToken });
      flow.current?.popup.close();
      flow.current = null;
      setMessage('店铺已授权，令牌已加密保存。后端运行期间会自动刷新。');
      await load();
    } catch (error) { setMessage(errorText(error)); }
    finally { confirming.current = false; setBusy(false); }
  }, [load]);

  useEffect(() => {
    void load();
    if (!consumedHash.current && window.location.hash.startsWith('#shopee-auth=')) {
      consumedHash.current = true;
      const encoded = window.location.hash.slice('#shopee-auth='.length);
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#shopee');
      try {
        const result: unknown = JSON.parse(decodeURIComponent(encoded));
        if (!isConfirmation(result)) throw new Error('授权确认参数无效，请重新授权。');
        void confirm(result);
      } catch (error) { setMessage(errorText(error)); }
    }
    const onMessage = (event: MessageEvent) => {
      const current = flow.current;
      if (!current || event.origin !== current.redirectOrigin || event.source !== current.popup
        || !isConfirmation(event.data) || event.data.sessionId !== current.sessionId) return;
      void confirm(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [load, confirm]);

  const begin = async () => {
    if (status?.configuration.frontendOrigin !== window.location.origin) {
      setMessage(`请从 ${status?.configuration.frontendOrigin || '配置的前端地址'} 打开 ERP 后授权。`);
      return;
    }
    const popup = window.open('about:blank', '_blank', 'popup,width=1000,height=780');
    if (!popup) { setMessage('浏览器阻止了授权窗口，请允许此网站弹出窗口后重试。'); return; }
    flow.current?.popup.close();
    setBusy(true);
    setMessage('');
    try {
      const { data } = await api.post('/shopee/manage/authorize');
      flow.current = { popup, sessionId: data.sessionId, redirectOrigin: data.redirectOrigin };
      popup.location.href = data.authorizationUrl;
      setMessage('请在新窗口完成虾皮授权。完成后会自动返回并保存店铺；如未返回，请点击回调页的“返回 ERP 完成绑定”。');
    } catch (error) { popup.close(); setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  const refresh = async (id: string) => {
    setBusy(true);
    try { await api.post(`/shopee/manage/connections/${id}/refresh`); setMessage('令牌已刷新。'); }
    catch (error) { setMessage(errorText(error)); }
    finally { await load(); setBusy(false); }
  };

  return <section className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">
    <div>
      <h3 className="text-lg font-semibold text-slate-800">Shopee 店铺授权</h3>
      <p className="text-sm text-slate-500 mt-2">逐店完成授权后，系统自动换取并加密保存令牌。此入口使用店铺授权，暂不支持主账号批量授权。</p>
    </div>
    {status && <p className="text-sm">当前环境：<strong>{status.configuration.environment === 'sandbox' ? '测试环境（Sandbox）' : status.configuration.environment === 'live' ? '正式环境' : '未配置'}</strong></p>}
    {status?.configuration.environment === 'sandbox' && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">当前使用 Test Partner 凭证，请先使用虾皮沙箱测试店铺验证。实际经营店铺需要正式环境凭证和相应授权资格。</p>}
    {status && !status.configuration.ready && <p role="alert" className="text-red-600">{status.configuration.error}</p>}
    {message && <p role="status" className="text-sm bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{message}</p>}
    <div className="flex gap-3">
      <button disabled={busy || !status?.configuration.ready} onClick={() => void begin()} className="px-4 py-2 rounded-lg bg-orange-600 text-white disabled:opacity-50">授权一家店铺</button>
      <button disabled={busy} onClick={() => void load()} className="px-4 py-2 rounded-lg border border-slate-200 disabled:opacity-50">刷新列表</button>
    </div>
    {!status ? <p className="text-slate-500">正在读取授权配置…</p> : !status.connections.length ? <p className="text-sm text-slate-500 py-5">尚未绑定店铺。完成授权后，店铺会显示在这里。</p> : <div className="space-y-3">
      {status.connections.map(connection => <div key={connection.id} className="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{connection.shopName || `店铺 ${connection.shopId}`} <span className="text-xs text-slate-500">{connection.region || ''} · {connection.environment === 'sandbox' ? '测试' : '正式'}</span></p>
          <p className="text-sm text-slate-500">Shop ID：{connection.shopId}</p>
          <p className="text-sm text-slate-500">令牌到期：{new Date(connection.expiresAt).toLocaleString()}</p>
          <p className="text-sm">{connection.status === 'reauthorization_required' ? '需要重新授权' : new Date(connection.expiresAt).getTime() <= Date.now() ? '令牌已过期，等待刷新' : '已授权'}{connection.lastError ? `（最近刷新错误：${connection.lastError}）` : ''}</p>
        </div>
        <button disabled={busy} onClick={() => void refresh(connection.id)} className="text-sm text-indigo-600 disabled:opacity-50">刷新令牌</button>
      </div>)}
    </div>}
  </section>;
};
