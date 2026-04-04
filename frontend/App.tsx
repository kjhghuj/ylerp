import React, { useState } from 'react';
import { StoreProvider, useStore } from './StoreContext';
import { AuthProvider, useAuth } from './AuthContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './modules/Dashboard';
import { ProfitCalculator } from './modules/ProfitCalculator';
import { FinanceManager } from './modules/FinanceManager';
import { RestockCalculator } from './modules/RestockCalculator';
import { RestockRecords } from './modules/RestockRecords';
import { PricingCalculator } from './modules/PricingCalculator';
import { ProductList } from './modules/ProductList';
import { LoginPage } from './modules/LoginPage';
import { UserManagement } from './modules/UserManagement';
import { PersonalCenter } from './modules/PersonalCenter';
import { ChromaAdapt } from './modules/chroma-adapt/ChromaAdapt';
import { DebugConsole } from './components/DebugConsole';
import { ToastProvider } from './components/Toast';
import { AppState } from './types';
import { Globe, Menu, LogOut, Lock } from 'lucide-react';

const MainContent: React.FC = () => {
  const [currentView, setCurrentView] = React.useState<AppState['currentView']>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { language, setLanguage, strings, loading } = useStore();
  const { user, logout } = useAuth();

  const handleViewChange = (view: AppState['currentView']) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const renderView = () => {
    const moduleViews = ['dashboard', 'profit', 'finance', 'inventory', 'restock-records', 'pricing', 'product-list'];
    if (user && user.role !== 'owner' && moduleViews.includes(currentView) && !(user.permissions || []).includes(currentView)) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
          <div className="p-4 bg-slate-100 rounded-2xl">
            <Lock size={40} className="text-slate-300" />
          </div>
          <p className="text-lg font-bold text-slate-500">无访问权限</p>
          <p className="text-sm text-slate-400">请联系管理员开通此模块的访问权限</p>
        </div>
      );
    }
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'profit': return <ProfitCalculator />;
      case 'finance': return <FinanceManager />;
      case 'inventory': return <RestockCalculator />;
      case 'restock-records': return <RestockRecords />;
      case 'pricing': return <PricingCalculator />;
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
      case 'pricing': return strings.sidebar.pricing;
      case 'product-list': return strings.sidebar.productList;
      case 'user-management': return '用户管理';
      case 'personal-center': return '个人中心';
      case 'chroma-adapt': return strings.sidebar.chromaAdapt || '图片制作';
      default: return view;
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return '超级管理员';
      case 'admin': return '管理员';
      case 'viewer': return '查看者';
      default: return role;
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-blue-50/50 overflow-hidden font-sans">
      <Sidebar
        currentView={currentView}
        onChangeView={handleViewChange}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area - responsive margin */}
      <main className="flex-1 md:ml-64 h-full overflow-hidden flex flex-col w-full relative">
        {/* Decorative Background Elements */}
        <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[100px] pointer-events-none"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-400/10 blur-[120px] pointer-events-none"></div>

        {/* Header / Top Bar */}
        <header className="h-16 bg-white/70 backdrop-blur-md border-b border-white/50 flex items-center justify-between px-4 md:px-8 shadow-[0_2px_10px_rgba(0,0,0,0.02)] z-10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <h2 className="font-semibold text-slate-700 capitalize text-lg truncate max-w-[150px] md:max-w-none">
              {getHeaderTitle(currentView)}
            </h2>
          </div>

          <div className="flex items-center gap-2 md:gap-4">

            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              <Globe size={16} />
              <span className="hidden md:inline">{language === 'zh' ? 'EN / 中' : '中 / EN'}</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block"></div>

            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-slate-800">{user?.displayName || 'User'}</p>
              <p className="text-xs text-slate-400">{getRoleLabel(user?.role || '')}</p>
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full shadow-md shrink-0 flex items-center justify-center text-white font-bold text-sm overflow-hidden cursor-pointer" onClick={() => setCurrentView('personal-center')}>
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                user?.displayName?.charAt(0) || 'U'
              )}
            </div>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Dynamic Content Area */}
        <div className="flex-1 overflow-auto p-4 md:p-6 relative">
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
      <div className="flex items-center justify-center h-screen w-screen bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900">
        <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
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