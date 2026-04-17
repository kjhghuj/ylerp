import { InventoryItem } from '../../../types';

export const calculateRestock = (
    item: InventoryItem, 
    targetDate: string, 
    leadTime: number
) => {
    const salesPerDay = item.dailySales; 
    if (salesPerDay === 0) return { daysCovered: '999.0', status: 'Stagnant', restockQty: 0, restockCost: 0 };

    // Total Stock = Official + Third Party + In Transit
    const totalStock = (item.currentStock || 0) + (item.inTransit || 0);
    const daysCovered = totalStock / salesPerDay;
    
    let status = 'Healthy';
    
    // Status check
    if (daysCovered < leadTime) {
        status = 'Critical';
    }
    
    // Calculate Target Turnover Days based on Target Date
    const today = new Date();
    today.setHours(0,0,0,0);
    const targetD = new Date(targetDate);
    targetD.setHours(0,0,0,0);
    
    // Difference in days
    const diffTime = targetD.getTime() - today.getTime();
    const targetTurnoverDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // FORMULA: Target Stock Needed = (Days until Target Date) * Daily Sales
    const targetStock = targetTurnoverDays * salesPerDay;
    
    // Calculate Restock Qty: Target Needed - (On Hand + In Transit)
    const restockQty = Math.max(0, Math.ceil(targetStock - totalStock));

    return {
        daysCovered: daysCovered.toFixed(1),
        status,
        restockQty,
        restockCost: restockQty * (item.costPerUnit || 0)
    };
};
