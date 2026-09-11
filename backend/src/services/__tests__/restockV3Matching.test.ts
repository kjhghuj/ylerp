/**
 * 补货V3 匹配链状态机回归测试（2026-09 第二轮）。
 * 核心契约：冲突是阻断态——发现冲突后不得回退到历史映射或本地回退；
 * 身份 = 编号类型:规范化值，跨类型同值不共享字符串映射。
 */
import { buildMatchChain } from '../restockV3Matching';
import type { ShopVariantSalesRowLike } from './matchTestHelpers';

const baseRow = (overrides: Partial<ShopVariantSalesRowLike> = {}): ShopVariantSalesRowLike => ({
  identityKey: 'modelCode:A',
  externalSku: 'A',
  identityValue: 'A',
  displaySku: 'A',
  skuSource: 'modelCode',
  level: 'variation',
  itemId: 'i1',
  itemName: '商品A',
  variationName: null,
  units: 5,
  observedDays: 1,
  positiveDays: 1,
  zeroDays: 0,
  latestObservedDate: '2026-09-01',
  salesStatus: 'has_sales',
  normalizedVariants: ['A'],
  itemIds: ['i1'],
  ...overrides,
});

const ctx = (overrides: Record<string, unknown> = {}) => ({
  shopNames: new Map([['s1', '店1']]),
  rowsByShop: new Map([['s1', [baseRow()]]]),
  shopMappings: [],
  siteMappings: [],
  ownedLocalSkus: new Set<string>(),
  localSkuNames: new Map<string, string>(),
  ycProducts: new Map<string, Array<{ customerSku: string; customerSkuName: string | null }>>(),
  ...overrides,
});

describe('问题3：映射冲突必须阻断回退', () => {
  it('元仓有 A、站点映射 A→B：不得自动采用 B，进入 conflict 待核对', () => {
    const { resolved, review } = buildMatchChain(ctx({
      siteMappings: [{ externalSku: 'A', targetSku: 'B' }],
      ownedLocalSkus: new Set(['B']),
      localSkuNames: new Map([['B', 'B商品']]),
      ycProducts: new Map([['A', [{ customerSku: 'A', customerSkuName: '元仓A' }]]]),
    }));
    expect(resolved.size).toBe(0);
    expect(review).toHaveLength(1);
    expect(review[0].status).toBe('conflict');
    expect(review[0].reasons.join()).toContain('不一致');
  });

  it('站点映射多目标：conflict，不得取第一个', () => {
    const { resolved, review } = buildMatchChain(ctx({
      siteMappings: [
        { externalSku: 'A', targetSku: 'B1' },
        { externalSku: 'A', targetSku: 'B2' },
      ],
      ownedLocalSkus: new Set(['B1', 'B2']),
    }));
    expect(resolved.size).toBe(0);
    expect(review[0].status).toBe('conflict');
    expect(review[0].reasons.join()).toContain('多个目标');
  });

  it('失效的店铺专属映射：conflict，不得静默替换成其他身份', () => {
    const { resolved, review } = buildMatchChain(ctx({
      shopMappings: [{ shopId: 's1', externalSku: 'A', targetSku: 'GONE' }],
      ownedLocalSkus: new Set(['A']), // 本地有同码 A，也不得静默回退
    }));
    expect(resolved.size).toBe(0);
    expect(review[0].status).toBe('conflict');
    expect(review[0].reasons.join()).toContain('均已不存在');
  });

  it('元仓同码多货品：conflict', () => {
    const { resolved, review } = buildMatchChain(ctx({
      ycProducts: new Map([['A', [
        { customerSku: 'A', customerSkuName: '仓A-1' },
        { customerSku: 'A', customerSkuName: '仓A-2' },
      ]]]),
    }));
    expect(resolved.size).toBe(0);
    expect(review[0].status).toBe('conflict');
    expect(review[0].reasons.join()).toContain('同码货品');
  });

  it('编号类型歧义：modelCode 与 variationSku 同值时，variationSku 行不得共享字符串映射', () => {
    const { resolved, review } = buildMatchChain(ctx({
      rowsByShop: new Map([['s1', [
        baseRow(),
        baseRow({
          identityKey: 'variationSku:A', identityValue: 'A', externalSku: 'A',
          skuSource: 'variationSku', itemId: 'i2', itemName: '商品B', units: 20,
        }),
      ]]]),
      siteMappings: [{ externalSku: 'A', targetSku: 'B' }],
      ownedLocalSkus: new Set(['A', 'B']),
      ycProducts: new Map([['A', [{ customerSku: 'A', customerSkuName: '元仓A' }]]]),
    }));
    // modelCode 行：元仓同码 vs 站点映射 A→B 冲突 → 阻断
    // variationSku 行：类型歧义 → 阻断（不得用 A→B 映射）
    expect(resolved.size).toBe(0);
    expect(review).toHaveLength(2);
    expect(review.every(entry => entry.status === 'conflict')).toBe(true);
  });

  it('同值仅单一编号类型占用时，历史映射对 variationSku 行仍兼容生效', () => {
    const { resolved, review } = buildMatchChain(ctx({
      rowsByShop: new Map([['s1', [
        baseRow({
          identityKey: 'variationSku:A', identityValue: 'A', externalSku: 'A',
          skuSource: 'variationSku', itemId: 'i2', itemName: '商品B', units: 20,
        }),
      ]]]),
      siteMappings: [{ externalSku: 'A', targetSku: 'B' }],
      ownedLocalSkus: new Set(['B']),
    }));
    expect(resolved.get('B')).toBeDefined();
    expect(resolved.get('B')!.matchType).toBe('site-mapping');
    expect(review).toHaveLength(0);
  });
});

