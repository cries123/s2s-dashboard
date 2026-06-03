import fs from 'fs';

async function extractTextFromPDFBuffer(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
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
    fullText += `\n=== PAGE ${i} ===\n${pageLines.join('\n')}\n`;
  }

  return fullText;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx scripts/extract-pdf-text.ts <pdf>');
    process.exit(1);
  }
  const buf = fs.readFileSync(path);
  const text = await extractTextFromPDFBuffer(buf);
  console.log(text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
