import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Button } from './ui/button';
import React, { useState } from 'react';
import { ChevronDown, ChevronRight,  LayoutDashboard, Calculator, Wallet, PackageCheck, PackagePlus, List, DollarSign, AlertTriangle, BarChart3, Receipt, PlusCircle, MinusCircle, FileText, Upload, Settings, Search, Download, Edit3, Truck, Package, BookOpen, Image, Calendar, Eye, Activity } from 'lucide-react';

export interface PermissionNode {
    key: string;
    label: string;
    labelEn?: string;
    icon: React.ElementType;
    children?: PermissionNode[];
}

export const ALL_PERMISSIONS: PermissionNode[] = [
    {
        key: 'dashboard', label: '仪表盘', labelEn: 'Dashboard', icon: LayoutDashboard,
        children: [
            { key: 'dashboard.balance', label: '账户余额', labelEn: 'Balance', icon: DollarSign },
            { key: 'dashboard.alerts', label: '补货与滞销预警', labelEn: 'Restock & Aging Alerts', icon: AlertTriangle },
            { key: 'dashboard.debt', label: '总负债', labelEn: 'Debt', icon: BarChart3 },
            { key: 'dashboard.inventoryTable', label: '元仓库存监控', labelEn: 'YC Warehouse Monitor', icon: Package },
        ]
    },
    {
        key: 'profit', label: '利润计算', labelEn: 'Profit Calculator', icon: Calculator,
        children: [
            { key: 'profit.calc', label: '利润计算', labelEn: 'Calculate', icon: Calculator },
            { key: 'profit.save', label: '保存商品', labelEn: 'Save Product', icon: FileText },
            { key: 'profit.template', label: '模板管理', labelEn: 'Templates', icon: BookOpen },
            { key: 'profit.matrix', label: '多站点矩阵', labelEn: 'Multi-Site Matrix', icon: LayoutDashboard },
        ]
    },
    {
        key: 'product-list', label: '商品明细表', labelEn: 'Product List', icon: List,
        children: [
            { key: 'product-list.view', label: '查看商品', labelEn: 'View Products', icon: Search },
            { key: 'product-list.edit', label: '编辑商品', labelEn: 'Edit Products', icon: Edit3 },
            { key: 'product-list.export', label: '导出数据', labelEn: 'Export', icon: Download },
        ]
    },
    {
        key: 'finance', label: '财务管理', labelEn: 'Finance', icon: Wallet,
        children: [
            { key: 'finance.income', label: '收入记录', labelEn: 'Income', icon: PlusCircle },
            { key: 'finance.expense', label: '支出记录', labelEn: 'Expense', icon: MinusCircle },
            { key: 'finance.debt', label: '负债管理', labelEn: 'Debt Mgmt', icon: Receipt },
            { key: 'finance.ledger', label: '流水明细', labelEn: 'Ledger', icon: FileText },
            { key: 'finance.stats', label: '统计图表', labelEn: 'Statistics', icon: BarChart3 },
        ]
    },
    {
        key: 'restock-v2', label: '元仓同步（商品列表）', labelEn: 'YC Sync (Product List)', icon: PackagePlus,
        children: [
            { key: 'restock-v2.view', label: '查看元仓库存', labelEn: 'View YC Stock', icon: Search },
            { key: 'restock-v2.refresh', label: '同步元仓商品', labelEn: 'Sync YC Products', icon: Truck },
        ]
    },
    {
        key: 'restock-v3', label: '补货V3', labelEn: 'Restock V3', icon: PackageCheck,
        children: [
            { key: 'restock-v3.view', label: '查看建议', labelEn: 'View Suggestions', icon: Search },
            { key: 'restock-v3.refresh', label: '刷新建议', labelEn: 'Refresh Suggestions', icon: Truck },
        ]
    },
    {
        key: 'chroma-adapt', label: '图片制作', labelEn: 'Image Studio', icon: Image,
        children: [
            { key: 'chroma-adapt.translate', label: '图片翻译', labelEn: 'Translate', icon: Edit3 },
            { key: 'chroma-adapt.edit', label: '图片编辑', labelEn: 'Edit', icon: Settings },
            { key: 'chroma-adapt.generate', label: 'AI生成', labelEn: 'Generate', icon: Image },
        ]
    },
    {
        key: 'schedule', label: '日程管理', labelEn: 'Schedule', icon: Calendar,
        children: [
            { key: 'schedule.view', label: '查看日程', labelEn: 'View', icon: Eye },
            { key: 'schedule.edit', label: '编辑日程', labelEn: 'Edit', icon: Edit3 },
        ]
    },
    {
        key: 'product-analysis', label: '商品分析', labelEn: 'Product Analysis', icon: BarChart3,
        children: [
            { key: 'product-analysis.view', label: '查看报告', labelEn: 'View Reports', icon: Search },
            { key: 'product-analysis.upload', label: '上传文件', labelEn: 'Upload', icon: Upload },
            { key: 'product-analysis.aiChat', label: 'AI 对话分析', labelEn: 'AI Chat', icon: BarChart3 },
        ]
    },
    {
        key: 'usage-stats', label: '使用统计', labelEn: 'Usage Stats', icon: Activity,
        children: [
            { key: 'usage-stats.view', label: '查看统计', labelEn: 'View Stats', icon: BarChart3 },
            { key: 'usage-stats.export', label: '导出报告', labelEn: 'Export Report', icon: Download },
        ]
    },
];

