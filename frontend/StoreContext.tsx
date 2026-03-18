import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { ProductCalcData, FinanceRecord, InventoryItem, WarehouseMapping, SkuGroupMapping } from './types';
import { translations } from './translations';
import { importedRawData } from './data/initialFinanceData';

type Language = 'zh' | 'en';

interface StoreContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  strings: typeof translations['zh'];

  products: ProductCalcData[];
  addProduct: (p: ProductCalcData) => Promise<void>;
  updateProduct: (p: ProductCalcData) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  calculatorImport: ProductCalcData | null;
  setCalculatorImport: (p: ProductCalcData | null) => void;

  financeRecords: FinanceRecord[];
  addTransaction: (t: FinanceRecord) => Promise<void>;
  updateTransaction: (t: FinanceRecord) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  clearAllTransactions: () => Promise<void>;
  importTransactions: (records: Omit<FinanceRecord, 'id'>[]) => Promise<void>;
  accountBalance: number;
  totalDebt: number;

  inventory: InventoryItem[];
  addInventoryItem: (i: InventoryItem) => Promise<void>;
  updateInventoryItem: (i: Partial<InventoryItem> & { id: string }) => Promise<void>;
  deleteInventoryItem: (id: string) => Promise<void>;

  warehouseMappings: WarehouseMapping[];
  addMapping: (m: WarehouseMapping) => Promise<void>;
  deleteMapping: (id: string) => Promise<void>;

  skuGroupMappings: SkuGroupMapping[];
  addSkuGroup: (m: SkuGroupMapping) => Promise<void>;
  deleteSkuGroup: (id: string) => Promise<void>;

  loading: boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

// Initial Products Data - Updated to match new comprehensive structure
const initialProducts: ProductCalcData[] = [
  {
    id: '1', name: '无线蓝牙耳机', sku: 'WE-001', country: 'SG',
    totalRevenue: 199, cost: 60, productWeight: 150, firstWeight: 50,
    baseShippingFee: 10, extraShippingFee: 0.5, crossBorderFee: 5,
    sellerCoupon: 5, platformCoupon: 5, platformCouponRate: 2.51,
    platformCommissionRate: 15, transactionFeeRate: 3, damageReturnRate: 1, adROI: 3,
    vatRate: 0, corporateIncomeTaxRate: 0, supplierTaxPoint: 0,
    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0,
    platformInfrastructureFee: 0, warehouseOperationFee: 2,
    supplierInvoice: 'yes',
    quantityPerBox: 50, volume: '40x30x30',
    shipping: 15, fees: 30, marketing: 40, taxes: 10, profit: 44, margin: 22.1, costMargin: 73
  },
];

// Initial Inventory Data
const initialInventory: InventoryItem[] = [
  { id: '1', name: '无线蓝牙耳机', sku: 'WE-001', currentStock: 120, stockOfficial: 100, stockThirdParty: 20, inTransit: 50, dailySales: 6.5, leadTime: 25, replenishCycle: 45, costPerUnit: 60 },
  { id: '2', name: '智能运动手表', sku: 'SW-PRO-02', currentStock: 15, stockOfficial: 10, stockThirdParty: 5, inTransit: 0, dailySales: 1.4, leadTime: 30, replenishCycle: 30, costPerUnit: 100 },
];

const initialMappings: WarehouseMapping[] = [
  { id: '1', officialWarehouseId: 'WH-OFF-001-A', sku: 'WE-001', type: 'official' },
  { id: '2', officialWarehouseId: 'WH-OFF-001-B', sku: 'WE-001', type: 'official' },
];

const initialSkuGroups: SkuGroupMapping[] = [];

