export interface ExportFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}
export interface ExportOptions {
  filename?: string;
  title?: string;
}

/**
 * Structural views of the optional `exceljs` / `pdfkit` peers.
 *
 * They are declared here rather than imported as types so the package builds
 * without those dependencies installed - they are optional peers, and only the
 * handful of members used below matter.
 */
interface ExcelWorksheet {
  columns: { header: string; key: string }[];
  addRow(row: Record<string, unknown>): unknown;
}
interface ExcelWorkbook {
  addWorksheet(name: string): ExcelWorksheet;
  xlsx: { writeBuffer(): Promise<ArrayBuffer> };
}
interface ExcelJsModule {
  Workbook: new () => ExcelWorkbook;
  default?: { Workbook: new () => ExcelWorkbook };
}

interface PdfDocument {
  fontSize(size: number): PdfDocument;
  text(value: string): PdfDocument;
  moveDown(): PdfDocument;
  on(event: string, listener: (chunk: Buffer) => void): PdfDocument;
  end(): void;
}
interface PdfKitModule {
  default: new (options: { margin: number }) => PdfDocument;
}

export class ExportService {
  static async toExcel(rows: readonly Record<string, unknown>[], columns: readonly string[], options: ExportOptions = {}): Promise<ExportFile> {
    let ExcelJS: ExcelJsModule;
    try { ExcelJS = await import('exceljs') as unknown as ExcelJsModule; }
    catch { throw new Error('Excel export requires optional peer dependency "exceljs".'); }
    const Workbook = ExcelJS.Workbook ?? ExcelJS.default?.Workbook;
    if (!Workbook) throw new Error('Excel export requires optional peer dependency "exceljs".');
    const workbook = new Workbook();
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
    let PDFKit: PdfKitModule;
    try { PDFKit = await import('pdfkit'); }
    catch { throw new Error('PDF export requires optional peer dependency "pdfkit".'); }
    const Doc = PDFKit.default;
    const doc = new Doc({ margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    doc.fontSize(16).text(options.title ?? 'Export');
    doc.moveDown();
    doc.fontSize(9).text(columns.join(' | '));
    for (const row of rows) doc.text(columns.map((c) => cellToString(row[c])).join(' | '));
    doc.end();
    return {
      filename: options.filename ?? 'export.pdf',
      mimeType: 'application/pdf',
      buffer: await finished,
    };
  }
}

/** Renders a cell without producing "[object Object]" for nested values. */
function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  switch (typeof value) {
    case 'string': return value;
    case 'number':
    case 'boolean':
    case 'bigint': return value.toString();
    default: return JSON.stringify(value) ?? '';
  }
}
