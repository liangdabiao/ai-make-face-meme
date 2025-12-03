// GIF.js type definitions
declare module 'gif.js' {
  export interface GIFOptions {
    workers?: number;
    quality?: number;
    workerScript?: string;
    width?: number | null;
    height?: number | null;
    transparent?: string | null;
    dither?: boolean | string;
    debug?: boolean;
  }

  export interface FrameOptions {
    delay?: number;
    copy?: boolean;
    dispose?: number;
  }

  export interface AddFrameOptions extends FrameOptions {
    // Frame options
  }

  export interface Progress {
    // Progress object
    numFrames: number;
    frameNumber: number;
    percent: number;
  }

  export type GIFEventType = 'progress' | 'finished' | 'abort' | 'error' | 'start';

  export type GIFEventHandler<T = any> = (event?: T) => void;

  export default class GIF {
    constructor(options?: GIFOptions);

    addFrame(
      element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
      options?: AddFrameOptions
    ): void;

    on(event: GIFEventType, callback: GIFEventHandler): void;
    on(event: 'progress', callback: (progress: Progress) => void): void;
    on(event: 'finished', callback: (blob: Blob) => void): void;
    on(event: 'error', callback: (error: Error | string) => void): void;
    on(event: 'abort', callback: () => void): void;
    on(event: 'start', callback: () => void): void;

    // Legacy event API
    on(event: GIFEventType, callback: (...args: any[]) => void): void;

    render(): void;
    abort(): void;
    pause(): void;
    resume(): void;
    isRunning(): boolean;
  }
}