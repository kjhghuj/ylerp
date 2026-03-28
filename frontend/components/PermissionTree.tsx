import React, { useState } from 'react';
import { ChevronDown, Check, Minus, LayoutDashboard, Calculator, Wallet, PackageCheck, Tag, List } from 'lucide-react';

export interface PermissionNode {
    key: string;
    label: string;
    icon: React.ElementType;
    children?: PermissionNode[];
}

export const ALL_PERMISSIONS: PermissionNode[] = [
    { key: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
    { key: 'profit', label: '利润计算器', icon: Calculator },
    { key: 'product-list', label: '产品列表', icon: List },
    { key: 'finance', label: '财务管理', icon: Wallet },
    { key: 'inventory', label: '补货计算', icon: PackageCheck },
    { key: 'pricing', label: '定价计算', icon: Tag },
];

// Get all leaf keys from the tree
export const getAllPermissionKeys = (): string[] => {
    return ALL_PERMISSIONS.map(n => n.key);
};

interface PermissionTreeProps {
    selected: string[];
    onChange: (selected: string[]) => void;
    disabled?: boolean;
}

export const PermissionTree: React.FC<PermissionTreeProps> = ({ selected, onChange, disabled }) => {
    const [expanded, setExpanded] = useState(true);

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

    const handleToggleItem = (key: string) => {
        if (disabled) return;
        if (selected.includes(key)) {
            onChange(selected.filter(k => k !== key));
        } else {
            onChange([...selected, key]);
        }
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Root node - Select All */}
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                disabled={disabled}
            >
                <span className="text-slate-400 transition-transform duration-200" style={{ transform: expanded ? 'rotate(0)' : 'rotate(-90deg)' }}>
                    <ChevronDown size={16} />
                </span>
                {/* Checkbox */}
                <span
                    onClick={(e) => { e.stopPropagation(); handleToggleAll(); }}
                    className={`
                        w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-200
                        ${allSelected ? 'bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200' :
                        isPartial ? 'bg-blue-100 border-blue-400 text-blue-500' :
                        'border-slate-300 hover:border-blue-400'}
                        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                    {allSelected && <Check size={13} strokeWidth={3} />}
                    {isPartial && <Minus size={13} strokeWidth={3} />}
                </span>
                <span className="text-sm font-bold text-slate-700">全部功能模块</span>
                <span className="ml-auto text-xs text-slate-400 font-medium">
                    {selected.length}/{allKeys.length}
                </span>
            </button>

            {/* Child nodes */}
            {expanded && (
                <div className="border-t border-slate-100">
                    {ALL_PERMISSIONS.map((node) => {
                        const Icon = node.icon;
                        const isChecked = selected.includes(node.key);
                        return (
                            <button
                                type="button"
                                key={node.key}
                                onClick={() => handleToggleItem(node.key)}
                                className={`
                                    w-full flex items-center gap-3 pl-12 pr-4 py-2.5 text-left transition-all duration-200
                                    ${isChecked ? 'bg-blue-50/50' : 'hover:bg-slate-50'}
                                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                disabled={disabled}
                            >
                                {/* Checkbox */}
                                <span className={`
                                    w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200
                                    ${isChecked ? 'bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200' : 'border-slate-300'}
                                `}>
                                    {isChecked && <Check size={13} strokeWidth={3} />}
                                </span>
                                <Icon size={16} className={isChecked ? 'text-blue-500' : 'text-slate-400'} />
                                <span className={`text-sm font-medium ${isChecked ? 'text-slate-800' : 'text-slate-500'}`}>
                                    {node.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
