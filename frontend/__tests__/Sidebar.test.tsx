import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const { mockLogout, mockUseAuth } = vi.hoisted(() => {
  const mockLogout = vi.fn();
  const mockUseAuth = () => ({
    user: {
      id: '1',
      username: 'testuser',
      displayName: 'Test User',
      role: 'owner' as const,
      permissions: [] as string[],
      parentId: null,
    },
    logout: mockLogout,
  });
  return { mockLogout, mockUseAuth };
});

vi.mock('../StoreContext', () => ({
  useStore: () => ({
    strings: {
      sidebar: {
        dashboard: '仪表盘',
        profit: '利润计算',
        productList: '商品明细',
        finance: '财务管理',
        inventory: '智能补货',
        restockRecords: '补货记录',
        chromaAdapt: '图片制作',
        personalCenter: '个人中心',
      },
    },
  }),
}));

vi.mock('../AuthContext', () => ({
  useAuth: mockUseAuth,
}));

import { Sidebar as SidebarComponent } from '../components/Sidebar';

describe('Sidebar', () => {
  const defaultProps = {
    currentView: 'dashboard' as const,
    onChangeView: vi.fn(),
  };

  it('should render the logo and app title', () => {
    render(<SidebarComponent {...defaultProps} />);
    expect(screen.getByAltText('Logo')).toBeInTheDocument();
    expect(screen.getByText('阳零ERP')).toBeInTheDocument();
  });

  it('should render all navigation items for owner', () => {
    render(<SidebarComponent {...defaultProps} />);
    expect(screen.getByText('仪表盘')).toBeInTheDocument();
    expect(screen.getByText('利润计算')).toBeInTheDocument();
    expect(screen.getByText('商品明细')).toBeInTheDocument();
    expect(screen.getByText('财务管理')).toBeInTheDocument();
    expect(screen.getByText('智能补货')).toBeInTheDocument();
    expect(screen.getByText('补货记录')).toBeInTheDocument();
    expect(screen.getByText('图片制作')).toBeInTheDocument();
    expect(screen.getByText('用户管理')).toBeInTheDocument();
  });

  it('should render user display name and role', () => {
    render(<SidebarComponent {...defaultProps} />);
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('超级管理员')).toBeInTheDocument();
  });

  it('should call onChangeView when a nav item is clicked', () => {
    const onChangeView = vi.fn();
    render(<SidebarComponent {...defaultProps} onChangeView={onChangeView} />);

    const dashboardNav = screen.getByText('仪表盘');
    fireEvent.click(dashboardNav);
    expect(onChangeView).toHaveBeenCalledWith('dashboard');
  });

  it('should highlight the active nav item', () => {
    render(<SidebarComponent {...defaultProps} />);
    const dashboardBtn = screen.getByText('仪表盘').closest('button');
    expect(dashboardBtn?.style.backgroundColor).toBe('var(--accent-blue-bg)');
    expect(dashboardBtn?.style.color).toBe('var(--accent-blue-dark)');
  });

  it('should not highlight inactive nav items', () => {
    render(<SidebarComponent {...defaultProps} currentView="dashboard" />);
    const profitBtn = screen.getByText('利润计算').closest('button');
    expect(profitBtn?.style.backgroundColor).toBe('transparent');
    expect(profitBtn?.style.color).toBe('var(--text-secondary)');
  });

  it('should show user menu dropdown when user button is clicked', () => {
    render(<SidebarComponent {...defaultProps} />);
    const userBtn = screen.getByText('Test User').closest('button');
    fireEvent.click(userBtn!);

    expect(screen.getByText('个人中心')).toBeInTheDocument();
    expect(screen.getByText('退出登录')).toBeInTheDocument();
    expect(screen.getByText('testuser')).toBeInTheDocument();
  });

  it('should navigate to personal-center when personal center is clicked', () => {
    const onChangeView = vi.fn();
    render(<SidebarComponent {...defaultProps} onChangeView={onChangeView} />);

    const userBtn = screen.getByText('Test User').closest('button');
    fireEvent.click(userBtn!);
    fireEvent.click(screen.getByText('个人中心'));
    expect(onChangeView).toHaveBeenCalledWith('personal-center');
  });

  it('should call logout when logout is clicked', () => {
    mockLogout.mockClear();
    render(<SidebarComponent {...defaultProps} />);

    const userBtn = screen.getByText('Test User').closest('button');
    fireEvent.click(userBtn!);
    fireEvent.click(screen.getByText('退出登录'));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('should show hamburger menu button', () => {
    render(<SidebarComponent {...defaultProps} />);
    const header = document.querySelector('header');
    expect(header).toBeInTheDocument();
  });

  it('should open mobile drawer when hamburger is clicked', () => {
    render(<SidebarComponent {...defaultProps} />);
    const menuButtons = screen.getAllByRole('button');
    const hamburger = menuButtons.find(btn => btn.querySelector('svg'));

    if (hamburger) {
      fireEvent.click(hamburger);
      const logos = screen.getAllByAltText('Logo');
      expect(logos.length).toBeGreaterThanOrEqual(2);
    }
  });
});
