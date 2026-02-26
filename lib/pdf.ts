export async function extractTextFromPDF(file: File): Promise<string[]> {
  const pdfjsLib = await import('pdfjs-dist');
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str).join(' ');
    // Clean up extra spaces and normalize
    const cleanedText = text.replace(/\s+/g, ' ').trim();
    if (cleanedText) {
      pages.push(cleanedText);
    }
  }
  
  return pages;
}
