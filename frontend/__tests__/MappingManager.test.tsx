import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MappingManager } from '../modules/restock/components/MappingManager';

const addMapping = vi.fn();
const deleteMapping = vi.fn();
const addSkuGroup = vi.fn();
const updateSkuGroup = vi.fn();
const deleteSkuGroup = vi.fn();

vi.mock('../StoreContext', () => ({
  useStore: () => ({
    addMapping,
    deleteMapping,
    skuGroupMappings: [
      {
        id: 'group-1',
        groupName: 'Old Product',
        skus: ['SKU-001', 'SKU-002'],
      },
    ],
    addSkuGroup,
    updateSkuGroup,
    deleteSkuGroup,
  }),
}));

const t = {
  imports: {
    mappingTitle: '仓库与产品映射管理',
    importMappingBtn: '导入映射表',
    tabs: {
      official: '官方仓映射',
      third: '三方仓映射',
      grouping: '产品聚合规则',
    },
    officialId: '官方仓 SKU ID',
    thirdPartyId: '三方仓 SKU ID',
    sku: '系统 SKU',
    groupName: '聚合产品名称',
    skusList: '包含的SKU',
    noGroups: '暂无聚合规则',
  },
  table: {
    product: '商品',
  },
};

describe('MappingManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits an existing product grouping rule', async () => {
    render(<MappingManager mappings={[]} onOpenImportModal={vi.fn()} t={t} />);

    await userEvent.click(screen.getByRole('button', { name: '产品聚合规则' }));
    await userEvent.click(screen.getByRole('button', { name: '编辑聚合规则' }));

    const groupNameInput = screen.getByDisplayValue('Old Product');
    await userEvent.clear(groupNameInput);
    await userEvent.type(groupNameInput, 'Updated Product');

    const skuInput = screen.getByDisplayValue('SKU-001, SKU-002');
    await userEvent.clear(skuInput);
    await userEvent.type(skuInput, 'SKU-010, SKU-011');

    await userEvent.click(screen.getByRole('button', { name: '保存聚合规则' }));

    expect(updateSkuGroup).toHaveBeenCalledWith({
      id: 'group-1',
      groupName: 'Updated Product',
      skus: ['SKU-010', 'SKU-011'],
    });
  });
});
