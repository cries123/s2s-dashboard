/**
 * 'canvas' is an optional native dependency, listed as an external in netlify.toml
 * and not installed in every environment. Declare the surface pdfToImages uses so
 * the typecheck does not depend on it being present.
 */
declare module 'canvas' {
  export function loadImage(src: Buffer | string): Promise<{ width: number; height: number }>;
  export function createCanvas(width: number, height: number): {
    getContext(kind: '2d'): {
      drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
      fillStyle: string;
      fillRect(x: number, y: number, w: number, h: number): void;
    };
    toDataURL(mime?: string, quality?: number): string;
    toBuffer(mime?: string): Buffer;
  };
}
