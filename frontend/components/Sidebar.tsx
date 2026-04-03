import React from 'react';
import { LayoutDashboard, Calculator, Wallet, PackageCheck, X, Tag, List, Users, LogOut, ShieldCheck, Shield, Eye, Image, ClipboardList } from 'lucide-react';
import { AppState } from '../types';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';

interface SidebarProps {
  currentView: AppState['currentView'];
  onChangeView: (view: AppState['currentView']) => void;
  isOpen?: boolean; // Mobile state
  onClose?: () => void; // Mobile close handler
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isOpen, onClose }) => {
  const { strings } = useStore();
  const { user, logout } = useAuth();

  const allMenuItems = [
    { id: 'dashboard', label: strings.sidebar.dashboard, icon: LayoutDashboard },
    { id: 'profit', label: strings.sidebar.profit, icon: Calculator },
    { id: 'product-list', label: strings.sidebar.productList, icon: List },
    { id: 'finance', label: strings.sidebar.finance, icon: Wallet },
    { id: 'inventory', label: strings.sidebar.inventory, icon: PackageCheck },
    { id: 'restock-records', label: strings.sidebar.restockRecords || '补货记录', icon: ClipboardList },
    { id: 'pricing', label: strings.sidebar.pricing, icon: Tag },
    { id: 'chroma-adapt', label: strings.sidebar.chromaAdapt || '图片制作', icon: Image },
    // Only show user management for owner
    ...(user?.role === 'owner' ? [{ id: 'user-management', label: '用户管理', icon: Users }] : []),
  ];

  // Filter menu items by permissions for non-owner users
  const menuItems = user?.role === 'owner'
    ? allMenuItems
    : allMenuItems.filter(item => item.id === 'user-management' || (user?.permissions || []).includes(item.id));

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <ShieldCheck size={12} />;
      case 'admin': return <Shield size={12} />;
      default: return <Eye size={12} />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return '超级管理员';
      case 'admin': return '管理员';
      case 'viewer': return '查看者';
      default: return role;
    }
  };

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
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain rounded-lg bg-white/10 p-1" />
            <span className="hidden sm:inline">阳零ERP</span>
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

        {/* User Info & Logout */}
        <div className="p-4 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-sm">
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{user?.displayName || 'User'}</p>
              <p className="text-xs text-blue-200 flex items-center gap-1">{getRoleIcon(user?.role || '')} {getRoleLabel(user?.role || '')}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-blue-200 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
          >
            <LogOut size={16} /> 退出登录
          </button>
          <p className="text-xs text-blue-200/50 text-center mt-2">{strings.sidebar.version}</p>
        </div>
      </aside>
    </>
  );
};