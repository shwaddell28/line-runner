import type { LineSegment } from '../db';

export type PlaybackMode = 'raw' | 'gapsRepeat' | 'fastGapsRepeat' | 'fastGaps';

export const FAST_RATE = 1.75;

export const MODE_INFO: Record<PlaybackMode, { label: string; description: string }> = {
  raw: {
    label: 'Raw',
    description: 'The whole recording, straight through'
  },
  gapsRepeat: {
    label: 'Gaps',
    description: 'Silent gap to say your line, then hear it played back'
  },
  fastGapsRepeat: {
    label: 'Fast + R',
    description: `Other lines at ${FAST_RATE}×, full-length gap, then your line plays back`
  },
  fastGaps: {
    label: 'Fast',
    description: `Other lines at ${FAST_RATE}×, gap for your line, no repeat`
  }
};

export interface AudioChunk {
  kind: 'audio';
  from: number;
  to: number;
  rate: number;
  /** true when this chunk is the repeat playback of one of your lines */
  isMyLine: boolean;
}

export interface SilenceChunk {
  kind: 'silence';
  /** the source-time range this gap stands in for (your line) */
  from: number;
  to: number;
}

export type Chunk = AudioChunk | SilenceChunk;

/** Sort, clamp to [0, duration], drop empties, merge overlaps. */
export function normalizeSegments(segments: LineSegment[], duration: number): LineSegment[] {
  const clamped = segments
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(duration, s.end) }))
    .filter((s) => s.end - s.start > 0.01)
    .sort((a, b) => a.start - b.start);
  const merged: LineSegment[] = [];
  for (const seg of clamped) {
    const last = merged[merged.length - 1];
    if (last && seg.start <= last.end) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

export function buildSchedule(
  duration: number,
  segments: LineSegment[],
  mode: PlaybackMode
): Chunk[] {
  if (mode === 'raw') {
    return duration > 0 ? [{ kind: 'audio', from: 0, to: duration, rate: 1, isMyLine: false }] : [];
  }
  const rate = mode === 'gapsRepeat' ? 1 : FAST_RATE;
  const repeat = mode !== 'fastGaps';
  const chunks: Chunk[] = [];
  let cursor = 0;
  for (const seg of normalizeSegments(segments, duration)) {
    if (seg.start - cursor > 0.01) {
      chunks.push({ kind: 'audio', from: cursor, to: seg.start, rate, isMyLine: false });
    }
    chunks.push({ kind: 'silence', from: seg.start, to: seg.end });
    if (repeat) {
      chunks.push({ kind: 'audio', from: seg.start, to: seg.end, rate, isMyLine: true });
    }
    cursor = seg.end;
  }
  if (duration - cursor > 0.01) {
    chunks.push({ kind: 'audio', from: cursor, to: duration, rate, isMyLine: false });
  }
  return chunks;
}

export type PlayerStatus = 'idle' | 'playing' | 'gap' | 'paused' | 'ended';

export interface PlayerState {
  status: PlayerStatus;
  /** current source-time position in seconds */
  position: number;
  /** true while the repeat playback of your line is sounding */
  playingMyLine: boolean;
}

/** How close (seconds of source time) to a chunk boundary counts as done. */
const BOUNDARY_EPSILON = 0.03;

export class ScenePlayer {
  private audio: HTMLAudioElement;
  private url: string;
  private schedule: Chunk[] = [];
  private index = 0;
  private rafId = 0;
  private gapTimer: ReturnType<typeof setTimeout> | undefined;
  private gapStartedAt = 0;
  private gapRemaining = 0;
  private gapElapsedBeforePause = 0;
  private status: PlayerStatus = 'idle';
  private destroyed = false;

  constructor(
    blob: Blob,
    private duration: number,
    private segments: LineSegment[],
    private onState: (state: PlayerState) => void
  ) {
    this.url = URL.createObjectURL(blob);
    this.audio = new Audio(this.url);
    this.audio.preload = 'auto';
    this.audio.preservesPitch = true;
    // Older iOS Safari uses the prefixed property.
    (this.audio as unknown as Record<string, unknown>).webkitPreservesPitch = true;
    this.setMode('raw');
  }

  setMode(mode: PlaybackMode): void {
    this.stop();
    this.schedule = buildSchedule(this.duration, this.segments, mode);
  }

  play(): void {
    if (this.destroyed || this.schedule.length === 0) return;
    if (this.status === 'paused') {
      this.resume();
      return;
    }
    if (this.status === 'playing' || this.status === 'gap') return;
    this.startChunk(0);
  }

  pause(): void {
    if (this.status === 'playing') {
      this.audio.pause();
      this.stopTicking();
      this.status = 'paused';
      this.emit();
    } else if (this.status === 'gap') {
      clearTimeout(this.gapTimer);
      this.gapElapsedBeforePause += (performance.now() - this.gapStartedAt) / 1000;
      this.stopTicking();
      this.status = 'paused';
      this.emit();
    }
  }

  stop(): void {
    clearTimeout(this.gapTimer);
    this.stopTicking();
    this.audio.pause();
    this.gapElapsedBeforePause = 0;
    this.index = 0;
    this.status = 'idle';
    this.emit();
  }

  /** Jump to a source time; playback continues from the chunk containing it. */
  seek(time: number): void {
    if (this.destroyed || this.schedule.length === 0) return;
    const t = Math.min(Math.max(time, 0), this.duration);
    let target = this.schedule.findIndex((c) => t >= c.from && t < c.to);
    if (target === -1) target = this.schedule.length - 1;
    const wasActive = this.status === 'playing' || this.status === 'gap';
    clearTimeout(this.gapTimer);
    this.stopTicking();
    this.audio.pause();
    this.gapElapsedBeforePause = 0;
    if (wasActive) {
      this.startChunk(target, t);
    } else {
      this.index = target;
      const chunk = this.schedule[target];
      if (chunk.kind === 'silence') {
        this.gapElapsedBeforePause = t - chunk.from;
      } else {
        this.audio.currentTime = t;
      }
      this.status = 'paused';
      this.emit();
    }
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.gapTimer);
    this.stopTicking();
    this.audio.pause();
    this.audio.src = '';
    URL.revokeObjectURL(this.url);
  }

  private resume(): void {
    const chunk = this.schedule[this.index];
    if (!chunk) return;
    if (chunk.kind === 'audio') {
      this.audio.playbackRate = chunk.rate;
      this.status = 'playing';
      void this.audio.play();
      this.tick();
    } else {
      this.startGap(chunk, this.gapElapsedBeforePause);
    }
  }

  private startChunk(index: number, fromTime?: number): void {
    if (this.destroyed) return;
    if (index >= this.schedule.length) {
      this.status = 'ended';
      this.index = 0;
      this.emit();
      return;
    }
    this.index = index;
    const chunk = this.schedule[index];
    if (chunk.kind === 'audio') {
      this.audio.currentTime = fromTime ?? chunk.from;
      this.audio.playbackRate = chunk.rate;
      this.status = 'playing';
      void this.audio.play();
      this.tick();
    } else {
      this.audio.pause();
      const elapsed = fromTime !== undefined ? fromTime - chunk.from : 0;
      this.startGap(chunk, elapsed);
    }
  }

  private startGap(chunk: SilenceChunk, alreadyElapsed: number): void {
    const total = chunk.to - chunk.from;
    this.gapElapsedBeforePause = alreadyElapsed;
    this.gapRemaining = Math.max(0, total - alreadyElapsed);
    this.gapStartedAt = performance.now();
    this.status = 'gap';
    this.gapTimer = setTimeout(() => {
      this.gapElapsedBeforePause = 0;
      this.startChunk(this.index + 1);
    }, this.gapRemaining * 1000);
    this.tick();
  }

  private tick = (): void => {
    if (this.destroyed) return;
    this.emit();
    const chunk = this.schedule[this.index];
    if (this.status === 'playing' && chunk?.kind === 'audio') {
      if (this.audio.currentTime >= chunk.to - BOUNDARY_EPSILON || this.audio.ended) {
        this.audio.pause();
        this.startChunk(this.index + 1);
        return;
      }
    }
    if (this.status === 'playing' || this.status === 'gap') {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  private stopTicking(): void {
    cancelAnimationFrame(this.rafId);
  }

  private currentPosition(): number {
    const chunk = this.schedule[this.index];
    if (!chunk) return 0;
    if (chunk.kind === 'audio') {
      return Math.min(Math.max(this.audio.currentTime, chunk.from), chunk.to);
    }
    const total = chunk.to - chunk.from;
    let elapsed = this.gapElapsedBeforePause;
    if (this.status === 'gap') {
      elapsed += (performance.now() - this.gapStartedAt) / 1000;
    }
    return chunk.from + Math.min(elapsed, total);
  }

  private emit(): void {
    const chunk = this.schedule[this.index];
    this.onState({
      status: this.status,
      position: this.status === 'ended' ? this.duration : this.currentPosition(),
      playingMyLine: this.status === 'playing' && chunk?.kind === 'audio' && chunk.isMyLine
    });
  }
}
