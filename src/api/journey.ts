import type { Customer } from "../simulation/types.js";
import type { ApiCall, DocuFlowClient } from "./client.js";

export type ApiJourneyStep = { step: number; operation: ApiCall["operation"]; description: string; success: boolean; metadata: Record<string, unknown> };
export type SyntheticApiJourney = { customerId: string; pages: number; completed: boolean; steps: ApiJourneyStep[]; calls: ApiCall[] };

export async function runSyntheticApiJourney(customer: Customer, client: DocuFlowClient, seed: number): Promise<SyntheticApiJourney> {
  const pages = Math.max(1, Math.round((customer.usage / 30) * (1 + ((seed % 11) - 5) / 20)));
  const steps: ApiJourneyStep[] = [{ step: 1, operation: "uploadDocument", description: "Customer uploaded a synthetic document.", success: true, metadata: { pages } }];
  try {
    const uploaded = await client.uploadDocument({ customerId: customer.id, pages });
    steps[0]!.metadata.documentId = uploaded.id;
    const processed = await client.processDocument(uploaded.id);
    steps.push({ step: 2, operation: "processDocument", description: "Sandbox API returned structured JSON.", success: true, metadata: { documentId: processed.documentId, fields: processed.fields } });
    return { customerId: customer.id, pages, completed: true, steps, calls: "calls" in client ? (client as DocuFlowClient & { calls: ApiCall[] }).calls : [] };
  } catch (error) {
    steps.push({ step: 2, operation: "processDocument", description: "Synthetic API request failed in the sandbox.", success: false, metadata: { error: error instanceof Error ? error.message : String(error) } });
    return { customerId: customer.id, pages, completed: false, steps, calls: "calls" in client ? (client as DocuFlowClient & { calls: ApiCall[] }).calls : [] };
  }
}
