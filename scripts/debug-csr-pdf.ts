import fs from 'fs';
import { parsePBSPerformanceReport } from '../server/dms/parsers/performance.js';

async function extractPdf(path: string): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buf = fs.readFileSync(path);
  const data = new Uint8Array(buf);
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageLines: string[] = [];
    let lastY = -1;
    let currentLine = '';

    for (const item of textContent.items) {
      if ('str' in item) {
        const strItem = item as { str: string; transform: number[] };
        const currentY = strItem.transform[5];
        if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
          pageLines.push(currentLine);
          currentLine = strItem.str;
        } else {
          currentLine += (currentLine ? ' ' : '') + strItem.str;
        }
        lastY = currentY;
      }
    }
    if (currentLine) pageLines.push(currentLine);
    fullText += `=== PAGE ${i} ===\n${pageLines.join('\n')}\n`;
  }
  return fullText;
}

const pdfPath =
  process.argv[2] ||
  '/home/ubuntu/.cursor/projects/workspace/uploads/6-4-2026_CSRServiceProductivityReport_8d74.pdf';

const text = await extractPdf(pdfPath);
fs.writeFileSync('/tmp/csr-report.txt', text);

const jarynIdx = text.toLowerCase().indexOf('jaryn');
if (jarynIdx >= 0) {
  console.log('--- Jaryn context ---');
  console.log(text.slice(Math.max(0, jarynIdx - 200), jarynIdx + 2500));
}

const parsed = parsePBSPerformanceReport(text);
console.log('\n--- Parsed advisors ---');
for (const a of parsed.advisors) {
  console.log(JSON.stringify(a, null, 2));
}
console.log('\n--- Totals ---');
console.log(parsed.totals);
