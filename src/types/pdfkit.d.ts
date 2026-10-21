/**
 * Minimal ambient types for the optional `pdfkit` peer dependency.
 *
 * `@types/pdfkit` is deliberately not a dependency: pdfkit is optional, and a
 * hard devDependency on its types would make consumers who never export PDFs
 * install them too. Only the surface `ExportService.toPdf` actually touches is
 * declared here. If pdfkit is installed together with `@types/pdfkit`, those
 * richer types win, since a real package declaration takes precedence.
 */
declare module 'pdfkit' {
  interface PDFDocumentOptions {
    margin?: number;
    size?: string | [number, number];
    layout?: 'portrait' | 'landscape';
    bufferPages?: boolean;
  }

  class PDFDocument {
    constructor(options?: PDFDocumentOptions);
    fontSize(size: number): this;
    text(text: string, options?: Record<string, unknown>): this;
    moveDown(lines?: number): this;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    end(): void;
  }

  export default PDFDocument;
}
