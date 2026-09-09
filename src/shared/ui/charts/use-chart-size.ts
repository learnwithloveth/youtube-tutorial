'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Measures the container so SVG can be drawn in real pixel units — text stays
 * at its intended size instead of being scaled by a viewBox fit.
 */
export function useChartSize<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && Math.abs(next - width) > 0.5) setWidth(next);
    });
    observer.observe(node);
    setWidth(node.clientWidth || fallback);
    return () => observer.disconnect();
    // `width` is intentionally excluded: it is written by this effect, and
    // including it would tear the observer down on every resize frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback]);

  return { ref, width };
}
