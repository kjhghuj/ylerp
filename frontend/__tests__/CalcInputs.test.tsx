import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { NumberInput, TextInput, SelectInput } from '../components/CalcInputs';

describe('NumberInput', () => {
    const mockOnChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render with label and value', () => {
        render(<NumberInput label="测试字段" name="testField" value={42} onChange={mockOnChange} />);
        expect(screen.getByText('测试字段')).toBeInTheDocument();
    });

    it('should display numeric value in input', () => {
        render(<NumberInput label="字段" name="field" value={100} onChange={mockOnChange} />);
        const input = screen.getByDisplayValue('100');
        expect(input).toBeInTheDocument();
    });

    it('should call onChange when value changes', () => {
        render(<NumberInput label="字段" name="field" value={100} onChange={mockOnChange} />);
        const input = screen.getByDisplayValue('100');
        fireEvent.change(input, { target: { value: '200' } });
        expect(mockOnChange).toHaveBeenCalled();
    });

    it('should display suffix when provided', () => {
        render(<NumberInput label="税率" name="tax" value={6} onChange={mockOnChange} suffix="%" />);
        expect(screen.getByText('%')).toBeInTheDocument();
    });

    it('should display currency conversion when rate and currencyCode are provided', () => {
        render(
            <NumberInput
                label="收入"
                name="revenue"
                value={100}
                onChange={mockOnChange}
                exchangeRate={0.65}
                currencyCode="MYR"
            />
        );
        expect(screen.getByText(/65\.00 MYR/)).toBeInTheDocument();
    });

    it('should not display currency conversion when rate is 0', () => {
        render(
            <NumberInput
                label="收入"
                name="revenue"
                value={100}
                onChange={mockOnChange}
                exchangeRate={0}
                currencyCode="MYR"
            />
        );
        expect(screen.queryByText(/MYR/)).not.toBeInTheDocument();
    });

    it('should not display currency conversion when currencyCode is empty', () => {
        render(
            <NumberInput
                label="收入"
                name="revenue"
                value={100}
                onChange={mockOnChange}
                exchangeRate={0.65}
                currencyCode=""
            />
        );
        expect(screen.queryByText(/0\.65/)).not.toBeInTheDocument();
    });

    it('should display inverted currency value when invertCurrency is true', () => {
        render(
            <NumberInput
                label="收入"
                name="revenue"
                value={100}
                onChange={mockOnChange}
                exchangeRate={0.65}
                currencyCode="MYR"
                invertCurrency={true}
            />
        );
        const input = screen.getByDisplayValue('65.00');
        expect(input).toBeInTheDocument();
        expect(screen.getByText(/100\.00 CNY/)).toBeInTheDocument();
    });

    it('should convert local currency back to CNY on change in invert mode', () => {
        render(
            <NumberInput
                label="收入"
                name="revenue"
                value={100}
                onChange={mockOnChange}
                exchangeRate={0.65}
                currencyCode="MYR"
                invertCurrency={true}
            />
        );
        const input = screen.getByDisplayValue('65.00');
        fireEvent.change(input, { target: { value: '130' } });
        expect(mockOnChange).toHaveBeenCalledWith(
            expect.objectContaining({
                target: expect.objectContaining({
                    name: 'revenue',
                    value: '200',
                }),
            })
        );
    });

    it('should format value on blur in invert mode', () => {
        render(
            <NumberInput
                label="收入"
                name="revenue"
                value={100}
                onChange={mockOnChange}
                exchangeRate={0.65}
                currencyCode="MYR"
                invertCurrency={true}
            />
        );
        const input = screen.getByDisplayValue('65.00');
        fireEvent.change(input, { target: { value: '130' } });
        fireEvent.blur(input);
        expect(input).toHaveValue('130.00');
    });

    it('should handle string value correctly', () => {
        render(<NumberInput label="字段" name="field" value="42" onChange={mockOnChange} />);
        expect(screen.getByDisplayValue('42')).toBeInTheDocument();
    });

    it('should handle zero value correctly', () => {
        render(<NumberInput label="字段" name="field" value={0} onChange={mockOnChange} />);
        expect(screen.getByDisplayValue('0')).toBeInTheDocument();
    });

    it('should apply highlight class when highlight is true', () => {
        render(<NumberInput label="字段" name="field" value={100} onChange={mockOnChange} highlight />);
        const input = screen.getByDisplayValue('100');
        expect(input.className).toContain('border-blue-300');
        expect(input.className).toContain('bg-blue-50');
    });

    it('should apply default class when highlight is false', () => {
        render(<NumberInput label="字段" name="field" value={100} onChange={mockOnChange} />);
        const input = screen.getByDisplayValue('100');
        expect(input.className).toContain('border-slate-200');
        expect(input.className).toContain('bg-white');
    });
});

describe('TextInput', () => {
    const mockOnChange = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render with label and value', () => {
        render(<TextInput label="名称" name="name" value="测试" onChange={mockOnChange} />);
        expect(screen.getByText('名称')).toBeInTheDocument();
        expect(screen.getByDisplayValue('测试')).toBeInTheDocument();
    });

    it('should call onChange when value changes', () => {
        render(<TextInput label="名称" name="name" value="" onChange={mockOnChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '新名称' } });
        expect(mockOnChange).toHaveBeenCalled();
    });
});

describe('SelectInput', () => {
    const mockOnChange = vi.fn();
    const options = [
        { value: 'yes', label: '是' },
        { value: 'no', label: '否' },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render with label and options', () => {
        render(<SelectInput label="发票" name="invoice" value="no" onChange={mockOnChange} options={options} />);
        expect(screen.getByText('发票')).toBeInTheDocument();
        expect(screen.getByDisplayValue('否')).toBeInTheDocument();
    });

    it('should display all options', () => {
        render(<SelectInput label="发票" name="invoice" value="no" onChange={mockOnChange} options={options} />);
        expect(screen.getByText('是')).toBeInTheDocument();
        expect(screen.getByText('否')).toBeInTheDocument();
    });

    it('should call onChange when selection changes', () => {
        render(<SelectInput label="发票" name="invoice" value="no" onChange={mockOnChange} options={options} />);
        fireEvent.change(screen.getByDisplayValue('否'), { target: { value: 'yes' } });
        expect(mockOnChange).toHaveBeenCalled();
    });
});
