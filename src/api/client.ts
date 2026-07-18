export type DocumentUpload = { customerId: string; pages: number };
export type UploadedDocument = { id: string; pages: number; status: "uploaded" };
export type ProcessingResult = { documentId: string; status: "processed"; fields: Record<string, string> };

export type DocuFlowClient = {
  uploadDocument(input: DocumentUpload): Promise<UploadedDocument>;
  processDocument(documentId: string): Promise<ProcessingResult>;
};

export type ApiCall = { operation: "uploadDocument" | "processDocument"; request: Record<string, unknown>; response: Record<string, unknown> };

export class SandboxDocuFlowClient implements DocuFlowClient {
  private sequence = 0;
  private readonly documents = new Map<string, UploadedDocument>();
  readonly calls: ApiCall[] = [];

  async uploadDocument(input: DocumentUpload): Promise<UploadedDocument> {
    if (!input.customerId || !Number.isInteger(input.pages) || input.pages < 1) throw new Error("A customerId and a positive integer page count are required.");
    const document = { id: `sandbox-document-${++this.sequence}`, pages: input.pages, status: "uploaded" as const };
    this.documents.set(document.id, document);
    this.calls.push({ operation: "uploadDocument", request: { ...input }, response: { ...document } });
    return document;
  }

  async processDocument(documentId: string): Promise<ProcessingResult> {
    const document = this.documents.get(documentId);
    if (!document) throw new Error(`Document ${documentId} does not exist in the sandbox.`);
    const result = { documentId, status: "processed" as const, fields: { pageCount: String(document.pages), documentType: "synthetic_invoice" } };
    this.calls.push({ operation: "processDocument", request: { documentId }, response: { ...result, fields: { ...result.fields } } });
    return result;
  }
}