export const getAllPermissionKeys = (): string[] => {
    const keys: string[] = [];
    for (const node of ALL_PERMISSIONS) {
        if (node.children && node.children.length > 0) {
            keys.push(node.key);
            for (const child of node.children) {
                keys.push(child.key);
            }
        } else {
            keys.push(node.key);
        }
    }
    return keys;
};

export const getModuleKeys = (): string[] => {
    return ALL_PERMISSIONS.map(n => n.key);
};

export const getSubKeysForModule = (moduleKey: string): string[] => {
    const node = ALL_PERMISSIONS.find(n => n.key === moduleKey);
    return node?.children?.map(c => c.key) || [];
};

export const getModuleKeyFromSubKey = (subKey: string): string | undefined => {
    return subKey.includes('.') ? subKey.split('.')[0] : undefined;
};

export const hasPermission = (userPermissions: string[], permissionKey: string): boolean => {
    if (userPermissions.includes(permissionKey)) return true;
    const moduleKey = permissionKey.includes('.') ? permissionKey.split('.')[0] : permissionKey;
    if (userPermissions.includes(moduleKey)) return true;
    if (!permissionKey.includes('.')) {
        const subKeys = getSubKeysForModule(permissionKey);
        return subKeys.some(sk => userPermissions.includes(sk));
    }
    return false;
};

export const expandPermissions = (permissions: string[]): string[] => {
    const result = new Set<string>();
    for (const perm of permissions) {
        result.add(perm);
        const subKeys = getSubKeysForModule(perm);
        if (subKeys.length > 0) {
            for (const sk of subKeys) result.add(sk);
        }
    }
    return Array.from(result);
};

interface PermissionTreeProps {
    selected: string[];
    onChange: (selected: string[]) => void;
    disabled?: boolean;
}

