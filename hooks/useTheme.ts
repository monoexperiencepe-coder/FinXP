import { darkTheme, lightTheme } from '@/constants/theme';
import { useFinanceStore } from '@/store/useFinanceStore';

export function useTheme() {
  const theme = useFinanceStore((s) => s.theme);
  const T = theme === 'dark' ? darkTheme : lightTheme;
  const isDark = theme === 'dark';
  return { T, isDark };
}
