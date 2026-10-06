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
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  readonly segments: LineSegment[] = [];

  get elapsed(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  get holdingLine(): boolean {
    return this.openStart !== null;
  }

  /** Rough input loudness, 0–1, for a level meter (0 if unavailable). */
  get level(): number {
    if (!this.analyser || !this.samples) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) sum += v * v;
    const rms = Math.sqrt(sum / this.samples.length);
    return Math.min(1, rms * 5);
  }

  async start(): Promise<void> {
    // Create the context before awaiting so it's still inside the tap gesture
    // (iOS won't start a suspended one later). The meter is best-effort.
    try {
      this.audioCtx = new AudioContext();
    } catch {
      this.audioCtx = null;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      this.releaseStream();
      throw e;
    }
    if (this.audioCtx) {
      try {
        const source = this.audioCtx.createMediaStreamSource(this.stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.samples = new Float32Array(this.analyser.fftSize);
        source.connect(this.analyser);
        void this.audioCtx.resume();
      } catch {
        this.analyser = null;
      }
    }
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
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.analyser = null;
  }
}
