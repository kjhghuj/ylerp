/** 参数抽屉：全局时效/安全/增长/日期 + 高级设置（自定义分母）+ SKU 覆盖规则（新增/恢复继承/作用域隔离） */
import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, Save } from 'lucide-react';
import Drawer from './ui/Drawer';
import type { SkuRuleRow } from '../types';
import type { WorkbenchParams } from '../useWorkbench';
import * as restockApi from '../api';
import { formatNumber } from '../labels';

interface ParamsDrawerProps {
  open: boolean;
  onClose: () => void;
  params: WorkbenchParams;
  onParamsChange: (next: WorkbenchParams) => void;
  shopId: string | null;
  canEdit: boolean;
  onRuleSaved: () => void;
}

interface RuleDraft {
  leadTimeDays: string;
  safetyDays: string;
  growthPercent: string;
}

const emptyDraft: RuleDraft = { leadTimeDays: '', safetyDays: '', growthPercent: '' };

/** 数字输入解析：空字符串 → null（继承）；严格非负整数；增长允许 1 位小数 */
const parseIntField = (value: string): number | null | 'invalid' => {
  if (value.trim() === '') return null;
  if (!/^\d{1,4}$/.test(value.trim())) return 'invalid';
  return Number.parseInt(value, 10);
};

const parseGrowthField = (value: string): number | null | 'invalid' => {
  if (value.trim() === '') return null;
  if (!/^\d{1,4}(\.\d)?$/.test(value.trim())) return 'invalid';
  return Number.parseFloat(value);
};

