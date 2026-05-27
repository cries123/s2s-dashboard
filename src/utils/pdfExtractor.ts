// @ts-ignore
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Map items to layout-aware elements
      const elements = textContent.items
        .filter((item: any) => typeof item.str === 'string')
        .map((item: any) => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          height: item.height || 10
        }));

      // Group elements on the same row with tolerance based on item heights
      const rows: { str: string; x: number; y: number }[][] = [];
      const yTolerance = 6.0;

      for (const el of elements) {
        let placed = false;
        for (const row of rows) {
          const rowY = row[0].y;
          if (Math.abs(rowY - el.y) <= yTolerance) {
            row.push(el);
            placed = true;
            break;
          }
        }
        if (!placed) {
          rows.push([el]);
        }
      }

      // Sort rows top-to-bottom (Y descending)
      rows.sort((a, b) => b[0].y - a[0].y);

      // In each row, sort items left-to-right (X ascending) and join them
      const pageLines = rows.map(row => {
        row.sort((a, b) => a.x - b.x);
        
        // Merge items that are extremely close horizontally to avoid extra spacing
        let lineText = '';
        let lastX = -1000;
        for (const el of row) {
          if (lastX !== -1000 && (el.x - lastX) < 1.0) {
            lineText += el.str;
          } else {
            lineText += (lineText ? ' ' : '') + el.str;
          }
          lastX = el.x + (el.str.length * 4); // estimate width boundaries
        }
        return lineText;
      });

      fullText += pageLines.join('\n') + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text content from the selected PDF. Is it a scanned image? This file processor requires selectable text PDFs.');
  }
};
