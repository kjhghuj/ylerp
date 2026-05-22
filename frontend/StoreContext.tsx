import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { ProductCalcData, FinanceRecord, InventoryItem, WarehouseMapping, SkuGroupMapping, RestockRecord } from './types';
import { translations } from './translations';
import { SiteLevelInputs, DEFAULT_SITE_INPUTS, ProfitGlobalInputs, PlatformNode } from './modules/profit/types';

type Language = 'zh' | 'en';

export interface ImportedNode {
    id?: string;
    productId?: string;
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
  addProduct: (p: Omit<ProductCalcData, 'id'>) => Promise<ProductCalcData | null>;
  updateProduct: (p: ProductCalcData) => Promise<void>;
  deleteProduct: (id: string, site?: string) => Promise<void>;

  calculatorImport: ProductCalcData | null;
  setCalculatorImport: (p: ProductCalcData | null) => void;
  calculatorImportNodes: ImportedNode[];
  setCalculatorImportNodes: (nodes: ImportedNode[]) => void;

  profitGlobalInputs: ProfitGlobalInputs;
  setProfitGlobalInputs: (inputs: ProfitGlobalInputs | ((prev: ProfitGlobalInputs) => ProfitGlobalInputs)) => void;
  profitSiteCurrency: string;
  setProfitSiteCurrency: (currency: string) => void;
  profitNodes: Record<string, PlatformNode[]>;
  setProfitNodes: (nodes: Record<string, PlatformNode[]> | ((prev: Record<string, PlatformNode[]>) => Record<string, PlatformNode[]>)) => void;
  profitEditingProductId: string | null;
  setProfitEditingProductId: (id: string | null) => void;
  profitSiteInputsMap: Record<string, SiteLevelInputs>;
  setProfitSiteInputsMap: (inputs: Record<string, SiteLevelInputs> | ((prev: Record<string, SiteLevelInputs>) => Record<string, SiteLevelInputs>)) => void;

  productListActiveTab: 'PH' | 'MY' | 'SG' | 'ID' | 'TH';
  setProductListActiveTab: (tab: 'PH' | 'MY' | 'SG' | 'ID' | 'TH') => void;
  productListCurrentPage: number;
  setProductListCurrentPage: (page: number | ((prev: number) => number)) => void;

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
  updateSkuGroup: (m: SkuGroupMapping) => Promise<void>;
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

  // Profit Calculator persistent state
  const [profitGlobalInputs, setProfitGlobalInputs] = useState<ProfitGlobalInputs>(() => {
        const saved = localStorage.getItem('yl-profit-global-inputs');
        const defaults = {
            name: '', sku: '', purchaseCost: 0, productWeight: 0,
            supplierTaxPoint: 0, supplierInvoice: 'no',
            vatRate: 1, corporateIncomeTaxRate: 5,
        };
        if (!saved) return defaults;
        try { return JSON.parse(saved); } catch { return defaults; }
    });

  const [profitSiteCurrency, setProfitSiteCurrency] = useState<string>(() => {
    return localStorage.getItem('yl-profit-site-country') || 'MYR';
  });

