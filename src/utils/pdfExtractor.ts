import * as pdfjsLib from 'pdfjs-dist';

// Set worker paths to CDNs matching the library version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
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
          // A rudimentary way to preserve layout/new lines
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
      if (currentLine) {
        pageLines.push(currentLine);
      }
      fullText += pageLines.join('\n') + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text content from the selected PDF. Is it a scanned image? This file processor requires selectable text PDFs.');
  }
};
