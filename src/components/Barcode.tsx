import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface Props {
  value: string;
  width?: number;
  height?: number;
}

export default function Barcode({ value, width = 1.2, height = 36 }: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128',
          width,
          height,
          displayValue: true,
          fontSize: 10,
          margin: 0,
          background: 'transparent',
        });
      } catch {}
    }
  }, [value, width, height]);

  if (!value) return <span>—</span>;

  return <svg ref={ref} style={{ display: 'block', maxWidth: 160 }} />;
}
