# UI component foundation

The application uses React/ReactDOM 18.3.1, React 18 types, locally compiled Tailwind CSS 3.4.19 and the MIT-licensed shadcn/ui New York registry for Tailwind 3. The existing Vite application, providers, state, locale and API contracts are retained.

## Source provenance

The exact source URLs, SHA-256 hashes of downloaded registry JSON, and dependency names are recorded in `ui-migration-components.json`. The retrieved source license is retained in `frontend/components/ui/LICENSE.md`. Package versions are pinned in `frontend/package.json` and resolved integrity hashes are in its lockfile. Registry JSON hashes describe the upstream input; local TSX files intentionally differ as described below.

Read the relevant [shadcn documentation](https://v3.shadcn.com/docs) and [Radix component API](https://www.radix-ui.com/primitives/docs/overview/introduction) before changing behavior. Do not regenerate this directory with a latest/default CLI preset: it may overwrite React 18 ref handling and Tailwind 3-compatible source.

## Intentional local adaptations

- Imports use `@/components/ui`, with `@/lib/utils` sharing clsx and Tailwind-3-compatible tailwind-merge 2.6.0.
- Controls retain React.forwardRef. `Button` defaults to `type="button"`; forms must explicitly mark submit buttons.
- DOM primitives carry `data-ui` markers. Semantic colors map through namespaced HSL `--ui-*` variables, avoiding collisions with existing full-color hex variables such as `--primary`.
- Global dark utility overrides were removed after all active views migrated. Use semantic colors (`bg-card text-foreground border-input`) or an intentional fixed background/foreground pair. Compatibility variables such as `--text-secondary` and `--bg-card` map to the same semantic tokens. Business color meanings and storage keys remain compatible.
- `Table wrapped={false}` renders only the table to preserve existing sticky headers/columns and scroll ownership. `containerClassName` is supported when using the default wrapper.
- `DialogContent` and `SheetContent` expose `showCloseButton`, `closeLabel`, `overlayClassName` and `overlayStyle`. Titles and descriptions remain required accessible content; the default close label is Chinese and callers can pass their locale label. Dialogs/sheets use z-index 100, menus/selects/popovers/tooltips 200, and notifications 9999. Nested dialogs of the same layer follow DOM order.
- Existing controlled `open/onOpenChange`, disabled and outside-interaction guards must stay in business components. Do not keep old Escape listeners/focus traps when Radix owns the dialog.
- Dialog, Sheet and AlertDialog remember the focused opener on every open-autofocus event. On close they honor the caller's focus callback/preventDefault and Radix's own Trigger/non-modal outside-click behavior first; a microtask restores the still-connected opener only if focus otherwise falls back to the document body. This supports controlled business dialogs without a Trigger and nested overlays without per-module focus workarounds.
- Do not put React `autoFocus` on descendants of a controlled dialog without a Trigger. React focuses that element during commit, before Radix's FocusScope can emit the open-autofocus event, which prevents opener capture. Use the default first focusable element or `Content.onOpenAutoFocus(event)` with `event.preventDefault(); inputRef.current?.focus()` instead. The shared handler records the opener before calling this callback. This rule applies equally to Dialog, Sheet and AlertDialog.
- `NativeSelect` is a local compatibility primitive for native change events and empty-option values. Radix `Select` instead uses `onValueChange(value)`. Checkbox and Switch expose Radix checked-value callbacks, not DOM events.
- Sonner uses the existing document root `.dark` class, observed by MutationObserver. It does not add next-themes or a second preference store. `useToast().showToast(message, type?, duration?)` remains stable; notifications are dismissed when their provider unmounts.
- Reduced-motion preferences disable new primitive animations and transitions. Coarse-pointer mobile controls use at least 44px target height.

## Local module themes and overlays

`UIThemeScope` supplies a body-level overlay host to all shared Dialog, Sheet, AlertDialog, Select, DropdownMenu, Popover and Tooltip portals. Pass the same mapped custom properties that are applied to the module root:

```tsx
const variables = { '--ui-primary': '221 83% 53%' };
return <UIThemeScope variables={variables}>
  <section style={variables as React.CSSProperties}>{/* module */}</section>
</UIThemeScope>;
```

The scope adds no layout wrapper around children. Its portal host sits under body, so scrolling/overflow in a module cannot clip a fixed overlay. Ordinary pages need no scope and use the global theme. Portal APIs keep their explicit `container` override; use the shared wrappers rather than raw Radix portals.

## Verification

`npm run typecheck`, `npm test -- --reporter=dot __tests__/uiContracts.test.tsx __tests__/uiToastContract.test.tsx`, and `npm run build` verify the foundation. Contracts cover default/explicit form submission, Input ref and decimal drafts, native select events, nested dialog focus/closing, sticky table scroll ownership, Portal theme ownership, and the existing toast API. Existing business suites remain the behavioral source of truth. Browser checks cover the actual CSS and focus rendering.

## Business adapters

- Amount controls retain string drafts, including incomplete decimals; existing blur formatting, currency conversion and handlers own numeric interpretation. Use Input without parsing drafts in the primitive.
- Date controls retain local date strings; do not round-trip them through UTC Date serialization.
- Adapt Select/Checkbox/Switch value callbacks explicitly. NativeSelect is reserved for callers that need native events or empty-option values.
- Keep submitting locks and late-response guards in business components. Financial identity confirmation blocks all dismissals while verification is pending and ignores results after unmount.
- Use primary/primary-foreground and destructive/destructive-foreground for solid fills. Use warning/success/danger text on corresponding subtle backgrounds; fill foreground tokens do not belong on translucent status backgrounds.
- Mobile coarse-pointer switch and checkbox hit areas expand to 44px through a pseudo-element while their artwork remains compact. Associated labels have 44px minimum height to keep adjacent rows separate.
