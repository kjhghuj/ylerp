
export interface ProductCalcData {
  id: string;
  name: string;
  sku: string;
  country?: 'SG' | 'MY' | 'PH' | 'TH' | 'CN' | 'ID'; // Country Code
  totalRevenue: number; // Selling Price
  cost: number; // Purchase Cost
  
  // Weights & Shipping
  productWeight: number;
  firstWeight: number;
  baseShippingFee: number;
  extraShippingFee: number; // Per 10g
  crossBorderFee: number;
  
  // Coupons & Discounts
  sellerCoupon: number;
  platformCoupon: number;
  platformCouponRate?: number; // New field for Percentage
  
  // Rates
  platformCommissionRate: number;
  transactionFeeRate: number;
  damageReturnRate: number;
  adROI: number;
  vatRate: number;
  corporateIncomeTaxRate: number;
  supplierTaxPoint: number;
  
  // Service Fees Rates
  mdvServiceFeeRate: number;
  fssServiceFeeRate: number;
  ccbServiceFeeRate: number;
  
  // Fixed Fees
  platformInfrastructureFee: number;
  warehouseOperationFee: number;
  
  // Logic Switches
  supplierInvoice: 'yes' | 'no';
  
  // Logistics Info (New)
  quantityPerBox?: number;
  volume?: string; // e.g. "30x20x30"
  
  // Calculated Results
  shipping: number; // Calculated Total Shipping
  fees: number; // Calculated Total Platform Fees
  marketing: number; // Calculated Ad Spend
  taxes: number; // Calculated Total Taxes
  profit: number; // Net Profit (Final Revenue)
  margin: number; // Revenue Profit Margin
  costMargin: number; // Cost Profit Margin
}

export interface FinanceRecord {
  id: string;
  date: string;
  type: 'income' | 'expense' | 'debt_repayment' | 'new_debt' | 'debt_balance' | 'account_balance';
  amount: number;
  category: string;
  description: string;
  accountId: 'main'; 
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string; 
  currentStock: number; 
  stockOfficial: number; 
  stockThirdParty: number; 
  inTransit: number;
  dailySales: number; 
  leadTime: number; 
  replenishCycle: number; 
  costPerUnit: number; 
}

export interface WarehouseMapping {
  id: string;
  officialWarehouseId?: string;
  thirdPartyWarehouseId?: string;
  sku: string; 
  type: 'official' | 'third';
}

export interface SkuGroupMapping {
    id: string;
    groupName: string; // The unified Product Name
    skus: string[]; // List of SKUs belonging to this group
}

export interface AppState {
  currentView: 'dashboard' | 'profit' | 'finance' | 'inventory' | 'pricing' | 'product-list' | 'user-management';
}
