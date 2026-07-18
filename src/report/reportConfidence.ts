import type { ReportEvidence, ReportNarrative } from "./businessReport.js";

export type EvidenceRating = "Directional" | "Partially Validated" | "Evidence-Based";
export type DecisionStatus = "Directional Scenario" | "Validated Estimate" | "Confirmed Forecast";

export type ReportConfidenceProfile = {
  evidenceRating: EvidenceRating;
  decisionStatus: DecisionStatus;
  reportLength: "short" | "normal" | "full";
  numberPrecision: "rounded" | "standard" | "specific";
  allowWinner: boolean;
  tone: string;
  reasons: string[];
};

export function assessEvidenceConfidence(evidence: ReportEvidence): ReportConfidenceProfile {
  const ledger = evidence.evidenceLedger;
  const totalInputs = Math.max(1, ledger.userProvidedInputs.length + ledger.aiSuggestedInputs.length);
  const userShare = ledger.userProvidedInputs.length / totalInputs;
  const criticalGaps = evidence.industryDecisionAnalysis?.criticalDataGaps.length ?? (evidence.industryDecisionAnalysis ? 0 : 1);
  const sourceCount = ledger.externalResearchSources.length;
  const researchCompleted = evidence.research?.status === "completed" && sourceCount >= 3;
  const reasons: string[] = [];

  let evidenceRating: EvidenceRating;
  if (criticalGaps > 0 || userShare < 0.75 || !evidence.industryDecisionAnalysis) {
    evidenceRating = "Directional";
    if (criticalGaps > 0) reasons.push(`${criticalGaps} decision-critical input${criticalGaps === 1 ? " is" : "s are"} unverified or missing.`);
    if (userShare < 0.75) reasons.push("Fewer than 75% of listed operating inputs are user-provided.");
    if (!evidence.industryDecisionAnalysis) reasons.push("No dedicated industry calculation adapter validates the decision mechanics.");
  } else if (userShare < 0.95 || !researchCompleted) {
    evidenceRating = "Partially Validated";
    if (userShare < 0.95) reasons.push("Some operating inputs remain AI-suggested.");
    if (!researchCompleted) reasons.push("Fewer than three current external research sources are attached.");
  } else {
    evidenceRating = "Evidence-Based";
    reasons.push("Critical operating inputs are user-provided and at least three current external sources are attached.");
  }

  if (evidenceRating === "Directional") return { evidenceRating, decisionStatus: "Directional Scenario", reportLength: "short", numberPrecision: "rounded", allowWinner: false, tone: "Cautious. Describe modeled ranges and validation needs; never declare a winner.", reasons };
  if (evidenceRating === "Partially Validated") return { evidenceRating, decisionStatus: "Validated Estimate", reportLength: "normal", numberPrecision: "standard", allowWinner: true, tone: "Moderate confidence. A direction may be suggested only as provisional and conditional.", reasons };
  return { evidenceRating, decisionStatus: "Confirmed Forecast", reportLength: "full", numberPrecision: "specific", allowWinner: true, tone: "Specific evidence-based language is allowed, with assumptions and reasoning still visible.", reasons };
}

const roundMoneyText = (text: string, precision: ReportConfidenceProfile["numberPrecision"], currency: string) => text.replace(/\$-?[\d,]+(?:\.\d+)?/g, (match) => {
  const value = Number(match.replace(/[$,]/g, ""));
  if (!Number.isFinite(value)) return match;
  const magnitude = Math.abs(value);
  const increment = precision === "rounded" ? (magnitude >= 10_000 ? 1_000 : magnitude >= 1_000 ? 100 : magnitude >= 100 ? 10 : 1) : precision === "standard" ? (magnitude >= 10_000 ? 100 : 1) : 0.01;
  const rounded = Math.round(value / increment) * increment;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: precision === "specific" ? 2 : 0 }).format(rounded);
});

const applyPrecision = (text: string, profile: ReportConfidenceProfile, currency: string) => {
  const moneyAdjusted = roundMoneyText(text, profile.numberPrecision, currency);
  if (profile.numberPrecision !== "rounded") return moneyAdjusted;
  return moneyAdjusted.replace(/(-?\d+)\.\d+%/g, "$1%");
};

