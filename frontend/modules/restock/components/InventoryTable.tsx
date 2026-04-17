import React, { useState, useMemo } from 'react';
import { Trash2, AlertCircle, Package, ChevronDown, ChevronRight, Layers, Edit2, Save } from 'lucide-react';
import { InventoryItem } from '../../../types';
import { useStore } from '../../../StoreContext';
import { calculateRestock } from '../utils/restockUtils';
import { useToast } from '../../../components/Toast';

interface InventoryTableProps {
    targetDate: string;
    leadTime: number;
    t: any;
}

interface GroupedItem {
    groupKey: string;
    name: string;
    items: InventoryItem[];
    // Aggregated Stats
    totalStockOfficial: number;
    totalStockThirdParty: number;
    totalInTransit: number;
    totalDailySales: number;
    maxCost: number;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ targetDate, leadTime, t }) => {
    const { inventory, updateInventoryItem, deleteInventoryItem, addRestockRecord } = useStore();
    const { showToast } = useToast();
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [recordName, setRecordName] = useState('');

    const toggleGroup = (groupKey: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            return next;
        });
    };

    const groupedInventory = useMemo(() => {
        const groups: Record<string, GroupedItem> = {};
        inventory.forEach(item => {
            const key = item.name.trim();
            if (!groups[key]) {
                groups[key] = {
                    groupKey: key,
                    name: key,
                    items: [],
                    totalStockOfficial: 0,
                    totalStockThirdParty: 0,
                    totalInTransit: 0,
                    totalDailySales: 0,
                    maxCost: 0
                };
            }
            const g = groups[key];
            g.items.push(item);
            g.totalStockOfficial += (item.stockOfficial || 0);
            g.totalStockThirdParty += (item.stockThirdParty || 0);
            g.totalInTransit += (item.inTransit || 0);
            g.totalDailySales += (item.dailySales || 0);
            g.maxCost = Math.max(g.maxCost, item.costPerUnit || 0);
        });
        return Object.values(groups).sort((a, b) => b.totalDailySales - a.totalDailySales);
    }, [inventory]);

    const handleUpdate = (id: string, field: keyof InventoryItem, value: any) => {
        const item = inventory.find(i => i.id === id);
        if (item) {
            const val = field === 'name' ? value : (value === '' || value === '.' || value === '-' ? 0 : (parseFloat(value) || 0));
            updateInventoryItem({ id: item.id, [field]: val });
        }
    };

    const handleDeleteItem = (e: React.MouseEvent<HTMLButtonElement>, item: InventoryItem) => {
        e.stopPropagation();
        e.preventDefault();

        if (deleteConfirmId === item.id) {
            deleteInventoryItem(item.id);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(item.id);
            setTimeout(() => {
                setDeleteConfirmId(prev => (prev === item.id ? null : prev));
            }, 3000);
        }
    };

    const handleSaveRecord = async () => {
        if (groupedInventory.length === 0) {
            showToast('暂无补货数据', 'error');
            return;
        }
        setSaving(true);
        try {
            const now = new Date();
            const dateStr = now.toLocaleDateString('zh-CN');
            const name = recordName.trim() || `补货记录 ${dateStr}`;
            const items = groupedInventory.map(group => {
                const syntheticItem: InventoryItem = {
                    id: 'group-' + group.groupKey,
                    name: group.name,
                    sku: group.items[0]?.sku || '',
                    currentStock: group.totalStockOfficial + group.totalStockThirdParty,
                    stockOfficial: group.totalStockOfficial,
                    stockThirdParty: group.totalStockThirdParty,
                    inTransit: group.totalInTransit,
                    dailySales: group.totalDailySales,
                    leadTime: leadTime,
                    replenishCycle: 30,
                    costPerUnit: group.maxCost
                };
                const calc = calculateRestock(syntheticItem, targetDate, leadTime);
                return {
                    sku: group.items.map(i => i.sku).join(', '),
                    productName: group.name,
                    currentStock: syntheticItem.currentStock,
                    avgDailySales: group.totalDailySales,
                    suggestedQty: calc.restockQty,
                    estimatedDays: Number(calc.daysCovered) || 0,
                };
            });
            await addRestockRecord(name, items);
            setRecordName('');
            for (const item of inventory) {
                await deleteInventoryItem(item.id);
            }
            showToast('已保存到补货记录', 'success');
        } catch {
            showToast('保存失败', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden flex flex-col min-h-[400px] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 relative z-10">
            <div className="p-4 border-b border-white/20 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">{t.detailsTitle}</h3>
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        value={recordName}
                        onChange={(e) => setRecordName(e.target.value)}
                        placeholder="输入记录名称（可选）"
                        className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none w-40 transition"
                    />
                    <button
                        onClick={handleSaveRecord}
                        disabled={saving || groupedInventory.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-bold rounded-lg hover:shadow-lg hover:shadow-indigo-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Save size={14} />{saving ? '保存中...' : '保存到补货记录'}
                    </button>
                    <div className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg flex items-center gap-1 font-medium">
                        <Layers size={14} />
                        <span>名称相同的 SKU 自动合并计算</span>
                    </div>
                </div>
            </div>

            <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                    <thead className="bg-white/50 backdrop-blur-md text-slate-500 sticky top-0 z-10 shadow-sm border-b border-white/60">
                        <tr>
                            <th className="p-4 w-8"></th>
                            <th className="p-4 text-left">{t.table.product}</th>
                            <th className="p-4 text-center">{t.table.stockOfficial}</th>
                            <th className="p-4 text-center">{t.table.stockThirdParty}</th>
                            <th className="p-4 text-center">{t.table.transit}</th>
                            <th className="p-4 text-center">{t.table.sales}</th>
                            <th className="p-4 text-center">{t.table.coverage}</th>
                            <th className="p-4 text-center">{t.table.restockQty}</th>
                            <th className="p-4 text-center w-16">{t.table.action}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {groupedInventory.map(group => {
                            const hasMultiple = group.items.length > 1;
                            const isExpanded = expandedGroups.has(group.groupKey);

                            // Parent Calculation
                            const syntheticItem: InventoryItem = {
                                id: 'group-' + group.groupKey,
                                name: group.name,
                                sku: 'MULTIPLE',
                                currentStock: group.totalStockOfficial + group.totalStockThirdParty,
                                stockOfficial: group.totalStockOfficial,
                                stockThirdParty: group.totalStockThirdParty,
                                inTransit: group.totalInTransit,
                                dailySales: group.totalDailySales,
                                leadTime: leadTime,
                                replenishCycle: 30,
                                costPerUnit: group.maxCost
                            };

                            const calc = calculateRestock(syntheticItem, targetDate, leadTime);
                            const isCritical = calc.status === 'Critical';

                            // If single item, we render inputs directly in parent row. 
                            // If multiple, we render spans in parent row and inputs in child rows.
                            const singleItem = !hasMultiple ? group.items[0] : null;

                            return (
                                <React.Fragment key={group.groupKey}>
                                    {/* PARENT ROW */}
                                    <tr
                                        className={`transition-colors ${hasMultiple ? 'hover:bg-indigo-50/30 cursor-pointer' : 'hover:bg-white/60'}`}
                                        onClick={() => hasMultiple && toggleGroup(group.groupKey)}
                                    >
                                        <td className="p-4 text-center text-slate-400">
                                            {hasMultiple && (
                                                <button onClick={(e) => { e.stopPropagation(); toggleGroup(group.groupKey); }}>
                                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                </button>
                                            )}
                                        </td>
                                        <td className="p-4 min-w-[200px]">
                                            {singleItem ? (
                                                <div>
                                                    <div className="flex items-center gap-1 mb-1">
                                                        <Edit2 size={12} className="text-slate-300" />
                                                        <input
                                                            type="text"
                                                            value={singleItem.name}
                                                            onChange={(e) => handleUpdate(singleItem.id, 'name', e.target.value)}
                                                            className="font-bold text-slate-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-full transition-colors"
                                                        />
                                                    </div>
                                                    <div className="text-xs text-slate-400">SKU: {singleItem.sku}</div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Layers size={14} className="text-indigo-500" />
                                                        <span className="font-bold text-indigo-900">{group.name}</span>
                                                    </div>
                                                    <div className="text-xs text-indigo-400 font-medium">
                                                        {group.items.length} SKUs Merged
                                                    </div>
                                                </div>
                                            )}
                                        </td>

                                        {/* STOCK OFFICIAL */}
                                        <td className="p-4 text-center">
                                            {singleItem ? (
                                                <input
                                                    type="number"
                                                    value={singleItem.stockOfficial}
                                                    onChange={(e) => handleUpdate(singleItem.id, 'stockOfficial', e.target.value)}
                                                    className="w-20 p-1 border rounded text-center bg-orange-50 text-orange-800 font-semibold focus:ring-2 focus:ring-orange-200 outline-none"
                                                />
                                            ) : (
                                                <span className="font-bold text-orange-800 bg-orange-50 px-2 py-1 rounded">{group.totalStockOfficial}</span>
                                            )}
                                        </td>

                                        {/* STOCK THIRD PARTY */}
                                        <td className="p-4 text-center">
                                            {singleItem ? (
                                                <input
                                                    type="number"
                                                    value={singleItem.stockThirdParty}
                                                    onChange={(e) => handleUpdate(singleItem.id, 'stockThirdParty', e.target.value)}
                                                    className="w-20 p-1 border rounded text-center bg-sky-50 text-sky-800 font-semibold focus:ring-2 focus:ring-sky-200 outline-none"
                                                />
                                            ) : (
                                                <span className="font-bold text-sky-800 bg-sky-50 px-2 py-1 rounded">{group.totalStockThirdParty}</span>
                                            )}
                                        </td>

                                        {/* TRANSIT */}
                                        <td className="p-4 text-center">
                                            {singleItem ? (
                                                <input
                                                    type="number"
                                                    value={singleItem.inTransit}
                                                    onChange={(e) => handleUpdate(singleItem.id, 'inTransit', e.target.value)}
                                                    className="w-20 p-1 border rounded text-center bg-blue-50 text-blue-700 font-semibold focus:ring-2 focus:ring-blue-200 outline-none"
                                                />
                                            ) : (
                                                <span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded">{group.totalInTransit}</span>
                                            )}
                                        </td>

                                        {/* SALES */}
                                        <td className="p-4 text-center">
                                            {singleItem ? (
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={singleItem.dailySales}
                                                    onChange={(e) => handleUpdate(singleItem.id, 'dailySales', e.target.value)}
                                                    className="w-16 p-1 border rounded text-center"
                                                />
                                            ) : (
                                                <span className="font-bold text-slate-700">{group.totalDailySales.toFixed(1)}</span>
                                            )}
                                        </td>

                                        {/* CALCULATION RESULTS */}
                                        <td className="p-4 text-center">
                                            <div className={`inline-flex items-center gap-1 font-bold ${isCritical ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                {calc.daysCovered} {t.table.days}
                                                {isCritical && <AlertCircle size={14} />}
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-sm font-bold text-slate-800">
                                                    {calc.restockQty}
                                                </span>
                                                <span className="text-xs text-slate-400">
                                                    ${calc.restockCost.toLocaleString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            {singleItem && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteItem(e, singleItem)}
                                                    className={`border p-2 rounded-lg transition-all shadow-sm z-10 relative cursor-pointer inline-flex items-center justify-center gap-1
                                                        ${deleteConfirmId === singleItem.id
                                                            ? 'bg-rose-600 border-rose-600 text-white w-full'
                                                            : 'bg-white border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600'
                                                        }`}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>

                                    {/* CHILD ROWS (Expanded) */}
                                    {hasMultiple && isExpanded && group.items.map(item => (
                                        <tr key={item.id} className="bg-slate-50 border-b border-slate-100 animate-in slide-in-from-top-1">
                                            <td className="p-4 text-right">
                                                <div className="w-4 h-full border-r border-slate-300 mx-auto opacity-50"></div>
                                            </td>
                                            <td className="p-4 pl-8">
                                                <div className="flex items-center gap-2">
                                                    <Edit2 size={12} className="text-slate-300" />
                                                    <input
                                                        type="text"
                                                        value={item.name}
                                                        onChange={(e) => handleUpdate(item.id, 'name', e.target.value)}
                                                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-600 w-full focus:ring-1 focus:ring-indigo-500 outline-none"
                                                    />
                                                </div>
                                                <div className="text-[10px] text-slate-400 mt-1 ml-5">SKU: {item.sku}</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <input
                                                    type="number"
                                                    value={item.stockOfficial}
                                                    onChange={(e) => handleUpdate(item.id, 'stockOfficial', e.target.value)}
                                                    className="w-16 p-1 border rounded text-center text-xs bg-white focus:bg-orange-50"
                                                />
                                            </td>
                                            <td className="p-4 text-center">
                                                <input
                                                    type="number"
                                                    value={item.stockThirdParty}
                                                    onChange={(e) => handleUpdate(item.id, 'stockThirdParty', e.target.value)}
                                                    className="w-16 p-1 border rounded text-center text-xs bg-white focus:bg-sky-50"
                                                />
                                            </td>
                                            <td className="p-4 text-center">
                                                <input
                                                    type="number"
                                                    value={item.inTransit}
                                                    onChange={(e) => handleUpdate(item.id, 'inTransit', e.target.value)}
                                                    className="w-16 p-1 border rounded text-center text-xs bg-white focus:bg-blue-50"
                                                />
                                            </td>
                                            <td className="p-4 text-center">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={item.dailySales}
                                                    onChange={(e) => handleUpdate(item.id, 'dailySales', e.target.value)}
                                                    className="w-16 p-1 border rounded text-center text-xs bg-white"
                                                />
                                            </td>
                                            <td colSpan={2} className="p-4 text-center text-[10px] text-slate-400 italic bg-slate-50/50">
                                                Included in group calculation
                                            </td>
                                            <td className="p-4 text-center">
                                                <button onClick={(e) => handleDeleteItem(e, item)} className="p-1.5 bg-white border border-slate-200 rounded text-slate-400 hover:text-red-500 hover:border-red-200">
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
                {inventory.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                        <Package size={48} className="mx-auto mb-4 opacity-20" />
                        <p>{t.empty.text}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
