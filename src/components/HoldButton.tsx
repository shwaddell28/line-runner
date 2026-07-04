import { useCallback, useRef, useState } from 'react';

interface Props {
  onHoldStart: () => void;
  onHoldEnd: () => void;
  disabled?: boolean;
}

/**
 * Big press-and-hold target. Uses pointer capture so the hold survives the
 * finger drifting off the button, and blocks the iOS long-press callout.
 */
export function HoldButton({ onHoldStart, onHoldEnd, disabled }: Props) {
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);

  const start = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || heldRef.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      heldRef.current = true;
      setHeld(true);
      onHoldStart();
    },
    [disabled, onHoldStart]
  );

  const end = useCallback(() => {
    if (!heldRef.current) return;
    heldRef.current = false;
    setHeld(false);
    onHoldEnd();
  }, [onHoldEnd]);

  return (
    <button
      className={`hold-btn${held ? ' held' : ''}`}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      {held ? 'YOUR LINE — RECORDING MARK' : 'HOLD WHILE SPEAKING YOUR LINE'}
    </button>
  );
}
