import type { ReportNarrative } from "./businessReport.js";

export type QualityDimensionId = "businessClarity" | "customerUnderstanding" | "marketTrendEvidence" | "competitorAnalysis" | "revenueModelClarity" | "costModelCredibility" | "financialAccuracy" | "scenarioRealism" | "riskAnalysis" | "recommendationQuality" | "actionability" | "readabilityDesign";

export type ReportQualityAssessment = {
  totalScore: number;
  classification: "Decision-ready" | "Strong with limited gaps" | "Useful internal draft" | "Weak; major revision required" | "Not suitable for business decisions";
  decisionUse: "external_decision_ready" | "conditional_internal_use" | "internal_draft_only" | "not_decision_suitable";
  dimensions: Array<{ id: QualityDimensionId; category: string; weight: number; score: number; weightedScore: number; reasons: string[] }>;
  blockingIssues: string[];
  comprehensionTest: Array<{ question: string; passed: boolean; explanation: string }>;
};

type EvidenceLike = {
  company: { name: string; description: string; industry: string; customerProfile: string; revenueModel?: string; unitName?: string; plans: Array<{ monthlyPrice: number }> };
  assumptions: Array<{ name: string; source: "ai" | "user"; value: unknown }>;
  research: null | { status: string; sources: Array<{ publishedAt: string | null }>; findings: Array<{ category: string; sourceIds: string[] }> };
  kpiProfile: { source: string; decisionUnit: string; kpis: Array<{ requiredInputs: string[] }> };
  industryDecisionAnalysis: null | { category: string; evidenceStatus: string; recommendationStatus: string; elasticityCases: unknown[]; criticalDataGaps: string[]; capacity?: { availableUnits: number }; scaleCases?: unknown[] };
  scenarioResults: unknown[];
  recommendation: { recommendation: string; rationale: string; confidence: string };
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const present = (value: unknown) => Boolean(String(value ?? "").trim()) && !/research required|not provided|untitled/i.test(String(value));

export function assessReportQuality(evidence: EvidenceLike, narrative: ReportNarrative): ReportQualityAssessment {
  const userAssumptions = evidence.assumptions.filter((item) => item.source === "user").length;
  const assumptionCount = Math.max(1, evidence.assumptions.length);
  const userShare = userAssumptions / assumptionCount;
  const researched = evidence.research?.status === "completed" && evidence.research.sources.length > 0;
  const datedSourceShare = researched ? evidence.research!.sources.filter((item) => item.publishedAt).length / evidence.research!.sources.length : 0;
  const findingCount = evidence.research?.findings.length ?? 0;
  const competitorFindings = evidence.research?.findings.filter((item) => item.category === "competitor" || item.category === "pricing").length ?? 0;
  const dedicatedModel = Boolean(evidence.industryDecisionAnalysis);
  const evidenceGated = evidence.industryDecisionAnalysis?.recommendationStatus === "experiment_required" || /insufficient evidence|controlled test|experiment/i.test(evidence.recommendation.recommendation);
  const risksComplete = narrative.risks.length >= 3 && narrative.risks.every((item) => item.owner && item.earlyWarningSignal && item.mitigation && item.stopCondition && item.reviewDate);
  const actionsComplete = narrative.actionPlan.length >= 3 && narrative.actionPlan.every((item) => item.owner && item.timeline && item.successMetric && item.dependency && item.decisionAfter);
  const dimensions: ReportQualityAssessment["dimensions"] = [];
  const add = (id: QualityDimensionId, category: string, weight: number, score: number, reasons: string[]) => dimensions.push({ id, category, weight, score: clamp(score), weightedScore: Math.round(clamp(score) * weight) / 100, reasons });

  const clarityFields = [evidence.company.name, evidence.company.description, evidence.company.industry, evidence.company.customerProfile, evidence.company.revenueModel, evidence.company.unitName].filter(present).length;
  add("businessClarity", "Business clarity", 10, clarityFields / 6 * 100, clarityFields === 6 ? ["Business, customer, model, and operating unit are defined."] : ["One or more business-definition fields are missing or generic."]);
  add("customerUnderstanding", "Customer understanding", 10, (present(evidence.company.customerProfile) ? 35 : 0) + (evidence.research?.findings.some((item) => item.category === "customer") ? 25 : 0) + (userShare * 30) + (narrative.customerAnalysis.length > 80 ? 10 : 0), [userShare < .5 ? "Most behavior inputs are assumptions rather than observed customer evidence." : "A majority of operating assumptions are user-provided."]);
  add("marketTrendEvidence", "Market and trend evidence", 10, (researched ? 45 : 0) + Math.min(25, findingCount * 5) + datedSourceShare * 20 + (researched ? 10 : 0), researched ? [`${evidence.research!.sources.length} clickable sources support ${findingCount} retained findings.`] : ["No completed sourced web research is attached."]);
  add("competitorAnalysis", "Competitor analysis", 8, Math.min(100, competitorFindings * 22 + (researched ? 20 : 0)), competitorFindings ? [`${competitorFindings} sourced competitor or pricing findings are attached.`] : ["No sourced competitor or substitute comparison is attached."]);
  add("revenueModelClarity", "Revenue-model clarity", 8, (present(evidence.company.revenueModel) ? 25 : 0) + (present(evidence.company.unitName) ? 25 : 0) + (evidence.company.plans.some((item) => item.monthlyPrice > 0) ? 20 : 0) + (dedicatedModel ? 30 : 10), [dedicatedModel ? "The decision unit and revenue mechanics are tied to an industry adapter." : "Revenue inputs exist, but no dedicated industry calculation adapter validates all mechanics."]);
  add("costModelCredibility", "Cost-model credibility", 8, userShare * 55 + (dedicatedModel ? 25 : 10) + (narrative.financialAnalysis.length > 100 ? 15 : 5), [userShare < .75 ? "Several cost inputs remain AI-suggested or unverified." : "Most cost assumptions are user-provided."],);
  add("financialAccuracy", "Financial accuracy", 10, (dedicatedModel ? 55 : 25) + (userShare * 25) + (/not .*cash|not EBITDA|excludes/i.test(`${narrative.financialAnalysis} ${narrative.limitations.join(" ")}`) ? 20 : 5), [dedicatedModel ? "An industry-specific calculation boundary is defined." : "Financial outputs rely on the general engine and should remain internal."],);
  const operatingBoundaryModeled = (evidence.industryDecisionAnalysis?.capacity?.availableUnits ?? 0) > 0 || (evidence.industryDecisionAnalysis?.scaleCases?.length ?? 0) >= 5;
  add("scenarioRealism", "Scenario realism", 10, dedicatedModel ? 55 + Math.min(25, evidence.industryDecisionAnalysis!.elasticityCases.length * 5) + (operatingBoundaryModeled ? 20 : 0) : 35, [dedicatedModel ? "Capacity or scale, demand response, and break-even are modeled." : "No dedicated capacity-and-behavior adapter is available for this industry."],);
  add("riskAnalysis", "Risk analysis", 8, risksComplete ? 90 : 45, [risksComplete ? "Risks include owners, signals, mitigations, review timing, and stop conditions." : "One or more risks lack a measurable stop condition or review date."]);
  add("recommendationQuality", "Recommendation quality", 8, evidenceGated ? 90 : (evidence.recommendation.confidence === "high" ? 75 : 45), [evidenceGated ? "The recommendation is conditional and blocks unsupported rollout." : "The recommendation may be stronger than the available evidence."]);
  add("actionability", "Actionability", 5, actionsComplete ? 90 : 45, [actionsComplete ? "Actions include dependencies, measurable success, and the next decision." : "One or more actions lack a dependency or explicit decision gate."]);
  add("readabilityDesign", "Readability and design", 5, 90, ["The PDF uses a short decision structure and automated page-flow checks."]);

  const rawScore = Math.round(dimensions.reduce((sum, item) => sum + item.weightedScore, 0));
  // Critical evidence failures are non-compensatory: strong presentation or risk
  // wording cannot offset missing company data or an unsupported calculation model.
  const criticalInputFailure = (evidence.industryDecisionAnalysis?.criticalDataGaps.length ?? 0) > 0;
  const totalScore = Math.min(rawScore, !dedicatedModel ? 59 : criticalInputFailure ? 59 : !researched ? 74 : 100);
  const classification = totalScore >= 90 ? "Decision-ready" : totalScore >= 75 ? "Strong with limited gaps" : totalScore >= 60 ? "Useful internal draft" : totalScore >= 40 ? "Weak; major revision required" : "Not suitable for business decisions";
  const decisionUse = totalScore >= 90 ? "external_decision_ready" : totalScore >= 75 ? "conditional_internal_use" : totalScore >= 60 ? "internal_draft_only" : "not_decision_suitable";
  const blockingIssues = [
    ...(!dedicatedModel ? ["No dedicated industry calculation adapter validates the scenario mechanics."] : []),
    ...(evidence.industryDecisionAnalysis?.criticalDataGaps ?? []).map((item) => `Unverified critical input: ${item}.`),
    ...(!researched ? ["Current market, trend, and competitor research is unavailable or uncited."] : []),
    ...(userShare < .5 ? ["Most major operating assumptions are not verified internal data."] : [])
  ];
  const comprehensionTest = [
    ["What does the company sell?", present(evidence.company.description), "Business description"],
    ["Who is the customer?", present(evidence.company.customerProfile), "Customer definition"],
    ["What decision is being considered?", present(evidence.recommendation.recommendation), "Decision statement"],
    ["What data is real?", userAssumptions > 0, `${userAssumptions} user-provided assumptions`],
    ["What data is assumed?", evidence.assumptions.some((item) => item.source === "ai"), "AI assumptions are labelled"],
    ["What is the recommended action?", narrative.recommendations.length > 0, "Recommendation section"],
    ["Why is it recommended?", narrative.recommendations.every((item) => item.evidence), "Evidence attached to recommendations"],
    ["What is the biggest risk?", narrative.risks.length > 0, "Risk register"],
    ["What should happen next?", narrative.actionPlan.length > 0, "Action plan"],
    ["What result would change the decision?", narrative.risks.some((item) => item.stopCondition) || narrative.actionPlan.some((item) => item.decisionAfter), "Stop condition or decision gate"]
  ].map(([question, passed, explanation]) => ({ question: String(question), passed: Boolean(passed), explanation: String(explanation) }));
  return { totalScore, classification, decisionUse, dimensions, blockingIssues: [...new Set(blockingIssues)].slice(0, 12), comprehensionTest };
}
