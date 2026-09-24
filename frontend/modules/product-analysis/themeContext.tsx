import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  buildPaTheme,
  loadThemeColor,
  normalizeHexColor,
  saveThemeColor,
  type PaTheme,
} from './theme';

interface PaThemeContextValue {
  theme: PaTheme;
  /** 当前基础色（#RRGGBB） */
  color: string;
  setColor: (hex: string) => void;
}

/** 默认值：无 Provider 时（单组件测试/独立渲染）使用默认紫色浅色主题 */
const PaThemeContext = createContext<PaThemeContextValue>({
  theme: buildPaTheme(loadThemeColorSafe(), false),
  color: loadThemeColorSafe(),
  setColor: () => undefined,
});

function loadThemeColorSafe(): string {
  try {
    return loadThemeColor();
  } catch {
    return '#7048EC';
  }
}

/** 读取根节点 .dark 类（应用级深色模式开关） */
function readIsDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

/**
 * 商品分析主题 Provider：持有主题色（localStorage 持久化）与深色模式标记，
 * 派生完整 PaTheme。深色模式由应用在 <html> 上切换 .dark 类，
 * 这里用 MutationObserver 跟随，使图表的具体色值也随之更新。
 */
export const PaThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [color, setColorState] = useState<string>(loadThemeColorSafe);
  const [isDark, setIsDark] = useState<boolean>(readIsDark);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const setColor = useCallback((hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return;
    saveThemeColor(normalized);
    setColorState(normalized);
  }, []);

  const value = useMemo<PaThemeContextValue>(() => ({
    theme: buildPaTheme(color, isDark),
    color,
    setColor,
  }), [color, isDark, setColor]);

  return <PaThemeContext.Provider value={value}>{children}</PaThemeContext.Provider>;
};

export function usePaTheme(): PaThemeContextValue {
  return useContext(PaThemeContext);
}