export const PermissionTree: React.FC<PermissionTreeProps> = ({ selected, onChange, disabled }) => {
    const treeId = React.useId();
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(ALL_PERMISSIONS.map(n => n.key)));

    const allKeys = getAllPermissionKeys();
    const allSelected = allKeys.every(k => selected.includes(k));
    const noneSelected = allKeys.every(k => !selected.includes(k));
    const isPartial = !allSelected && !noneSelected;

    const handleToggleAll = () => {
        if (disabled) return;
        if (allSelected) {
            onChange([]);
        } else {
            onChange([...allKeys]);
        }
    };

    const handleToggleModule = (node: PermissionNode) => {
        if (disabled) return;
        const moduleKey = node.key;
        const subKeys = node.children?.map(c => c.key) || [];
        const allModuleKeys = [moduleKey, ...subKeys];
        const allModuleSelected = allModuleKeys.every(k => selected.includes(k));

        let newSelected: string[];
        if (allModuleSelected) {
            newSelected = selected.filter(k => !allModuleKeys.includes(k));
        } else {
            const existing = new Set(selected);
            for (const k of allModuleKeys) existing.add(k);
            newSelected = Array.from(existing) as string[];
        }
        onChange(newSelected);
    };

    const handleToggleSub = (moduleKey: string, subKey: string) => {
        if (disabled) return;
        const subKeys = getSubKeysForModule(moduleKey);
        const otherSubKeys = subKeys.filter(k => k !== subKey);
        const otherSubsAllSelected = otherSubKeys.every(k => selected.includes(k));

        let newSelected: string[];
        if (selected.includes(subKey)) {
            newSelected = selected.filter(k => k !== subKey && k !== moduleKey);
        } else {
            const existing = new Set(selected);
            existing.add(subKey);
            if (otherSubsAllSelected) {
                existing.add(moduleKey);
            }
            newSelected = Array.from(existing) as string[];
        }
        onChange(newSelected);
    };

    const toggleExpand = (key: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const isModuleChecked = (node: PermissionNode) => {
        const subKeys = node.children?.map(c => c.key) || [];
        const allModuleKeys = [node.key, ...subKeys];
        return allModuleKeys.every(k => selected.includes(k));
    };

    const isModulePartial = (node: PermissionNode) => {
        const subKeys = node.children?.map(c => c.key) || [];
        const allModuleKeys = [node.key, ...subKeys];
        const some = allModuleKeys.some(k => selected.includes(k));
        const all = allModuleKeys.every(k => selected.includes(k));
        return some && !all;
    };

    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card text-foreground">
        <div className="flex min-h-11 items-center gap-3 border-b border-border px-4 py-3">
          <Checkbox id={`${treeId}-all`} checked={allSelected ? true : isPartial ? 'indeterminate' : false} onCheckedChange={handleToggleAll} disabled={disabled} />
          <Label htmlFor={`${treeId}-all`} className="flex-1 cursor-pointer">全部功能模块</Label>
          <span className="text-xs text-muted-foreground">{selected.filter(k => !k.includes('.')).length}/{ALL_PERMISSIONS.length} 模块</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {ALL_PERMISSIONS.map(node => {
            const Icon = node.icon;
            const checked = isModuleChecked(node);
            const partial = isModulePartial(node);
            const isExpanded = expandedModules.has(node.key);
            const hasChildren = !!node.children?.length;
            return <div key={node.key}>
              <div className={`flex min-h-11 items-center gap-2 px-3 py-2 ${checked ? 'bg-accent/50' : 'hover:bg-muted/50'}`}>
                {hasChildren ? <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => toggleExpand(node.key)} aria-label={`${isExpanded ? '收起' : '展开'}${node.label}`} aria-expanded={isExpanded} aria-controls={`${treeId}-children-${node.key}`}>{isExpanded ? <ChevronDown /> : <ChevronRight />}</Button> : <span className="w-7" />}
                <Checkbox id={`${treeId}-${node.key}`} checked={checked ? true : partial ? 'indeterminate' : false} onCheckedChange={() => handleToggleModule(node)} disabled={disabled} />
                <Icon size={16} className={checked || partial ? 'text-primary' : 'text-muted-foreground'} />
                <Label htmlFor={`${treeId}-${node.key}`} className="min-w-0 flex-1 cursor-pointer py-1 text-sm">{node.label}</Label>
                {hasChildren && <span className="text-xs text-muted-foreground">{node.children!.filter(child => selected.includes(child.key)).length}/{node.children!.length}</span>}
              </div>
              {isExpanded && hasChildren && <div id={`${treeId}-children-${node.key}`} className="border-t border-border">
                {node.children!.map(child => {
                  const ChildIcon = child.icon;
                  const checkedChild = selected.includes(child.key);
                  return <div key={child.key} className={`flex min-h-10 items-center gap-3 pl-12 pr-4 py-2 ${checkedChild ? 'bg-accent/30' : 'hover:bg-muted/50'}`}>
                    <Checkbox id={`${treeId}-${child.key}`} checked={checkedChild} onCheckedChange={() => handleToggleSub(node.key, child.key)} disabled={disabled} />
                    <ChildIcon size={14} className={checkedChild ? 'text-primary' : 'text-muted-foreground'} />
                    <Label htmlFor={`${treeId}-${child.key}`} className="min-w-0 flex-1 cursor-pointer py-1 text-xs">{child.label}</Label>
                  </div>;
                })}
              </div>}
            </div>;
          })}
        </div>
      </div>
    );
};

