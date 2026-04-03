import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Minus, LayoutDashboard, Calculator, Wallet, PackageCheck, Tag, List, ClipboardList, DollarSign, TrendingUp, AlertTriangle, BarChart3, Receipt, PlusCircle, MinusCircle, FileText, Upload, Settings, Search, Download, Edit3, Truck, Package, ShoppingCart, Target, BookOpen } from 'lucide-react';

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
            { key: 'dashboard.margin', label: '平均利润率', labelEn: 'Margin', icon: TrendingUp },
            { key: 'dashboard.alerts', label: '缺货预警', labelEn: 'Alerts', icon: AlertTriangle },
            { key: 'dashboard.debt', label: '总负债', labelEn: 'Debt', icon: BarChart3 },
            { key: 'dashboard.chart', label: '趋势图表', labelEn: 'Chart', icon: BarChart3 },
            { key: 'dashboard.profitTable', label: '利润分析表', labelEn: 'Profit Table', icon: FileText },
            { key: 'dashboard.inventoryTable', label: '库存监控表', labelEn: 'Inventory Table', icon: Package },
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
        key: 'inventory', label: '智能补货', labelEn: 'Smart Restock', icon: PackageCheck,
        children: [
            { key: 'inventory.view', label: '查看库存', labelEn: 'View Stock', icon: Search },
            { key: 'inventory.import', label: '数据导入', labelEn: 'Import Data', icon: Upload },
            { key: 'inventory.mapping', label: '映射管理', labelEn: 'Mappings', icon: Settings },
            { key: 'inventory.restock', label: '补货操作', labelEn: 'Restock', icon: Truck },
        ]
    },
    {
        key: 'restock-records', label: '补货记录', labelEn: 'Restock Records', icon: ClipboardList,
        children: [
            { key: 'restock-records.view', label: '查看记录', labelEn: 'View Records', icon: Search },
            { key: 'restock-records.edit', label: '编辑记录', labelEn: 'Edit Records', icon: Edit3 },
        ]
    },
    {
        key: 'pricing', label: '智能定价', labelEn: 'Smart Pricing', icon: Tag,
        children: [
            { key: 'pricing.calc', label: '定价计算', labelEn: 'Calculate', icon: Calculator },
            { key: 'pricing.save', label: '保存方案', labelEn: 'Save Plan', icon: FileText },
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
    return userPermissions.includes(moduleKey);
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
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <button
                type="button"
                onClick={handleToggleAll}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100"
                disabled={disabled}
            >
                <span className={`
                    w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-200
                    ${allSelected ? 'bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200' :
                    isPartial ? 'bg-blue-100 border-blue-400 text-blue-500' :
                    'border-slate-300 hover:border-blue-400'}
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}>
                    {allSelected && <Check size={13} strokeWidth={3} />}
                    {isPartial && <Minus size={13} strokeWidth={3} />}
                </span>
                <span className="text-sm font-bold text-slate-700">全部功能模块</span>
                <span className="ml-auto text-xs text-slate-400 font-medium">
                    {selected.filter(k => !k.includes('.')).length}/{ALL_PERMISSIONS.length} 模块
                </span>
            </button>

            <div className="max-h-[420px] overflow-y-auto">
                {ALL_PERMISSIONS.map((node) => {
                    const Icon = node.icon;
                    const checked = isModuleChecked(node);
                    const partial = isModulePartial(node);
                    const isExpanded = expandedModules.has(node.key);
                    const hasChildren = !!node.children && node.children.length > 0;

                    return (
                        <div key={node.key}>
                            <div className={`
                                flex items-center gap-2 pl-4 pr-4 py-2.5 transition-all duration-200
                                ${checked ? 'bg-blue-50/50' : 'hover:bg-slate-50'}
                                ${disabled ? 'opacity-50' : ''}
                            `}>
                                {hasChildren && (
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(node.key)}
                                        className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                )}
                                {!hasChildren && <span className="w-[18px]" />}

                                <span
                                    onClick={() => handleToggleModule(node)}
                                    className={`
                                        w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-200
                                        ${checked ? 'bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200' :
                                        partial ? 'bg-blue-100 border-blue-400 text-blue-500' :
                                        'border-slate-300'}
                                        ${disabled ? 'cursor-not-allowed' : ''}
                                    `}
                                >
                                    {checked && <Check size={13} strokeWidth={3} />}
                                    {partial && <Minus size={13} strokeWidth={3} />}
                                </span>
                                <Icon size={16} className={checked || partial ? 'text-blue-500' : 'text-slate-400'} />
                                <span
                                    onClick={() => handleToggleModule(node)}
                                    className={`text-sm font-medium flex-1 ${(checked || partial) ? 'text-slate-800' : 'text-slate-500'} ${disabled ? '' : 'cursor-pointer'}`}
                                >
                                    {node.label}
                                </span>
                                {hasChildren && (
                                    <span className="text-[10px] text-slate-400">
                                        {node.children!.filter(c => selected.includes(c.key)).length}/{node.children!.length}
                                    </span>
                                )}
                            </div>

                            {isExpanded && hasChildren && (
                                <div className="border-t border-slate-50">
                                    {node.children!.map((child) => {
                                        const ChildIcon = child.icon;
                                        const isChildChecked = selected.includes(child.key);
                                        return (
                                            <button
                                                type="button"
                                                key={child.key}
                                                onClick={() => handleToggleSub(node.key, child.key)}
                                                className={`
                                                    w-full flex items-center gap-3 pl-12 pr-4 py-2 text-left transition-all duration-200
                                                    ${isChildChecked ? 'bg-blue-50/30' : 'hover:bg-slate-50/50'}
                                                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                                `}
                                                disabled={disabled}
                                            >
                                                <span className={`
                                                    w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-200
                                                    ${isChildChecked ? 'bg-blue-500 border-blue-500 text-white shadow-sm' : 'border-slate-300'}
                                                `}>
                                                    {isChildChecked && <Check size={10} strokeWidth={3} />}
                                                </span>
                                                <ChildIcon size={14} className={isChildChecked ? 'text-blue-400' : 'text-slate-300'} />
                                                <span className={`text-xs font-medium ${isChildChecked ? 'text-slate-700' : 'text-slate-400'}`}>
                                                    {child.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
