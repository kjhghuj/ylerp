import React, { useState, useRef, useEffect } from 'react';
import { LayoutDashboard, Calculator, Wallet, PackageCheck, Tag, List, Users, Image, ClipboardList, UserCircle, LogOut, ChevronDown, X, ShieldCheck, Shield, Eye, Menu } from 'lucide-react';
import { AppState } from '../types';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import { hasPermission } from './PermissionTree';
import { version } from '../package.json';

interface SidebarProps {
  currentView: AppState['currentView'];
  onChangeView: (view: AppState['currentView']) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const { strings } = useStore();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const allMenuItems = [
    { id: 'dashboard', label: strings.sidebar.dashboard, icon: LayoutDashboard },
    { id: 'profit', label: strings.sidebar.profit, icon: Calculator },
    { id: 'product-list', label: strings.sidebar.productList, icon: List },
    { id: 'finance', label: strings.sidebar.finance, icon: Wallet },
    { id: 'inventory', label: strings.sidebar.inventory, icon: PackageCheck },
    { id: 'restock-records', label: strings.sidebar.restockRecords || '补货记录', icon: ClipboardList },
    { id: 'pricing', label: strings.sidebar.pricing, icon: Tag },
    { id: 'chroma-adapt', label: strings.sidebar.chromaAdapt || '图片制作', icon: Image },
    ...(user?.role === 'owner' ? [{ id: 'user-management', label: '用户管理', icon: Users }] : []),
  ];

  const menuItems = user?.role === 'owner'
    ? allMenuItems
    : allMenuItems.filter(item => item.id === 'user-management' || hasPermission(user?.permissions || [], item.id));

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return '超级管理员';
      case 'admin': return '管理员';
      case 'viewer': return '查看者';
      default: return role;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <ShieldCheck size={12} className="text-primary" />;
      case 'admin': return <Shield size={12} className="text-primary" />;
      default: return <Eye size={12} className="text-slate-400" />;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (drawerOpen || userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [drawerOpen, userMenuOpen]);

  const handleNav = (view: AppState['currentView']) => {
    onChangeView(view);
    setDrawerOpen(false);
  };

  return (
    <>
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
      )}

      <header className="fixed top-0 left-0 right-0 h-14 z-30 border-b flex items-center justify-between px-4 lg:px-6"
        style={{
          backgroundColor: 'var(--topnav-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: 'var(--topnav-border)',
        }}>

        <div className="flex items-center gap-3">
          <button onClick={() => setDrawerOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" style={{ color: 'var(--text-secondary)' }}>
            <Menu size={20} />
          </button>

          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="w-7 h-7 object-contain rounded-md" />
            <span className="font-bold text-base hidden sm:inline" style={{ color: 'var(--text-primary)' }}>阳零ERP</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded hidden sm:inline" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-card-hover)' }}>v{version}</span>
          </div>

          <nav className="hidden lg:flex items-center gap-1 ml-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id as AppState['currentView'])}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-blue-bg)' : 'transparent',
                    color: isActive ? 'var(--accent-blue-dark)' : 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors duration-200 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <div className="w-8 h-8 bg-gradient-to-tr from-primary to-blue-400 rounded-full flex items-center justify-center text-white font-bold text-xs overflow-hidden shadow-sm">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  user?.displayName?.charAt(0) || 'U'
                )}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{user?.displayName || 'User'}</p>
                <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>{getRoleIcon(user?.role || '')} {getRoleLabel(user?.role || '')}</p>
              </div>
              <ChevronDown size={14} className="hidden md:block" style={{ color: 'var(--text-tertiary)' }} />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border shadow-lg py-1 z-50"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-default)',
                  boxShadow: 'var(--shadow-lg)',
                }}>
                <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{user?.displayName || 'User'}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{user?.username}</p>
                </div>

                <button
                  onClick={() => { handleNav('personal-center'); setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-200"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <UserCircle size={16} /> {strings.sidebar.personalCenter || '个人中心'}
                </button>

                <div className="my-1 mx-3 border-t" style={{ borderColor: 'var(--border-light)' }} />

                <button
                  onClick={() => { logout(); setUserMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-200"
                  style={{ color: 'var(--accent-red)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-red-bg)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <LogOut size={16} /> 退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div ref={drawerRef} className="fixed top-0 left-0 bottom-0 w-72 z-50 flex flex-col shadow-2xl transform transition-transform duration-300 ease-out"
          style={{
            backgroundColor: 'var(--sidebar-bg)',
            borderRight: '1px solid var(--sidebar-border)',
          }}>
          <div className="flex items-center justify-between px-5 h-14 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Logo" className="w-7 h-7 object-contain rounded-md" />
              <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>阳零ERP</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', backgroundColor: 'var(--bg-card-hover)' }}>v{version}</span>
            </div>
            <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-tertiary)' }}>
              <X size={18} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id as AppState['currentView'])}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                    color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
                      e.currentTarget.style.color = 'var(--sidebar-text-hover)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--sidebar-text)';
                    }
                  }}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-gradient-to-tr from-primary to-blue-400 rounded-full flex items-center justify-center text-white font-bold text-xs overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  user?.displayName?.charAt(0) || 'U'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.displayName || 'User'}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{getRoleLabel(user?.role || '')}</p>
              </div>
            </div>
            <button
              onClick={() => handleNav('personal-center')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
              style={{ color: 'var(--sidebar-text)', backgroundColor: currentView === 'personal-center' ? 'var(--sidebar-active-bg)' : 'transparent' }}
            >
              <UserCircle size={16} /> {strings.sidebar.personalCenter || '个人中心'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
