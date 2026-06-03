import fs from 'fs';

async function main() {
  const pdfBase64 = fs
    .readFileSync(
      '/home/ubuntu/.cursor/projects/workspace/uploads/Scanned_Document_4_e76a.pdf'
    )
    .toString('base64');

  const response = await fetch('http://localhost:3000/api/parse-performance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dmsProvider: 'dealerbuilt',
      reportText: '',
      pdfBase64,
    }),
  });

  const text = await response.text();
  console.log('status', response.status);
  console.log(text.slice(0, 2500));
}

main();