describe('第三轮：多目标映射阻断与编号类型贯通（2026-09 审核修复）', () => {
  const ycUniqueA = new Map([['A', [{ customerSku: 'A', customerSkuName: '元仓A' }]]]);

  it('问题一：元仓唯一 A + 站点映射 A→A、A→B 并存 → 不得自动同码直连，进入 conflict', () => {
    const { resolved, review } = buildMatchChain(ctx({
      siteMappings: [
        { externalSku: 'A', targetSku: 'A' },
        { externalSku: 'A', targetSku: 'B' },
      ],
      ownedLocalSkus: new Set(['A', 'B']),
      ycProducts: ycUniqueA,
    }));
    // 修复前：siteTargets 含 A 即被视为一致 → resolved=[A] 自动直连（绕过冲突）
    expect(resolved.size).toBe(0);
    expect(review).toHaveLength(1);
    expect(review[0].status).toBe('conflict');
    expect(review[0].reasons.join()).toContain('多个目标');
  });

  it('问题一：同场景下有效店铺专属映射保持最高优先（不被历史多目标阻断）', () => {
    const { resolved, review } = buildMatchChain(ctx({
      siteMappings: [
        { externalSku: 'A', targetSku: 'A' },
        { externalSku: 'A', targetSku: 'B' },
      ],
      shopMappings: [{ shopId: 's1', externalSku: 'A', targetSku: 'LOCAL-C', externalSkuType: 'modelCode' }],
      ownedLocalSkus: new Set(['A', 'B', 'LOCAL-C']),
      ycProducts: ycUniqueA,
    }));
    expect(resolved.get('LOCAL-C')).toBeDefined();
    expect(resolved.get('LOCAL-C')!.status).toBe('confirmed');
    expect(resolved.get('LOCAL-C')!.matchType).toBe('shop-mapping');
    expect(review).toHaveLength(0);
  });

  it('问题一：typed(modelCode) 与 legacy 同值不同目标（A→A + A→B）同样 conflict', () => {
    const { resolved, review } = buildMatchChain(ctx({
      siteMappings: [
        { externalSku: 'A', targetSku: 'A', externalSkuType: 'modelCode' },
        { externalSku: 'A', targetSku: 'B' },
      ],
      ownedLocalSkus: new Set(['A', 'B']),
      ycProducts: ycUniqueA,
    }));
    expect(resolved.size).toBe(0);
    expect(review[0].status).toBe('conflict');
    expect(review[0].reasons.join()).toContain('多个目标');
  });

  it('问题二：variationSku=A 的 typed 店铺映射只作用于该身份，modelCode=A 行不被改写', () => {
    const { resolved, review } = buildMatchChain(ctx({
      rowsByShop: new Map([['s1', [
        baseRow(),
        baseRow({
          identityKey: 'variationSku:A', identityValue: 'A', externalSku: 'A',
          skuSource: 'variationSku', itemId: 'i2', itemName: '商品B', units: 20,
        }),
      ]]]),
      shopMappings: [{ shopId: 's1', externalSku: 'A', targetSku: 'LOCAL-B', externalSkuType: 'variationSku' }],
      ownedLocalSkus: new Set(['LOCAL-B']),
      ycProducts: ycUniqueA,
    }));
    // variationSku 行：typed 映射解除歧义 → confirmed LOCAL-B
    const mapped = resolved.get('LOCAL-B')!;
    expect(mapped).toBeDefined();
    expect(mapped.status).toBe('confirmed');
    expect(mapped.sources.every(source => source.row.skuSource === 'variationSku')).toBe(true);
    // modelCode 行：不受 variationSku 映射影响，走自身元仓同码直连 → A
    const direct = resolved.get('A')!;
    expect(direct).toBeDefined();
    expect(direct.matchType).toBe('exact-yc');
    expect(direct.sources.every(source => source.row.skuSource === 'modelCode')).toBe(true);
    expect(review).toHaveLength(0);
  });

  it('问题二：typed 站点映射同样可解除对应身份的歧义', () => {
    const { resolved, review } = buildMatchChain(ctx({
      rowsByShop: new Map([['s1', [
        baseRow({ units: 1 }),
        baseRow({
          identityKey: 'variationSku:A', identityValue: 'A', externalSku: 'A',
          skuSource: 'variationSku', itemId: 'i2', itemName: '商品B', units: 20,
        }),
      ]]]),
      siteMappings: [{ externalSku: 'A', targetSku: 'LOCAL-B', externalSkuType: 'variationSku' }],
      ownedLocalSkus: new Set(['LOCAL-B']),
      // 元仓无 A：modelCode 行无依据 → 待核对（不被 typed 站点映射改写）
      ycProducts: new Map(),
    }));
    expect(resolved.get('LOCAL-B')).toBeDefined();
    expect(resolved.get('LOCAL-B')!.matchType).toBe('site-mapping');
    expect(resolved.get('LOCAL-B')!.sources.every(source => source.row.skuSource === 'variationSku')).toBe(true);
    expect(review).toHaveLength(1);
    expect(review[0].identityKey).toBe('modelCode:A');
    expect(review[0].status).toBe('pending');
  });

  it('问题二：legacy 映射在值歧义时对 modelCode 行也不得使用（不猜测）', () => {
    const { resolved, review } = buildMatchChain(ctx({
      rowsByShop: new Map([['s1', [
        baseRow({ units: 1 }),
        baseRow({
          identityKey: 'variationSku:A', identityValue: 'A', externalSku: 'A',
          skuSource: 'variationSku', itemId: 'i2', itemName: '商品B', units: 20,
        }),
      ]]]),
      // legacy（身份未知）店铺映射：值同时被两种类型占用 → 不得套用到任何一行
      shopMappings: [{ shopId: 's1', externalSku: 'A', targetSku: 'LOCAL-B' }],
      ownedLocalSkus: new Set(['LOCAL-B']),
      ycProducts: new Map(),
    }));
    expect(resolved.size).toBe(0);
    const modelCodeEntry = review.find(entry => entry.identityKey === 'modelCode:A');
    expect(modelCodeEntry).toBeDefined();
    expect(modelCodeEntry!.status).toBe('pending'); // 不被 legacy 映射解析，也不误报冲突
    const variationEntry = review.find(entry => entry.identityKey === 'variationSku:A');
    expect(variationEntry!.status).toBe('conflict'); // 歧义需人工为该身份建立映射
  });

  it('问题二：typed 店铺映射目标失效 → conflict 阻断（不回退）', () => {
    const { resolved, review } = buildMatchChain(ctx({
      shopMappings: [{ shopId: 's1', externalSku: 'A', targetSku: 'GONE', externalSkuType: 'modelCode' }],
      ownedLocalSkus: new Set(['A']),
      ycProducts: ycUniqueA,
    }));
    expect(resolved.size).toBe(0);
    expect(review[0].status).toBe('conflict');
    expect(review[0].reasons.join()).toContain('均已不存在');
  });
});

