import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  children: ReactNode;
}

/** Width of the revealed Edit + Delete buttons. */
const ACTIONS_WIDTH = 168;
/** Movement before we decide whether a touch is a swipe or a scroll. */
const SLOP_PX = 8;

/**
 * List row that slides left to reveal Edit and Delete. Vertical drags are
 * left to the browser (touch-action: pan-y) so the list still scrolls.
 */
export function SwipeRow({ name, open, onOpenChange, onSelect, onEdit, onDelete, children }: Props) {
  const rowRef = useRef<HTMLLIElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    base: number;
    mode: 'pending' | 'drag' | 'none';
  } | null>(null);
  const suppressClick = useRef(false);

  // Tapping anywhere outside an open row closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onOpenChange]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    gesture.current = { x: e.clientX, y: e.clientY, base: open ? -ACTIONS_WIDTH : 0, mode: 'pending' };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.mode === 'none') return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.mode === 'pending') {
      if (Math.abs(dx) > SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
        g.mode = 'drag';
        e.currentTarget.setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > SLOP_PX) {
        g.mode = 'none';
        return;
      } else {
        return;
      }
    }
    // A little rubber-band past the fully-open position.
    const raw = g.base + dx;
    const offset = raw < -ACTIONS_WIDTH ? -ACTIONS_WIDTH + (raw + ACTIONS_WIDTH) / 4 : Math.min(raw, 0);
    setDrag(offset);
  };

  const endGesture = (commit: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.mode !== 'drag') return;
    suppressClick.current = true;
    if (commit && drag !== null) onOpenChange(drag < -ACTIONS_WIDTH / 2);
    setDrag(null);
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (open) onOpenChange(false);
    else onSelect();
  };

  const offset = drag ?? (open ? -ACTIONS_WIDTH : 0);

  return (
    <li ref={rowRef} className="swipe-row">
      <div className="swipe-actions" style={{ width: ACTIONS_WIDTH }} aria-hidden={!open}>
        <button className="swipe-action edit" onClick={onEdit} tabIndex={open ? 0 : -1} aria-label={`Rename ${name}`}>
          <Icon name="edit" />
          <span>Edit</span>
        </button>
        <button className="swipe-action delete" onClick={onDelete} tabIndex={open ? 0 : -1} aria-label={`Delete ${name}`}>
          <Icon name="trash" />
          <span>Delete</span>
        </button>
      </div>
      <button
        className={`swipe-main${drag === null ? ' settle' : ''}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endGesture(true)}
        onPointerCancel={() => endGesture(false)}
        onClick={onClick}
      >
        {children}
      </button>
    </li>
  );
}