  const [profitNodes, setProfitNodes] = useState<Record<string, PlatformNode[]>>(() => {
    const saved = localStorage.getItem('yl-profit-nodes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 兼容旧数据格式：如果是数组，转换为对象结构
        if (Array.isArray(parsed)) {
          return {
            MYR: parsed,
            SGD: [],
            PHP: [],
            THB: [],
            IDR: [],
          };
        }
        // 新格式已经是对象，确保所有站点都存在
        return {
          MYR: parsed.MYR || [],
          SGD: parsed.SGD || [],
          PHP: parsed.PHP || [],
          THB: parsed.THB || [],
          IDR: parsed.IDR || [],
        };
      } catch (e) {
        console.error('Failed to parse profitNodes from localStorage:', e);
      }
    }
    return {
      MYR: [],
      SGD: [],
      PHP: [],
      THB: [],
      IDR: [],
    };
  });

  const [profitEditingProductId, setProfitEditingProductId] = useState<string | null>(() => {
    return localStorage.getItem('yl-profit-editing-product-id');
  });

  const [profitSiteInputsMap, setProfitSiteInputsMap] = useState<Record<string, SiteLevelInputs>>(() => {
    const saved = localStorage.getItem('yl-profit-site-inputs');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* fall through */ }
    }
    return {
      'MYR': { ...DEFAULT_SITE_INPUTS },
      'SGD': { ...DEFAULT_SITE_INPUTS },
      'PHP': { ...DEFAULT_SITE_INPUTS },
      'THB': { ...DEFAULT_SITE_INPUTS },
      'IDR': { ...DEFAULT_SITE_INPUTS },
    };
  });

  // Product List persistent state
  const [productListActiveTab, setProductListActiveTab] = useState<'PH' | 'MY' | 'SG' | 'ID' | 'TH'>(() => {
    const saved = localStorage.getItem('yl-product-list-active-tab');
    return (saved === 'PH' || saved === 'MY' || saved === 'SG' || saved === 'ID' || saved === 'TH') ? saved : 'MY';
  });

  const [productListCurrentPage, setProductListCurrentPage] = useState<number>(() => {
    const saved = localStorage.getItem('yl-product-list-current-page');
    return saved ? parseInt(saved, 10) : 1;
  });

  // Save to localStorage when state changes
  React.useEffect(() => {
    localStorage.setItem('yl-profit-global-inputs', JSON.stringify(profitGlobalInputs));
  }, [profitGlobalInputs]);

  React.useEffect(() => {
    localStorage.setItem('yl-profit-site-country', profitSiteCurrency);
  }, [profitSiteCurrency]);

  React.useEffect(() => {
    localStorage.setItem('yl-profit-site-inputs', JSON.stringify(profitSiteInputsMap));
  }, [profitSiteInputsMap]);

  React.useEffect(() => {
    localStorage.setItem('yl-profit-nodes', JSON.stringify(profitNodes));
  }, [profitNodes]);

  React.useEffect(() => {
    if (profitEditingProductId) {
      localStorage.setItem('yl-profit-editing-product-id', profitEditingProductId);
    } else {
      localStorage.removeItem('yl-profit-editing-product-id');
    }
  }, [profitEditingProductId]);

  React.useEffect(() => {
    localStorage.setItem('yl-product-list-active-tab', productListActiveTab);
  }, [productListActiveTab]);

  React.useEffect(() => {
    localStorage.setItem('yl-product-list-current-page', productListCurrentPage.toString());
  }, [productListCurrentPage]);

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
    } catch (e) { console.error('Error updating product', e); throw e; }
  };
  const deleteProduct = async (id: string, site?: string) => {
    try {
      if (site) {
        await api.delete(`/products/${id}?site=${encodeURIComponent(site)}`);
      } else {
        await api.delete(`/products/${id}`);
      }
      if (site) {
        setProducts(prev => prev.map(p => {
          if (p.id !== id) return p;
          const remainingSites = (p.sites || []).filter(s => s !== site);
          if (remainingSites.length === 0) return null;
          return { ...p, sites: remainingSites };
        }).filter(Boolean) as ProductCalcData[]);
      } else {
        setProducts(prev => prev.filter(p => p.id !== id));
      }
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
  const updateSkuGroup = async (m: SkuGroupMapping) => {
    try {
      const res = await api.put(`/sku-groups/${m.id}`, m);
      setSkuGroupMappings(prev => prev.map(group => group.id === m.id ? res.data : group));
    } catch (e) { console.error('Error updating sku group', e); }
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
      profitSiteCurrency, setProfitSiteCurrency,
      profitNodes, setProfitNodes,
      profitEditingProductId, setProfitEditingProductId,
      profitSiteInputsMap, setProfitSiteInputsMap,
      productListActiveTab, setProductListActiveTab,
      productListCurrentPage, setProductListCurrentPage,
      financeRecords, addTransaction, updateTransaction, deleteTransaction, deleteTransactionsByMonth, clearAllTransactions, importTransactions, accountBalance, totalDebt,
      inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
      warehouseMappings, addMapping, deleteMapping,
      skuGroupMappings, addSkuGroup, updateSkuGroup, deleteSkuGroup,
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
