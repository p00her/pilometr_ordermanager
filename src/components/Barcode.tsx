import { useEffect, useRef } from 'react';
import { useTheme } from '@mui/material';
import JsBarcode from 'jsbarcode';

interface Props {
  value: string;
  width?: number;
  height?: number;
}

export default function Barcode({ value, width = 2.4, height = 35 }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const theme = useTheme();
  const color = theme.palette.mode === 'dark' ? '#fff' : '#000';

  useEffect(() => {
    if (ref.current && value) {
      const opts = {
        width,
        height,
        displayValue: true,
        fontSize: 18,
        textMargin: 2,
        margin: 0,
        background: 'transparent',
        lineColor: color,
        fontColor: color,
      };
      try {
        JsBarcode(ref.current, value, { ...opts, format: 'EAN13' });
      } catch {
        try {
          JsBarcode(ref.current, value, { ...opts, format: 'CODE128' });
        } catch {}
      }
    }
  }, [value, width, height, color]);

  if (!value) return <span>—</span>;

  return <svg ref={ref} style={{ display: 'block', maxWidth: 360 }} />;
}
