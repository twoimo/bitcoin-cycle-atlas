import { useLayoutEffect, useRef } from 'react';
import { createChartColorsControl } from '../../../../dist/ui/chart-colors.js';

/** Reuse the native workbench preference without adding a second state owner. */
export function ChartColorsControl() {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const control = createChartColorsControl(node.ownerDocument);
    node.append(control);
    return () => control.remove();
  }, []);
  return <div ref={host}/>;
}