const normalizeFinanceData = (): FinanceRecord[] => {
  const records: FinanceRecord[] = [];
  let idCounter = 1;

  importedRawData.forEach(monthGroup => {
    // Parse "2025年7月" -> 2025, 7
    const monthMatch = monthGroup.month.match(/(\d{4})年(\d{1,2})月/);
    if (!monthMatch) return;
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]);

    monthGroup.days.forEach((day: any) => {
      // Parse "1日" -> 1
      const dayMatch = day.date.match(/(\d{1,2})日/);
      if (!dayMatch) return;
      const dayNum = parseInt(dayMatch[1]);

      // Format YYYY-MM-DD
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
      const notes = day.notes || '';

      const addRecord = (amountStr: string, type: FinanceRecord['type'], category: string, descPrefix: string) => {
        if (!amountStr) return;
        const amount = parseFloat(amountStr.toString().replace(/,/g, ''));
        if (amount > 0) {
          records.push({
            id: (idCounter++).toString(),
            date: dateStr,
            type,
            amount,
            category,
            description: notes ? `${descPrefix} - ${notes}` : descPrefix,
            accountId: 'main'
          });
        }
      };

      addRecord(day.expectedIncome, 'income', 'Revenue', 'Income');
      addRecord(day.newDebt, 'new_debt', 'Loans', 'New Loan');
      addRecord(day.repayment, 'debt_repayment', 'Debt Service', 'Repayment');
      addRecord(day.rentUtilities, 'expense', 'Operations', 'Rent/Utilities');
      addRecord(day.freightCost, 'expense', 'Logistics', 'Freight');
      addRecord(day.salary, 'expense', 'HR', 'Salary');
    });
  });
  return records;
};

// --- DATA IMPORT LOGIC END ---

