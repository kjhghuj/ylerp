import React, { useState } from 'react';
import { useStore } from '../StoreContext';
import { RestockRecord } from '../types';
import { ClipboardList, Trash2, ChevronDown, ChevronRight, Package, Calendar, FileText } from 'lucide-react';
import { useToast } from '../components/Toast';

export const RestockRecords: React.FC = () => {
    const { restockRecords, deleteRestockRecord } = useStore();
    const { showToast } = useToast();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const toggleExpand = (id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteRestockRecord(id);
            showToast('删除成功', 'success');
            setConfirmDeleteId(null);
        } catch {
            showToast('删除失败', 'error');
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const totalItems = (record: RestockRecord) => {
        const items = Array.isArray(record.items) ? record.items : [];
        return items.reduce((sum: number, item: any) => sum + (item.suggestedQty || 0), 0);
    };

    if (restockRecords.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 p-8">
                <div className="p-6 bg-slate-100 rounded-3xl">
                    <ClipboardList size={56} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-500">暂无补货记录</h3>
                <p className="text-sm text-slate-400 max-w-md text-center">在"智能补货"模块中生成补货建议后，可点击保存将补货详情保存到此处查看</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                    <ClipboardList size={24} />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800">补货记录</h2>
                    <p className="text-sm text-slate-400">共 {restockRecords.length} 条记录</p>
                </div>
            </div>

            <div className="space-y-3">
                {restockRecords.map(record => {
                    const isExpanded = expandedId === record.id;
                    const items = record.items as any[];
                    return (
                        <div key={record.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition">
                            <div
                                className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50/50 transition"
                                onClick={() => toggleExpand(record.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="text-indigo-500">
                                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-base">{record.name}</h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className="flex items-center gap-1 text-xs text-slate-400">
                                                <Calendar size={12} /> {formatDate(record.createdAt)}
                                            </span>
                                            <span className="flex items-center gap-1 text-xs text-slate-400">
                                                <Package size={12} /> {items.length} 个SKU
                                            </span>
                                            <span className="flex items-center gap-1 text-xs text-indigo-500 font-medium">
                                                <FileText size={12} /> 建议补货 {totalItems(record).toLocaleString()} 件
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {confirmDeleteId === record.id ? (
                                        <div className="flex items-center gap-2">
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(record.id); }} className="px-3 py-1.5 bg-rose-500 text-white text-xs font-bold rounded-lg hover:bg-rose-600 transition">确认删除</button>
                                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition">取消</button>
                                        </div>
                                    ) : (
                                        <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(record.id); }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/50">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                                <th className="py-3 pl-5 text-left">SKU</th>
                                                <th className="py-3 text-left">产品名称</th>
                                                <th className="py-3 text-right">当前库存</th>
                                                <th className="py-3 text-right">日均销量</th>
                                                <th className="py-3 text-right pr-5">建议补货</th>
                                                <th className="py-3 text-right pr-5">预计天数</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map((item: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-white transition">
                                                    <td className="py-3 pl-5 font-mono text-xs text-slate-600">{item.sku}</td>
                                                    <td className="py-3 font-medium text-slate-700">{item.productName}</td>
                                                    <td className="py-3 text-right text-slate-600">{typeof item.currentStock === 'number' ? item.currentStock.toLocaleString() : '-'}</td>
                                                    <td className="py-3 text-right text-slate-600">{typeof item.avgDailySales === 'number' ? item.avgDailySales.toFixed(1) : '-'}</td>
                                                    <td className="py-3 text-right pr-5 font-bold text-indigo-600">{typeof item.suggestedQty === 'number' ? item.suggestedQty.toLocaleString() : '-'}</td>
                                                    <td className="py-3 text-right pr-5 text-slate-500">{typeof item.estimatedDays === 'number' ? `${item.estimatedDays.toFixed(0)}天` : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
