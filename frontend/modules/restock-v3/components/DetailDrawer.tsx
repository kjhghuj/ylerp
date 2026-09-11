/** 商品详情抽屉：来源与质量、逐仓库存、在途分类、双库存轨迹、计算过程、人工调整与关联更正 */
import { useState } from 'react';
import Drawer from './ui/Drawer';
import type { ConfirmEdit, MatchType, RestockResultItem } from '../types';
import {
  INBOUND_CATEGORY_LABELS,
  MATCH_TYPE_LABELS,
  QUALITY_LABELS,
  RESTOCK_STATUS_META,
  RULE_SOURCE_LABELS,
  SKU_SOURCE_LABELS,
  formatInt,
  formatNumber,
} from '../labels';

interface DetailDrawerProps {
  item: RestockResultItem | null;
  /** 结果过期时明确标注当前展示的版本 */
  stale: boolean;
  edit?: ConfirmEdit;
  onEdit: (sku: string, edit: ConfirmEdit | null) => void;
  canEdit: boolean;
  onRemoveMapping: (sku: string) => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="tabular-nums text-right" style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function TrajectoryTable({ title, sim }: { title: string; sim: NonNullable<RestockResultItem['stockSim']> }) {
  return (
    <div className="mb-2">
      <p className="text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>{title}</p>
      <div className="overflow-x-auto rounded-lg border max-h-44 overflow-y-auto" style={{ borderColor: 'var(--border-light)' }}>
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0">
            <tr style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>
              <th className="px-2 py-1 text-left font-medium">日期</th>
              <th className="px-2 py-1 text-right font-medium">期初</th>
              <th className="px-2 py-1 text-right font-medium">到货</th>
              <th className="px-2 py-1 text-right font-medium">需求</th>
              <th className="px-2 py-1 text-right font-medium">期末</th>
            </tr>
          </thead>
          <tbody>
            {sim.map(point => (
              <tr
                key={point.date}
                style={{
                  borderTop: '1px solid var(--border-light)',
                  backgroundColor: point.stockout ? 'rgba(220, 38, 38, 0.07)' : undefined,
                }}
              >
                <td className="px-2 py-1">{point.date}{point.stockout && <span style={{ color: '#dc2626' }}> 断</span>}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatInt(point.startStock)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatInt(point.arrivals)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatNumber(point.demand, 1)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatInt(point.endStock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DetailDrawer({ item, stale, edit, onEdit, canEdit, onRemoveMapping, onClose }: DetailDrawerProps) {
  const [qtyDraft, setQtyDraft] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');
  const [showReason, setShowReason] = useState(false);

  if (!item) return null;
  const statusMeta = RESTOCK_STATUS_META[item.status];
  const quality = item.salesQuality;
  const qualityColor = quality.status === 'ok' ? '#16a34a' : quality.status === 'zero' ? '#64748b' : '#d97706';
  const effectiveQty = edit?.confirmedQty ?? item.suggestedQty;
  const effectiveReason = edit?.adjustReason ?? '';
  const isAdjusted = edit?.confirmedQty !== undefined;
  const deletableMapping = item.matchType === 'shop-mapping' || item.matchType === 'site-mapping';

  const applyAdjust = () => {
    const raw = qtyDraft.trim();
    if (raw === '' && reasonDraft.trim() === '') {
      onEdit(item.sku, null);
      setQtyDraft('');
      setReasonDraft('');
      setShowReason(false);
      return;
    }
    if (raw === '') {
      // 只填原因：保留为说明
      onEdit(item.sku, { confirmedQty: null, adjustReason: reasonDraft.trim() });
      return;
    }
    // 严格整数校验（拒绝 1.5 / 1e3 / 负数）
    if (!/^\d{1,9}$/.test(raw)) return;
    const parsed = Number(raw);
    if (parsed !== item.suggestedQty && !reasonDraft.trim()) {
      setShowReason(true);
      return;
    }
    onEdit(item.sku, {
      confirmedQty: parsed,
      adjustReason: reasonDraft.trim(),
    });
    setQtyDraft('');
    setReasonDraft('');
    setShowReason(false);
  };

  return (
    <Drawer
      open={Boolean(item)}
      onClose={onClose}
      title={`${item.sku}`}
      subtitle={`${item.name} · ${statusMeta.label}${stale ? ' · 结果已过期（展示旧条件下的计算）' : ''}`}
      width={660}
    >
      {stale && (
        <p className="text-[12px] mb-3 px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(217, 119, 6, 0.1)', color: '#b45309' }} role="status">
          条件已变化：以下内容属于过期结果（计算于 {item.planningDate}），请重新计算后查看新依据。
        </p>
      )}

      {/* 基础结论 */}
      <Section title="补货结论">
        <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-light)' }}>
          <Row label="状态" value={
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusMeta.color }} />
              {statusMeta.label}
            </span>
          } />
          <Row label="建议补货量" value={<b>{formatInt(item.suggestedQty)}</b>} />
          <Row label="说明" value={<span className="text-left inline-block">{item.reason}</span>} />
          {item.reviewReason && <Row label="待核对原因" value={item.reviewReason} />}
          {item.gapBeforeArrival > 0 && (
            <Row label="到仓前缺口（丢失销量，本次订单无法修复）" value={<span style={{ color: '#dc2626' }}>{formatInt(item.gapBeforeArrival)} 件</span>} />
          )}
          {item.gapAfterArrival > 0 && (
            <Row label="到仓后基线缺口（不补货轨迹，由本次建议量覆盖）" value={formatNumber(item.gapAfterArrival, 2)} />
          )}
          {item.baselineEndSafetyGap > 0 && (
            <Row label="基线期末安全缺口（不补货轨迹，由本次建议量覆盖）" value={formatNumber(item.baselineEndSafetyGap, 2)} />
          )}
          {item.endSafetyGap > 0 && (
            <Row label="采用建议量后剩余安全缺口（预期为 0，大于 0 请核对）" value={<span style={{ color: '#dc2626' }}>{formatNumber(item.endSafetyGap, 2)} 件</span>} />
          )}
          {item.baselineStockoutDate && (
            <Row label={`不补货时的首断货日${item.stockoutDate ? '（采用建议量后仍断货：' + item.stockoutDate + '）' : ''}`} value={<span style={{ color: item.stockoutDate ? '#dc2626' : '#b45309' }}>{item.baselineStockoutDate}</span>} />
          )}
          {item.warnings.length > 0 && (
            <div className="mt-1.5 pt-1.5" style={{ borderTop: '1px dashed var(--border-light)' }}>
              {item.warnings.map(warning => (
                <p key={warning} className="text-[12px]" style={{ color: '#b45309' }}>⚠ {warning}</p>
              ))}
            </div>
          )}
          {!item.executable && (
            <p className="text-[12px] mt-1.5" style={{ color: '#7c3aed' }}>
              该商品当前不可执行（库存未知 / 零销量 / 数据质量不足），不能保存为可执行计划。
            </p>
          )}
        </div>
      </Section>

      {/* 人工调整 */}
      <Section title="人工确认调整（不覆盖系统建议量）">
        {item.executable ? (
          <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-light)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                确认补货量
                <input
                  type="text"
                  inputMode="numeric"
                  value={qtyDraft}
                  placeholder={String(item.suggestedQty)}
                  disabled={!canEdit}
                  onChange={event => {
                    const raw = event.target.value;
                    if (raw !== '' && !/^\d{1,9}$/.test(raw)) return;
                    setQtyDraft(raw);
                    if (raw !== '' && Number(raw) !== item.suggestedQty) setShowReason(true);
                  }}
                  aria-label={`${item.sku} 人工确认补货量`}
                  className="w-24 rounded border px-1.5 py-1 text-right text-[13px] tabular-nums disabled:opacity-40"
                  style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </label>
              {(showReason || isAdjusted || effectiveReason) && (
                <label className="flex items-center gap-1.5 text-[12px] flex-1 min-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
                  调整原因
                  <input
                    type="text"
                    value={reasonDraft || (showReason ? '' : effectiveReason)}
                    placeholder="数量与建议不一致时必填"
                    disabled={!canEdit}
                    maxLength={200}
                    onChange={event => setReasonDraft(event.target.value)}
                    aria-label={`${item.sku} 调整原因`}
                    className="flex-1 rounded border px-1.5 py-1 text-[13px] disabled:opacity-40"
                    style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </label>
              )}
              <button
                type="button"
                disabled={!canEdit}
                onClick={applyAdjust}
                className="rounded-lg border px-2 py-1 text-[12px] disabled:opacity-40"
                style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
              >
                应用
              </button>
              {isAdjusted && (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => { onEdit(item.sku, null); setQtyDraft(''); setReasonDraft(''); setShowReason(false); }}
                  className="text-[12px] underline disabled:opacity-40"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  恢复建议量
                </button>
              )}
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              当前生效确认量：<b className="tabular-nums">{formatInt(effectiveQty)}</b>（系统建议 {formatInt(item.suggestedQty)}）
              {isAdjusted && ' · 已人工调整'}
            </p>
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>不可执行商品不支持人工调整数量。</p>
        )}
      </Section>

      {/* 来源与关联 */}
      <Section title={`销量来源（${item.salesSources.length}）与 SKU 关联`}>
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            关联方式：<b>{MATCH_TYPE_LABELS[item.matchType as MatchType] ?? item.matchType}</b>
            {item.matchType === 'exact-yc' && '（规格货号与元仓 customerSku 同码直连，未使用本地档案）'}
          </p>
          {canEdit && deletableMapping && (
            <button
              type="button"
              onClick={() => onRemoveMapping(item.sku)}
              className="ml-auto text-[11px] underline"
              style={{ color: '#b45309' }}
              title="删除已有映射（店铺级或站点级），恢复到自动匹配/待核对；删除后需重新计算"
            >
              删除映射（恢复继承）
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-light)' }}>
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>
                <th className="px-2 py-1 text-left font-medium">店铺</th>
                <th className="px-2 py-1 text-left font-medium">规格货号（来源）</th>
                <th className="px-2 py-1 text-left font-medium">商品 / 规格</th>
                <th className="px-2 py-1 text-right font-medium">件数</th>
                <th className="px-2 py-1 text-right font-medium">观测天数</th>
                <th className="px-2 py-1 text-right font-medium">分母</th>
                <th className="px-2 py-1 text-right font-medium">增长</th>
              </tr>
            </thead>
            <tbody>
              {item.salesSources.map(source => (
                <tr key={`${source.shopId}-${source.identityKey ?? source.externalSku}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                  <td className="px-2 py-1" style={{ color: 'var(--text-primary)' }}>{source.shopName}</td>
                  <td className="px-2 py-1" style={{ color: 'var(--text-primary)' }}>
                    {source.displaySku}
                    <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>（{SKU_SOURCE_LABELS[source.skuSource]}）</span>
                  </td>
                  <td className="px-2 py-1" style={{ color: 'var(--text-secondary)' }}>
                    {source.itemName}{source.variationName ? ` / ${source.variationName}` : ''}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatInt(source.units)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{source.observedDays}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{source.denominator ?? '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatNumber(source.growthPercent ?? 0, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 销量观测质量 */}
      <Section title="销量观测与数据质量">
        <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-light)' }}>
          <Row label="质量状态" value={<span style={{ color: qualityColor }}>{QUALITY_LABELS[quality.status]}{quality.executable === false ? '（不可执行）' : quality.status === 'insufficient' ? '（受限估算）' : ''}</span>} />
          <Row label="有效观测天数（最差来源）" value={`${quality.observedDays} / 店铺上传 ${quality.shopObservedDays} 天（缺 ${quality.missingDays} 天）`} />
          <Row label="覆盖率" value={`${Math.round(quality.coverage * 100)}%`} />
          <Row label="最新观测日" value={quality.latestObservedDate ?? '—'} />
          <Row label="合计件数（已下订单）" value={formatInt(quality.totalUnits)} />
          <Row label="预测日销" value={`${formatNumber(item.dailySales, 2)} × (1 + ${formatNumber(item.growthPercent, 1)}%) = ${formatNumber(item.adjustedDailySales, 2)}`} />
        </div>
      </Section>

      {/* 逐仓库存 */}
      <Section title="元仓可用库存（逐仓）">
        {item.stockByWarehouse.length > 0 ? (
          <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-light)' }}>
            {item.stockByWarehouse.map(warehouse => (
              <Row key={warehouse.warehouseCode} label={`${warehouse.warehouseCode}${warehouse.warehouseName ? ` · ${warehouse.warehouseName}` : ''}`} value={formatInt(warehouse.available)} />
            ))}
            <Row label="合计" value={<b>{formatInt(item.availableStock)}</b>} />
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: '#b91c1c' }}>
            元仓未返回该货品的库存记录——可用库存未知（不等于 0），建议量不可执行，请先在异常处理区核对。
          </p>
        )}
      </Section>

      {/* 在途明细 */}
      <Section title="在途明细（按 ETA 分类，可用区间左闭右开）">
        {item.inboundBreakdown.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-light)' }}>
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>
                  <th className="px-2 py-1 text-left font-medium">入库单</th>
                  <th className="px-2 py-1 text-right font-medium">剩余量</th>
                  <th className="px-2 py-1 text-left font-medium">预计到仓</th>
                  <th className="px-2 py-1 text-left font-medium">类别</th>
                </tr>
              </thead>
              <tbody>
                {item.inboundBreakdown.map((entry, index) => (
                  <tr key={`${entry.orderNumber}-${entry.detailId ?? index}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td className="px-2 py-1" style={{ color: 'var(--text-primary)' }}>{entry.orderNumber}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{formatInt(entry.remaining)}</td>
                    <td className="px-2 py-1">{entry.eta ?? '无 ETA'}</td>
                    <td className="px-2 py-1" style={{ color: entry.category.startsWith('before') || entry.category.startsWith('during') ? '#16a34a' : 'var(--text-tertiary)' }}>
                      {INBOUND_CATEGORY_LABELS[entry.category]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>无有效在途</p>
        )}
      </Section>

      {/* 双轨迹 */}
      {item.stockSim && item.stockSim.length > 0 && (
        <Section title="库存逐日轨迹（丢失销量假设：断货日未满足需求损失，不积压）">
          <TrajectoryTable title="采用建议量后：" sim={item.stockSim} />
          {item.baselineStockSim && item.baselineStockSim.length > 0 && (
            <TrajectoryTable title="不新增补货时（对照）：" sim={item.baselineStockSim} />
          )}
        </Section>
      )}

      {/* 计算过程 */}
      <Section title="计算过程（与建议量/状态/导出同源）">
        <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-light)' }}>
          <Row label={`计划日 → 到仓日（时效 ${item.leadTimeDays} 天，${RULE_SOURCE_LABELS[item.ruleSources.leadTimeDays]}）`} value={`${item.planningDate} → ${item.arrivalDate}`} />
          <Row label={`目标覆盖日（覆盖 ${item.coverageDays} 天 + 安全 ${item.safetyDays} 天，${RULE_SOURCE_LABELS[item.ruleSources.safetyDays]}）`} value={item.targetDate} />
          <Row label="提前期需求" value={`${formatNumber(item.adjustedDailySales, 2)} × ${item.leadTimeDays} = ${formatNumber(item.transportDemand, 1)}`} />
          <Row label="到仓库存（建议量轨迹中到仓日期末）" value={formatInt(item.arrivalStock)} />
          <Row label="覆盖期需求" value={`${formatNumber(item.adjustedDailySales, 2)} × ${item.coverageDays} = ${formatNumber(item.coverageDemand, 1)}`} />
          <Row label="安全库存目标" value={`${formatNumber(item.adjustedDailySales, 2)} × ${item.safetyDays} = ${formatNumber(item.safetyStockDemand, 1)}`} />
          {item.suggestedQtyRaw !== null && item.suggestedQtyRaw !== undefined ? (
            <Row
              label="建议量等式（基线轨迹推导，⌈⌉ = 向上取整）"
              value={
                <span>
                  ⌈{formatNumber(item.gapAfterArrival, 2)}（到仓后基线缺口）+ {formatNumber(item.baselineEndSafetyGap, 2)}（基线期末安全缺口）⌉ = <b>{formatInt(item.suggestedQty)}</b>
                  {!Number.isInteger(item.suggestedQtyRaw) && `（原始和 ${formatNumber(item.suggestedQtyRaw, 2)}，取整进位）`}
                  {item.suggestedQty === 0 && item.suggestedQtyRaw > 0 && '（该商品当前不可执行或无销量，建议量按 0 输出）'}
                </span>
              }
            />
          ) : (
            <Row
              label="建议量组成（基线轨迹缺口）"
              value={`${formatNumber(item.gapAfterArrival, 2)}（到仓后基线缺口）+ ${formatNumber(item.baselineEndSafetyGap ?? 0, 2)}（基线期末安全缺口）= ${formatInt(item.suggestedQty)}`}
            />
          )}
          {item.endSafetyGap > 0 && (
            <Row label="采用建议量后剩余安全缺口" value={formatNumber(item.endSafetyGap, 2)} />
          )}
          <Row label="估算金额" value={item.costUnknown ? '成本未知（本地无档案）' : `建议 ${item.estimatedCost ?? '—'}`} />
        </div>
      </Section>
    </Drawer>
  );
}
