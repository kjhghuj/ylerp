import React, { useState, useEffect } from 'react';
import { StoreProvider, useStore } from './StoreContext';
import { AuthProvider, useAuth } from './AuthContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './modules/Dashboard';
import { ProfitCalculator } from './modules/ProfitCalculator';
import { FinanceManager } from './modules/FinanceManager';
import { RestockCalculator } from './modules/RestockCalculator';
import { RestockRecords } from './modules/RestockRecords';
import { ProductList } from './modules/ProductList';
import { LoginPage } from './modules/LoginPage';
import { UserManagement } from './modules/UserManagement';
import { PersonalCenter } from './modules/PersonalCenter';
import { ChromaAdapt } from './modules/chroma-adapt/ChromaAdapt';
import { DebugConsole } from './components/DebugConsole';
import { ToastProvider } from './components/Toast';
import { AppState } from './types';
import { Globe, Lock, Sun, Moon } from 'lucide-react';
import { hasPermission } from './components/PermissionTree';

const MainContent: React.FC = () => {
  const [currentView, setCurrentView] = React.useState<AppState['currentView']>('dashboard');
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('yl-dark-mode') === 'true'; } catch { return false; }
  });
  const { language, setLanguage, strings, loading } = useStore();
  const { user } = useAuth();

  useEffect(() => {
    try { localStorage.setItem('yl-dark-mode', String(darkMode)); } catch {}
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
    const moduleViews = ['dashboard', 'profit', 'finance', 'inventory', 'restock-records', 'product-list'];
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
      case 'inventory': return <RestockCalculator />;
      case 'restock-records': return <RestockRecords />;
      case 'product-list': return <ProductList onNavigate={(view) => handleViewChange(view)} />;
      case 'user-management': return <UserManagement />;
      case 'personal-center': return <PersonalCenter />;
      case 'chroma-adapt': return <ChromaAdapt />;
      default: return <Dashboard />;
    }
  };

  const getHeaderTitle = (view: AppState['currentView']) => {
    switch (view) {
      case 'dashboard': return strings.sidebar.dashboard;
      case 'profit': return strings.sidebar.profit;
      case 'finance': return strings.sidebar.finance;
      case 'inventory': return strings.sidebar.inventory;
      case 'restock-records': return strings.sidebar.restockRecords || '补货记录';
      case 'product-list': return strings.sidebar.productList;
      case 'user-management': return '用户管理';
      case 'personal-center': return '个人中心';
      case 'chroma-adapt': return strings.sidebar.chromaAdapt || '图片制作';
      default: return view;
    }
  };

  return (
    <div className="h-screen overflow-hidden font-sans" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar
        currentView={currentView}
        onChangeView={handleViewChange}
      />

      <main className="h-full overflow-hidden flex flex-col w-full pt-14">
        <div className="flex items-center justify-between px-4 lg:px-8 h-10 shrink-0">
          <h2 className="font-semibold text-base truncate" style={{ color: 'var(--text-primary)' }}>
            {getHeaderTitle(currentView)}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-1.5 rounded-lg transition-colors duration-200"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              title={darkMode ? '切换到浅色模式' : '切换到深色模式'}
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors duration-200"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Globe size={14} />
              <span className="hidden sm:inline">{language === 'zh' ? 'EN' : '中'}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="h-full">
            {renderView()}
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
