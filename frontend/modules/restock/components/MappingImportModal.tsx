import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Download } from 'lucide-react';
import { read, utils, writeFile } from 'xlsx';
import { useStore } from '../../../StoreContext';

interface MappingImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    t: any;
    type: 'official' | 'third' | 'grouping';
}

export const MappingImportModal: React.FC<MappingImportModalProps> = ({ isOpen, onClose, t, type }) => {
    const { addMapping, addSkuGroup } = useStore();
    const [selectedMappingFile, setSelectedMappingFile] = useState<File | null>(null);
    const mappingFileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleDownloadTemplate = () => {
        let header, row1;
        
        if (type === 'grouping') {
            header = { "Name": "Super Fan (White)", "SKU": "FAN-001" };
            row1 = { "Name": "Super Fan (White)", "SKU": "FAN-002" };
        } else if (type === 'official') {
            header = { "OfficialWarehouseID": "WH-ABC-123", "SystemSKU": "SKU-001" };
            row1 = { "OfficialWarehouseID": "WH-XYZ-789", "SystemSKU": "SKU-002" };
        } else {
            // third
            header = { "3PF_SKU": "TP-XYZ-789", "SystemSKU": "SKU-002" };
            row1 = { "3PF_SKU": "TP-123-456", "SystemSKU": "SKU-003" };
        }
            
        const ws = utils.json_to_sheet([header, row1]);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Template");
        writeFile(wb, `Mapping_Template_${type}.xlsx`);
    };

    const handleMappingFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedMappingFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setSelectedMappingFile(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const processMappingImport = async () => {
        if (!selectedMappingFile) return;
        try {
            const buffer = await selectedMappingFile.arrayBuffer();
            const wb = read(buffer);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData = utils.sheet_to_json(ws);
            
            let count = 0;

            if (type === 'grouping') {
                // Grouping Logic: Aggregate SKUs by Name
                const groupMap = new Map<string, Set<string>>();

                jsonData.forEach((row: any) => {
                    const name = row['Name'] || row['产品名称'] || row['聚合名称'] || row['Group Name'];
                    const sku = row['SKU'] || row['系统 SKU'] || row['Product SKU'];
                    
                    if (name && sku) {
                        const cleanName = String(name).trim();
                        const cleanSku = String(sku).trim();
                        if (!groupMap.has(cleanName)) {
                            groupMap.set(cleanName, new Set());
                        }
                        groupMap.get(cleanName)!.add(cleanSku);
                    }
                });

                // Convert Map to Store Actions
                for (const [groupName, skuSet] of groupMap) {
                    addSkuGroup({
                        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        groupName: groupName,
                        skus: Array.from(skuSet)
                    });
                    count++;
                }

            } else {
                // Warehouse Mapping Logic
                jsonData.forEach((row: any, index: number) => {
                    let offId = '';
                    if (type === 'official') {
                        offId = row['OfficialWarehouseID'] || row['官方仓 SKU ID'] || row['Official ID'];
                    } else {
                        offId = row['3PF_SKU'] || row['ThirdPartyWarehouseID'] || row['三方仓 SKU ID'] || row['Third Party ID'] || row['External ID'];
                    }
                    const sysSku = row['SystemSKU'] || row['系统 SKU'] || row['SKU'];

                    if (offId && sysSku) {
                        addMapping({
                            id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
                            officialWarehouseId: type === 'official' ? String(offId).trim() : undefined,
                            thirdPartyWarehouseId: type === 'third' ? String(offId).trim() : undefined,
                            sku: String(sysSku).trim(),
                            type: type
                        });
                        count++;
                    }
                });
            }

            alert(`${t.imports.success} ${count}`);
            onClose();
            setSelectedMappingFile(null);
        } catch (error) {
            console.error("Error parsing Excel:", error);
            alert(t.messages.errorParse);
        }
    };

    const getTitle = () => {
        switch(type) {
            case 'official': return t.imports.tabs.official;
            case 'third': return t.imports.tabs.third;
            case 'grouping': return t.imports.tabs.grouping;
            default: return '';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-bold text-slate-800">{t.imports.mappingModalTitle}</h3>
                        <p className="text-xs text-blue-600 font-bold uppercase">{getTitle()}</p>
                    </div>
                    <button onClick={() => {onClose(); setSelectedMappingFile(null);}} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div 
                        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group
                            ${selectedMappingFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50'}`}
                        onClick={() => mappingFileInputRef.current?.click()}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                    >
                        <input type="file" ref={mappingFileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleMappingFileSelect} />
                        
                        {selectedMappingFile ? (
                            <>
                                <FileSpreadsheet size={40} className="text-emerald-500 mb-3" />
                                <p className="text-sm font-semibold text-emerald-700">{selectedMappingFile.name}</p>
                                <p className="text-xs text-emerald-600 mt-1">{(selectedMappingFile.size / 1024).toFixed(1)} KB</p>
                            </>
                        ) : (
                            <>
                                <Upload size={40} className="text-slate-300 group-hover:text-blue-500 mb-3 transition-colors" />
                                <p className="text-sm text-slate-600 font-medium">{t.imports.dropZone}</p>
                                <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv</p>
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={handleDownloadTemplate} 
                            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 hover:border-slate-300 transition"
                        >
                            <Download size={16} /> {t.imports.downloadTemplate}
                        </button>
                        <button 
                            onClick={processMappingImport}
                            disabled={!selectedMappingFile}
                            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white shadow-lg shadow-blue-100 transition
                                ${selectedMappingFile 
                                    ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-200 translate-y-0' 
                                    : 'bg-slate-300 cursor-not-allowed shadow-none'}`}
                        >
                            {t.imports.confirm}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
