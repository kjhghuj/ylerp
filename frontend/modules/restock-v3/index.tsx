/**
 * 补货工作台（补货V3）：店铺（需求源）× 库存池（供应源）× 元仓直连。
 * 布局：顶部工具栏 → 数据状态条 → 紧凑摘要 → 异常处理区（可折叠）→ 主表格 → 底部选中操作栏；
 * 详情/参数/计划/库存池为抽屉。结果绑定条件指纹，条件变化即过期（禁导出/保存/复制）；
 * 刷新失败保留旧快照但标记禁用；可执行状态前后端双重校验。
 */
import { useCallback, useMemo, useState } from 'react';
import { Loader2, PackageCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { hasPermission } from '../../components/PermissionTree';
import { useToast } from '../../components/Toast';
import { useWorkbench, type InitialWorkbenchParams } from './useWorkbench';
import * as restockApi from './api';
import Toolbar from './components/Toolbar';
import StatusStrip from './components/StatusStrip';
import SummaryBar, { type TableFilter } from './components/SummaryBar';
import ResultsTable from './components/ResultsTable';
import ReviewPanel from './components/ReviewPanel';
import DetailDrawer from './components/DetailDrawer';
import ParamsDrawer from './components/ParamsDrawer';
import SelectionBar from './components/SelectionBar';
import PlanHistoryDrawer from './components/PlanHistoryDrawer';
import PoolManagerDrawer from './components/PoolManagerDrawer';
import type { RestockResultItem } from './types';

export interface RestockV3Props {
  initialParams?: InitialWorkbenchParams;
}

const csvEscape = (value: unknown): string => {
  let text = value === null || value === undefined ? '' : String(value);
  // CSV 公式注入防护：文本以 = + - @ 制表/回车开头时前缀单引号
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export default function RestockV3({ initialParams }: RestockV3Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const workbench = useWorkbench(initialParams);
  const [tableFilter, setTableFilter] = useState<TableFilter>('restock');
  const [reviewOpen, setReviewOpen] = useState(false);
  /** 详情抽屉绑定 SKU（非对象）：结果更新时自动切换到新结果中的同一商品或关闭 */
  const [detailSku, setDetailSku] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [poolsOpen, setPoolsOpen] = useState(false);

  const canEdit = !user || user.role === 'owner' || hasPermission(user.permissions || [], 'restock-v3.refresh');

  // 详情内容从当前 result 派生：切换条件/重新计算后自动跟随对应版本，不静默保留旧商品数据
  const detailItem: RestockResultItem | null = useMemo(() => {
    if (!detailSku || !workbench.result) return null;
    return workbench.result.items.find(item => item.sku === detailSku) ?? null;
  }, [detailSku, workbench.result]);

  const onCompute = useCallback(async () => {
    await workbench.compute();
  }, [workbench]);

  const onRefreshSource = useCallback(async () => {
    await workbench.compute({ forceRefresh: true });
  }, [workbench]);

  const handleSavePlan = useCallback(async (name: string) => {
    try {
      await workbench.savePlanFromResult(name, Array.from(workbench.selectedSkus));
      showToast('计划已保存为草稿（含完整计算依据快照），可在计划列表中确认或导出', 'success');
      setPlansOpen(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存计划失败', 'error');
    }
  }, [workbench, showToast]);

  const exportItems = useCallback((items: RestockResultItem[], label: string) => {
    const result = workbench.result;
    if (!result) return;
    const lines: string[] = [];
    lines.push(`导出范围,${csvEscape(label)}`);
    lines.push(`站点,${csvEscape(result.site)}`);
    lines.push(`店铺,${csvEscape(result.metadata.shopIds.map(shop => shop.name).join(' | '))}`);
    lines.push(`统计区间,${result.metadata.from} ~ ${result.metadata.to},口径,已下订单件数`);
    lines.push(`数据获取,${csvEscape(result.snapshot.stockFetchedAt)},算法,${csvEscape(result.snapshot.algorithmVersion)},条件指纹,${csvEscape(result.snapshot.fingerprint)}`);
    lines.push('');
    lines.push('SKU,名称,状态,预测日销,可用库存,确定在途,预计断货日,建议补货量,确认补货量,是否可执行');
    for (const item of items) {
      const edit = workbench.edits[item.sku];
      lines.push([
        csvEscape(item.sku),
        csvEscape(item.name),
        csvEscape(item.status),
        csvEscape(item.adjustedDailySales),
        csvEscape(item.stockSource === 'missing' ? '未知' : item.availableStock),
        csvEscape(item.inTransit),
        csvEscape(item.stockoutDate ?? ''),
        csvEscape(item.suggestedQty),
        csvEscape(item.executable ? (edit?.confirmedQty ?? item.suggestedQty) : ''),
        csvEscape(item.executable ? '是' : '否（库存未知/零销量/数据质量不足）'),
      ].join(','));
    }
    const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `补货建议_${result.metadata.from}_${result.metadata.to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [workbench]);

  const handleExportAll = useCallback(() => {
    if (!workbench.result) return;
    exportItems(workbench.result.items, '全部核对结果');
  }, [workbench.result, exportItems]);

  const handleExportSelected = useCallback(() => {
    if (!workbench.result) return;
    const executable = workbench.result.items.filter(item => workbench.selectedSkus.has(item.sku) && item.executable);
    exportItems(executable, '所选可执行补货清单');
  }, [workbench.result, workbench.selectedSkus, exportItems]);

  const handleCopySelected = useCallback(async () => {
    const result = workbench.result;
    if (!result) return;
    const rows = result.items
      .filter(item => workbench.selectedSkus.has(item.sku) && item.executable)
      .map(item => {
        const edit = workbench.edits[item.sku];
        return `${item.sku}\t${edit?.confirmedQty ?? item.suggestedQty}`;
      });
    if (rows.length === 0) return;
    try {
      await navigator.clipboard.writeText(rows.join('\n'));
      showToast(`已复制 ${rows.length} 行（SKU + 确认量）`, 'success');
    } catch {
      showToast('剪贴板不可用，请手动选择表格内容复制', 'error');
    }
  }, [workbench, showToast]);

  const emptyState = useMemo(() => {
    if (workbench.shopsLoading) {
      return { icon: <Loader2 size={18} className="animate-spin" />, title: '加载店铺列表…', hint: '' };
    }
    if (workbench.shopsError) {
      return {
        icon: <RefreshCw size={18} />,
        title: workbench.shopsError,
        hint: '点击右上角刷新或稍后重试',
      };
    }
    if (workbench.shops.length === 0) {
      return {
        icon: <PackageCheck size={18} />,
        title: '还没有商品分析店铺',
        hint: '先到「商品分析」添加店铺并上传每日报表，再回来生成补货建议',
      };
    }
    return null;
  }, [workbench.shopsLoading, workbench.shopsError, workbench.shops.length]);

  return (
    <div className="flex flex-col min-h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Toolbar
        shops={workbench.shops}
        shopsLoading={workbench.shopsLoading}
        pools={workbench.pools}
        selectedShopIds={workbench.selectedShopIds}
        onShopIdsChange={ids => workbench.setSelectedShopIds(ids)}
        poolId={workbench.poolId}
        onPoolChange={workbench.setPoolId}
        rangePreset={workbench.rangePreset}
        onPresetChange={workbench.applyPreset}
        fromDate={workbench.fromDate}
        toDate={workbench.toDate}
        onRangeChange={(from, to) => { workbench.setFromDate(from); workbench.setToDate(to); }}
        params={workbench.params}
        onOpenParams={() => setParamsOpen(true)}
        onOpenPools={() => setPoolsOpen(true)}
        computing={workbench.computing}
        planSaving={workbench.planSaving}
        hasResult={workbench.result !== null}
        onRefreshSource={onRefreshSource}
        onRecompute={onCompute}
        onCompute={onCompute}
      />

      {/* 错误与提示 */}
      {workbench.computeError && (
        <div
          className="mx-4 mt-3 rounded-lg border px-3 py-2 text-[13px]"
          style={{
            borderColor: workbench.refreshFailed ? 'rgba(217, 119, 6, 0.4)' : 'rgba(220, 38, 38, 0.4)',
            backgroundColor: workbench.refreshFailed ? 'rgba(217, 119, 6, 0.06)' : 'rgba(220, 38, 38, 0.06)',
            color: workbench.refreshFailed ? '#b45309' : '#b91c1c',
          }}
          role="alert"
        >
          {workbench.refreshFailed
            ? `刷新源数据失败：${workbench.computeError}。下方展示的是此前旧快照的结果，保存/导出/复制已禁用；条件未变化时可直接重试。`
            : workbench.computeError}
          <button
            type="button"
            onClick={onCompute}
            className="ml-2 underline"
          >
            重试
          </button>
        </div>
      )}

      {workbench.result ? (
        <>
          <StatusStrip result={workbench.result} stale={workbench.isStale} onOpenReview={() => setReviewOpen(true)} />
          <SummaryBar result={workbench.result} filter={tableFilter} onFilterChange={setTableFilter} />
          <div className="flex-1 min-h-0 flex flex-col pt-2">
            <ReviewPanel
              review={workbench.result.review}
              site={workbench.result.site}
              canEdit={canEdit}
              open={reviewOpen}
              onOpenChange={setReviewOpen}
              onMappingSaved={() => {
                workbench.bumpDataRevision();
                showToast('映射已保存；结果已标记为过期，请重新计算', 'info');
              }}
            />
            <ResultsTable
              result={workbench.result}
              filter={tableFilter}
              onFilterChange={setTableFilter}
              edits={workbench.edits}
              onEdit={workbench.setEdit}
              selectedSkus={workbench.selectedSkus}
              onToggleSelect={workbench.toggleSelected}
              onSelectPage={(skus, selected) => {
                // 不可执行项不可批量勾选
                const allowed = skus.filter(sku => {
                  const item = workbench.result?.items.find(candidate => candidate.sku === sku);
                  return item?.executable === true;
                });
                const next = new Set(workbench.selectedSkus);
                for (const sku of allowed) {
                  if (selected) next.add(sku);
                  else next.delete(sku);
                }
                workbench.setSelectedSkus(Array.from(next));
              }}
              onOpenDetail={item => setDetailSku(item.sku)}
            />
          </div>
          <SelectionBar
            result={workbench.result}
            stale={workbench.isStale}
            refreshFailed={workbench.refreshFailed}
            canBatch={workbench.canBatch}
            selectedSkus={workbench.selectedSkus}
            selectedExecutableSkus={workbench.result.items
              .filter(item => workbench.selectedSkus.has(item.sku) && item.executable)
              .map(item => item.sku)}
            edits={workbench.edits}
            planSaving={workbench.planSaving}
            canEdit={canEdit}
            onSavePlan={name => void handleSavePlan(name)}
            onOpenPlans={() => setPlansOpen(true)}
            onExportAll={handleExportAll}
            onExportSelected={handleExportSelected}
            onCopySelected={() => void handleCopySelected()}
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-20 text-center px-6">
          {emptyState ? (
            <>
              <span style={{ color: 'var(--text-tertiary)' }}>{emptyState.icon}</span>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{emptyState.title}</p>
              {emptyState.hint && <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{emptyState.hint}</p>}
            </>
          ) : workbench.computing ? (
            <>
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>正在拉取销量与元仓库存并计算…</p>
            </>
          ) : (
            <>
              <PackageCheck size={22} style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>选择店铺与区间后计算补货建议</p>
              <p className="text-[13px] max-w-md" style={{ color: 'var(--text-tertiary)' }}>
                正常商品自动关联（店铺映射 → 元仓同码 → 站点映射）并直接计算；
                未匹配或冲突商品会进入「待核对」单独处理。日销口径 = 已下订单件数 ÷ 统计天数。
              </p>
            </>
          )}
          {workbench.shopsError && (
            <button
              type="button"
              onClick={() => void workbench.loadShops()}
              className="mt-2 rounded-lg border px-3 py-1.5 text-[13px]"
              style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
            >
              重新加载店铺
            </button>
          )}
        </div>
      )}

      <DetailDrawer
        item={detailItem}
        stale={workbench.isStale}
        edit={detailSku ? workbench.edits[detailSku] : undefined}
        onEdit={(sku, edit) => workbench.setEdit(sku, edit)}
        canEdit={canEdit}
        onRemoveMapping={sku => {
          const item = workbench.result?.items.find(candidate => candidate.sku === sku);
          const shopId = item?.salesSources[0]?.shopId ?? workbench.selectedShopIds[0];
          if (!shopId || !item) return;
          const scope = item.matchType === 'site-mapping' ? 'site' : 'shop';
          const externalSku = item.salesSources[0]?.externalSku ?? sku;
          void restockApi.deleteMapping({ shopId, externalSku, scope })
            .then(() => {
              workbench.bumpDataRevision();
              showToast(`已删除 ${sku} 的映射（${scope === 'site' ? '站点级' : '店铺级'}），恢复继承；请重新计算`, 'info');
            })
            .catch(error => showToast(error instanceof Error ? error.message : '删除映射失败', 'error'));
        }}
        onClose={() => setDetailSku(null)}
      />
      <ParamsDrawer
        open={paramsOpen}
        onClose={() => setParamsOpen(false)}
        params={workbench.params}
        onParamsChange={workbench.setParams}
        shopId={workbench.selectedShopIds[0] ?? null}
        canEdit={canEdit}
        onRuleSaved={() => {
          workbench.bumpDataRevision();
          showToast('规则已变更；结果已标记为过期，请重新计算', 'info');
        }}
      />
      <PlanHistoryDrawer
        open={plansOpen}
        onClose={() => setPlansOpen(false)}
        canEdit={canEdit}
        onNotice={message => showToast(message, 'info')}
        onPlansChanged={() => { void workbench.refreshPlans(); }}
      />
      <PoolManagerDrawer
        open={poolsOpen}
        onClose={() => setPoolsOpen(false)}
        pools={workbench.pools}
        shops={workbench.shops}
        canEdit={canEdit}
        onPoolsChanged={() => { void workbench.loadShops(); }}
        onNotice={message => showToast(message, 'info')}
      />
    </div>
  );
}
