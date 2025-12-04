declare module 'gifencoder' {
  class GIFEncoder {
    constructor(width: number, height: number);
    start(): void;
    setRepeat(repeat: number): void;
    setDelay(delay: number): void;
    setQuality(quality: number): void;
    setTransparent(color: number): void;
    addFrame(ctx: CanvasRenderingContext2D): void;
    finish(): void;
    out: {
      getData(): Uint8Array<ArrayBuffer>;
    };
  }
  export default GIFEncoder;
}