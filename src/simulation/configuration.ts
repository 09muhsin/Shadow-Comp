import type { BusinessAssumption, BusinessType, CompiledBusinessModel, CompiledPlan } from "./types.js";

export type BusinessModelCompiler = {
  compile(description: string): CompiledBusinessModel;
};

export type StructuredBusinessModelProvider = {
  generate(description: string): unknown;
};

const plan = (id: string, name: string, monthlyPrice: number, includedUnits: number | null): CompiledPlan => ({
  id,
  name,
  monthlyPrice,
  includedUnits,
  overagePrice: 0,
  rateLimit: includedUnits,
  source: "ai"
});

function inferBusinessType(description: string): BusinessType {
  return /api|endpoint|developer|structured json/i.test(description) ? "subscription_api" : "subscription_saas";
}

function inferTargetCustomers(description: string): string[] {
  const targets: string[] = [];
  if (/developer|developers|api/i.test(description)) targets.push("independent_developers");
  if (/agenc/i.test(description)) targets.push("small_agencies");
  if (/enterprise/i.test(description)) targets.push("enterprise_evaluators");
  return targets.length ? targets : ["early_stage_businesses"];
}

function inferPlans(description: string): CompiledPlan[] {
  const priceMatches = [...description.matchAll(/\$(\d+(?:\.\d+)?)\s*(?:per\s*)?month/gi)].map((match) => Number(match[1]));
  const starterPrice = priceMatches[0] ?? 19;
  const businessPrice = priceMatches[1] ?? Math.max(79, starterPrice * 4);
  const unlimited = /unlimited/i.test(description);
  return [
    plan("free", "Free", 0, 1_000),
    plan("starter", "Starter", starterPrice, unlimited ? null : 1_000),
    plan("business", "Business", businessPrice, null)
  ];
}

export const localBusinessModelCompiler: BusinessModelCompiler = {
  compile(description) {
    if (!description.trim()) throw new Error("A business description is required.");
    const normalized = description.trim();
    return {
      businessType: inferBusinessType(normalized),
      targetCustomers: inferTargetCustomers(normalized),
      plans: inferPlans(normalized),
      variableCostDrivers: /document|page/i.test(normalized) ? ["pages_processed", "storage", "payment_processing"] : ["usage_units", "storage", "payment_processing"],
      sourceDescription: normalized,
      confidence: "medium"
    };
  }
};

export function compileBusinessDescription(description: string, compiler: BusinessModelCompiler = localBusinessModelCompiler): CompiledBusinessModel {
  return compiler.compile(description);
}

function validateProviderModel(value: unknown, description: string): CompiledBusinessModel {
  if (!value || typeof value !== "object") throw new Error("The model provider returned no structured business model.");
  const candidate = value as Partial<CompiledBusinessModel>;
  if (candidate.businessType !== "subscription_api" && candidate.businessType !== "subscription_saas") throw new Error("The model provider returned an invalid business type.");
  if (!Array.isArray(candidate.targetCustomers) || !candidate.targetCustomers.every((item) => typeof item === "string")) throw new Error("The model provider returned invalid target customers.");
  if (!Array.isArray(candidate.variableCostDrivers) || !candidate.variableCostDrivers.every((item) => typeof item === "string")) throw new Error("The model provider returned invalid cost drivers.");
  if (!Array.isArray(candidate.plans) || candidate.plans.length === 0) throw new Error("The model provider returned no subscription plans.");
  for (const plan of candidate.plans) {
    if (!plan || typeof plan.id !== "string" || typeof plan.name !== "string" || typeof plan.monthlyPrice !== "number" || plan.monthlyPrice < 0) throw new Error("The model provider returned an invalid subscription plan.");
  }
  return { ...candidate, sourceDescription: description, confidence: candidate.confidence ?? "medium" } as CompiledBusinessModel;
}

export function compilerFromStructuredProvider(provider: StructuredBusinessModelProvider): BusinessModelCompiler {
  return { compile: (description) => validateProviderModel(provider.generate(description), description) };
}

export function detectMissingAssumptions(model: CompiledBusinessModel): BusinessAssumption[] {
  const api = model.businessType === "subscription_api";
  return [
    { id: "average-usage", name: "Average customer usage", value: null, unit: api ? "units/customer/day" : "sessions/customer/day", explanation: "Usage determines variable infrastructure cost and capacity pressure.", confidence: "low", source: "ai", editable: true },
    { id: "free-paid-conversion", name: "Free-to-paid conversion", value: 0.08, unit: "probability", explanation: "The proportion of free users expected to become paying customers.", confidence: "low", source: "ai", editable: true },
    { id: "customer-lifetime", name: "Average customer lifetime", value: 12, unit: "months", explanation: "A longer lifetime increases cumulative revenue but also exposes more support and usage risk.", confidence: "low", source: "ai", editable: true },
    { id: "refund-probability", name: "Refund probability", value: 0.01, unit: "probability", explanation: "Refunds reduce recognized cash revenue and should be visible in the ledger.", confidence: "low", source: "ai", editable: true },
    { id: "payment-fee-rate", name: "Payment-processing fee", value: 0.029, unit: "revenue fraction", explanation: "Payment fees are a variable cost that is not captured by plan price alone.", confidence: "medium", source: "ai", editable: true },
    { id: "support-demand", name: "Support demand", value: 0.04, unit: "tickets/customer/month", explanation: "Ticket volume determines whether the current team can respond without delaying customers.", confidence: "low", source: "ai", editable: true },
    { id: "infrastructure-failure-rate", name: "Infrastructure failure rate", value: 0.005, unit: "probability/request", explanation: "Failures can create support demand, refunds, and churn.", confidence: "low", source: "ai", editable: true },
    { id: "high-volume-usage", name: "High-volume customer usage", value: api ? 8_500 : 2_000, unit: "units/customer/day", explanation: "A small high-volume segment can dominate variable cost under unlimited pricing.", confidence: "low", source: "ai", editable: true }
  ];
}
