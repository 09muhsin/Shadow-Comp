import { describe, expect, it } from "vitest";
import { buildDashboardExperience } from "../src/web/dashboard.js";
import { buildLocalReportNarrative, buildReportEvidence } from "../src/report/businessReport.js";
import { renderBusinessReportPdf } from "../src/report/pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getIndustryKpiProfile } from "../src/report/kpiRegistry.js";
import { assessReportQuality } from "../src/report/reportQuality.js";
import { assessEvidenceConfidence, enforceConfidenceRules } from "../src/report/reportConfidence.js";

const company = {
  name: "Harvest & Co.",
  industry: "Food and beverage",
  developmentStage: "Early revenue",
  description: "Whole-food snack bars for health-conscious professionals and parents.",
  decisionQuestion: "Which pricing and cost structure is most sustainable?",
  customerProfile: "Health-conscious professionals and parents",
  revenueModel: "unit_sales",
  unitName: "bars",
  startingCash: 75_000,
  fixedMonthlyCosts: 12_000,
  variableCostPerUnit: 1.1,
  averageDailyUsage: 0.4,
  highVolumeDailyUsage: 2,
  dailyCustomerArrivals: 15,
  supportHoursPerWeek: 40,
  customerTarget: 300,
  durationDays: 120,
  seed: 42,
  plans: [
    { name: "Single bar", price: 3.5, units: 1 },
    { name: "12-pack", price: 2.5, units: 12 },
    { name: "Variety bundle", price: 2.2917, units: 24 }
  ]
};

