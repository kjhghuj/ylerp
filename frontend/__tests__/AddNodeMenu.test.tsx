import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AddNodeMenu } from '../modules/profit/AddNodeMenu';
import { ProfitTemplate } from '../modules/profit/types';

const mockT = {
    matrix: {
        addNode: '添加节点',
        useTemplate: '使用模版',
        createBlank: '创建空白',
        newNode: '添加',
        sites: { MYR: '马来西亚', SGD: '新加坡' },
        platforms: { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok', other: '其他' },
    },
    templates: { empty: '暂无模版' },
};

const mockTemplates: ProfitTemplate[] = [
    { id: 'tpl-1', name: '模版A', country: 'MYR', platform: 'shopee', data: {} },
    { id: 'tpl-2', name: '模版B', country: 'MYR', platform: 'lazada', data: {} },
    { id: 'tpl-3', name: 'SG模版', country: 'SGD', platform: 'shopee', data: {} },
];

describe('AddNodeMenu', () => {
    const mockSetShowAddMenu = vi.fn();
    const mockSetSelectedPlatform = vi.fn();
    const mockOnAddFromTemplate = vi.fn();
    const mockOnAddBlank = vi.fn();
    const mockOnDeleteTemplate = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render add node button', () => {
        render(
            <AddNodeMenu
                showAddMenu={false}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        expect(screen.getByText('添加节点')).toBeInTheDocument();
    });

    it('should show dropdown when showAddMenu is true', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        expect(screen.getByText('使用模版')).toBeInTheDocument();
        expect(screen.getByText('创建空白')).toBeInTheDocument();
    });

    it('should not show dropdown when showAddMenu is false', () => {
        render(
            <AddNodeMenu
                showAddMenu={false}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        expect(screen.queryByText('使用模版')).not.toBeInTheDocument();
    });

    it('should filter templates by siteCountry', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        expect(screen.getByText('模版A')).toBeInTheDocument();
        expect(screen.getByText('模版B')).toBeInTheDocument();
        expect(screen.queryByText('SG模版')).not.toBeInTheDocument();
    });

    it('should show empty message when no templates for current country', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="SGD"
                allTemplates={[]}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        expect(screen.getByText('暂无模版')).toBeInTheDocument();
    });

    it('should call onAddFromTemplate when template is clicked', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        fireEvent.click(screen.getByText('模版A'));
        expect(mockOnAddFromTemplate).toHaveBeenCalledWith(mockTemplates[0]);
    });

    it('should call onAddBlank when blank node button is clicked', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        fireEvent.click(screen.getByText('添加'));
        expect(mockOnAddBlank).toHaveBeenCalled();
    });

    it('should call onDeleteTemplate when delete button is clicked', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        const deleteButtons = screen.getAllByRole('button').filter(btn =>
            btn.querySelector('svg.lucide-trash2') || btn.className.includes('hover:text-red-500')
        );
        fireEvent.click(deleteButtons[0]);
        expect(mockOnDeleteTemplate).toHaveBeenCalledWith('tpl-1', expect.any(Object));
    });

    it('should call setShowAddMenu(false) when overlay is clicked', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        const overlay = document.querySelector('.fixed.inset-0');
        expect(overlay).toBeTruthy();
        fireEvent.click(overlay!);
        expect(mockSetShowAddMenu).toHaveBeenCalledWith(false);
    });

    it('should toggle menu when add node button is clicked', () => {
        render(
            <AddNodeMenu
                showAddMenu={false}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        fireEvent.click(screen.getByText('添加节点'));
        expect(mockSetShowAddMenu).toHaveBeenCalledWith(true);
    });

    it('should display current site country name', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        expect(screen.getByText(/马来西亚/)).toBeInTheDocument();
    });

    it('should display platform options in select', () => {
        render(
            <AddNodeMenu
                showAddMenu={true}
                setShowAddMenu={mockSetShowAddMenu}
                selectedPlatform="shopee"
                setSelectedPlatform={mockSetSelectedPlatform}
                siteCountry="MYR"
                allTemplates={mockTemplates}
                onAddFromTemplate={mockOnAddFromTemplate}
                onAddBlank={mockOnAddBlank}
                onDeleteTemplate={mockOnDeleteTemplate}
                t={mockT}
            />
        );
        const select = screen.getByDisplayValue('Shopee');
        expect(select).toBeInTheDocument();
    });
});
