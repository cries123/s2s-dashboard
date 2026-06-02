import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

/** OCR scanned PDF pages when tesseract + poppler are available. */
export async function ocrPdfBufferToText(buffer: Buffer, maxPages = 8): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dealerbuilt-ocr-'));
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

    const pngFiles = fs
      .readdirSync(tmpDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    const chunks: string[] = [];
    for (const file of pngFiles) {
      const { stdout } = await execFileAsync('tesseract', [
        path.join(tmpDir, file),
        'stdout',
      ]);
      chunks.push(stdout);
    }

    return chunks.join('\n\n');
  } catch (err) {
    console.warn('[ocrPdfBufferToText] OCR unavailable:', err);
    return '';
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function enrichReportTextFromPdf(
  buffer: Buffer | undefined,
  existingText: string
): Promise<string> {
  if (existingText && existingText.replace(/\s+/g, ' ').trim().length >= 200) {
    return existingText;
  }
  if (!buffer) return existingText;

  const ocrText = await ocrPdfBufferToText(buffer);
  if (!ocrText.trim()) return existingText;

  return [existingText, ocrText].filter(Boolean).join('\n\n');
}