export default function ParamsDrawer(props: ParamsDrawerProps) {
  const { open, onClose, params, onParamsChange, shopId, canEdit, onRuleSaved } = props;
  const [rules, setRules] = useState<SkuRuleRow[]>([]);
  /** 编辑状态按 `${sku}:${scope}` 隔离：同 SKU 不同作用域互不串扰 */
  const [ruleEdits, setRuleEdits] = useState<Record<string, RuleDraft>>({});
  const [newSku, setNewSku] = useState('');
  const [newDraft, setNewDraft] = useState<RuleDraft>(emptyDraft);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    if (!shopId) return;
    try {
      const payload = await restockApi.fetchSkuRules(shopId);
      setRules(payload.rules);
    } catch {
      setRules([]);
    }
  }, [shopId]);

  useEffect(() => {
    if (open) void loadRules();
  }, [open, loadRules]);

  const editKeyOf = (rule: SkuRuleRow) => `${rule.sku}:${rule.scope}`;
  const draftOf = (rule: SkuRuleRow): RuleDraft => ruleEdits[editKeyOf(rule)] ?? {
    leadTimeDays: rule.leadTimeDays?.toString() ?? '',
    safetyDays: rule.safetyDays?.toString() ?? '',
    growthPercent: rule.growthPercent?.toString() ?? '',
  };

  const saveRule = async (sku: string, scope: 'shop' | 'site', draft: RuleDraft) => {
    if (!shopId) return;
    const lead = parseIntField(draft.leadTimeDays);
    const safety = parseIntField(draft.safetyDays);
    const growth = parseGrowthField(draft.growthPercent);
    if (lead === 'invalid' || safety === 'invalid' || growth === 'invalid') {
      setRuleError('天数需为非负整数，增长率允许一位小数');
      return;
    }
    setBusyKey(`${sku}:${scope}`);
    setRuleError(null);
    try {
      await restockApi.saveSkuRule({ shopId, sku, leadTimeDays: lead, safetyDays: safety, growthPercent: growth, scope });
      setRuleEdits(previous => {
        const next = { ...previous };
        delete next[`${sku}:${scope}`];
        return next;
      });
      await loadRules();
      onRuleSaved();
    } catch (saveError) {
      setRuleError(saveError instanceof Error ? saveError.message : '保存规则失败');
    } finally {
      setBusyKey(null);
    }
  };

  /** 恢复继承 = 删除该作用域的覆盖规则 */
  const restoreInherit = async (sku: string, scope: 'shop' | 'site') => {
    if (!shopId) return;
    setBusyKey(`${sku}:${scope}`);
    setRuleError(null);
    try {
      await restockApi.deleteSkuRule(shopId, sku, scope);
      setRuleEdits(previous => {
        const next = { ...previous };
        delete next[`${sku}:${scope}`];
        return next;
      });
      await loadRules();
      onRuleSaved();
    } catch (restoreError) {
      setRuleError(restoreError instanceof Error ? restoreError.message : '恢复继承失败');
    } finally {
      setBusyKey(null);
    }
  };

  const createNewRule = async () => {
    const sku = newSku.trim().toUpperCase();
    if (!sku) return;
    await saveRule(sku, 'shop', newDraft);
    setNewSku('');
    setNewDraft(emptyDraft);
  };

  const numberField = (
    label: string,
    key: keyof WorkbenchParams,
    props2: { min?: number; max?: number; help?: string } = {},
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input
        type="number"
        min={props2.min}
        max={props2.max}
        value={String(params[key])}
        onChange={event => {
          const parsed = Number.parseInt(event.target.value, 10);
          onParamsChange({ ...params, [key]: Number.isInteger(parsed) ? parsed : 0 });
        }}
        disabled={!canEdit}
        className="rounded-lg border px-2 py-1.5 text-[13px] disabled:opacity-50"
        style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      />
      {props2.help && <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{props2.help}</span>}
    </label>
  );

  const dateField = (label: string, key: 'planningDate' | 'targetDate') => (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <input
        type="date"
        value={params[key]}
        onChange={event => onParamsChange({ ...params, [key]: event.target.value })}
        className="rounded-lg border px-2 py-1.5 text-[13px]"
        style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      />
    </label>
  );

  return (
    <Drawer open={open} onClose={onClose} title="计算参数" subtitle="全局参数 + 高级设置 + SKU 覆盖规则（店铺级优先，可恢复继承）" width={540}>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {dateField('计划日期', 'planningDate')}
        {dateField('目标覆盖日期', 'targetDate')}
        {numberField('补货时效（天）', 'leadTimeDays', { min: 0, max: 3650, help: '从下单到可入仓上架的天数' })}
        {numberField('安全库存（天）', 'safetyDays', { min: 0, max: 3650, help: '到仓后额外保留的天数' })}
        {numberField('需求增长调整（%）', 'growthPercent', { min: 0, max: 1000, help: '预测日销 = 有效日销 × (1 + 增长%)' })}
        <div className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>统计天数（日销分母）</span>
          <div className="flex items-center gap-2" role="radiogroup" aria-label="统计天数模式">
            <label className="flex items-center gap-1 text-[13px]" style={{ color: 'var(--text-primary)' }}>
              <input
                type="radio"
                name="statistics-mode"
                checked={params.statisticsDaysMode === 'auto'}
                onChange={() => onParamsChange({ ...params, statisticsDaysMode: 'auto', statisticsDaysCustom: '' })}
              />
              自动
            </label>
            <label className="flex items-center gap-1 text-[13px]" style={{ color: 'var(--text-primary)' }}>
              <input
                type="radio"
                name="statistics-mode"
                checked={params.statisticsDaysMode === 'custom'}
                onChange={() => onParamsChange({ ...params, statisticsDaysMode: 'custom' })}
              />
              自定义
            </label>
            {params.statisticsDaysMode === 'custom' && (
              <input
                type="number"
                min={1}
                value={params.statisticsDaysCustom}
                onChange={event => onParamsChange({ ...params, statisticsDaysCustom: event.target.value })}
                aria-label="自定义统计天数"
                className="w-20 rounded-lg border px-2 py-1 text-[13px]"
                style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
            )}
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            自动 = 区间内店铺实际上传天数；自定义会作为人工覆盖记录在快照中
          </span>
        </div>
      </div>

      <h3 className="text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
        SKU 覆盖规则{shopId ? '（当前店铺）' : '（请先选择店铺）'}
      </h3>
      {ruleError && <p className="text-xs mb-2" style={{ color: '#b91c1c' }} role="alert">{ruleError}</p>}

      {canEdit && shopId && (
        <div className="rounded-lg border p-2 mb-3" style={{ borderColor: 'var(--border-light)' }}>
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>为任意 SKU（含元仓直连货品）新增店铺级覆盖：</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newSku}
              onChange={event => setNewSku(event.target.value)}
              placeholder="SKU 货号"
              aria-label="新增规则的 SKU"
              className="w-36 rounded border px-1.5 py-1 text-[12px]"
              style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <input
              type="number" min={0} placeholder="时效" aria-label="新规则 时效天数"
              value={newDraft.leadTimeDays}
              onChange={event => setNewDraft(previous => ({ ...previous, leadTimeDays: event.target.value }))}
              className="w-20 rounded border px-1.5 py-1 text-[12px]"
              style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <input
              type="number" min={0} placeholder="安全" aria-label="新规则 安全天数"
              value={newDraft.safetyDays}
              onChange={event => setNewDraft(previous => ({ ...previous, safetyDays: event.target.value }))}
              className="w-20 rounded border px-1.5 py-1 text-[12px]"
              style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <input
              type="number" min={0} placeholder="增长%" aria-label="新规则 增长百分比"
              value={newDraft.growthPercent}
              onChange={event => setNewDraft(previous => ({ ...previous, growthPercent: event.target.value }))}
              className="w-20 rounded border px-1.5 py-1 text-[12px]"
              style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <button
              type="button"
              disabled={!newSku.trim() || busyKey !== null}
              onClick={() => void createNewRule()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-white disabled:opacity-40"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Plus size={12} />
              新增
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 && (
        <p className="text-[12px] mb-2" style={{ color: 'var(--text-tertiary)' }}>
          暂无 SKU 规则。全局参数适用于全部 SKU；可上方新增，或在商品详情中对单个商品设置覆盖。
        </p>
      )}
      <div className="flex flex-col gap-2">
        {rules.map(rule => {
          const editKey = editKeyOf(rule);
          const draft = draftOf(rule);
          const inputStyle = {
            borderColor: 'var(--border-light)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          } as const;
          const isDirty = editKey in ruleEdits;
          return (
            <div key={editKey} className="rounded-lg border p-2" style={{ borderColor: isDirty ? 'var(--primary)' : 'var(--border-light)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>{rule.sku}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-tertiary)' }}>
                  {rule.scope === 'shop' ? '店铺级' : '站点级（V2共享）'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number" min={0} placeholder="时效" aria-label={`${rule.sku}（${rule.scope}）时效天数`}
                  value={draft.leadTimeDays}
                  onChange={event => setRuleEdits(previous => ({ ...previous, [editKey]: { ...draft, leadTimeDays: event.target.value } }))}
                  disabled={!canEdit}
                  className="w-20 rounded border px-1.5 py-1 text-[12px] disabled:opacity-50" style={inputStyle}
                />
                <input
                  type="number" min={0} placeholder="安全" aria-label={`${rule.sku}（${rule.scope}）安全天数`}
                  value={draft.safetyDays}
                  onChange={event => setRuleEdits(previous => ({ ...previous, [editKey]: { ...draft, safetyDays: event.target.value } }))}
                  disabled={!canEdit}
                  className="w-20 rounded border px-1.5 py-1 text-[12px] disabled:opacity-50" style={inputStyle}
                />
                <input
                  type="number" min={0} placeholder="增长%" aria-label={`${rule.sku}（${rule.scope}）增长百分比`}
                  value={draft.growthPercent}
                  onChange={event => setRuleEdits(previous => ({ ...previous, [editKey]: { ...draft, growthPercent: event.target.value } }))}
                  disabled={!canEdit}
                  className="w-20 rounded border px-1.5 py-1 text-[12px] disabled:opacity-50" style={inputStyle}
                />
                <span className="flex-1" />
                <button
                  type="button"
                  disabled={!isDirty || busyKey === editKey || !canEdit}
                  onClick={() => void saveRule(rule.sku, rule.scope, draft)}
                  title={isDirty ? '保存修改' : '未修改（保存现值）'}
                  className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] disabled:opacity-50"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
                >
                  <Save size={12} />
                  保存
                </button>
                <button
                  type="button"
                  disabled={busyKey === editKey || !canEdit}
                  onClick={() => void restoreInherit(rule.sku, rule.scope)}
                  title="删除该覆盖规则，恢复继承（店铺规则继承站点/全局；站点规则继承全局）"
                  className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] disabled:opacity-40"
                  style={{ borderColor: 'var(--border-light)', color: '#b45309' }}
                >
                  <RotateCcw size={12} />
                  恢复继承
                </button>
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                现值：时效 {rule.leadTimeDays ?? '继承'} · 安全 {rule.safetyDays ?? '继承'} · 增长 {rule.growthPercent !== null ? `${formatNumber(rule.growthPercent, 1)}%` : '继承'}
                {isDirty && '（有未保存修改）'}
              </p>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
