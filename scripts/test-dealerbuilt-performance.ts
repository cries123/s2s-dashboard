import fs from 'fs';
import { pdfBufferToPngBase64Pages, isScannedOrEmptyReportText } from '../server/dms/pdfToImages.js';
import { parseDealerBuiltPerformanceDeterministic } from '../server/dms/parsers/dealerbuiltPerformance.js';

async function main() {
  const pdfPath =
    process.argv[2] ||
    '/home/ubuntu/.cursor/projects/workspace/uploads/Scanned_Document_4_e76a.pdf';

  const buf = fs.readFileSync(pdfPath);
  const imgs = await pdfBufferToPngBase64Pages(buf, 3);
  console.log('Rendered pages:', imgs.length, 'bytes page1:', imgs[0]?.length);

  const ocrPath = '/workspace/tmp-pdf-pages/ocr.txt';
  if (fs.existsSync(ocrPath)) {
    const ocr = fs.readFileSync(ocrPath, 'utf8');
    console.log('isScanned empty?', isScannedOrEmptyReportText(''));
    const parsed = parseDealerBuiltPerformanceDeterministic(ocr);
    console.log('Deterministic advisors:', parsed.advisors.map((a) => a.name));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
