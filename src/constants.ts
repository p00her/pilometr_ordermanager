export const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  '97': 'success',
  '98': 'success',
  '99': 'warning',
  '100': 'success',
  '101': 'success',
  '95': 'error',
  '96': 'error',
  '102': 'default',
  '4735558': 'error',
};

type NonDefaultColor = 'info' | 'warning' | 'success' | 'error';

export function labelStatusColor(label: string): NonDefaultColor | undefined {
  const l = label.toLowerCase();
  if (l.includes('оплачивается')) return 'info';
  return undefined;
}

export function paletteColor(label: string, id: number | string): NonDefaultColor | undefined {
  const lc = labelStatusColor(label);
  if (lc) return lc;
  const c = STATUS_COLORS[String(id)];
  if (c && c !== 'default') return c as NonDefaultColor;
  return undefined;
}
