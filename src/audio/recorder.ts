import type { LineSegment } from '../db';

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  duration: number;
  segments: LineSegment[];
}

/** Marks shorter than this are treated as accidental taps and dropped. */
const MIN_SEGMENT_SECONDS = 0.2;

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
}

export class SceneRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private openStart: number | null = null;
  readonly segments: LineSegment[] = [];

  get elapsed(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  get holdingLine(): boolean {
    return this.openStart !== null;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    await new Promise<void>((resolve) => {
      this.recorder!.onstart = () => {
        this.startedAt = performance.now();
        resolve();
      };
      this.recorder!.start();
    });
  }

  markLineStart(): void {
    if (this.openStart === null) this.openStart = this.elapsed;
  }

  markLineEnd(): void {
    if (this.openStart === null) return;
    const end = this.elapsed;
    if (end - this.openStart >= MIN_SEGMENT_SECONDS) {
      this.segments.push({ start: this.openStart, end });
    }
    this.openStart = null;
  }

  async stop(): Promise<RecordingResult> {
    this.markLineEnd();
    const duration = this.elapsed;
    const recorder = this.recorder;
    if (!recorder) throw new Error('Recorder was never started');
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/mp4' }));
      };
      recorder.stop();
    });
    this.releaseStream();
    return { blob, mimeType: blob.type, duration, segments: this.segments };
  }

  /** Discard the recording and release the microphone. */
  cancel(): void {
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      // already stopped
    }
    this.releaseStream();
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
