import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from '../modules/product-analysis/components/MarkdownText';

describe('MarkdownText', () => {
    it('renders headings, bold text, and lists as real elements', () => {
        render(
            <MarkdownText content={'## 店铺总结\n\n**核心问题**：转化率偏低\n\n- 第一\n- 第二'} />
        );

        expect(screen.getByText('店铺总结').tagName).toBe('P');
        expect(screen.getByText('核心问题').tagName).toBe('STRONG');
        expect(screen.getByText('第一').tagName).toBe('LI');
        expect(screen.queryByText(/##/)).toBeNull();
        expect(screen.queryByText(/\*\*/)).toBeNull();
    });

    it('renders GFM tables and inline code', () => {
        render(
            <MarkdownText content={'| 商品 | 销售额 |\n| --- | --- |\n| 键盘 | `1200` |'} />
        );

        expect(screen.getByText('商品').tagName).toBe('TH');
        expect(screen.getByText('销售额').tagName).toBe('TH');
        expect(screen.getByText('键盘').tagName).toBe('TD');
        expect(screen.getByText('1200').tagName).toBe('CODE');
        expect(screen.queryByText(/`/)).toBeNull();
    });
});
