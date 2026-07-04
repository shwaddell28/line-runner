import type { LineSegment } from '../db';

interface Props {
  duration: number;
  segments: LineSegment[];
  position: number;
  onSeek?: (time: number) => void;
}

/** Scrub bar with "my line" segments highlighted. */
export function Timeline({ duration, segments, position, onSeek }: Props) {
  const pct = (t: number) => `${duration > 0 ? (t / duration) * 100 : 0}%`;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(Math.min(Math.max(frac, 0), 1) * duration);
  };

  return (
    <div className="timeline" onClick={handleClick} role="slider" aria-label="Playback position">
      <div className="timeline-track" />
      {segments.map((s, i) => (
        <div
          key={i}
          className="timeline-segment"
          style={{ left: pct(s.start), width: pct(s.end - s.start) }}
        />
      ))}
      <div className="timeline-cursor" style={{ left: pct(position) }} />
    </div>
  );
}
