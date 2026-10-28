import React, { useState } from 'react';
import { LayoutDashboard, Calculator, Wallet, PackageCheck, List, Users, Image, UserCircle, LogOut, ChevronDown, ShieldCheck, Shield, Eye, Menu, Calendar, Activity, BarChart3, Globe, Sun, Moon } from 'lucide-react';
import { AppState } from '../types';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import { hasPermission } from './PermissionTree';
import { version } from '../package.json';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';

interface SidebarProps {
  currentView: AppState['currentView'];
  onChangeView: (view: AppState['currentView']) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, darkMode, onToggleDarkMode }) => {
  const { strings, language, setLanguage } = useStore();
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const zh = language === 'zh';
  const allMenuItems = [
    { id: 'dashboard', label: strings.sidebar.dashboard, icon: LayoutDashboard },
    { id: 'profit', label: strings.sidebar.profit, icon: Calculator },
    { id: 'product-list', label: strings.sidebar.productList, icon: List },
    { id: 'finance', label: strings.sidebar.finance, icon: Wallet },
    { id: 'restock-v3', label: strings.sidebar.restockV3 || '店铺补货', icon: PackageCheck },
    { id: 'chroma-adapt', label: strings.sidebar.chromaAdapt || '图片制作', icon: Image },
    { id: 'schedule', label: strings.sidebar.schedule || '日程管理', icon: Calendar },
    { id: 'product-analysis', label: strings.sidebar.productAnalysis || '商品分析', icon: BarChart3 },
    ...(user?.role === 'owner' || user?.role === 'admin' ? [{ id: 'usage-stats', label: strings.sidebar.usageStats || '使用统计', icon: Activity }] : []),
    ...(user?.role === 'owner' ? [{ id: 'user-management', label: zh ? '用户管理' : 'User management', icon: Users }] : []),
  ];
  const menuItems = user?.role === 'owner' ? allMenuItems : allMenuItems.filter(item => item.id === 'user-management' || hasPermission(user?.permissions || [], item.id));
  const roleLabel = user?.role === 'owner' ? (zh ? '超级管理员' : 'Owner') : user?.role === 'admin' ? (zh ? '管理员' : 'Administrator') : (zh ? '查看者' : 'Viewer');
  const RoleIcon = user?.role === 'owner' ? ShieldCheck : user?.role === 'admin' ? Shield : Eye;
  const handleNav = (view: AppState['currentView']) => { onChangeView(view); setDrawerOpen(false); };
  const brand = <div className="flex min-w-0 items-center gap-2"><img src="/logo.png" alt="Logo" className="h-7 w-7 rounded-md object-contain" /><span className="hidden text-base font-semibold tracking-tight text-foreground sm:inline">阳零ERP</span><Badge variant="secondary" className="hidden px-1.5 text-[10px] font-normal sm:inline-flex">v{version}</Badge></div>;
  const navItem = (item: typeof menuItems[number], compact: boolean) => {
    const Icon = item.icon;
    const active = currentView === item.id;
    return <Button key={item.id} variant="ghost" size="sm" aria-current={active ? 'page' : undefined}
      className={`${compact ? 'h-11 w-full justify-start gap-3 px-3' : 'gap-1.5 px-2.5'} ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
      onClick={() => handleNav(item.id as AppState['currentView'])}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></Button>;
  };
  return <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card/95 px-3 text-foreground backdrop-blur-md lg:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <SheetTrigger asChild><Button variant="ghost" size="icon" className="shrink-0 2xl:hidden" aria-label={zh ? '打开导航菜单' : 'Open navigation'}><Menu className="h-5 w-5" /></Button></SheetTrigger>
        {brand}
        <nav aria-label={zh ? '主导航' : 'Main navigation'} className="ml-4 hidden items-center gap-0.5 2xl:flex">{menuItems.map(item => navItem(item, false))}</nav>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div className="relative">
          <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-10 gap-2 px-2" aria-label={zh ? '用户菜单' : 'User menu'}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground">{user?.avatar ? <img src={user.avatar} alt="" className="h-full w-full object-cover" /> : user?.displayName?.charAt(0) || 'U'}</span>
              <span className="hidden text-left md:block"><span className="block text-sm font-medium leading-tight">{user?.displayName || 'User'}</span><span className="flex items-center gap-1 text-[11px] text-muted-foreground"><RoleIcon className="h-3 w-3" />{roleLabel}</span></span><ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
            </Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel><span className="block">{user?.displayName || 'User'}</span><span className="block text-xs font-normal text-muted-foreground">{user?.username}</span></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { handleNav('personal-center'); setUserMenuOpen(false); }}><UserCircle className="h-4 w-4" />{strings.sidebar.personalCenter || '个人中心'}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => { logout(); setUserMenuOpen(false); }}><LogOut className="h-4 w-4" />{zh ? '退出登录' : 'Sign out'}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={onToggleDarkMode} title={darkMode ? '切换到浅色模式' : '切换到深色模式'} aria-label={darkMode ? '切换到浅色模式' : '切换到深色模式'}>{darkMode ? <Sun /> : <Moon />}</Button>
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setLanguage(zh ? 'en' : 'zh')} aria-label={zh ? 'Switch to English' : '切换到中文'}><Globe /><span className="hidden sm:inline">{zh ? 'EN' : '中'}</span></Button>
      </div>
    </header>
    <SheetContent side="left" className="flex w-72 flex-col gap-0 p-0" closeLabel={zh ? '关闭导航菜单' : 'Close navigation'}>
      <SheetHeader className="border-b border-border px-5 py-4 text-left"><SheetTitle><span className="flex items-center gap-2"><img src="/logo.png" alt="Logo" className="h-7 w-7 object-contain" />阳零ERP</span></SheetTitle><SheetDescription className="sr-only">{zh ? '选择要打开的功能模块' : 'Choose a module'}</SheetDescription></SheetHeader>
      <nav aria-label={zh ? '移动端导航' : 'Mobile navigation'} className="flex-1 space-y-1 overflow-y-auto p-3">{menuItems.map(item => navItem(item, true))}</nav>
      <div className="border-t border-border p-3"><Button variant="ghost" className="w-full justify-start gap-3" onClick={() => handleNav('personal-center')}><UserCircle />{strings.sidebar.personalCenter || '个人中心'}</Button><p className="px-3 pt-2 text-xs text-muted-foreground">v{version}</p></div>
    </SheetContent>
  </Sheet>;
};

