import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useCartesianChart } from '@funnest/charts-react';
import type { PlotRect } from '@funnest/charts-react';
import type { InstrumentMarker } from './rsi-chart-canvas.js';
import { placePlotLabel } from '../../../../dist/ui/chart-legend-layout.js';

export type FunnestInstrumentMarker = InstrumentMarker & { at: number; value: number };
export interface FunnestInstrumentMarkersProps {
  markers: readonly FunnestInstrumentMarker[];
  active: boolean;
  onMarker?: () => void;
}
export interface MarkerGroup {
  key: string;
  kind: InstrumentMarker['kind'];
  date: string;
  at: number;
  value: number;
  markers: readonly FunnestInstrumentMarker[];
}
export interface MarkerLabelBox { x: number; y: number; width: number; height: number }
export interface MarkerLabelConnector { x1: number; y1: number; x2: number; y2: number }
export function shouldUseInstrumentMarkerTouchTargets(plotWidth: number, coarsePointer: boolean): boolean {
  return coarsePointer || Number.isFinite(plotWidth) && plotWidth <= 500;
}

export interface InstrumentMarkerLayout {
  group: MarkerGroup;
  text: string;
  labelBox: MarkerLabelBox | null;
  labelX: number | null;
  labelY: number | null;
  anchor: { x: number; y: number };
  targetBox: MarkerLabelBox | null;
  connector: MarkerLabelConnector | null;
}

/** Group source markers without modifying or reordering their source objects. */
export function groupInstrumentMarkers(markers: readonly FunnestInstrumentMarker[]): MarkerGroup[] {
  const groups = new Map<string, FunnestInstrumentMarker[]>();
  for (const marker of markers) {
    if (!Number.isFinite(marker.at) || !Number.isFinite(marker.value)) continue;
    const key = `${marker.kind}:${marker.date}`;
    const group = groups.get(key);
    if (group) group.push(marker);
    else groups.set(key, [marker]);
  }
  return [...groups].map(([key, items]) => ({ key, kind: items[0].kind, date: items[0].date,
    at: items[0].at, value: items[0].value, markers: items }));
}

/** Compact E/J labels and (when requested) true touch-target rectangles share one collision ledger. */
export function placeInstrumentMarkerLabels(
  groups: readonly MarkerGroup[], width: number, height: number, obstacles: readonly MarkerLabelBox[] = [],
  bounds: Pick<PlotRect, 'left'|'right'|'top'|'bottom'> = { left: 0, right: width, top: 0, bottom: height }, targetSize = 0,
): InstrumentMarkerLayout[] {
  const placed: MarkerLabelBox[] = Array.from(obstacles);
  return groups.map(group => {
    const text = `${group.kind === 'evidence' ? 'E' : 'J'}${group.markers.length > 1 ? `·${group.markers.length}` : ''}`;
    const labelWidth = Math.max(12, [...text].length * 7);
    const labelHeight = 14;
    const anchor = { x: group.at, y: group.value };
    let targetBox: MarkerLabelBox | null = null;
    let connector: MarkerLabelConnector | null = null;
    if (targetSize > 0) {
      const wanted = { x: anchor.x - targetSize / 2, y: anchor.y - targetSize / 2 };
      const target = placePlotLabel({ x: wanted.x, y: wanted.y, width: targetSize, height: targetSize,
        left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, obstacles: placed, gap: 4 });
      if (target) {
        targetBox = { x: target.x, y: target.y, width: target.width, height: target.height };
        placed.push(targetBox);
        const moved = target.x !== wanted.x || target.y !== wanted.y;
        if (moved) {
          const containsAnchor = anchor.x >= targetBox.x && anchor.x <= targetBox.x + targetBox.width && anchor.y >= targetBox.y && anchor.y <= targetBox.y + targetBox.height;
          connector = { x1: anchor.x, y1: anchor.y,
            x2: containsAnchor ? targetBox.x + targetBox.width / 2 : Math.max(targetBox.x, Math.min(anchor.x, targetBox.x + targetBox.width)),
            y2: containsAnchor ? targetBox.y + targetBox.height / 2 : Math.max(targetBox.y, Math.min(anchor.y, targetBox.y + targetBox.height)) };
        }
        return { group, text, labelBox: { x: targetBox.x + (targetBox.width - labelWidth) / 2,
          y: targetBox.y + (targetBox.height - labelHeight) / 2, width: labelWidth, height: labelHeight },
          labelX: targetBox.x + targetBox.width / 2, labelY: targetBox.y + targetBox.height / 2 + 4,
          anchor, targetBox, connector };
      }
    }
    const preferred = { x: anchor.x + 7, y: anchor.y - 18 };
    const result = placePlotLabel({ x: preferred.x, y: preferred.y, width: labelWidth, height: labelHeight,
      left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, obstacles: placed, gap: 4 });
    if (!result) return { group, text, labelBox: null, labelX: null, labelY: null, anchor, targetBox: null, connector: null };
    const labelBox = { x: result.x, y: result.y, width: result.width, height: result.height };
    placed.push(labelBox);
    const moved = result.x !== preferred.x || result.y !== preferred.y;
    if (moved) connector = { x1: anchor.x, y1: anchor.y,
      x2: Math.max(labelBox.x, Math.min(anchor.x, labelBox.x + labelBox.width)),
      y2: Math.max(labelBox.y, Math.min(anchor.y, labelBox.y + labelBox.height)) };
    return { group, text, labelBox, labelX: result.x, labelY: result.y + 11, anchor, targetBox: null, connector };
  });
}

