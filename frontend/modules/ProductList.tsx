import React, { useState } from 'react';
import { useStore } from '../StoreContext';
import {
    Search, Plus, FileSpreadsheet, Eye, Edit2, Trash2,
    ChevronLeft, ChevronRight, X, Calculator, List
} from 'lucide-react';
import { ProductCalcData, AppState } from '../types';
import { writeFile, utils } from 'xlsx';

interface ProductListProps {
    onNavigate: (view: AppState['currentView']) => void;
}

export const ProductList: React.FC<ProductListProps> = ({ onNavigate }) => {
    const { products, deleteProduct, updateProduct, setCalculatorImport, addProduct, strings } = useStore();
    const t = strings.productList;

    // Tabs State: matches ProfitCalculator region tabs
    const [activeTab, setActiveTab] = useState<'PH' | 'MY' | 'SG' | 'ID' | 'TH'>('MY');

    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Modal States
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductCalcData | null>(null);

    // Edit Form State
    const [editFormData, setEditFormData] = useState<Partial<ProductCalcData>>({});

    // Filtering: Search AND Country
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCountry = (p.country || 'MY') === activeTab; // Default to MY if undefined
        return matchesSearch && matchesCountry;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    const handleExport = () => {
        if (filteredProducts.length === 0) return alert('No data to export for this country');

        const ws = utils.json_to_sheet(filteredProducts.map(p => ({
            "Product Name": p.name,
            "SKU": p.sku,
            "Country": p.country,
            "Price": p.totalRevenue,
            "Cost": p.cost,
            "Weight (g)": p.productWeight,
            "Profit": p.profit,
            "Margin %": p.margin,
            "ROI": p.costMargin,
            "Ad ROI": p.adROI,
            "Cross Border Fee": p.crossBorderFee,
            "Qty/Box": p.quantityPerBox,
            "Volume": p.volume
        })));

        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, `${activeTab}_Products`);
        writeFile(wb, `Product_List_${activeTab}.xlsx`);
    };

    // Actions
    const handleView = (product: ProductCalcData) => {
        setSelectedProduct(product);
        setShowDetailModal(true);
    };

    const handleEdit = (product: ProductCalcData) => {
        // Import to profit calculator and navigate
        setCalculatorImport(product);
        onNavigate('profit');
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            deleteProduct(id);
        }
    };

    const handleImportToCalculator = () => {
        if (selectedProduct) {
            setCalculatorImport(selectedProduct);
            setShowDetailModal(false);
            onNavigate('profit');
        }
    };

    const handleSaveEdit = () => {
        if (!editFormData.name) return;

        const updatedProduct = {
            ...selectedProduct,
            ...editFormData,
            country: activeTab // Ensure it stays in the active tab country or sets it if new
        };

        if (selectedProduct && selectedProduct.id) {
            updateProduct(updatedProduct as ProductCalcData);
        } else {
            // Add New
            addProduct({ ...updatedProduct, id: Date.now().toString() } as ProductCalcData);
        }
        setShowEditModal(false);
    };

    const openAddModal = () => {
        setSelectedProduct({} as ProductCalcData);
        setEditFormData({ country: activeTab });
        setShowEditModal(true);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Modals */}
            {/* Detail Modal */}
            {showDetailModal && selectedProduct && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-xl font-bold text-slate-800">{t.modals.detailTitle} - {selectedProduct.name}</h3>
                            <div className="flex gap-2">
                                <button onClick={handleImportToCalculator} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition">
                                    <Calculator size={14} /> {t.modals.importCalculator}
                                </button>
                                <button onClick={() => setShowDetailModal(false)}><X size={20} className="text-slate-400 hover:text-indigo-600" /></button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                {Object.entries(t.modals.labels).map(([key, label]) => {
                                    const dataKeyMap: any = {
                                        name: 'name',
                                        price: 'totalRevenue',
                                        cost: 'cost',
                                        weight: 'productWeight',
                                        profit: 'profit',
                                        adROI: 'adROI',
                                        crossBorder: 'crossBorderFee',
                                        qtyPerBox: 'quantityPerBox',
                                        volume: 'volume'
                                    };
                                    const val = selectedProduct[dataKeyMap[key] as keyof ProductCalcData];
                                    return (
                                        <div key={key} className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-100">
                                            <span className="text-xs font-bold text-slate-400 uppercase mb-1">{label}</span>
                                            <span className="font-medium text-slate-800">{val !== undefined ? val : '-'}</span>
                                        </div>
                                    );
                                })}
                                <div className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="text-xs font-bold text-slate-400 uppercase mb-1">SKU</span>
                                    <span className="font-medium text-slate-800">{selectedProduct.sku}</span>
                                </div>
                                <div className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="text-xs font-bold text-slate-400 uppercase mb-1">Country</span>
                                    <span className="font-medium text-slate-800">{selectedProduct.country || 'SG'}</span>
                                </div>
                                <div className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <span className="text-xs font-bold text-slate-400 uppercase mb-1">Margin</span>
                                    <span className="font-medium text-emerald-600">{selectedProduct.margin}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col border border-white/50 animate-in zoom-in-95">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800">
                                {selectedProduct?.id ? t.modals.editTitle : t.modals.addTitle}
                            </h3>
                            <button onClick={() => setShowEditModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.name}</label>
                                <input type="text" className="w-full p-2 border rounded-lg" value={editFormData.name || ''} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
                                    <input type="text" className="w-full p-2 border rounded-lg" value={editFormData.sku || ''} onChange={e => setEditFormData({ ...editFormData, sku: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.price}</label>
                                    <input type="number" className="w-full p-2 border rounded-lg" value={editFormData.totalRevenue || ''} onChange={e => setEditFormData({ ...editFormData, totalRevenue: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.cost}</label>
                                    <input type="number" className="w-full p-2 border rounded-lg" value={editFormData.cost || ''} onChange={e => setEditFormData({ ...editFormData, cost: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.weight}</label>
                                    <input type="number" className="w-full p-2 border rounded-lg" value={editFormData.productWeight || ''} onChange={e => setEditFormData({ ...editFormData, productWeight: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.profit}</label>
                                    <input type="number" className="w-full p-2 border rounded-lg" value={editFormData.profit || ''} onChange={e => setEditFormData({ ...editFormData, profit: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.adROI}</label>
                                    <input type="number" className="w-full p-2 border rounded-lg" value={editFormData.adROI || ''} onChange={e => setEditFormData({ ...editFormData, adROI: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.crossBorder}</label>
                                    <input type="number" className="w-full p-2 border rounded-lg" value={editFormData.crossBorderFee || ''} onChange={e => setEditFormData({ ...editFormData, crossBorderFee: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.qtyPerBox}</label>
                                    <input type="number" className="w-full p-2 border rounded-lg" value={editFormData.quantityPerBox || ''} onChange={e => setEditFormData({ ...editFormData, quantityPerBox: parseFloat(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{t.modals.labels.volume}</label>
                                    <input type="text" className="w-full p-2 border rounded-lg" value={editFormData.volume || ''} onChange={e => setEditFormData({ ...editFormData, volume: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-2xl">
                            <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50">{t.modals.cancel}</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">{t.modals.save}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header Section */}
            <div className="bg-white/70 backdrop-blur-xl p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 shrink-0 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <List className="text-indigo-600" /> {t.title}
                    </h2>

                    <div className="flex flex-wrap gap-4 items-center w-full md:w-auto">
                        <div className="relative flex-1 md:w-64">
                            <input
                                type="text"
                                placeholder={t.searchPlaceholder}
                                value={searchTerm}
                                onChange={handleSearch}
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            />
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>

                        <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition shadow-sm font-medium text-sm">
                            <Plus size={16} /> {t.addProduct}
                        </button>
                        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition shadow-sm font-medium text-sm">
                            <FileSpreadsheet size={16} /> {t.exportExcel}
                        </button>
                    </div>
                </div>

                {/* Country Tabs */}
                <div className="flex gap-2 border-b border-slate-100">
                    {[
                        { code: 'PH' as const, name: '菲律宾' },
                        { code: 'MY' as const, name: '马来西亚' },
                        { code: 'SG' as const, name: '新加坡' },
                        { code: 'ID' as const, name: '印尼' },
                        { code: 'TH' as const, name: '泰国' }
                    ].map(tab => (
                        <button
                            key={tab.code}
                            onClick={() => { setActiveTab(tab.code); setCurrentPage(1); }}
                            className={`px-6 py-2.5 text-sm font-bold border-b-2 transition-all duration-200 
                           ${activeTab === tab.code
                                    ? 'border-indigo-600 text-indigo-700'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                                }`}
                        >
                            {tab.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 overflow-hidden flex flex-col hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all duration-300 relative z-10">
                <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/50 backdrop-blur-md text-indigo-900 font-semibold sticky top-0 z-10 border-b border-white/60">
                            <tr>
                                <th className="p-4">{t.table.name}</th>
                                <th className="p-4">{t.table.price}</th>
                                <th className="p-4">{t.table.cost}</th>
                                <th className="p-4">{t.table.weight}</th>
                                <th className="p-4">{t.table.profit}</th>
                                <th className="p-4">{t.table.adROI}</th>
                                <th className="p-4">{t.table.crossBorder}</th>
                                <th className="p-4">{t.table.qtyPerBox}</th>
                                <th className="p-4">{t.table.volume}</th>
                                <th className="p-4 w-24 text-center">{t.table.action}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/40">
                            {currentProducts.map(p => (
                                <tr key={p.id} className="hover:bg-white/60 transition-colors">
                                    <td className="p-4 font-medium text-slate-800">{p.name}</td>
                                    <td className="p-4 text-slate-600">${p.totalRevenue?.toFixed(2)}</td>
                                    <td className="p-4 text-slate-600">${p.cost?.toFixed(2)}</td>
                                    <td className="p-4 text-slate-600">{p.productWeight}</td>
                                    <td className="p-4 font-bold text-emerald-600">${p.profit?.toFixed(2)}</td>
                                    <td className="p-4 text-slate-600">{p.adROI}</td>
                                    <td className="p-4 text-slate-600">${p.crossBorderFee}</td>
                                    <td className="p-4 text-slate-600">{p.quantityPerBox || '-'}</td>
                                    <td className="p-4 text-slate-600">{p.volume || '-'}</td>
                                    <td className="p-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <button onClick={() => handleView(p)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition" title="View"><Eye size={16} /></button>
                                            <button onClick={() => handleEdit(p)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition" title="Edit"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {currentProducts.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-slate-400 italic">No products found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-4 border-t border-white/40 flex justify-between items-center bg-white/30 backdrop-blur-md rounded-b-3xl">
                    <div className="text-xs text-slate-500 font-medium">
                        {t.pagination.showing} <span className="font-bold text-slate-700">{filteredProducts.length > 0 ? startIndex + 1 : 0}</span> {t.pagination.to} <span className="font-bold text-slate-700">{Math.min(startIndex + itemsPerPage, filteredProducts.length)}</span> {t.pagination.of} <span className="font-bold text-slate-700">{filteredProducts.length}</span> {t.pagination.items}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 border rounded-lg bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pNum = i + 1;
                                if (totalPages > 5 && currentPage > 3) {
                                    pNum = currentPage - 2 + i;
                                    if (pNum > totalPages) pNum = i + 1;
                                }
                                if (totalPages <= 5) pNum = i + 1;

                                return (
                                    <button
                                        key={pNum}
                                        onClick={() => setCurrentPage(pNum)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition
                                        ${currentPage === pNum ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}
                                    `}
                                    >
                                        {pNum}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="p-2 border rounded-lg bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
