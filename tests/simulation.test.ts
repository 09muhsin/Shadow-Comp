import { describe, expect, it } from "vitest";
import { simulate } from "../src/simulation/engine.js";
import { docuFlow } from "../src/simulation/sampleCompany.js";
import { compileBusinessDescription, compilerFromStructuredProvider, detectMissingAssumptions } from "../src/simulation/configuration.js";
import { reviewAssumptions } from "../src/simulation/assumptions.js";
import { explainScenario } from "../src/simulation/explanation.js";
import { buildDashboardSnapshot, buildOutcomeReport, buildTimeline, compareScenarios, forkScenario, inspectCustomerJourney, runScenario } from "../src/simulation/experience.js";
import { SandboxDocuFlowClient } from "../src/api/client.js";
import { runSyntheticApiJourney } from "../src/api/journey.js";
import { codexAttribution } from "../src/api/codexAttribution.js";
import { runDemoWorkflow } from "../src/demoWorkflow.js";

describe("Shadow Company simulation foundation", () => {
  it("replays identical results with the same seed", () => {
    const a = simulate(docuFlow, { durationDays: 60, seed: 42, customerTarget: 1_000 });
    const b = simulate(docuFlow, { durationDays: 60, seed: 42, customerTarget: 1_000 });
    expect(a.metrics).toEqual(b.metrics);
    expect(a.events).toEqual(b.events);
  });

  it("generates at least 1,000 customer journeys for the demo run", () => {
    const result = simulate(docuFlow, { durationDays: 365, seed: 7, customerTarget: 1_000 });
    expect(result.customers).toHaveLength(1_000);
    expect(result.events.some((event) => event.type === "infrastructure_incident")).toBe(true);
  });

  it("preserves the cash ledger invariant", () => {
    const result = simulate(docuFlow, { durationDays: 90, seed: 99, customerTarget: 1_000 });
    const expected = docuFlow.startingCash + result.metrics.revenue - result.metrics.variableCosts - result.metrics.fixedCosts - result.metrics.refunds;
    expect(result.metrics.endingCash).toBeCloseTo(expected, 2);
  });

  it("emits deterministic customer, usage, cost, support, and infrastructure events", () => {
    const result = simulate(docuFlow, { durationDays: 45, seed: 12, customerTarget: 100 });
    const types = new Set(result.events.map((event) => event.type));

    expect(types).toContain("customer_signup");
    expect(types).toContain("product_usage");
    expect(types).toContain("usage_cost");
    expect(types).toContain("support_ticket");
    expect(types).toContain("infrastructure_incident");
    expect(result.events.every((event, index) => event.id === `event-${index + 1}`)).toBe(true);
    expect(result.events.every((event) => event.day >= 1 && event.day <= 45)).toBe(true);
  });

  it("keeps customer financial totals deterministic and non-negative", () => {
    const result = simulate(docuFlow, { durationDays: 60, seed: 3, customerTarget: 250 });

    expect(result.customers).toHaveLength(250);
    expect(result.customers.every((customer) => customer.usage >= 0)).toBe(true);
    expect(result.customers.every((customer) => customer.lifetimeRevenue >= 0)).toBe(true);
    expect(result.customers.every((customer) => customer.lifetimeCost >= 0)).toBe(true);
  });

  it("compiles a natural-language API description into editable structured data", () => {
    const model = compileBusinessDescription("We sell a document-processing API to small agencies for $19 per month. Customers can process unlimited documents.");

    expect(model.businessType).toBe("subscription_api");
    expect(model.targetCustomers).toContain("small_agencies");
    expect(model.plans.find((plan) => plan.id === "starter")?.monthlyPrice).toBe(19);
    expect(model.plans.find((plan) => plan.id === "starter")?.includedUnits).toBeNull();
    expect(model.variableCostDrivers).toContain("pages_processed");
  });

  it("validates structured provider output before accepting it", () => {
    const compiler = compilerFromStructuredProvider({
      generate: () => ({ businessType: "subscription_api", targetCustomers: ["small_agencies"], plans: [{ id: "starter", name: "Starter", monthlyPrice: 19, includedUnits: null, overagePrice: 0, rateLimit: null, source: "ai" }], variableCostDrivers: ["pages_processed"], confidence: "high" })
    });

    expect(compileBusinessDescription("an API", compiler).plans[0]?.monthlyPrice).toBe(19);
    expect(() => compilerFromStructuredProvider({ generate: () => ({ businessType: "unknown" }) }).compile("bad model")).toThrow("invalid business type");
  });

  it("keeps missing assumptions visible and blocks incomplete reviews", () => {
    const generated = detectMissingAssumptions(compileBusinessDescription("A subscription API for developers."));
    const initial = reviewAssumptions(generated);
    const reviewed = reviewAssumptions(generated, { "average-usage": 500, "high-volume-usage": 8_500 });

    expect(initial.assumptions).toHaveLength(8);
    expect(initial.readyForSimulation).toBe(false);
    expect(reviewed.readyForSimulation).toBe(true);
    expect(reviewed.assumptions.find((assumption) => assumption.id === "average-usage")?.source).toBe("user");
  });

  it("explains outcomes using simulation events and calculated metrics", () => {
    const run = simulate(docuFlow, { durationDays: 90, seed: 99, customerTarget: 1_000 });
    const explanation = explainScenario(run, reviewAssumptions(detectMissingAssumptions(compileBusinessDescription(docuFlow.description)), { "average-usage": 500 }).assumptions);

    expect(explanation.primaryOutcome).toBeTruthy();
    expect(explanation.mainCause).toMatch(/infrastructure|Support|No dominant/);
    expect(explanation.evidenceMetrics.endingCash).toBe(run.metrics.endingCash);
    expect(explanation.evidenceEventIds.every((id) => run.events.some((event) => event.id === id))).toBe(true);
  });

  it("projects a live dashboard and emphasized timeline from a run", () => {
    const run = simulate(docuFlow, { durationDays: 60, seed: 42, customerTarget: 250 });
    const timeline = buildTimeline(run);
    const snapshot = buildDashboardSnapshot(docuFlow, run, 30);

    expect(timeline.length).toBe(run.events.length);
    expect(timeline.some((event) => event.important && event.type === "infrastructure_incident")).toBe(true);
    expect(snapshot.day).toBe(30);
    expect(snapshot.events.length).toBeLessThanOrEqual(50);
    expect(snapshot.cashBalance).toBeTypeOf("number");
  });

  it("supports customer journey inspection and outcome reporting", () => {
    const run = simulate(docuFlow, { durationDays: 90, seed: 99, customerTarget: 250 });
    const journey = inspectCustomerJourney(run, docuFlow, run.customers[0]!.id);
    const report = buildOutcomeReport(run);

    expect(journey?.events[0]?.type).toBe("customer_signup");
    expect(journey?.cohortName).toBeTruthy();
    expect(report.disclaimer).toMatch(/scenarios, not guaranteed predictions/);
    expect(report.explanation.evidenceMetrics.endingCash).toBe(run.metrics.endingCash);
  });

  it("forks and compares three scenario futures", () => {
    const base = { id: "unlimited", label: "$19 unlimited", config: { durationDays: 60, seed: 7, customerTarget: 250 } };
    const limited = forkScenario(docuFlow, base, { id: "limited", label: "$49 limited", decision: { type: "pricing_change", planId: "starter", monthlyPrice: 49 } });
    const hired = forkScenario(docuFlow, base, { id: "hired", label: "Hire support", decision: { type: "team_capacity_change", role: "support", headcountDelta: 1 } });
    const comparison = compareScenarios(docuFlow, [runScenario(docuFlow, base), runScenario(docuFlow, limited), runScenario(docuFlow, hired)]);

    expect(limited.config.seed).toBe(base.config.seed);
    expect(comparison.scenarios).toHaveLength(3);
    expect(comparison.strongestMarginScenarioId).toBeTruthy();
    expect(comparison.fastestGrowthScenarioId).toBeTruthy();
  });

  it("runs a synthetic customer journey through the offline typed API client", async () => {
    const run = simulate(docuFlow, { durationDays: 30, seed: 5, customerTarget: 10 });
    const client = new SandboxDocuFlowClient();
    const journey = await runSyntheticApiJourney(run.customers[0]!, client, 5);

    expect(journey.completed).toBe(true);
    expect(journey.steps.map((step) => step.operation)).toEqual(["uploadDocument", "processDocument"]);
    expect(journey.steps[1]?.metadata.fields).toEqual({ pageCount: String(journey.pages), documentType: "synthetic_invoice" });
    expect(client.calls).toHaveLength(2);
  });

  it("rejects invalid sandbox requests and exposes Codex attribution", async () => {
    const client = new SandboxDocuFlowClient();
    await expect(client.uploadDocument({ customerId: "customer-1", pages: 0 })).rejects.toThrow("positive integer");
    expect(codexAttribution.accelerated).toContain("Typed DocuFlow client interfaces");
    expect(codexAttribution.safety).toMatch(/in-memory fictional sandbox/);
  });

  it("runs the documented three-scenario demo workflow", async () => {
    const demo = await runDemoWorkflow();

    expect(demo.scenarios).toHaveLength(3);
    expect(demo.comparison.scenarios).toHaveLength(3);
    expect(demo.apiJourney.completed).toBe(true);
    expect(demo.reports.every((report) => report.disclaimer.includes("not guaranteed predictions"))).toBe(true);
  });
});
