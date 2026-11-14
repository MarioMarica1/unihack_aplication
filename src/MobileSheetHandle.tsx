import { useRef } from 'react';
import type { PointerEvent } from 'react';

const stops = ['peek', 'half', 'full'] as const;
export type MobileSheetSnap = typeof stops[number];

type Drag = {
  id: number;
  shell: HTMLElement;
  heights: number[];
  startHeight: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  moved: boolean;
};

const labels: Record<MobileSheetSnap, string> = {
  peek: 'Glisează în sus',
  half: 'Glisează sus / jos',
  full: 'Glisează în jos',
};

export default function MobileSheetHandle({ snap, onSnap }: {
  snap: MobileSheetSnap;
  onSnap: (snap: MobileSheetSnap) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const sheet = event.currentTarget.closest<HTMLElement>('.discovery');
    const shell = sheet?.closest<HTMLElement>('.app-shell');
    if (!sheet || !shell) return;

    const styles = getComputedStyle(shell);
    const viewportHeight = shell.clientHeight;
    const heights = stops.map(stop => viewportHeight * Number(styles.getPropertyValue(`--mobile-sheet-${stop}-ratio`)));
    const topReserve = parseFloat(styles.getPropertyValue('--mobile-sheet-top-reserve'));
    heights[2] = Math.max(heights[1], Math.min(heights[2], viewportHeight - topReserve));
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId,
      shell,
      heights,
      startHeight: sheet.getBoundingClientRect().height,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const distance = current.startY - event.clientY;
    if (!current.moved && Math.abs(distance) < 6) return;

    current.moved = true;
    const elapsed = event.timeStamp - current.lastTime;
    if (elapsed > 0) current.velocity = (current.lastY - event.clientY) / elapsed;
    current.lastTime = event.timeStamp;
    current.lastY = event.clientY;
    const height = Math.min(current.heights[2], Math.max(current.heights[0], current.startHeight + distance));
    current.shell.dataset.sheetDragging = '';
    current.shell.style.setProperty('--mobile-sheet-drag-height', `${height}px`);
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (!current.moved) return;

    suppressClick.current = true;
    if (!cancelled) {
      const momentum = event.timeStamp - current.lastTime < 100
        ? Math.min(90, Math.max(-90, current.velocity * 110))
        : 0;
      const target = current.startHeight + current.startY - event.clientY + momentum;
      const index = current.heights.reduce((closest, height, i) =>
        Math.abs(height - target) < Math.abs(current.heights[closest] - target) ? i : closest, stops.indexOf(snap));
      onSnap(stops[index]);
    }
    delete current.shell.dataset.sheetDragging;
    current.shell.style.removeProperty('--mobile-sheet-drag-height');
  }

  return (
    <button
      type="button"
      className="sheet-grabber"
      aria-label="Ajustează înălțimea panoului mobil"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => finish(event, true)}
      onClick={event => {
        if (event.detail > 0 && suppressClick.current) return;
        onSnap(stops[(stops.indexOf(snap) + 1) % stops.length]);
      }}
      onKeyDown={event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const step = event.key === 'ArrowUp' ? 1 : -1;
        onSnap(stops[Math.max(0, Math.min(stops.length - 1, stops.indexOf(snap) + step))]);
      }}
    >
      <span aria-hidden="true" />
      <small className="mobile-sheet-snap-pills">{labels[snap]}</small>
    </button>
  );
}
