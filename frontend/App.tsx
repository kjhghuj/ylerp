import React, { useState, useEffect, lazy, Suspense } from 'react';
import { StoreProvider, useStore } from './StoreContext';
import { AuthProvider, useAuth } from './AuthContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './modules/Dashboard';
import { ProfitCalculator } from './modules/ProfitCalculator';
import { FinanceManager } from './modules/FinanceManager';
import { LoginPage } from './modules/LoginPage';

// 重组件按需加载：减小主 JS 包（首屏无需全部模块代码）
const RestockV3 = lazy(() => import('./modules/RestockV3'));
const ProductList = lazy(() => import('./modules/ProductList').then(module => ({ default: module.ProductList })));
const UserManagement = lazy(() => import('./modules/UserManagement').then(module => ({ default: module.UserManagement })));
const PersonalCenter = lazy(() => import('./modules/PersonalCenter').then(module => ({ default: module.PersonalCenter })));
const ChromaAdapt = lazy(() => import('./modules/chroma-adapt/ChromaAdapt').then(module => ({ default: module.ChromaAdapt })));
const ScheduleManager = lazy(() => import('./modules/ScheduleManager').then(module => ({ default: module.ScheduleManager })));
const ProductAnalysis = lazy(() => import('./modules/product-analysis/ProductAnalysis').then(module => ({ default: module.ProductAnalysis })));
const UsageStats = lazy(() => import('./modules/UsageStats').then(module => ({ default: module.UsageStats })));
import { DebugConsole } from './components/DebugConsole';
import { ToastProvider } from './components/Toast';
import { AppState } from './types';
import { Lock } from 'lucide-react';
import { hasPermission } from './components/PermissionTree';

const MainContent: React.FC = () => {
  const [currentView, setCurrentView] = React.useState<AppState['currentView']>(() => window.location.hash.startsWith('#shopee') ? 'personal-center' : 'dashboard');
  /** 跨模块导航参数：商品分析「生成补货建议」带入店铺与区间 */
  const [restockEntry, setRestockEntry] = React.useState<{ shopId: string; from: string; to: string } | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('yl-dark-mode') === 'true'; } catch { return false; }
  });
  const { loading } = useStore();
  const { user } = useAuth();

  useEffect(() => {
    try { localStorage.setItem('yl-dark-mode', String(darkMode)); } catch {}
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [currentView]);

  const handleViewChange = (view: AppState['currentView']) => {
    setCurrentView(view);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  const renderView = () => {
    const moduleViews = ['dashboard', 'profit', 'finance', 'restock-v3', 'product-list', 'schedule', 'usage-stats', 'product-analysis'];
    if (user && user.role !== 'owner' && moduleViews.includes(currentView) && !hasPermission(user.permissions || [], currentView)) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: 'var(--text-tertiary)' }}>
          <div className="p-4 rounded-2xl" style={{ backgroundColor: 'var(--border-light)' }}>
            <Lock size={40} style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-lg font-bold" style={{ color: 'var(--text-secondary)' }}>无访问权限</p>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>请联系管理员开通此模块的访问权限</p>
        </div>
      );
    }
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'profit': return <ProfitCalculator />;
      case 'finance': return <FinanceManager />;
      case 'restock-v3': return <RestockV3 key={restockEntry ? `entry-${restockEntry.shopId}-${restockEntry.from}` : 'default'} initialParams={restockEntry ?? undefined} />;
      case 'product-list': return <ProductList onNavigate={(view) => handleViewChange(view)} />;
      case 'user-management': return <UserManagement />;
      case 'personal-center': return <PersonalCenter />;
      case 'chroma-adapt': return <ChromaAdapt />;
      case 'schedule': return <ScheduleManager />;
      case 'product-analysis': return (
        <ProductAnalysis
          onGenerateRestock={(shopId, from, to) => {
            setRestockEntry({ shopId, from, to });
            setCurrentView('restock-v3');
          }}
        />
      );
      case 'usage-stats': return <UsageStats />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="h-screen overflow-hidden font-sans" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar
        currentView={currentView}
        onChangeView={handleViewChange}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(value => !value)}
      />

      <main className="h-full overflow-hidden flex flex-col w-full pt-14">
        <div ref={contentRef} className={`flex-1 min-h-0 overflow-auto ${currentView === 'profit' ? 'profit-scroll-surface p-3 lg:p-4' : 'p-4 lg:p-6'}`}>
          <div className="h-full">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
              }
            >
              {renderView()}
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppGuard />
    </AuthProvider>
  );
};

const AppGuard: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <StoreProvider>
      <ToastProvider>
        <MainContent />
        <DebugConsole />
      </ToastProvider>
    </StoreProvider>
  );
};

export default App;
