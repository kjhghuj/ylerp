import React from 'react';
import { LayoutDashboard, Calculator, Wallet, PackageCheck, X, Tag, List } from 'lucide-react';
import { AppState } from '../types';
import { useStore } from '../StoreContext';

interface SidebarProps {
  currentView: AppState['currentView'];
  onChangeView: (view: AppState['currentView']) => void;
  isOpen?: boolean; // Mobile state
  onClose?: () => void; // Mobile close handler
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isOpen, onClose }) => {
  const { strings } = useStore();

  const menuItems = [
    { id: 'dashboard', label: strings.sidebar.dashboard, icon: LayoutDashboard },
    { id: 'profit', label: strings.sidebar.profit, icon: Calculator },
    { id: 'product-list', label: strings.sidebar.productList, icon: List },
    { id: 'finance', label: strings.sidebar.finance, icon: Wallet },
    { id: 'inventory', label: strings.sidebar.inventory, icon: PackageCheck },
    { id: 'pricing', label: strings.sidebar.pricing, icon: Tag },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      <aside className={`
        w-64 bg-gradient-to-b from-primary-dark to-primary text-white flex flex-col fixed h-full shadow-[4px_0_24px_rgba(0,0,0,0.05)] z-30 transition-transform duration-300 ease-in-out border-r border-white/10
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white">
              <span className="font-bold text-lg">U</span>
            </div>
            <span className="hidden sm:inline">Commerce</span>
          </h1>
          {/* Mobile Close Button */}
          <button onClick={onClose} className="md:hidden text-blue-200 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id as AppState['currentView'])}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group
                  ${isActive
                    ? 'bg-white/20 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-md font-semibold translate-x-2'
                    : 'text-blue-100 hover:bg-white/10 hover:text-white hover:translate-x-1'
                  }`}
              >
                <Icon size={20} className={isActive ? 'text-white' : 'text-blue-200 group-hover:text-white'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-6 text-xs text-blue-200 border-t border-white/10 shrink-0">
          <p>{strings.app.name}</p>
          <p className="mt-1 opacity-70">{strings.sidebar.version}</p>
        </div>
      </aside>
    </>
  );
};