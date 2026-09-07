import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '../AuthContext';
import api from '../src/api';
import type { UsageReport } from './usageTypes';
import { canViewUsage, canExportUsage, usageDate, usageMoney, USAGE_MODULES, USAGE_STATUSES, type UsageDetails } from './usageHelpers';

const inputClass = 'border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm';
const panelClass = 'rounded-xl border border-slate-200 bg-white p-4 space-y-3';
const th = 'px-3 py-2 text-left whitespace-nowrap';
const initialDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

export const UsageStats: React.FC = () => {
  const { user } = useAuth();
  const allowed = canViewUsage(user);
  const exportAllowed = canExportUsage(user);
  const [period, setPeriod] = useState('30');
  const [startDate, setStartDate] = useState(initialDay);
  const [endDate, setEndDate] = useState(initialDay);
  const [userId, setUserId] = useState('');
  const [module, setModule] = useState('');
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: UsageReport } | null>(null);
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState('');
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [kind, setKind] = useState('all');
  const [page, setPage] = useState(1);
  const [detailRevision, setDetailRevision] = useState(0);
  const [details, setDetails] = useState<{ key: string; data: UsageDetails } | null>(null);
  const [detailError, setDetailError] = useState<{ key: string; text: string } | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [knownModules, setKnownModules] = useState<string[]>(Object.keys(USAGE_MODULES));
  const invalid = period === 'custom' && (!startDate || !endDate || startDate > endDate || (Date.parse(endDate) - Date.parse(startDate)) / 86400000 >= 365 || startDate > initialDay());
  const query = useMemo(() => {
    const q = new URLSearchParams(period === 'custom' ? { startDate, endDate } : { days: period });
    if (userId) q.set('userId', userId);
    if (module) q.set('module', module);
    if (status) q.set('status', status);
    return q.toString();
  }, [period, startDate, endDate, userId, module, status]);
  const key = `${user?.id || ''}:${allowed}:${query}:${revision}`;
  const report = result?.key === key ? result.data : null;
  const reportError = errorKey === key ? error : '';
  const detailKey = `${key}:${kind}:${page}:${detailRevision}`;
  const detailData = details?.key === detailKey ? details.data : null;

  useEffect(() => {
    if (!allowed || invalid) return;
    const controller = new AbortController();
    let live = true;
    setError(''); setExportError('');
    api.get<UsageReport>(`/usage/report?${query}`, { signal: controller.signal }).then(({ data }) => {
      if (!live) return;
      setResult({ key, data });
      setAccounts(previous => Array.from(new Map([...previous, ...data.users.map(u => ({ id: u.userId, name: u.displayName || u.username }))].map(u => [u.id, u])).values()));
      setKnownModules(previous => [...new Set([...previous, ...data.modules.map(m => m.module)])]);
    }).catch(() => { if (live) { setResult(null); setErrorKey(key); setError('统计加载失败，请重试。若持续失败，请确认数据库迁移及当前权限。'); } });
    return () => { live = false; controller.abort(); };
  }, [allowed, invalid, key, query]);

  useEffect(() => {
    if (!allowed || invalid || !report) return;
    const controller = new AbortController();
    let live = true;
    api.get<UsageDetails>(`/usage/details?${query}&kind=${kind}&page=${page}&pageSize=50`, { signal: controller.signal }).then(({ data }) => {
      if (live) setDetails({ key: detailKey, data });
    }).catch(() => { if (live) setDetailError({ key: detailKey, text: '明细加载失败，请重试。' }); });
    return () => { live = false; controller.abort(); };
  }, [allowed, invalid, report, query, kind, page, detailKey]);

  const change = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => { setter(e.target.value); setPage(1); };
  const drill = (nextKind: string, account?: string) => { setKind(nextKind); setPage(1); if (account !== undefined) setUserId(account); };
  const exportCsv = async () => {
    if (!exportAllowed || !report || exporting) return;
    setExporting(true); setExportError('');
    try {
      const response = await api.get(`/usage/export?${query}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = `usage-${report.meta.startDate.replace(/[^0-9-]/g, '')}-${report.meta.endDate.replace(/[^0-9-]/g, '')}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { setExportError('导出失败，请检查当前导出权限后重试。'); }
    finally { setExporting(false); }
  };
  if (!allowed) return <p role="alert">无使用统计查看权限</p>;
  return <div className="space-y-5 p-1 text-slate-700">
    <header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">使用统计</h2><p className="text-sm text-slate-500">按账号追溯业务操作与 AI 调用 · 北京时间（Asia/Shanghai）· 人民币预估费用</p></div><div className="flex gap-2"><button className={inputClass} onClick={() => setRevision(r => r + 1)}>刷新</button>{exportAllowed && <button className={inputClass} disabled={!report || exporting} onClick={exportCsv}>{exporting ? '导出中…' : '导出 CSV'}</button>}</div></header>
    <section className={`${panelClass} flex flex-wrap gap-3 items-end`} aria-label="统计筛选">
      <label>时间范围 <select aria-label="时间范围" className={inputClass} value={period} onChange={change(setPeriod)}>{['7','30','90','365'].map(d => <option key={d} value={d}>近 {d} 天（含今天）</option>)}<option value="custom">自定义日期</option></select></label>
      {period === 'custom' && <><label>开始日期 <input aria-label="开始日期" type="date" className={inputClass} value={startDate} max={initialDay()} onChange={change(setStartDate)} /></label><label>结束日期 <input aria-label="结束日期" type="date" className={inputClass} value={endDate} max={initialDay()} onChange={change(setEndDate)} /></label></>}
      <label>账号 <select aria-label="账号" className={inputClass} value={userId} onChange={change(setUserId)}><option value="">全部账号</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.id}</option>)}</select></label>
      <label>模块 <select aria-label="模块" className={inputClass} value={module} onChange={change(setModule)}><option value="">全部模块</option>{knownModules.map(m => <option key={m} value={m}>{USAGE_MODULES[m] || m}</option>)}</select></label>
      <label>结果 <select aria-label="结果" className={inputClass} value={status} onChange={change(setStatus)}><option value="">全部结果</option>{Object.entries(USAGE_STATUSES).map(([s,l]) => <option key={s} value={s}>{l}</option>)}</select></label>
    </section>
    {invalid && <p role="alert">请选择有效日期，开始日期不能晚于结束日期或今天，范围最多 365 天。</p>}
    {reportError && <div role="alert">{reportError} <button className={inputClass} onClick={() => setRevision(r => r + 1)}>重试</button></div>}
    {exportError && <p role="alert">{exportError}</p>}
    {!invalid && !report && !reportError && <p role="status">正在加载统计…</p>}
    {!invalid && report && <>
      <p className="text-xs text-slate-500">{report.meta.startDate} 至 {report.meta.endDate}（包含结束日，截至快照） · 更新于 {usageDate(report.meta.asOf)} · {report.meta.timezone} · {report.meta.version}</p>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[
        ['活跃账号', report.summary.activeUsers, '按所选范围去重，不能将每天活跃账号相加。', 'all'],
        ['业务操作', report.summary.operationCount, `影响条数 ${report.summary.affectedCount}；成功登录 ${report.summary.loginCount} 次。`, 'event'],
        ['成功生成次数', report.summary.generationCount, `分析调用 ${report.summary.analysisCount} 次；仅计成功生成。`, 'ai'],
        ['生成图片数', report.summary.imageCount, '供应商实际产出数量；删除图库不会减少历史产出。', 'ai'],
        ['人民币预估费用', usageMoney(report.summary.estimatedCost), `分析 ${usageMoney(report.summary.analysisCost)}；生成 ${usageMoney(report.summary.generationCost)}。未计价调用不视为零费用。`, 'ai'],
      ].map(([label,value,hint,k]) => <button key={String(label)} className={`${panelClass} text-left hover:border-indigo-400`} title={String(hint)} onClick={() => drill(String(k))}><p className="text-xs">{label}</p><p className="text-2xl font-bold text-indigo-700">{value}</p><p className="text-xs text-slate-500">{hint}</p></button>)}</div>
      <div className={`${panelClass} flex flex-wrap gap-5 text-sm`}><span><strong>当前图库图片数</strong>：{report.summary.currentGalleryCount}（当前存量，非期间产出）</span><span title="范围内有活动的日期去重，不能将各账号活跃天数相加。">活跃天数：{report.summary.activeDays}（日期去重）</span>{[['pendingCount','处理中'],['failedCount','失败'],['unknownCount','结果未知'],['unpricedCount','未计价']].map(([k,l]) => <span key={k}>{l}：{report.summary[k as 'pendingCount']}</span>)}</div>
      <section className={panelClass}><h3 className="font-semibold">每日趋势</h3><p className="text-xs text-slate-500">各指标分别展示，不堆叠相加；活跃账号为每日去重。</p>{report.timeline.length > 0 ? <ResponsiveContainer width="100%" height={280}><BarChart data={report.timeline}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={d => String(d).slice(5)} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="operationCount" name="业务操作" fill="#6366f1" /><Bar dataKey="generationCount" name="成功生成" fill="#10b981" /><Bar dataKey="activeUsers" name="活跃账号" fill="#f59e0b" /></BarChart></ResponsiveContainer> : <p>所选范围暂无活动</p>}</section>
      <section className={panelClass}><h3 className="font-semibold">模块分布</h3><div className="flex flex-wrap gap-3">{report.modules.map(m => <button key={m.module} className={inputClass} onClick={() => { setModule(m.module); setPage(1); }}>{USAGE_MODULES[m.module] || m.module}：操作 {m.operationCount} / 影响 {m.affectedCount} / 生成 {m.generationCount} / 分析 {m.analysisCount}</button>)}{!report.modules.length && <p>暂无模块活动</p>}</div></section>
      <section className={`${panelClass} overflow-x-auto`}><h3 className="font-semibold">账号统计</h3><table className="w-full text-sm"><thead><tr>{['账号','状态','活跃天数','登录','业务操作 / 影响条数','生成 / 图片','分析','预估费用（人民币）','最后登录（全历史）','最后活动（全历史）','明细'].map(h => <th className={th} key={h}>{h}</th>)}</tr></thead><tbody>{report.users.map(u => <tr key={u.userId} className="border-t"><td className={th}><strong>{u.displayName || u.username}</strong><div className="text-xs">@{u.username} · {u.role}</div></td><td className={th}>{u.isActive ? '启用' : '停用'}</td><td className={th}>{u.activeDays}</td><td className={th}>{u.loginCount}</td><td className={th}>{u.operationCount} / {u.affectedCount}</td><td className={th}>{u.generationCount} / {u.imageCount}</td><td className={th}>{u.analysisCount}</td><td className={th}>{usageMoney(u.estimatedCost)}</td><td className={th}>{usageDate(u.lastLogin)}</td><td className={th}>{usageDate(u.lastActivity)}</td><td className={th}><button className={inputClass} aria-label={`查看 ${u.displayName || u.username} 明细`} onClick={() => drill('all', u.userId)}>查看明细</button></td></tr>)}</tbody></table>{!report.users.length && <p>没有符合筛选的账号记录</p>}</section>
      <section className={`${panelClass} bg-amber-50`}><h3 className="font-semibold">历史参考（不计入新口径总量）</h3><p>原始活动 {report.quality.legacyEventCount} 条；历史生成记录 {report.quality.legacyGenerationCount} 条；历史上报估算 {usageMoney(report.quality.legacyEstimatedCost)}。</p><p>新口径开始记录：{usageDate(report.quality.nativeRecordingSince)}；未计价 {report.quality.unpricedCalls}；超时未完成 {report.quality.stalePendingCalls}；结果未知 {report.quality.unknownCalls}。</p>{report.quality.notes.map((n,i) => <p className="text-sm" key={i}>{n}</p>)}<button className={inputClass} onClick={() => drill('legacy')}>查看未核验历史</button> <button className={inputClass} onClick={() => drill('rebuilt')}>查看有证据的历史重建</button></section>
      <section className={panelClass} aria-label="操作和调用明细"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">操作和调用明细</h3><select aria-label="明细类型" className={inputClass} value={kind} onChange={change(setKind)}>{[['all','新口径全部'],['event','业务事件'],['ai','AI 调用'],['legacy','未核验历史'],['rebuilt','历史重建']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {detailError?.key === detailKey ? <p role="alert">{detailError.text} <button className={inputClass} onClick={() => setDetailRevision(r => r + 1)}>重试明细</button></p> : !detailData ? <p role="status">正在加载明细…</p> : <><p className="text-sm">共 {detailData.total} 条，第 {page} 页</p><div className="space-y-2">{detailData.items.map(item => <details key={`${item.type}:${item.id}`} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm">{usageDate(item.occurredAt)} · {item.actorName || item.userId} · {USAGE_MODULES[item.module] || item.module} / {item.action} · {USAGE_STATUSES[item.status] || item.status}</summary><dl className="grid sm:grid-cols-2 gap-2 text-xs mt-3 break-all">{Object.entries({ '记录 / 调用 ID': item.id, '类型': item.type, '账号 ID': item.userId, '业务对象': [item.objectType,item.objectId].filter(Boolean).join(' / '), '影响条数': item.affectedCount, '产出图片': item.outputCount, '模型': item.model, '人民币预估费用': item.type.includes('ai') ? usageMoney(item.estimatedCost) : undefined, '计价版本': item.pricingVersion, '操作关联 ID': item.operationId, '供应商请求 ID': item.providerRequestId, '下载状态': item.deliveryStatus, '图库保存状态': item.storageStatus, '来源': item.source, '可信度': ({ native: '新口径记录', rebuilt: '有证据的历史重建', legacy: '未核验历史' } as Record<string,string>)[item.provenance] || item.provenance, '原始来源': item.legacySource, '原始 ID': item.legacyId, '迁移批次': item.migrationBatch, '修正规则': item.ruleVersion }).filter(([,v]) => v !== undefined && v !== null && v !== '').map(([k,v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd>{String(v)}</dd></div>)}</dl></details>)}</div>{!detailData.items.length && <p>没有符合筛选的明细</p>}<div className="flex gap-3"><button className={inputClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><button className={inputClass} disabled={page * detailData.pageSize >= detailData.total} onClick={() => setPage(p => p + 1)}>下一页</button></div></>}
      </section>
    </>}
  </div>;
};
