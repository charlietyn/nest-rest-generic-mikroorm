export interface ExportFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}
export interface ExportOptions {
  filename?: string;
  title?: string;
}

export class ExportService {
  static async toExcel(rows: readonly Record<string, unknown>[], columns: readonly string[], options: ExportOptions = {}): Promise<ExportFile> {
    let ExcelJS: typeof import('exceljs');
    try { ExcelJS = await import('exceljs'); }
    catch { throw new Error('Excel export requires optional peer dependency "exceljs".'); }
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    sheet.columns = columns.map((key) => ({ header: key, key }));
    rows.forEach((row) => sheet.addRow(row));
    const data = await workbook.xlsx.writeBuffer();
    return {
      filename: options.filename ?? 'export.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(data),
    };
  }

  static async toPdf(rows: readonly Record<string, unknown>[], columns: readonly string[], options: ExportOptions = {}): Promise<ExportFile> {
    let PDFDocument: typeof import('pdfkit');
    try { PDFDocument = await import('pdfkit'); }
    catch { throw new Error('PDF export requires optional peer dependency "pdfkit".'); }
    const Doc = PDFDocument.default;
    const doc = new Doc({ margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    doc.fontSize(16).text(options.title ?? 'Export');
    doc.moveDown();
    doc.fontSize(9).text(columns.join(' | '));
    for (const row of rows) doc.text(columns.map((c) => String(row[c] ?? '')).join(' | '));
    doc.end();
    return {
      filename: options.filename ?? 'export.pdf',
      mimeType: 'application/pdf',
      buffer: await finished,
    };
  }
}
