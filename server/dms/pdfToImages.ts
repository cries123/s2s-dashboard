import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

async function pdfBufferToPngBase64ViaPoppler(
  buffer: Buffer,
  maxPages = 8
): Promise<string[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dealerbuilt-pdf-'));
  const pdfPath = path.join(tmpDir, 'report.pdf');
  const outPrefix = path.join(tmpDir, 'page');

  try {
    fs.writeFileSync(pdfPath, buffer);
    await execFileAsync('pdftoppm', [
      '-png',
      '-r',
      '200',
      '-f',
      '1',
      '-l',
      String(maxPages),
      pdfPath,
      outPrefix,
    ]);

    const files = fs
      .readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    return files.map((file) => fs.readFileSync(path.join(tmpDir, file)).toString('base64'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function pdfBufferToPngBase64ViaPdfJs(
  buffer: Buffer,
  maxPages = 8,
  scale = 2
): Promise<string[]> {
  const { createCanvas } = await import('canvas');
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const images: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;
    images.push(canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''));
  }

  return images;
}

/** Render PDF buffer pages to PNG base64 strings for vision models. */
export async function pdfBufferToPngBase64Pages(
  buffer: Buffer,
  maxPages = 8
): Promise<string[]> {
  try {
    const popplerImages = await pdfBufferToPngBase64ViaPoppler(buffer, maxPages);
    if (popplerImages.length > 0) return popplerImages;
  } catch (err) {
    console.warn('[pdfToImages] pdftoppm unavailable, falling back to pdfjs:', err);
  }

  return pdfBufferToPngBase64ViaPdfJs(buffer, maxPages);
}

export function isScannedOrEmptyReportText(text: string): boolean {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 80) return true;
  const alphaChars = trimmed.replace(/[^a-zA-Z]/g, '').length;
  return alphaChars < 40;
}