export function activateInstrumentMarkerGroup(group: MarkerGroup, onMarker?: () => void): void {
  const chosen = group.markers.find(marker => marker.selected) ?? group.markers.at(-1);
  if (!chosen) return;
  chosen.onSelect();
  onMarker?.();
}

function sourceTitle(group: MarkerGroup): string {
  return group.markers.map(marker => `${marker.date} · ${marker.kind === 'evidence' ? '근거' : '판정'} · ${marker.title}`).join(' / ');
}
const overlaySelector = '.atlas-quote-hud,.lab-chart-foot,.rsi-trading-criteria';
function overlayNodes(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(overlaySelector)];
}
function visibleOverlayNodes(root: Element): HTMLElement[] {
  return overlayNodes(root).filter(node => {
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.visibility !== 'collapse';
  });
}
function rectToChartBox(rect: DOMRect, svgRect: DOMRect, scaleX: number, scaleY: number): MarkerLabelBox {
  return { x: (rect.left - svgRect.left) * scaleX, y: (rect.top - svgRect.top) * scaleY,
    width: rect.width * scaleX, height: rect.height * scaleY };
}

export function FunnestInstrumentMarkers({ markers, active, onMarker }: FunnestInstrumentMarkersProps) {
  const ctx = useCartesianChart();
  const groupRef = useRef<SVGGElement>(null);
  const [, setGeometryVersion] = useState(0);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const groups = useMemo(() => groupInstrumentMarkers(markers), [markers]);
  useLayoutEffect(() => {
    const win = groupRef.current?.ownerSVGElement?.ownerDocument.defaultView;
    const media = win?.matchMedia?.('(pointer: coarse)');
    if (!media) return;
    const update = () => setCoarsePointer(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useLayoutEffect(() => {
    const groupNode = groupRef.current;
    const svg = groupNode?.ownerSVGElement;
    const root = svg?.closest('.rsi-chart-canvas');
    if (!svg || !root) return;
    const refresh = () => setGeometryVersion(version => version + 1);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    resizeObserver?.observe(svg);
    const overlayMutationObservers: MutationObserver[] = [];
    let observedOverlays: HTMLElement[] = [];
    const bindOverlays = () => {
      const next = overlayNodes(root);
      if (next.length === observedOverlays.length && next.every((node, index) => node === observedOverlays[index])) return false;
      for (const observer of overlayMutationObservers.splice(0)) observer.disconnect();
      for (const node of observedOverlays) resizeObserver?.unobserve(node);
      observedOverlays = next;
      for (const node of next) {
        resizeObserver?.observe(node);
        if (typeof MutationObserver !== 'undefined') {
          const overlayObserver = new MutationObserver(refresh);
          overlayObserver.observe(node, { attributes: true, childList: true, characterData: true, subtree: true });
          overlayMutationObservers.push(overlayObserver);
        }
      }
      return true;
    };
    bindOverlays();
    const rootChildObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      if (bindOverlays()) refresh();
    });
    rootChildObserver?.observe(root, { childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    const win = svg.ownerDocument.defaultView;
    const refreshViewport = () => { bindOverlays(); refresh(); };
    win?.addEventListener('resize', refreshViewport);
    win?.addEventListener('scroll', refreshViewport, true);
    refresh();
    return () => {
      resizeObserver?.disconnect();
      rootChildObserver?.disconnect();
      for (const observer of overlayMutationObservers) observer.disconnect();
      overlayMutationObservers.length = 0;
      win?.removeEventListener('resize', refreshViewport);
      win?.removeEventListener('scroll', refreshViewport, true);
    };
  }, []);

  const svg = groupRef.current?.ownerSVGElement ?? null;
  const svgRect = svg?.getBoundingClientRect();
  const scaleX = svgRect?.width ? ctx.width / svgRect.width : 1;
  const scaleY = svgRect?.height ? ctx.height / svgRect.height : 1;
  const root = svg?.closest('.rsi-chart-canvas');
  const obstacles = svg && svgRect && root ? visibleOverlayNodes(root)
    .map(node => rectToChartBox(node.getBoundingClientRect(), svgRect, scaleX, scaleY)) : [];
  const touchTargetMode = shouldUseInstrumentMarkerTouchTargets(ctx.plot.width, coarsePointer);
  const layouts = placeInstrumentMarkerLabels(groups.map(group => ({ ...group, at: ctx.x(group.at), value: ctx.y(group.value) })),
    ctx.width, ctx.height, obstacles, ctx.plot, touchTargetMode ? 44 : 0);
  const placedTouchTargets = layouts.filter(layout => layout.targetBox).length;
  const unplacedTouchTargets = touchTargetMode ? groups.length - placedTouchTargets : 0;
  const targetStatus = !touchTargetMode ? 'not-required' : unplacedTouchTargets ? 'limited' : 'complete';

  const activate = (group: MarkerGroup) => (event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>) => {
    event.stopPropagation();
    if (!active) return;
    if ('key' in event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
    }
    activateInstrumentMarkerGroup(group, onMarker);
  };
  return <g ref={groupRef} className="atlas-funnest-instrument-markers" role="group"
    aria-label={touchTargetMode ? `근거·판정 표식 · 44px 터치 영역 ${placedTouchTargets}/${groups.length}${unplacedTouchTargets ? ` · 공간 부족 ${unplacedTouchTargets}` : ''}` : '근거·판정 표식'}
    data-hit-target-status={targetStatus} data-hit-target-count={placedTouchTargets} data-hit-target-unplaced={unplacedTouchTargets}>
    {touchTargetMode && unplacedTouchTargets > 0 && <desc>일부 표식은 차트 안에 44픽셀 터치 영역을 배치할 공간이 없습니다. 원자료 접근은 차트의 표식 목록을 이용할 수 있습니다.</desc>}
    {groups.map((group, index) => {
      const x = ctx.x(group.at), y = ctx.y(group.value), layout = layouts[index];
      const title = sourceTitle(group);
      const color = group.kind === 'judgment' ? 'var(--data-gold)' : 'var(--text)';
      return <g key={group.key} role="button" tabIndex={active ? 0 : -1} aria-disabled={!active} aria-label={title}
        aria-pressed={group.markers.some(marker => marker.selected)} data-marker-kind={group.kind} data-marker-date={group.date}
        data-hit-target={layout.targetBox ? '44' : 'unplaced'}
        onClick={activate(group)} onKeyDown={activate(group)} style={{ cursor: active ? 'pointer' : 'default' }}>
        <title>{title}</title>
        {layout.targetBox && <rect x={layout.targetBox.x} y={layout.targetBox.y} width={layout.targetBox.width} height={layout.targetBox.height}
          fill="transparent" stroke="none" pointerEvents="all" aria-hidden="true"/>}
        {layout.connector && <line x1={layout.connector.x1} y1={layout.connector.y1} x2={layout.connector.x2} y2={layout.connector.y2}
          stroke={color} strokeWidth={1} opacity={0.7} pointerEvents="none"/>}
        <circle cx={x} cy={y} r={4} fill={color} stroke="var(--bg)" strokeWidth={2}/>
        {layout.labelX !== null && layout.labelY !== null && <text x={layout.labelX} y={layout.labelY} textAnchor={layout.targetBox ? 'middle' : 'start'}
          fontSize={11} fontWeight={700} fill={color} pointerEvents="none">{layout.text}</text>}
      </g>;
    })}
  </g>;
}
