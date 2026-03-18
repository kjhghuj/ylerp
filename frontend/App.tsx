import React, { useState } from 'react';
import { StoreProvider, useStore } from './StoreContext';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './modules/Dashboard';
import { ProfitCalculator } from './modules/ProfitCalculator';
import { FinanceManager } from './modules/FinanceManager';
import { RestockCalculator } from './modules/RestockCalculator';
import { PricingCalculator } from './modules/PricingCalculator';
import { ProductList } from './modules/ProductList';
import { DebugConsole } from './components/DebugConsole';
import { AppState } from './types';
import { Globe, Menu } from 'lucide-react';

const MainContent: React.FC = () => {
  const [currentView, setCurrentView] = React.useState<AppState['currentView']>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { language, setLanguage, strings, setCalculatorImport, loading } = useStore();

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
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'profit': return <ProfitCalculator />;
      case 'finance': return <FinanceManager />;
      case 'inventory': return <RestockCalculator />;
      case 'pricing': return <PricingCalculator />;
      case 'product-list': return <ProductList onNavigate={(view) => handleViewChange(view)} />;
      default: return <Dashboard />;
    }
  };

  const getHeaderTitle = (view: AppState['currentView']) => {
    switch (view) {
      case 'dashboard': return strings.sidebar.dashboard;
      case 'profit': return strings.sidebar.profit;
      case 'finance': return strings.sidebar.finance;
      case 'inventory': return strings.sidebar.inventory;
      case 'pricing': return strings.sidebar.pricing;
      case 'product-list': return strings.sidebar.productList;
      default: return view;
    }
  }

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
              <p className="text-sm font-bold text-slate-800">{strings.app.admin}</p>
              <p className="text-xs text-slate-400">{strings.app.role}</p>
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full shadow-md shrink-0"></div>
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
    <StoreProvider>
      <MainContent />
      <DebugConsole />
    </StoreProvider>
  );
};

export default App;