import api from './src/api';

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');
  const [loading, setLoading] = useState<boolean>(true);
  const [products, setProducts] = useState<ProductCalcData[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [warehouseMappings, setWarehouseMappings] = useState<WarehouseMapping[]>([]);
  const [skuGroupMappings, setSkuGroupMappings] = useState<SkuGroupMapping[]>([]);
  const [calculatorImport, setCalculatorImport] = useState<ProductCalcData | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const requests = [
          api.get('/products'),
          api.get('/finance'),
          api.get('/inventory'),
          api.get('/warehouse-mappings'),
          api.get('/sku-groups')
        ];

        // Attach dummy catch handlers to prevent unhandled rejection warnings
        // if multiple requests fail simultaneously. Promise.all still catches the first one.
        requests.forEach(req => req.catch(() => {}));

        const [
          prodRes,
          finRes,
          invRes,
          wmRes,
          sgRes
        ] = await Promise.all(requests);

        setProducts(prodRes.data);
        setFinanceRecords(finRes.data);
        setInventory(invRes.data);
        setWarehouseMappings(wmRes.data);
        setSkuGroupMappings(sgRes.data);
      } catch (error) {
        console.error('Failed to fetch initial data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const strings = translations[language];

  const addProduct = async (p: ProductCalcData) => {
    try {
      const res = await api.post('/products', p);
      setProducts(prev => [...prev, res.data]);
    } catch (e) { console.error('Error adding product', e); }
  };
  const updateProduct = async (p: ProductCalcData) => {
    try {
      const res = await api.put(`/products/${p.id}`, p);
      setProducts(prev => prev.map(prod => prod.id === p.id ? res.data : prod));
    } catch (e) { console.error('Error updating product', e); }
  };
  const deleteProduct = async (id: string) => {
    try {
      await api.delete(`/products/${id}`);
      setProducts(prev => prev.filter(p => p.id !== id));
    } catch (e) { console.error('Error deleting product', e); }
  };

  const addTransaction = async (t: FinanceRecord) => {
    try {
      const res = await api.post('/finance', t);
      setFinanceRecords(prev => [...prev, res.data]);
    } catch (e) { console.error('Error adding finance record', e); }
  };
  const updateTransaction = async (t: FinanceRecord) => {
    try {
      const res = await api.put(`/finance/${t.id}`, t);
      setFinanceRecords(prev => prev.map(old => old.id === t.id ? res.data : old));
    } catch (e) { console.error('Error updating finance record', e); }
  };
  const deleteTransaction = async (id: string) => {
    try {
      await api.delete(`/finance/${id}`);
      setFinanceRecords(prev => prev.filter(t => t.id !== id));
    } catch (e) { console.error('Error deleting finance record', e); }
  };

  const importTransactions = async (records: Omit<FinanceRecord, 'id'>[]) => {
    try {
      await api.post('/finance/batch', records);
      // Fetch the updated list from the backend to ensure consistency
      const res = await api.get('/finance');
      setFinanceRecords(res.data);
    } catch (e) { console.error('Error importing finance records', e); }
  };

  const clearAllTransactions = async () => {
    try {
      await api.delete('/finance/all');
      setFinanceRecords([]);
    } catch (e) { console.error('Error clearing finance records', e); }
  };

  const addInventoryItem = async (i: InventoryItem) => {
    try {
      const res = await api.post('/inventory', i);
      setInventory(prev => [...prev, res.data]);
    } catch (e) { console.error('Error adding inventory item', e); }
  };

  const updateInventoryItem = async (i: Partial<InventoryItem> & { id: string }) => {
    try {
      // Find existing to merge before sending
      const existing = inventory.find(item => item.id === i.id);
      if (!existing) return;
      const merged = { ...existing, ...i };
      merged.currentStock = merged.stockOfficial + merged.stockThirdParty;

      const res = await api.put(`/inventory/${i.id}`, merged);
      setInventory(prev => prev.map(item => item.id === i.id ? res.data : item));
    } catch (e) { console.error('Error updating inventory item', e); }
  };

  const deleteInventoryItem = async (id: string) => {
    try {
      await api.delete(`/inventory/${id}`);
      setInventory(prev => prev.filter(i => i.id !== id));
    } catch (e) { console.error('Error deleting inventory item', e); }
  };

  const addMapping = async (m: WarehouseMapping) => {
    try {
      const res = await api.post('/warehouse-mappings', m);
      setWarehouseMappings(prev => [...prev, res.data]);
    } catch (e) { console.error('Error adding warehouse mapping', e); }
  };
  const deleteMapping = async (id: string) => {
    try {
      await api.delete(`/warehouse-mappings/${id}`);
      setWarehouseMappings(prev => prev.filter(m => m.id !== id));
    } catch (e) { console.error('Error deleting warehouse mapping', e); }
  };

  const addSkuGroup = async (m: SkuGroupMapping) => {
    try {
      const res = await api.post('/sku-groups', m);
      setSkuGroupMappings(prev => [...prev, res.data]);
    } catch (e) { console.error('Error adding sku group', e); }
  };
  const deleteSkuGroup = async (id: string) => {
    try {
      await api.delete(`/sku-groups/${id}`);
      setSkuGroupMappings(prev => prev.filter(m => m.id !== id));
    } catch (e) { console.error('Error deleting sku group', e); }
  };

  // Derived Financial State
  const accountBalance = useMemo(() => {
    return financeRecords.reduce((acc, curr) => {
      if (curr.type === 'income' || curr.type === 'new_debt') return acc + curr.amount;
      return acc - curr.amount;
    }, 0);
  }, [financeRecords]);

  const totalDebt = useMemo(() => {
    return financeRecords.reduce((acc, curr) => {
      if (curr.type === 'new_debt') return acc + curr.amount;
      if (curr.type === 'debt_repayment') return acc - curr.amount;
      return acc;
    }, 0);
  }, [financeRecords]);

  return (
    <StoreContext.Provider value={{
      language, setLanguage, strings,
      products, addProduct, updateProduct, deleteProduct,
      calculatorImport, setCalculatorImport,
      financeRecords, addTransaction, updateTransaction, deleteTransaction, clearAllTransactions, importTransactions, accountBalance, totalDebt,
      inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
      warehouseMappings, addMapping, deleteMapping,
      skuGroupMappings, addSkuGroup, deleteSkuGroup
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};
