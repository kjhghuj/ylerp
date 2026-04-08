import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { ProductCalcData, FinanceRecord, InventoryItem, WarehouseMapping, SkuGroupMapping, RestockRecord } from './types';
import { translations } from './translations';

type Language = 'zh' | 'en';

export interface ImportedNode {
    name: string;
    country: string;
    platform: string;
    data: Record<string, any>;
}

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
  calculatorImportNodes: ImportedNode[];
  setCalculatorImportNodes: (nodes: ImportedNode[]) => void;

  profitGlobalInputs: Record<string, any>;
  setProfitGlobalInputs: (inputs: Record<string, any>) => void;
  profitSiteCountry: string;
  setProfitSiteCountry: (country: string) => void;
  profitNodes: any[];
  setProfitNodes: (nodes: any[]) => void;
  profitEditingProductId: string | null;
  setProfitEditingProductId: (id: string | null) => void;

  financeRecords: FinanceRecord[];
  addTransaction: (t: FinanceRecord) => Promise<void>;
  updateTransaction: (t: FinanceRecord) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteTransactionsByMonth: (monthKey: string) => Promise<void>;
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

  restockRecords: RestockRecord[];
  addRestockRecord: (name: string, items: RestockRecord['items']) => Promise<void>;
  deleteRestockRecord: (id: string) => Promise<void>;

  loading: boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

import api from './src/api';

export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');
  const [loading, setLoading] = useState<boolean>(true);
  const [products, setProducts] = useState<ProductCalcData[]>([]);
  const [financeRecords, setFinanceRecords] = useState<FinanceRecord[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [warehouseMappings, setWarehouseMappings] = useState<WarehouseMapping[]>([]);
  const [skuGroupMappings, setSkuGroupMappings] = useState<SkuGroupMapping[]>([]);
  const [restockRecords, setRestockRecords] = useState<RestockRecord[]>([]);
  const [calculatorImport, setCalculatorImport] = useState<ProductCalcData | null>(null);
  const [calculatorImportNodes, setCalculatorImportNodes] = useState<ImportedNode[]>([]);

  const [profitGlobalInputs, setProfitGlobalInputs] = useState<Record<string, any>>({
    name: '', sku: '', totalRevenue: 0, purchaseCost: 0, productWeight: 0, firstWeight: 50,
    supplierTaxPoint: 0, supplierInvoice: 'no',
    sellerCouponType: 'fixed', sellerCoupon: 0, sellerCouponPlatformRatio: 0,
    adROI: 15, vatRate: 1, corporateIncomeTaxRate: 5, platformInfrastructureFee: 0,
  });
  const [profitSiteCountry, setProfitSiteCountry] = useState('MYR');
  const [profitNodes, setProfitNodes] = useState<any[]>([]);
  const [profitEditingProductId, setProfitEditingProductId] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const requests = [
          api.get('/products'),
          api.get('/finance'),
          api.get('/inventory'),
          api.get('/warehouse-mappings'),
          api.get('/sku-groups'),
          api.get('/restock-records')
        ];

        // Attach dummy catch handlers to prevent unhandled rejection warnings
        // if multiple requests fail simultaneously. Promise.all still catches the first one.
        requests.forEach(req => req.catch(() => {}));

        const [
          prodRes,
          finRes,
          invRes,
          wmRes,
          sgRes,
          rrRes
        ] = await Promise.all(requests);

        setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
        setFinanceRecords(Array.isArray(finRes.data) ? finRes.data : []);
        setInventory(Array.isArray(invRes.data) ? invRes.data : []);
        setWarehouseMappings(Array.isArray(wmRes.data) ? wmRes.data : []);
        setSkuGroupMappings(Array.isArray(sgRes.data) ? sgRes.data : []);
        setRestockRecords(Array.isArray(rrRes.data) ? rrRes.data : []);
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
    const res = await api.post('/products', p);
    const saved = res.data;
    setProducts(prev => [...prev, saved]);
    return saved;
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

  const deleteTransactionsByMonth = async (monthKey: string) => {
    try {
      await api.delete(`/finance/month/${monthKey}`);
      // Also update local state
      setFinanceRecords(prev => prev.filter(t => !t.date.startsWith(monthKey)));
    } catch (e) { console.error('Error deleting finance month records', e); }
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

  const addRestockRecord = async (name: string, items: RestockRecord['items']) => {
    try {
      const res = await api.post('/restock-records', { name, items });
      setRestockRecords(prev => [res.data, ...prev]);
    } catch (e) { console.error('Error adding restock record', e); }
  };
  const deleteRestockRecord = async (id: string) => {
    try {
      await api.delete(`/restock-records/${id}`);
      setRestockRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) { console.error('Error deleting restock record', e); }
  };

  // Derived Financial State
  const accountBalance = useMemo(() => {
    return financeRecords.reduce((acc, curr) => {
      if (curr.type === 'debt_balance' || curr.type === 'account_balance' || curr.type === 'new_debt') return acc;
      if (curr.type === 'income') return acc + curr.amount;
      if (curr.type === 'debt_repayment') return acc - curr.amount;
      if (curr.type === 'expense') return acc - curr.amount;
      return acc;
    }, 0);
  }, [financeRecords]);

  const totalDebt = useMemo(() => {
    return financeRecords.reduce((acc, curr) => {
      if (curr.type === 'debt_balance' || curr.type === 'account_balance') return acc;
      if (curr.type === 'new_debt') return acc + curr.amount;
      if (curr.type === 'debt_repayment') return acc - curr.amount;
      return acc;
    }, 0);
  }, [financeRecords]);

  return (
    <StoreContext.Provider value={{
      language, setLanguage, strings, loading,
      products, addProduct, updateProduct, deleteProduct,
      calculatorImport, setCalculatorImport,
      calculatorImportNodes, setCalculatorImportNodes,
      profitGlobalInputs, setProfitGlobalInputs,
      profitSiteCountry, setProfitSiteCountry,
      profitNodes, setProfitNodes,
      profitEditingProductId, setProfitEditingProductId,
      financeRecords, addTransaction, updateTransaction, deleteTransaction, deleteTransactionsByMonth, clearAllTransactions, importTransactions, accountBalance, totalDebt,
      inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
      warehouseMappings, addMapping, deleteMapping,
      skuGroupMappings, addSkuGroup, deleteSkuGroup,
      restockRecords, addRestockRecord, deleteRestockRecord
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