const limitWords = (text: string, maximum = 150) => {
  const words = text.trim().split(/\s+/);
  return words.length <= maximum ? text.trim() : `${words.slice(0, maximum).join(" ").replace(/[,:;]$/, "")}.`;
};

function directionalSummary(evidence: ReportEvidence): string {
  const analysis = evidence.industryDecisionAnalysis;
  if (analysis?.category === "subscription") {
    const current = analysis.scenarios[0]!;
    const lossMaking = analysis.usageCohorts.filter((item) => !item.profitable).map((item) => item.name);
    return `${evidence.company.name} tested the entered flat plan, a defined allowance, a price-plus-overage option, and lower-cost model routing over ${evidence.simulation.durationDays} days. The current case models ${current.grossMargin * 100}% gross margin and ${current.aiCostPerAccount} dollars of monthly AI cost per paid account. ${lossMaking.length ? `${lossMaking.join(" and ")} usage cohorts are modeled as loss-making.` : "No modeled usage cohort is directly loss-making."} The higher-price case requires at least ${(1 - analysis.breakEvenVolumeDecline) * 100}% paid-volume retention to match baseline operating contribution. No scenario should be declared a winner because the evidence is Directional. Validate usage cost, churn, customer response, and account profitability before deciding.`;
  }
  if (analysis?.category === "hospitality") {
    const current = analysis.scenarios[0]!;
    return `${evidence.company.name} tested the entered operating case, a room-cost efficiency case, and a controlled price case over ${evidence.simulation.durationDays} days. Baseline occupancy is ${current.utilization * 100}% and the modeled price case breaks even after approximately ${analysis.breakEvenVolumeDecline * 100}% occupied-room decline. No scenario should be declared a winner because the evidence is Directional. Validate property inventory, occupancy, channel costs, room costs, and booking response through a controlled test before deciding.`;
  }
  const revenues = evidence.scenarioResults.map((item) => item.metrics.revenue);
  return `${evidence.company.name} tested ${evidence.scenarioResults.length} modeled operating cases over ${evidence.simulation.durationDays} days. Modeled revenue ranges from ${Math.min(...revenues, 0)} to ${Math.max(...revenues, 0)} dollars, but the report does not have a dedicated industry adapter or enough validated evidence to select a winner. Validate the transaction unit, demand response, customer behavior, direct costs, and industry context before deciding.`;
}

export function enforceConfidenceRules(evidence: ReportEvidence, narrative: ReportNarrative, profile: ReportConfidenceProfile): ReportNarrative {
  const executiveSummary = profile.evidenceRating === "Directional" ? directionalSummary(evidence) : narrative.executiveSummary;
  const map = (value: string) => applyPrecision(value, profile, evidence.company.currency || "USD");
  return {
    ...narrative,
    executiveSummary: limitWords(map(executiveSummary), 150),
    businessOverview: map(narrative.businessOverview),
    problemAndMarketNeed: map(narrative.problemAndMarketNeed),
    productAnalysis: map(narrative.productAnalysis),
    marketAnalysis: map(narrative.marketAnalysis),
    customerAnalysis: map(narrative.customerAnalysis),
    competitorAnalysis: map(narrative.competitorAnalysis),
    businessModelAnalysis: map(narrative.businessModelAnalysis),
    salesAndMarketingAnalysis: map(narrative.salesAndMarketingAnalysis),
    operationalAnalysis: map(narrative.operationalAnalysis),
    financialAnalysis: map(narrative.financialAnalysis),
    keyFindings: narrative.keyFindings.map(map),
    recommendations: narrative.recommendations.map((item) => ({ recommendation: map(item.recommendation), evidence: map(item.evidence), validation: map(item.validation) })),
    risks: narrative.risks.map((item) => ({ ...item, risk: map(item.risk), earlyWarningSignal: map(item.earlyWarningSignal) })),
    actionPlan: narrative.actionPlan.map((item) => ({ ...item, successMetric: map(item.successMetric) })),
    limitations: narrative.limitations.map(map)
  };
}
