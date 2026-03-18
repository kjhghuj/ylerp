import React, { useRef } from 'react';
import { read, utils } from 'xlsx';
import { useStore } from '../../../StoreContext';

export const useInventoryImport = (leadTimeSetting: number) => {
    const { inventory, updateInventoryItem, addInventoryItem, warehouseMappings, skuGroupMappings, strings } = useStore();
    const t = strings.inventory;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const importTypeRef = useRef<'sales' | 'sales7' | 'official' | 'third' | null>(null);

    // Helper to find the group name for a SKU, if exists
    const getProductNameFromSku = (sku: string, fallbackName: string): string => {
        const group = skuGroupMappings.find(g => g.skus.includes(sku));
        return group ? group.groupName : fallbackName;
    };

    const handleFileClick = (type: 'sales' | 'sales7' | 'official' | 'third') => {
        importTypeRef.current = type;
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const processFile = async (e: React.ChangeEvent<HTMLInputElement>, onRequireMapping: () => void) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const type = importTypeRef.current;
        if (!type) return;

        try {
            const buffer = await file.arrayBuffer();
            const wb = read(buffer);
            const ws = wb.Sheets[wb.SheetNames[0]];

            let updatedCount = 0;
            let createdCount = 0;

            // Logic Branching based on Type
            if (type === 'sales' || type === 'sales7') {
                const divisor = type === 'sales7' ? 7 : 30;
                const rawData = utils.sheet_to_json(ws, { header: 1 }) as any[][];
                if (rawData.length < 1) { alert(t.messages.emptyFile); return; }

                let headerRowIndex = -1;
                let skuColIdx = -1;
                let totalSalesColIdx = -1;

                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i];
                    if (!Array.isArray(row)) continue;

                    let currentSkuIdx = -1;
                    let currentSalesIdx = -1;

                    row.forEach((cell, colIdx) => {
                        const val = String(cell || '').trim();
                        if (!val) return;

                        if (['平台sku', '平台SKU', '商品SKU', 'SKU'].includes(val)) {
                            currentSkuIdx = colIdx;
                        }
                        if (['有效订单量', '总销量', '销量', '30天销量', '7天销量'].includes(val) || (val.includes('30天') && val.includes('销量')) || (val.includes('7天') && val.includes('销量'))) {
                            currentSalesIdx = colIdx;
                        }
                    });

                    if (currentSkuIdx !== -1 && currentSalesIdx !== -1) {
                        headerRowIndex = i;
                        skuColIdx = currentSkuIdx;
                        totalSalesColIdx = currentSalesIdx;
                        break;
                    }
                }

                if (headerRowIndex === -1) { alert(t.messages.headerMissing); return; }

                const salesMap = new Map<string, number>();
                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row) continue;
                    const rawSku = row[skuColIdx];
                    if (!rawSku) continue;
                    const sku = String(rawSku).trim();
                    let dailySales = 0;
                    if (totalSalesColIdx !== -1 && row[totalSalesColIdx] != null) {
                        let val = 0;
                        const rawSales = row[totalSalesColIdx];
                        if (typeof rawSales === 'number') {
                            val = rawSales;
                        } else if (typeof rawSales === 'string') {
                            const cleanSales = rawSales.replace(/[, ]/g, '');
                            val = parseFloat(cleanSales);
                        }
                        if (!isNaN(val)) dailySales = val / divisor;
                    }
                    if (sku && dailySales >= 0) { salesMap.set(sku, dailySales); }
                }

                for (const item of inventory) {
                    if (salesMap.has(item.sku)) {
                        // Apply naming rule when updating
                        const newName = getProductNameFromSku(item.sku, item.name);

                        await updateInventoryItem({
                            id: item.id,
                            dailySales: salesMap.get(item.sku)!,
                            name: newName // Ensure name is synced with rules
                        });

                        salesMap.delete(item.sku);
                        updatedCount++;
                    }
                }

                for (const [sku, dailySales] of salesMap) {
                    // Apply naming rule when creating
                    const name = getProductNameFromSku(sku, sku);

                    addInventoryItem({
                        id: `auto-${Date.now()}-${createdCount}`,
                        name: name,
                        sku: sku,
                        currentStock: 0,
                        stockOfficial: 0,
                        stockThirdParty: 0,
                        inTransit: 0,
                        dailySales: dailySales,
                        leadTime: leadTimeSetting,
                        replenishCycle: 30,
                        costPerUnit: 0
                    });
                    createdCount++;
                }

            } else if (type === 'third') {
                const rawData = utils.sheet_to_json(ws, { header: 1 }) as any[][];
                let headerRowIndex = -1, skuColIdx = -1, stockColIdx = -1, transitColIdx = -1;

                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i];
                    if (!Array.isArray(row)) continue;
                    row.forEach((cell, colIdx) => {
                        const val = String(cell || '').trim();
                        if (!val) return;

                        if (['SKU', '商品SKU'].includes(val.toUpperCase())) skuColIdx = colIdx;
                        if (['仓库库存', '库存', '可用库存'].includes(val)) stockColIdx = colIdx;
                        if (['头程在途', '在途', '头程'].includes(val)) transitColIdx = colIdx;
                    });
                    if (skuColIdx !== -1 && (stockColIdx !== -1 || transitColIdx !== -1)) {
                        headerRowIndex = i; break;
                    }
                }

                if (headerRowIndex === -1) {
                    alert("无法识别表头。请确保Excel包含 'SKU' 以及 '仓库库存' 或 '头程在途' 列。");
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                const dataMap = new Map<string, { stock: number, transit: number }>();
                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row) continue;
                    const rawSku = row[skuColIdx];
                    if (!rawSku) continue;
                    const skuStr = String(rawSku).trim();

                    // Check Mapping First
                    let systemSku = skuStr;
                    const mapping = warehouseMappings.find(m => m.type === 'third' && m.thirdPartyWarehouseId === skuStr);
                    if (mapping) {
                        systemSku = mapping.sku;
                    }

                    const currentData = dataMap.get(systemSku) || { stock: 0, transit: 0 };

                    if (stockColIdx !== -1) {
                        const rawQty = row[stockColIdx];
                        let qty = 0;
                        if (typeof rawQty === 'number') qty = rawQty;
                        else if (typeof rawQty === 'string') qty = parseFloat(rawQty);
                        if (!isNaN(qty)) currentData.stock += qty;
                    }
                    if (transitColIdx !== -1) {
                        const rawTrans = row[transitColIdx];
                        let trans = 0;
                        if (typeof rawTrans === 'number') trans = rawTrans;
                        else if (typeof rawTrans === 'string') trans = parseFloat(rawTrans);
                        if (!isNaN(trans)) currentData.transit += trans;
                    }
                    dataMap.set(systemSku, currentData);
                }

                for (const item of inventory) {
                    if (dataMap.has(item.sku)) {
                        const data = dataMap.get(item.sku)!;
                        const newName = getProductNameFromSku(item.sku, item.name);

                        const updates: any = { id: item.id, name: newName };
                        if (stockColIdx !== -1) updates.stockThirdParty = data.stock;
                        if (transitColIdx !== -1) updates.inTransit = data.transit;
                        await updateInventoryItem(updates);
                        updatedCount++;
                    }
                }

            } else if (type === 'official') {
                const rawData = utils.sheet_to_json(ws, { header: 1 }) as any[][];
                let headerRowIndex = -1, whIdColIdx = -1, qtyColIdx = -1, skuColIdx = -1;



                for (let i = 0; i < Math.min(rawData.length, 20); i++) {
                    const row = rawData[i];
                    if (!Array.isArray(row)) continue;
                    let currentWhIdIdx = -1, currentQtyIdx = -1, currentSkuIdx = -1;



                    row.forEach((cell, colIdx) => {
                        const val = String(cell || '').trim();
                        if (!val) return;

                        // Identify ID Column (Mapping Key)
                        // Added: '条码' as the primary mapping key
                        if (
                            ['条码', '仓库SKU ID', '仓库SKUID', 'SKU ID', '商品编码', 'Warehouse SKU', 'Warehouse SKU ID', 'Official ID'].includes(val) ||
                            (val.includes('仓库') && val.includes('ID')) ||
                            (val.includes('仓库') && val.includes('SKU'))
                        ) {
                            currentWhIdIdx = colIdx;
                        }

                        // Identify Qty Column
                        // Added: '可销售' explicitly, plus flexible matching
                        if (
                            ['可销售', '总可用', '可销售数量', '良品数量', '良品', '可售', '可用', 'Sellable', 'Available Stock', 'Qty', '库存'].includes(val) ||
                            (val.includes('可用') && !val.includes('不可用')) ||
                            (val.includes('可销售') && !val.includes('不可销售'))
                        ) {
                            currentQtyIdx = colIdx;
                        }

                        // Identify SKU Column (Fallback for direct matching if Barcode/Mapping not found)
                        if (['商家SKU', 'Seller SKU', 'SKU', 'Product SKU', '商品SKU'].includes(val)) {
                            currentSkuIdx = colIdx;
                        }
                    });

                    if (currentQtyIdx !== -1 && (currentWhIdIdx !== -1 || currentSkuIdx !== -1)) {
                        headerRowIndex = i; whIdColIdx = currentWhIdIdx; qtyColIdx = currentQtyIdx; skuColIdx = currentSkuIdx;

                        break;
                    }
                }

                if (headerRowIndex === -1) {

                    alert("无法识别表头。\n请确保Excel包含以下列：\n1. '条码' (用于匹配系统映射)\n2. '可销售' 或 '总可用' (用于更新库存)");
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }

                const stockMap = new Map<string, number>();
                for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row) continue;

                    let targetSystemSku: string | null = null;
                    let matchReason = '';

                    // 1. Try Mapping via Warehouse ID (Barcode)
                    const rawWhId = whIdColIdx !== -1 ? row[whIdColIdx] : null;

                    if (rawWhId) {
                        const whId = String(rawWhId).trim();
                        // Find mapping where officialWarehouseId === whId (barcode)
                        const mapping = warehouseMappings.find(m => m.type === 'official' && m.officialWarehouseId === whId);
                        if (mapping) {
                            targetSystemSku = mapping.sku;
                            matchReason = `Mapped via Barcode '${whId}'`;
                        }
                    }

                    // 2. Try Direct SKU Match (if no mapping found, or ID not present)
                    if (!targetSystemSku && skuColIdx !== -1) {
                        const rawSku = row[skuColIdx];
                        if (rawSku) {
                            const skuStr = String(rawSku).trim();
                            // We just assume the Excel SKU matches the System SKU directly
                            targetSystemSku = skuStr;
                            matchReason = 'Direct SKU match';
                        }
                    }

                    let qty = 0;
                    const rawQty = row[qtyColIdx];
                    if (typeof rawQty === 'number') {
                        qty = rawQty;
                    } else if (typeof rawQty === 'string') {
                        // Handle "1,200", "1 200" etc.
                        const cleanQty = rawQty.replace(/[, ]/g, '');
                        qty = parseFloat(cleanQty);
                    }

                    if (isNaN(qty)) qty = 0;



                    if (targetSystemSku) {
                        // Accumulate stock (handle case where multiple excel rows map to one system sku)
                        const current = stockMap.get(targetSystemSku) || 0;
                        stockMap.set(targetSystemSku, current + qty);
                    }
                }



                for (const item of inventory) {
                    if (stockMap.has(item.sku)) {
                        const newName = getProductNameFromSku(item.sku, item.name);
                        const newQty = stockMap.get(item.sku)!;



                        await updateInventoryItem({
                            id: item.id,
                            stockOfficial: newQty,
                            name: newName
                        });
                        updatedCount++;
                    }
                }


            }

            let message = `${t.messages.complete}\n\n${t.messages.updated}${updatedCount}`;
            if (createdCount > 0) {
                message += `\n${t.messages.created}${createdCount}`;
                message += t.messages.createdNote;
            } else if (updatedCount === 0 && type !== 'sales') {
                message = t.messages.noUpdates + "\n(请查看页面底部的Debug控制台获取详细原因)";
            }
            alert(message);

        } catch (err) {
            console.error(err);
            alert(t.messages.errorFile);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return { fileInputRef, handleFileClick, processFile };
};
