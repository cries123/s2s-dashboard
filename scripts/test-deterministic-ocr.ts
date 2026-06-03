import fs from 'fs';
import { ocrPdfBufferToText } from '../server/dms/pdfOcr.js';
import { parseDealerBuiltPerformanceDeterministic } from '../server/dms/parsers/dealerbuiltPerformance.js';

async function main() {
  const buf = fs.readFileSync(
    '/home/ubuntu/.cursor/projects/workspace/uploads/Scanned_Document_4_e76a.pdf'
  );
  const ocr = await ocrPdfBufferToText(buf);
  fs.writeFileSync('/workspace/tmp-ocr-latest.txt', ocr);
  const r = parseDealerBuiltPerformanceDeterministic(ocr);
  console.log(JSON.stringify(r, null, 2));
}

main();
