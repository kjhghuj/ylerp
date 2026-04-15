
export interface ProductCalcData {
  id: string;
  name: string;
  sku: string;
  country?: 'SG' | 'MY' | 'PH' | 'TH' | 'CN' | 'ID';
  sites?: ('SG' | 'MY' | 'PH' | 'TH' | 'CN' | 'ID')[];
  cost: number;
  productWeight: number;
  supplierInvoice: 'yes' | 'no';
  supplierTaxPoint: number;
  sellerCouponType?: 'fixed' | 'percent';
  sellerCoupon?: number;
  sellerCouponPlatformRatio?: number;
  adROI?: number;
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

export interface RestockRecord {
  id: string;
  name: string;
  createdAt: string;
  items: {
    sku: string;
    productName: string;
    currentStock: number;
    avgDailySales: number;
    suggestedQty: number;
    estimatedDays: number;
    supplier?: string;
    note?: string;
  }[];
}

export interface AppState {
  currentView: 'dashboard' | 'profit' | 'finance' | 'inventory' | 'restock-records'
    | 'product-list' | 'user-management' | 'chroma-adapt' | 'personal-center';
}
