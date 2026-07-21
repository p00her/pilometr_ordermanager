import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import CssBaseline from '@mui/material/CssBaseline';
import { createTheme } from '@mui/material/styles';

type Mode = 'light' | 'dark' | 'system';

interface ThemeCtx {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

function buildTheme(mode: 'light' | 'dark') {
  return createTheme({
    palette: {
      mode,
      ...(mode === 'light'
        ? { background: { default: '#f5f5f5' } }
        : { background: { default: '#121212' } }),
      primary: { main: '#1976d2' },
      secondary: { main: '#dc004e' },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    },
    components: {
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': {
              backgroundColor: mode === 'dark' ? '#2c371e' : '#F2EFE9',
              '&:hover': {
                backgroundColor: mode === 'dark' ? '#3a4a28' : '#e5e0d6',
              },
            },
          },
        },
      },
    },
  });
}

export function ThemeContextProvider({ children }: { children: ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem('theme-mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system';
  });

  useEffect(() => {
    localStorage.setItem('theme-mode', mode);
  }, [mode]);

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      <ThemeProvider theme={buildTheme(resolved)}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeMode must be inside ThemeContextProvider');
  return ctx;
}
