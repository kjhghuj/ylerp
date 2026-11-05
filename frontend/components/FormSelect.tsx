import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Value adapter over the local shadcn/Radix Select primitives.
 *
 * Contract (see global-select migration plan):
 * - `value: string | null`; `null` means truly unselected, `''` is a real
 *   business value with its own label. `onValueChange` emits business values only.
 * - Options are explicit data; duplicate values disable the control with a
 *   visible data-error state, keep the external value displayed and never emit.
 * - Real values are one-to-one prefixed (`v:` + value) so the Radix root's
 *   empty string stays reserved for `null`. Decoding verifies prefix,
 *   membership and disabled state before any business callback fires.
 * - Unknown external values render a disabled fallback item instead of losing
 *   the selection; options arriving later restore the label with zero callbacks.
 * - `name`/`required`/`form` are deliberately not exposed: the hidden native
 *   bridge may carry encoded values, and only the decoded callback is a
 *   business interface.
 */
export interface FormSelectOption {
  value: string;
  label: React.ReactNode;
  /** Typeahead text for rich labels; never derived by casting ReactNode. */
  textValue?: string;
  disabled?: boolean;
}

export interface FormSelectProps {
  value: string | null;
  options: FormSelectOption[];
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
  'data-testid'?: string;
  title?: string;
  triggerClassName?: string;
  contentClassName?: string;
  itemClassName?: string;
}

const VALUE_PREFIX = 'v:';
const encodeValue = (value: string) => VALUE_PREFIX + value;

const FALLBACK_LABEL = '当前值暂不可用';
const DATA_ERROR_LABEL = '选项数据异常（存在重复值）';

const longTextItemClass =
  'min-w-0 whitespace-normal [&>span:last-child]:min-w-0 [&>span:last-child]:whitespace-normal [&>span:last-child]:[overflow-wrap:anywhere]';

/**
 * Shared select for business forms. The caller's state stays the single source
 * of truth: no first-option fallback, no fabricated events, no auto-selection
 * when options change; keyboard, focus restore and layering come from Radix.
 */
export const FormSelect = React.forwardRef<HTMLButtonElement, FormSelectProps>(
  (
    {
      value,
      options,
      onValueChange,
      placeholder = '请选择',
      disabled = false,
      id,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      'aria-describedby': ariaDescribedby,
      'aria-invalid': ariaInvalid,
      'data-testid': dataTestId,
      title,
      triggerClassName,
      contentClassName,
      itemClassName,
    },
    forwardedRef,
  ) => {
    const hasDuplicateValues =
      new Set(options.map(option => option.value)).size !== options.length;

    const knownOption = options.find(option => option.value === value) ?? null;
    // Unknown external value (including '' when no such option exists).
    const isFallbackValue = !hasDuplicateValues && value !== null && !knownOption;

    const triggerDisabled =
      disabled ||
      hasDuplicateValues ||
      (!hasDuplicateValues && value === null && options.length === 0);

    const rootValue = value === null ? '' : encodeValue(value);

    const handleValueChange = (raw: string) => {
      if (hasDuplicateValues) return;
      if (!raw.startsWith(VALUE_PREFIX)) return;
      const decoded = raw.slice(VALUE_PREFIX.length);
      const option = options.find(candidate => candidate.value === decoded);
      if (!option || option.disabled) return;
      onValueChange?.(decoded);
    };

    return (
      <Select value={rootValue} onValueChange={handleValueChange} disabled={triggerDisabled}>
        <SelectTrigger
          ref={forwardedRef}
          id={id}
          data-testid={dataTestId}
          data-form-select-trigger=""
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          aria-describedby={ariaDescribedby}
          aria-invalid={ariaInvalid}
          title={title}
          className={cn('min-w-0', triggerClassName)}
        >
          <SelectValue placeholder={hasDuplicateValues && value === null ? DATA_ERROR_LABEL : placeholder} />
        </SelectTrigger>
        <SelectContent
          className={cn(
            'w-[var(--radix-select-trigger-width)] min-w-0 max-w-[calc(100vw-2rem)] [&_[data-radix-select-viewport]]:min-w-0',
            contentClassName,
          )}
        >
          {hasDuplicateValues ? (
            <SelectItem
              value={encodeValue(value ?? '')}
              disabled
              textValue={knownOption?.textValue ?? DATA_ERROR_LABEL}
              className={cn(longTextItemClass, 'text-muted-foreground', itemClassName)}
            >
              {knownOption ? knownOption.label : DATA_ERROR_LABEL}
            </SelectItem>
          ) : (
            <>
              {options.map(option => (
                <SelectItem
                  key={option.value}
                  value={encodeValue(option.value)}
                  disabled={option.disabled}
                  textValue={option.textValue}
                  className={cn(longTextItemClass, itemClassName)}
                >
                  {option.label}
                </SelectItem>
              ))}
              {isFallbackValue && (
                <SelectItem
                  value={encodeValue(value)}
                  disabled
                  textValue={value}
                  className={cn(longTextItemClass, 'text-muted-foreground', itemClassName)}
                >
                  {FALLBACK_LABEL}：{value}
                </SelectItem>
              )}
            </>
          )}
        </SelectContent>
      </Select>
    );
  },
);
FormSelect.displayName = 'FormSelect';
