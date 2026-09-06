
export interface SiteData {
  totalRevenue?: number;
  sellerCoupon?: number;
  sellerCouponType?: 'fixed' | 'percent';
  sellerCouponPlatformRatio?: number;
  adROI?: number;
  platformInfrastructureFee?: number;
}

export interface ProductCalcData {
  id: string;
  name: string;
  sku: string;
  country?: 'SG' | 'MY' | 'PH' | 'TH' | 'CN' | 'ID';
  sites?: ('SG' | 'MY' | 'PH' | 'TH' | 'CN' | 'ID')[];
  cost: number;
  productWeight: number;
  ycLengthCm?: number | null;
  ycWidthCm?: number | null;
  ycHeightCm?: number | null;
  ycVolumeM3?: number | null;
  ycSpecsSyncedAt?: string | null;
  supplierInvoice: 'yes' | 'no';
  supplierTaxPoint: number;
  vatRate?: number;
  corporateIncomeTaxRate?: number;
  sellerCouponType?: 'fixed' | 'percent';
  sellerCoupon?: number;
  sellerCouponPlatformRatio?: number;
  adROI?: number;
  totalRevenue?: number;
  platformInfrastructureFee?: number;
  siteData?: Record<string, SiteData>;
}

export interface FinanceRecord {
  id: string;
  date: string;
  type: 'income' | 'expense' | 'debt_repayment' | 'new_debt' | 'debt_balance' | 'account_balance';
  amount: number;
  category: string;
  description: string;
  accountId: 'main';
  userId?: string;
  updatedBy?: string;
  user?: { id: string; displayName: string };
}

export interface AppState {
  currentView: 'dashboard' | 'profit' | 'finance' | 'restock-v2'
    | 'product-list' | 'user-management' | 'chroma-adapt' | 'personal-center' | 'schedule' | 'usage-stats' | 'product-analysis';
}