describe('正常匹配状态', () => {
  it('元仓同码唯一且无矛盾：auto exact-yc', () => {
    const { resolved, review } = buildMatchChain(ctx({
      ycProducts: new Map([['A', [{ customerSku: 'A', customerSkuName: '元仓A' }]]]),
    }));
    const target = resolved.get('A')!;
    expect(target).toBeDefined();
    expect(target.status).toBe('auto');
    expect(target.matchType).toBe('exact-yc');
    expect(review).toHaveLength(0);
  });

  it('店铺映射命中：confirmed', () => {
    const { resolved } = buildMatchChain(ctx({
      shopMappings: [{ shopId: 's1', externalSku: 'A', targetSku: 'LOCAL-A' }],
      ownedLocalSkus: new Set(['LOCAL-A']),
    }));
    expect(resolved.get('LOCAL-A')!.status).toBe('confirmed');
  });

  it('归一化碰撞传播到 resolved 与 review（不再只是 metadata）', () => {
    const { resolved } = buildMatchChain(ctx({
      rowsByShop: new Map([['s1', [
        baseRow({ normalizedVariants: ['a', 'A '] }),
        baseRow({
          identityKey: 'modelCode:B', identityValue: 'B', externalSku: 'B',
          displaySku: 'B', itemId: 'i2', itemName: 'B', units: 1,
        }),
      ]]]),
      ycProducts: new Map([
        ['A', [{ customerSku: 'A', customerSkuName: '元仓A' }]],
        ['B', [{ customerSku: 'B', customerSkuName: '元仓B' }]],
      ]),
    }));
    expect(resolved.get('A')!.normalizedCollision).toBe(true);
    expect(resolved.get('B')!.normalizedCollision).toBe(false);
  });
});