describe("business report", () => {
  it("selects category KPIs and restricts custom AI profiles to approved formulas", () => {
    expect(getIndustryKpiProfile({ industry: "Boutique hotels" }).kpis.map((item) => item.id)).toEqual(expect.arrayContaining(["occupancy", "adr", "revpar", "net_revpar"]));
    expect(getIndustryKpiProfile({ industry: "B2B SaaS platform" }).kpis.map((item) => item.id)).toEqual(expect.arrayContaining(["mrr", "arr", "net_revenue_retention"]));
    expect(getIndustryKpiProfile({ industry: "Restaurant group" }).kpis.map((item) => item.id)).toEqual(expect.arrayContaining(["average_check", "table_turnover", "food_cost_percent"]));
    expect(getIndustryKpiProfile({ industry: "Last-mile delivery fleet" }).kpis.map((item) => item.id)).toEqual(expect.arrayContaining(["throughput", "capacity_utilization", "contribution_per_unit"]));
    expect(getIndustryKpiProfile({ industry: "Boutique fitness membership" }).kpis.map((item) => item.id)).toEqual(expect.arrayContaining(["customer_retention", "capacity_utilization", "revenue_per_visit"]));
    const custom = getIndustryKpiProfile({ industry: "Specialized circular-economy operator" }, ["capacity_utilization", "gross_margin", "not_a_formula"]);
    expect(custom.source).toBe("ai_proposed");
    expect(custom.kpis.map((item) => item.id)).toEqual(["capacity_utilization", "gross_margin"]);
  });

  it("uses capacity-constrained hotel KPIs and refuses to declare a winner without verified inputs", () => {
    const hotel = { ...company, name: "Cedar & Stone Hotels", industry: "Hospitality · boutique hotels", description: "A portfolio of boutique hotels with locally designed rooms.", unitName: "room nights", durationDays: 180, capacityLocations: 3, capacityPerLocation: 60, baselineUtilization: 0.7, averageSellingPrice: 195, averageTransactionLength: 2.2, cancellationRate: 0.12, directChannelShare: 0.45, thirdPartyFeeRate: 0.17, priceElasticity: 1, assumptionSources: {} };
    const experience = buildDashboardExperience(hotel);
    const evidence = buildReportEvidence(hotel, experience);
    const narrative = buildLocalReportNarrative(evidence);
    const analysis = evidence.industryDecisionAnalysis!;
    if (analysis.category !== "hospitality") throw new Error("Expected hospitality analysis");

    expect(analysis.modelName).toContain("Capacity-constrained hotel");
    expect(analysis.capacity.availableUnits).toBe(3 * 60 * 180);
    expect(analysis.scenarios.every((scenario) => scenario.volume <= analysis.capacity.availableUnits)).toBe(true);
    expect(analysis.elasticityCases.map((item) => item.volumeChange)).toEqual([0, -0.05, -0.1, -0.15, -0.2]);
    expect(analysis.breakEvenVolumeDecline).toBeGreaterThan(0.08);
    expect(analysis.breakEvenVolumeDecline).toBeLessThan(0.15);
    expect(analysis.recommendationStatus).toBe("experiment_required");
    expect(narrative.executiveSummary).toMatch(/cannot determine|controlled test/i);
    expect(narrative.executiveSummary).not.toMatch(/choose.*premium|winning scenario/i);
    expect(narrative.financialAnalysis).not.toMatch(/ending cash/i);
    expect(evidence.kpiProfile.kpis.map((item) => item.name)).toEqual(expect.arrayContaining(["Occupancy", "ADR", "RevPAR", "Net RevPAR"]));
    const quality = assessReportQuality(evidence, narrative);
    expect(quality.dimensions.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(quality.totalScore).toBeLessThan(75);
    expect(quality.decisionUse).not.toBe("external_decision_ready");
    expect(quality.comprehensionTest).toHaveLength(10);
    expect(quality.blockingIssues).toEqual(expect.arrayContaining([expect.stringMatching(/unverified critical input/i)]));
  });

  it("models AI subscription scaling, heavy-user economics, real allowances, and price break-even", async () => {
    const aiCompany = {
      ...company,
      name: "Adloom AI",
      industry: "AI marketing automation SaaS",
      description: "An AI platform that generates and optimizes advertising variations for small agencies.",
      decisionQuestion: "How will AI infrastructure costs scale against subscription revenue over 90 days?",
      customerProfile: "Small advertising agencies",
      revenueModel: "subscription",
      unitName: "ad variation generations",
      startingCash: 100_000,
      fixedMonthlyCosts: 17_000,
      variableCostPerUnit: 0.4,
      averageDailyUsage: 3,
      highVolumeDailyUsage: 10,
      dailyCustomerArrivals: 12,
      customerTarget: 700,
      durationDays: 90,
      startingPaidCustomers: 100,
      monthlyChurnRate: 0.05,
      paidConversionRate: 0.08,
      paymentProcessingRate: 0.029,
      refundRate: 0.02,
      failedTaskRate: 0.03,
      customerAcquisitionCost: 150,
      targetGrossMargin: 0.7,
      priceElasticity: 1,
      plans: [{ name: "$99 monthly", price: 99, units: null, overagePrice: 0 }, { name: "$150 allowance", price: 150, units: 120, overagePrice: 1 }],
      assumptionSources: {}
    };
    const experience = buildDashboardExperience(aiCompany);
    const evidence = buildReportEvidence(aiCompany, experience);
    const narrative = buildLocalReportNarrative(evidence);
    const analysis = evidence.industryDecisionAnalysis;
    if (!analysis || analysis.category !== "subscription") throw new Error("Expected subscription analysis");
    const current = analysis.scenarios.find((item) => item.id === "current-flat")!;
    const allowance = analysis.scenarios.find((item) => item.id === "current-allowance")!;

    expect(analysis.modelName).toMatch(/AI subscription scaling/i);
    expect(analysis.scenarios).toHaveLength(4);
    expect(analysis.scenarios.map((item) => item.label).join(" ")).not.toMatch(/protected|sustainable/i);
    expect(allowance.includedUnits).toBeGreaterThan(0);
    expect(allowance.aiUsageCosts).not.toBe(current.aiUsageCosts);
    expect(allowance.capAffectedShare).toBeGreaterThan(0);
    expect(analysis.usageCohorts.some((item) => !item.profitable)).toBe(true);
    expect(analysis.scaleCases.map((item) => item.paidAccounts)).toEqual(expect.arrayContaining([100, 250, 500, 700, 1000, 2500, 5000]));
    expect(analysis.growthTimeline.map((item) => item.day)).toEqual(expect.arrayContaining([0, 30, 60, 90]));
    expect(analysis.elasticityCases).toHaveLength(5);
    expect(analysis.breakEvenVolumeDecline).toBeGreaterThan(0);
    expect(narrative.executiveSummary).toMatch(/cannot yet select|controlled/i);
    expect(narrative.financialAnalysis).not.toMatch(/ending cash is|ending balance/i);
    expect(narrative.keyFindings.join(" ")).toMatch(/loss-making|usage cohort/i);

    const qualityAssessment = assessReportQuality(evidence, narrative);
    const pdf = await renderBusinessReportPdf({ evidence, narrative, qualityAssessment, provider: "evidence-gated-industry-writer", generatedAt: "2026-07-17T00:00:00.000Z" });
    const parsed = await getDocument({ data: new Uint8Array(pdf) }).promise;
    expect(parsed.numPages).toBeGreaterThanOrEqual(10);
    expect(parsed.numPages).toBeLessThanOrEqual(12);
    for (let pageNumber = 2; pageNumber <= parsed.numPages; pageNumber++) {
      const page = await parsed.getPage(pageNumber);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => "str" in item ? item.str.trim() : "").filter(Boolean);
      expect(strings.join(" ").length, `AI report page ${pageNumber} should contain report content`).toBeGreaterThan(200);
      expect(strings.filter((item) => item.length === 1).length / Math.max(1, strings.length), `AI report page ${pageNumber} should not wrap character-by-character`).toBeLessThan(0.2);
    }
  });

  it("scales status, precision, length, and winner language from the evidence rating", () => {
    const base = {
      ...company,
      name: "Evidence AI",
      industry: "AI workflow SaaS",
      description: "An AI workflow product for operations teams.",
      customerProfile: "Operations teams",
      revenueModel: "subscription",
      unitName: "completed AI workflows",
      averageDailyUsage: 3,
      highVolumeDailyUsage: 10,
      monthlyChurnRate: 0.05,
      paidConversionRate: 0.08,
      paymentProcessingRate: 0.029,
      refundRate: 0.02,
      failedTaskRate: 0.03,
      customerAcquisitionCost: 150,
      targetGrossMargin: 0.7,
      priceElasticity: 1,
      startingPaidCustomers: 100,
      plans: [{ name: "Core", price: 99, units: null, overagePrice: 0 }, { name: "Growth", price: 150, units: 120, overagePrice: 1 }]
    };
    const directionalInput = { ...base, assumptionSources: {} };
    const directionalEvidence = buildReportEvidence(directionalInput, buildDashboardExperience(directionalInput));
    const directional = assessEvidenceConfidence(directionalEvidence);
    const governed = enforceConfidenceRules(directionalEvidence, buildLocalReportNarrative(directionalEvidence), directional);
    expect(directional).toMatchObject({ evidenceRating: "Directional", decisionStatus: "Directional Scenario", reportLength: "short", numberPrecision: "rounded", allowWinner: false });
    expect(governed.executiveSummary.split(/\s+/).length).toBeLessThanOrEqual(150);
    expect(governed.executiveSummary).toMatch(/validate .* before deciding/i);
    expect(directionalEvidence.evidenceLedger.aiSuggestedInputs.length).toBeGreaterThan(0);
    expect(directionalEvidence.kpiInputStatus.some((item) => item.missingInputs.length > 0)).toBe(true);
    expect(directionalEvidence.behaviorEvidence.every((item) => /Modeled|Missing|Observed/.test(item.evidenceType))).toBe(true);

    const criticalFields = ["unitName", "plans", "startingCash", "fixedMonthlyCosts", "variableCostPerUnit", "averageDailyUsage", "highVolumeDailyUsage", "dailyCustomerArrivals", "supportHoursPerWeek", "startingPaidCustomers", "monthlyChurnRate", "paidConversionRate", "paymentProcessingRate", "refundRate", "failedTaskRate", "customerAcquisitionCost", "targetGrossMargin", "priceElasticity"];
    const verifiedInput = { ...base, assumptionSources: Object.fromEntries(criticalFields.map((field) => [field, "user"])) as Record<string, "user"> };
    const partialEvidence = buildReportEvidence(verifiedInput, buildDashboardExperience(verifiedInput));
    expect(assessEvidenceConfidence(partialEvidence)).toMatchObject({ evidenceRating: "Partially Validated", decisionStatus: "Validated Estimate", reportLength: "normal" });

    const research = { status: "completed" as const, searchedAt: "2026-07-17T00:00:00.000Z", query: "test", summary: "Sourced context", findings: [], limitations: [], recommendedKpiIds: [], sources: [1, 2, 3].map((id) => ({ id: `S${id}`, title: `Source ${id}`, url: `https://example.com/${id}`, publisher: "Example", publishedAt: "2026-07-01" })) };
    const basedEvidence = buildReportEvidence(verifiedInput, buildDashboardExperience(verifiedInput), research);
    expect(assessEvidenceConfidence(basedEvidence)).toMatchObject({ evidenceRating: "Evidence-Based", decisionStatus: "Confirmed Forecast", reportLength: "full", numberPrecision: "specific" });
  });

  it("separates locked calculated evidence from narrative", () => {
    const experience = buildDashboardExperience(company);
    const evidence = buildReportEvidence(company, experience);
    const narrative = buildLocalReportNarrative(evidence);
    const winner = evidence.scenarioResults.find((scenario) => scenario.id === evidence.recommendation.recommendedScenarioId)!;

    expect(evidence.evidencePolicy.calculatedFieldsAreLocked).toBe(true);
    expect(narrative.financialAnalysis).toContain(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(winner.metrics.endingCash));
    expect(narrative.marketAnalysis).toMatch(/TAM, SAM, SOM/i);
    expect(narrative.marketAnalysis).toMatch(/research required/i);
    expect(narrative.competitorAnalysis).not.toMatch(/KIND|RXBAR|Clif|competitor is/i);
    expect(narrative.limitations.join(" ")).toMatch(/synthetic/i);
  });

  it("renders a substantial multi-page PDF", async () => {
    const experience = buildDashboardExperience(company);
    const evidence = buildReportEvidence(company, experience);
    const narrative = buildLocalReportNarrative(evidence);
    const qualityAssessment = assessReportQuality(evidence, narrative);
    const pdf = await renderBusinessReportPdf({ evidence, narrative, qualityAssessment, provider: "local-report-writer", generatedAt: "2026-07-17T00:00:00.000Z" });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(15_000);
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(5);
  });

  it("produces a short readable hotel PDF without footer-only or character-wrapped pages", async () => {
    const hotel = { ...company, name: "Cedar & Stone Hotels", industry: "Hospitality · boutique hotels", description: "A portfolio of boutique hotels with locally designed rooms.", unitName: "room nights", durationDays: 180, capacityLocations: 3, capacityPerLocation: 60, baselineUtilization: 0.7, averageSellingPrice: 195, averageTransactionLength: 2.2, cancellationRate: 0.12, directChannelShare: 0.45, thirdPartyFeeRate: 0.17, priceElasticity: 1, assumptionSources: {} };
    const experience = buildDashboardExperience(hotel);
    const evidence = buildReportEvidence(hotel, experience);
    const narrative = buildLocalReportNarrative(evidence);
    const qualityAssessment = assessReportQuality(evidence, narrative);
    const pdf = await renderBusinessReportPdf({ evidence, narrative, qualityAssessment, provider: "local-report-writer", generatedAt: "2026-07-17T00:00:00.000Z" });
    const parsed = await getDocument({ data: new Uint8Array(pdf) }).promise;

    expect(parsed.numPages).toBeGreaterThanOrEqual(10);
    expect(parsed.numPages).toBeLessThanOrEqual(15);
    for (let pageNumber = 2; pageNumber <= parsed.numPages; pageNumber++) {
      const page = await parsed.getPage(pageNumber);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => "str" in item ? item.str.trim() : "").filter(Boolean);
      const joined = strings.join(" ");
      const singleCharacterRatio = strings.filter((item) => item.length === 1).length / Math.max(1, strings.length);
      expect(joined.length, `page ${pageNumber} should contain report content`).toBeGreaterThan(120);
      expect(singleCharacterRatio, `page ${pageNumber} should not wrap words character-by-character`).toBeLessThan(0.2);
    }
  });
});
