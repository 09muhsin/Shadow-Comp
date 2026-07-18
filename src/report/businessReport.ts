import type { DashboardCompanyInput } from "../web/dashboard.js";
import { buildIndustryDecisionAnalysis } from "./industryAnalysis.js";
import { getIndustryKpiProfile } from "./kpiRegistry.js";

export type ReportResearchSource = { id: string; title: string; url: string; publisher: string; publishedAt: string | null };
export type ReportResearchFinding = { category: "market" | "customer" | "competitor" | "pricing" | "operations" | "risk"; finding: string; implication: string; timeHorizon: "Short" | "Medium" | "Long"; evidenceStrength: "Low" | "Medium" | "High"; requiredAction: "Test" | "Invest" | "Monitor" | "Avoid"; sourceIds: string[] };
export type ReportResearch = { status: "not_requested" | "completed" | "unavailable"; searchedAt: string | null; query: string; summary: string; findings: ReportResearchFinding[]; sources: ReportResearchSource[]; limitations: string[]; recommendedKpiIds: string[] };

export type EvidenceLedgerInput = { id: string; name: string; value: string | number; unit: string; source: "user" | "ai"; confidence: "Low" | "Medium" | "High" };
export type EvidenceLedger = { userProvidedInputs: EvidenceLedgerInput[]; aiSuggestedInputs: EvidenceLedgerInput[]; externalResearchSources: ReportResearchSource[] };
export type KpiInputStatus = { id: string; name: string; requiredInputs: string[]; missingInputs: string[]; evidenceStatus: "Available" | "Modeled only" | "Missing inputs" };
export type BehaviorEvidence = { metric: string; value: string; evidenceType: "Modeled - user provided" | "Modeled - AI suggested" | "Modeled - synthetic" | "Observed" | "Missing"; explanation: string };

export type ReportRisk = {
  risk: string;
  probability: "Low" | "Medium" | "High";
  impact: "Low" | "Medium" | "High";
  earlyWarningSignal: string;
  mitigation: string;
  owner: string;
  reviewDate: string;
  stopCondition: string;
};

export type ReportRecommendation = {
  recommendation: string;
  evidence: string;
  validation: string;
};

export type ReportAction = {
  action: string;
  owner: string;
  timeline: string;
  successMetric: string;
  dependency: string;
  decisionAfter: string;
};

export type ReportNarrative = {
  executiveSummary: string;
  businessOverview: string;
  problemAndMarketNeed: string;
  productAnalysis: string;
  marketAnalysis: string;
  customerAnalysis: string;
  competitorAnalysis: string;
  businessModelAnalysis: string;
  salesAndMarketingAnalysis: string;
  operationalAnalysis: string;
  financialAnalysis: string;
  keyFindings: string[];
  recommendations: ReportRecommendation[];
  risks: ReportRisk[];
  actionPlan: ReportAction[];
  limitations: string[];
};

export type ReportEvidence = ReturnType<typeof buildReportEvidence>;

type DashboardExperience = ReturnType<(typeof import("../web/dashboard.js"))["buildDashboardExperience"]>;

const money = (value: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const sourceMarkers = (ids: string[]) => ids.length ? ` [${ids.join(", ")}]` : "";

const confidenceForField = (field: string, source: "ai" | "user"): EvidenceLedgerInput["confidence"] => {
  if (source === "user") return "High";
  if (/priceElasticity|churn|conversion|usage|customerAcquisition|capacity|occupancy|averageSellingPrice/i.test(field)) return "Low";
  return "Medium";
};

function buildEvidenceLedger(input: DashboardCompanyInput, experience: DashboardExperience, analysis: ReturnType<typeof buildIndustryDecisionAnalysis>, research: ReportResearch | null): EvidenceLedger {
  const baseFieldById: Record<string, string> = { "starting-cash": "startingCash", "fixed-costs": "fixedMonthlyCosts", "unit-cost": "variableCostPerUnit", "average-usage": "averageDailyUsage", "high-volume-usage": "highVolumeDailyUsage", "customer-arrivals": "dailyCustomerArrivals", "support-capacity": "supportHoursPerWeek" };
  const entries: EvidenceLedgerInput[] = experience.assumptions.map((item) => ({ id: baseFieldById[item.id] ?? item.id, name: item.name, value: typeof item.value === "number" ? item.value : String(item.value), unit: item.unit, source: item.source, confidence: item.confidence === "high" ? "High" : item.confidence === "medium" ? "Medium" : "Low" }));
  const add = (field: keyof DashboardCompanyInput, name: string, unit: string) => {
    if (entries.some((item) => item.id === field)) return;
    const raw = input[field];
    if (raw === undefined || raw === null) return;
    const source = analysis?.assumptionSources[String(field)] === "user" || input.assumptionSources?.[String(field)] === "user" ? "user" : "ai";
    const value = field === "plans" && Array.isArray(raw) ? raw.map((plan) => `${plan.name ?? "Plan"}: ${money(Number(plan.monthlyPrice ?? plan.price ?? 0), input.currency || "USD")}`).join("; ") : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    entries.push({ id: String(field), name, value, unit, source, confidence: confidenceForField(String(field), source) });
  };
  add("unitName", "Defined operating or usage unit", "definition");
  add("plans", "Pricing and allowance structure", "plan terms");
  if (analysis?.category === "hospitality") {
    add("capacityLocations", "Properties", "properties"); add("capacityPerLocation", "Rooms per property", "rooms"); add("baselineUtilization", "Baseline occupancy", "rate"); add("averageSellingPrice", "Average daily rate", "USD/room-night"); add("averageTransactionLength", "Average length of stay", "nights"); add("cancellationRate", "Cancellation rate", "rate"); add("directChannelShare", "Direct booking share", "rate"); add("thirdPartyFeeRate", "Third-party commission", "rate"); add("priceElasticity", "Booking price elasticity", "elasticity");
  }
  if (analysis?.category === "subscription") {
    add("startingPaidCustomers", "Current paying accounts", "accounts"); add("monthlyChurnRate", "Monthly paid churn", "rate"); add("paidConversionRate", "Paid conversion", "rate"); add("paymentProcessingRate", "Payment processing rate", "rate"); add("refundRate", "Refund and credit rate", "rate"); add("failedTaskRate", "Failed or retried task rate", "rate"); add("customerAcquisitionCost", "Customer acquisition cost", "USD/account"); add("targetGrossMargin", "Target gross margin", "rate"); add("priceElasticity", "Subscription price elasticity", "elasticity");
  }
  return { userProvidedInputs: entries.filter((item) => item.source === "user"), aiSuggestedInputs: entries.filter((item) => item.source === "ai"), externalResearchSources: research?.sources ?? [] };
}

function buildKpiInputStatus(input: DashboardCompanyInput, profile: ReturnType<typeof getIndustryKpiProfile>, analysis: ReturnType<typeof buildIndustryDecisionAnalysis>): KpiInputStatus[] {
  const category = analysis?.category ?? profile.category;
  const hasPlan = Boolean(input.plans?.some((plan) => Number(plan.monthlyPrice ?? plan.price) >= 0));
  const known = (required: string) => {
    const key = required.toLowerCase();
    if (/paid accounts|opening accounts/.test(key)) return Number.isFinite(input.customerTarget) || Number.isFinite(input.startingPaidCustomers);
    if (/plan price|recurring subscriptions|mrr/.test(key)) return hasPlan;
    if (/overage revenue/.test(key)) return hasPlan && input.plans!.some((plan) => plan.overagePrice !== undefined);
    if (/revenue|gross profit|net revenue|account revenue/.test(key)) return hasPlan;
    if (/direct ai cost|account direct cost|cost to serve|direct cost|vendor cost/.test(key)) return Number.isFinite(input.variableCostPerUnit) && Boolean(input.unitName);
    if (/cac|acquisition cost/.test(key)) return Number.isFinite(input.customerAcquisitionCost);
    if (/occupied room|available room/.test(key)) return Number.isFinite(input.capacityLocations) && Number.isFinite(input.capacityPerLocation);
    if (/distribution cost/.test(key)) return Number.isFinite(input.thirdPartyFeeRate) && Number.isFinite(input.directChannelShare);
    if (/cohort|expansion|contraction|lost accounts|attempted tasks|failed tasks|model calls|tool calls|retries/.test(key)) return false;
    return category === "hospitality" ? Boolean(analysis) : false;
  };
  return profile.kpis.map((item) => {
    const missingInputs = item.requiredInputs.filter((required) => !known(required));
    const evidenceStatus: KpiInputStatus["evidenceStatus"] = missingInputs.length ? "Missing inputs" : analysis?.criticalDataGaps.length ? "Modeled only" : "Available";
    return { id: item.id, name: item.name, requiredInputs: item.requiredInputs, missingInputs, evidenceStatus };
  });
}

function buildBehaviorEvidence(input: DashboardCompanyInput, experience: DashboardExperience, analysis: ReturnType<typeof buildIndustryDecisionAnalysis>): BehaviorEvidence[] {
  const sourceType = (field: string): BehaviorEvidence["evidenceType"] => input.assumptionSources?.[field] === "user" ? "Modeled - user provided" : "Modeled - AI suggested";
  const rows: BehaviorEvidence[] = [
    { metric: "Acquisition rate", value: `${experience.company.settings.dailyCustomerArrivals} new accounts or customers per day`, evidenceType: sourceType("dailyCustomerArrivals"), explanation: "Entered arrival assumption; no acquisition-channel evidence is attached." },
    { metric: "Activation rate", value: "Not provided", evidenceType: "Missing", explanation: "Define activation and provide activated accounts divided by eligible signups." },
    { metric: "Support demand", value: `${experience.company.settings.supportHoursPerWeek} hours of weekly capacity; demand is simulated`, evidenceType: "Modeled - synthetic", explanation: "Capacity is not observed ticket demand or response performance." },
    { metric: "High-usage segment", value: `${experience.company.settings.highVolumeDailyUsage} ${experience.company.unitName} per day`, evidenceType: sourceType("highVolumeDailyUsage"), explanation: "This segment is shown separately because it can become loss-making before the average account." }
  ];
  if (analysis?.category === "subscription") rows.splice(2, 0, { metric: "Paid retention / churn", value: `${percent(analysis.baseline.monthlyChurnRate)} monthly churn`, evidenceType: sourceType("monthlyChurnRate"), explanation: "Entered churn assumption; observed cohort retention is not attached." });
  else rows.splice(2, 0, { metric: "Retention / churn", value: "Synthetic simulation only", evidenceType: "Modeled - synthetic", explanation: "No observed customer cohort retention was supplied." });
  return rows;
}

export function buildReportEvidence(input: DashboardCompanyInput, experience: DashboardExperience, research: ReportResearch | null = null) {
  const recommended = experience.scenarios.find((scenario) => scenario.id === experience.decision.recommendedScenarioId)!;
  const baseline = experience.scenarios.find((scenario) => scenario.isBaseline)!;
  const industryDecisionAnalysis = buildIndustryDecisionAnalysis(input);
  const kpiProfile = getIndustryKpiProfile(input, research?.recommendedKpiIds ?? []);
  const evidenceLedger = buildEvidenceLedger(input, experience, industryDecisionAnalysis, research);
  const kpiInputStatus = buildKpiInputStatus(input, kpiProfile, industryDecisionAnalysis);
  const behaviorEvidence = buildBehaviorEvidence(input, experience, industryDecisionAnalysis);
  return {
    evidencePolicy: {
      calculatedFieldsAreLocked: true,
      prohibitedInferences: ["Unprovided market sizes", "Unprovided competitor names or pricing", "Unprovided legal or regulatory claims", "Guaranteed forecasts"],
      missingEvidenceLabel: "Research required / not provided"
    },
    company: {
      name: experience.company.name,
      description: experience.company.description,
      industry: input.industry || "Research required / not provided",
      geography: input.geography || "Research required / not provided",
      currency: input.currency || "USD",
      dataAsOf: input.dataAsOf || "Research required / not provided",
      developmentStage: input.developmentStage || "Research required / not provided",
      customerProfile: input.customerProfile || "Research required / not provided",
      revenueModel: experience.company.revenueModel,
      unitName: experience.company.unitName,
      decisionQuestion: experience.decision.question,
      plans: experience.company.plans
    },
    reportHeader: {
      companyName: experience.company.name,
      analysisPeriod: `${experience.engine.durationDays}-day simulation${input.dataAsOf ? ` · inputs current through ${input.dataAsOf}` : ""}`,
      decisionQuestion: experience.decision.question
    },
    simulation: experience.engine,
    operatingModel: {
      startingCash: input.startingCash ?? 0,
      fixedMonthlyCosts: input.fixedMonthlyCosts ?? 0,
      variableCostPerUnit: input.variableCostPerUnit ?? 0,
      averageDailyUsage: experience.company.settings.averageDailyUsage,
      highVolumeDailyUsage: experience.company.settings.highVolumeDailyUsage,
      dailyCustomerArrivals: experience.company.settings.dailyCustomerArrivals,
      supportHoursPerWeek: experience.company.settings.supportHoursPerWeek,
      syntheticCustomerTarget: experience.company.settings.customerTarget
    },
    recommendation: industryDecisionAnalysis ? {
      question: experience.decision.question,
      recommendedScenarioId: null,
      recommendation: industryDecisionAnalysis.recommendation,
      rationale: industryDecisionAnalysis.rationale,
      confidence: "insufficient" as const,
      disclaimer: industryDecisionAnalysis.category === "hospitality" ? "This is a capacity-constrained decision experiment, not a forecast or authorization to change prices." : "This is a unit-economics and scaling experiment, not a forecast or authorization to change pricing, allowances, or model infrastructure."
    } : experience.decision,
    scenarioResults: industryDecisionAnalysis ? [] : experience.scenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      isBaseline: scenario.isBaseline,
      metrics: scenario.metrics,
      sensitivity: scenario.range,
      primaryOutcome: scenario.explanation.primaryOutcome,
      mainCause: scenario.explanation.mainCause,
      secondaryCauses: scenario.explanation.secondaryCauses,
      firstWarningSignal: scenario.explanation.firstWarningSignal,
      timeline: scenario.timeline,
      representativeJourney: scenario.journey,
      cashSeries: scenario.cashSeries
    })),
    comparison: industryDecisionAnalysis ? null : {
      baselineScenario: baseline.label,
      recommendedScenario: recommended.label,
      endingCashDifference: recommended.metrics.endingCash - baseline.metrics.endingCash,
      grossMarginPointDifference: (recommended.metrics.grossMargin - baseline.metrics.grossMargin) * 100,
      churnDifference: recommended.metrics.churn - baseline.metrics.churn,
      supportBacklogDifference: recommended.metrics.supportBacklog - baseline.metrics.supportBacklog
    },
    assumptions: experience.assumptions
    ,industryDecisionAnalysis
    ,kpiProfile
    ,kpiInputStatus
    ,behaviorEvidence
    ,evidenceLedger
    ,research
  };
}

function hospitalityNarrative(evidence: ReportEvidence): ReportNarrative {
  const analysis = evidence.industryDecisionAnalysis;
  if (!analysis || analysis.category !== "hospitality") throw new Error("Hospitality analysis is required.");
  const current = analysis.scenarios.find((item) => item.id === "current")!;
  const efficiency = analysis.scenarios.find((item) => item.id === "efficiency")!;
  const pricing = analysis.scenarios.find((item) => item.id === "pricing")!;
  const research = evidence.research;
  const marketFindings = research?.findings.filter((item) => item.category === "market" || item.category === "customer") ?? [];
  const competitorFindings = research?.findings.filter((item) => item.category === "competitor" || item.category === "pricing") ?? [];
  const findingsText = (items: typeof marketFindings, fallback: string) => items.length ? items.map((item) => `${item.finding}${sourceMarkers(item.sourceIds)} Implication: ${item.implication}`).join(" ") : fallback;
  const dataGapList = analysis.criticalDataGaps.slice(0, 6).join(", ");
  const experimentThreshold = `Proceed only if treatment RevPAR improves by at least 5%, booking conversion declines by no more than 3%, cancellation rate rises by no more than 1 percentage point, guest rating changes by no more than 0.1 points, and contribution per available room improves.`;
  return {
    executiveSummary: `The current evidence cannot determine whether a 12% room-rate increase or a 15% reduction in variable room cost is superior. The pricing result depends on booking response: under the entered costs and channel mix, the price increase breaks even when occupied room-nights decline by approximately ${percent(analysis.breakEvenVolumeDecline)}. Because ${dataGapList || "critical operating inputs"} are not verified, the correct decision is a controlled test—not a portfolio-wide price change.`,
    businessOverview: `${evidence.company.name} is described as ${evidence.company.description} This report uses a capacity-constrained hotel model built around available room-nights, occupied room-nights, ADR, occupancy, distribution cost, and simplified operating contribution. It does not treat guests as software subscribers or assume unlimited inventory.`,
    problemAndMarketNeed: `The business brief indicates a positioning opportunity between luxury chains and budget motels, supported by local design and personalized service. The strength of demand, target segments by property, booking occasions, willingness to pay, and reasons guests reject alternatives require observed booking, interview, review, and channel data.`,
    productAnalysis: `The guest proposition includes distinctive rooms, consistent design standards, direct-booking loyalty points, food and beverage, flexible cancellation, and local concierge experiences. These features should be evaluated by their effect on conversion, ADR, length of stay, direct-booking share, guest ratings, and repeat stays rather than described only as a feature list.`,
    marketAnalysis: findingsText(marketFindings, "No sourced local demand, supply, occupancy, ADR, RevPAR, seasonality, or segment data is available. Research is required at the city and competitive-set level before portfolio conclusions are made."),
    customerAnalysis: `The decision unit is a room-night, not an always-active customer. The operating model uses ${analysis.capacity.totalUnits.toLocaleString()} rooms across ${analysis.capacity.locations} properties and ${analysis.capacity.availableUnits.toLocaleString()} available room-nights over the analysis period. Average length of stay, cancellations, booking windows, segment mix, repeat stays, and channel behavior must be measured separately.`,
    competitorAnalysis: findingsText(competitorFindings, "No verified competitive set or dated competitor-rate sample was provided. A property-level rate shop should compare room type, date, cancellation terms, taxes, fees, review score, and channel—not just headline nightly price."),
    businessModelAnalysis: `The model earns room revenue from occupied room-nights and constrains sales by physical room inventory. It deducts ${money(evidence.operatingModel.variableCostPerUnit)} per occupied room-night, estimated third-party distribution cost, and entered fixed operating costs. The resulting figure is simplified operating contribution before tax, financing, debt service, capital expenditure, acquisitions, renovations, and owner distributions; it is not “ending cash.”`,
    salesAndMarketingAnalysis: `Commercial performance should be evaluated through occupancy, ADR, RevPAR, Net RevPAR, direct-booking share, channel commission, conversion, cancellation, length of stay, and repeat-stay behavior. A portfolio average can conceal property-level differences, so pricing tests should be stratified by property, room type, day of week, season, and channel.`,
    operationalAnalysis: `The baseline provides ${analysis.capacity.availableUnits.toLocaleString()} available room-nights at ${percent(current.utilization)} occupancy. Capacity prevents occupied room-nights from exceeding inventory. The cost-efficiency case assumes a 15% reduction in variable room cost while holding rate and occupancy constant; it must specify which costs change and include service-quality guardrails.`,
    financialAnalysis: `The baseline produces ${money(current.revenue)} room revenue and ${money(current.operatingContribution)} simplified operating contribution. The cost-efficiency case produces ${money(efficiency.operatingContribution)}. The entered-elasticity pricing case produces ${money(pricing.operatingContribution)} at ${percent(pricing.utilization)} occupancy. These figures exclude tax, financing, capital expenditure, working capital, property transactions, and other cash-flow items.`,
    keyFindings: [
      `A 12% price increase is not automatically superior: it breaks even at approximately ${percent(analysis.breakEvenVolumeDecline)} lower occupied room-nights under the entered economics.`,
      `The portfolio can sell at most ${analysis.capacity.availableUnits.toLocaleString()} room-nights during the modeled period; every scenario respects this capacity.`,
      `The baseline RevPAR is ${money(current.revenuePerAvailableUnit)} and Net RevPAR after modeled distribution cost is ${money(current.netRevenuePerAvailableUnit)}.`,
      `The model cannot select a winner while ${analysis.criticalDataGaps.length} critical inputs remain AI-suggested or unverified.`
    ],
    recommendations: [
      { recommendation: "Do not select a winning scenario yet; run a controlled property-level pricing experiment.", evidence: `The break-even occupied-room decline is approximately ${percent(analysis.breakEvenVolumeDecline)}, and actual price elasticity is unverified.`, validation: experimentThreshold },
      { recommendation: "Rebuild the baseline with property and channel data.", evidence: `${analysis.criticalDataGaps.length} critical fields are still unverified.`, validation: "Load rooms, out-of-service inventory, occupancy, ADR, channel mix, commission, cancellations, variable room cost, and fixed operating expense for each property." },
      { recommendation: "Define the room-cost efficiency case operationally.", evidence: `The scenario changes variable room cost from ${money(evidence.operatingModel.variableCostPerUnit)} to ${money(evidence.operatingModel.variableCostPerUnit * 0.85)} without identifying affected services.`, validation: "Name each cost line, owner, quality guardrail, guest-rating threshold, and reversibility condition." }
    ],
    risks: [
      { risk: "Booking volume declines beyond break-even", probability: "High", impact: "High", earlyWarningSignal: `Occupied room-nights fall more than ${percent(analysis.breakEvenVolumeDecline)} against a comparable control`, mitigation: "Use holdout properties or matched dates with rate fences and stop thresholds", owner: "Revenue Management", reviewDate: "Weekly during test", stopCondition: `Stop or reverse if comparable occupied room-nights decline beyond ${percent(analysis.breakEvenVolumeDecline)}.` },
      { risk: "Portfolio averages hide property differences", probability: "High", impact: "High", earlyWarningSignal: "Treatment results diverge materially by property, room type, weekday, or channel", mitigation: "Analyze and approve decisions at property-segment level", owner: "Commercial Analytics", reviewDate: "At each interim review", stopCondition: "Do not roll out where a property segment fails its contribution and guest-experience thresholds." },
      { risk: "Cost reductions damage guest experience", probability: "Medium", impact: "High", earlyWarningSignal: "Guest rating falls by more than 0.1 points or service complaints rise", mitigation: "Protect service standards and reverse affected cost changes", owner: "Operations", reviewDate: "Weekly", stopCondition: "Reverse the affected cost change if guest rating falls by more than 0.1 points." },
      { risk: "Distribution cost offsets rate gain", probability: "Medium", impact: "Medium", earlyWarningSignal: "Net RevPAR lags gross RevPAR due to OTA mix or commission", mitigation: "Measure results after channel cost and preserve direct-booking incentives", owner: "Distribution", reviewDate: "Weekly by channel", stopCondition: "Stop the channel treatment if Net RevPAR declines against its matched control." },
      { risk: "Incomplete fixed-cost accounting overstates contribution", probability: "High", impact: "High", earlyWarningSignal: "Property P&L reconciliation identifies excluded labor, lease, insurance, utility, tax, or maintenance cost", mitigation: "Reconcile the model to property-level P&Ls before external use", owner: "Finance", reviewDate: "Before approval", stopCondition: "Block external distribution until the model reconciles to property P&Ls." }
    ],
    actionPlan: [
      { action: "Load verified property-level operating baseline", owner: "Finance + Revenue Management", timeline: "Before experiment design", successMetric: "Rooms, occupancy, ADR, RevPAR, channel cost, cancellations, and cost lines reconcile to source systems", dependency: "Property-management, booking, channel, and P&L extracts", decisionAfter: "Proceed to experiment design only after reconciliation passes." },
      { action: "Design matched control and treatment cells", owner: "Revenue Management", timeline: "Within 2 weeks", successMetric: "Properties, dates, room types, channels, sample size, and rate fences approved", dependency: "Verified baseline and statistical review", decisionAfter: "Approve, revise, or reject the proposed test design." },
      { action: "Run the controlled rate test", owner: "Property GMs + Commercial", timeline: "At least one representative demand cycle", successMetric: experimentThreshold, dependency: "Approved controls, tracking, and stop rules", decisionAfter: "Continue, stop, or extend based on the pre-agreed interim thresholds." },
      { action: "Review results and choose by property segment", owner: "Executive team", timeline: "After test completion", successMetric: "Documented go, revise, or stop decision using pre-agreed thresholds", dependency: "Completed analysis by property, room type, date, and channel", decisionAfter: "Approve only qualifying segments; do not assume a portfolio-wide effect." }
    ],
    limitations: [
      "AI-suggested industry assumptions are hypotheses and are visibly separated from user-provided operating data.",
      "Simplified operating contribution is not EBITDA, net income, or ending cash and excludes tax, financing, capital expenditure, working capital, and property transactions.",
      "External trend research provides context, not proof of Cedar & Stone performance or local demand.",
      "Portfolio results must not be applied to individual properties without property-level validation.",
      "No scenario is a forecast or authorization to change prices; a controlled experiment is required."
    ]
  };
}

function subscriptionNarrative(evidence: ReportEvidence): ReportNarrative {
  const analysis = evidence.industryDecisionAnalysis;
  if (!analysis || analysis.category !== "subscription") throw new Error("Subscription analysis is required.");
  const current = analysis.scenarios.find((item) => item.id === "current-flat")!;
  const allowance = analysis.scenarios.find((item) => item.id === "current-allowance")!;
  const priceAllowance = analysis.scenarios.find((item) => item.id === "price-allowance")!;
  const routed = analysis.scenarios.find((item) => item.id === "model-routing")!;
  const unprofitable = analysis.usageCohorts.filter((item) => !item.profitable);
  const research = evidence.research;
  const marketFindings = research?.findings.filter((item) => item.category === "market" || item.category === "customer" || item.category === "operations") ?? [];
  const competitorFindings = research?.findings.filter((item) => item.category === "competitor" || item.category === "pricing") ?? [];
  const findingsText = (items: typeof marketFindings, fallback: string) => items.length ? items.map((item) => `${item.finding}${sourceMarkers(item.sourceIds)} Implication: ${item.implication}`).join(" ") : fallback;
  const unit = evidence.company.unitName;
  const breakEvenRetention = 1 - analysis.breakEvenVolumeDecline;
  const commercialRetention = analysis.commercialRetentionGuardrail;
  const testThreshold = "Approve a wider rollout only if retained contribution improves by at least 10%, 30-day paid retention declines by no more than 2 percentage points, direct AI cost stays below 25% of net revenue, failed-task rate stays below 2%, and at least 95% of usage cost reconciles to vendor invoices.";
  return {
    executiveSummary: `${evidence.company.name} may be viable, but you cannot yet select a permanent price because the current flat plan looks risky under these assumptions. ${unprofitable.length ? `${unprofitable.map((item) => item.name).join(" and ")} users cost more to serve than they pay.` : "The modeled usage groups cover direct cost, but real usage still needs validation."} Start with a controlled test of a clear monthly allowance, a real overage fee, and lower-cost AI routing; do not jump straight to a major price increase. The figures are an idea-evaluation model, not audited company results.`,
    businessOverview: `${evidence.company.name} is described as ${evidence.company.description} It is intended for ${evidence.company.customerProfile} and charges a monthly subscription. Customers use ${unit} when they complete the product's core AI workflow. This report evaluates whether that workflow appears useful enough to pay for and whether the price can cover the direct cost of serving different kinds of users.`,
    problemAndMarketNeed: `The stated decision is: “${evidence.company.decisionQuestion}” The relevant question is not simply whether a larger price produces more revenue. It is whether a defined price, allowance, overage rule, technical delivery strategy, and customer segment create durable retained contribution after price rejection, churn, heavy usage, retries, refunds, and customer acquisition.`,
    productAnalysis: `The report models ${evidence.company.plans.length} entered plan${evidence.company.plans.length === 1 ? "" : "s"}: ${evidence.company.plans.map((plan) => `${plan.name} at ${money(plan.monthlyPrice)} per month${plan.includedUnits === null ? " with no entered allowance" : ` with ${plan.includedUnits.toLocaleString()} included ${unit}`}${plan.overagePrice > 0 ? ` and ${money(plan.overagePrice)} per extra unit` : ""}`).join("; ")}. Before a price is judged, the founder should be able to explain one customer workflow, the outcome it improves, and why that outcome is better than a general AI tool, a manual process, or doing nothing.`,
    marketAnalysis: findingsText(marketFindings, "No dated, sourced evidence is attached for category growth, AI delivery-cost trends, model routing, customer expectations, regulation, or customer willingness to pay. These remain research required; they are not inferred from the synthetic model."),
    customerAnalysis: `The model separates Light (${percent(analysis.usageCohorts[0]!.share)}), Typical (${percent(analysis.usageCohorts[1]!.share)}), Heavy (${percent(analysis.usageCohorts[2]!.share)}), and Extreme (${percent(analysis.usageCohorts[3]!.share)}) usage cohorts. Average entered usage is ${analysis.baseline.averageMonthlyUsage.toLocaleString()} ${unit} per month and high-volume usage is ${analysis.baseline.highVolumeMonthlyUsage.toLocaleString()}. These cohort shares are structural assumptions until replaced by median, 75th, 90th, 95th, and 99th percentile usage from actual accounts.`,
    competitorAnalysis: findingsText(competitorFindings, "No verified competitor set, dated pricing, included allowances, overage rules, seat rules, contract terms, or indirect alternatives are attached. Research must compare direct competitors, general-purpose AI products, manual workflows, agencies, and doing nothing before willingness to pay is inferred."),
    businessModelAnalysis: `The model compares four options: the current flat plan; the same price with a defined allowance; a moderate higher-price plan with allowance and paid overage; and the current price with lower AI cost from model routing. “Operating contribution” simply means money left after direct AI, retry, payment, refund, and basic fixed costs. It is useful for comparing options, but it is not final profit or cash in the bank.`,
    salesAndMarketingAnalysis: `The entered paid-conversion assumption is ${percent(analysis.baseline.paidConversionRate)}, monthly paid churn is ${percent(analysis.baseline.monthlyChurnRate)}, and CAC is ${money(analysis.baseline.customerAcquisitionCost)}. These are not observed results unless user-verified. Pricing tests must separate new and existing customers, acquisition channels, customer segments, discounts, annual contracts, grandfathered accounts, and retention windows.`,
    operationalAnalysis: `At ${analysis.baseline.paidAccounts.toLocaleString()} modeled paid accounts, the current case creates ${money(current.aiUsageCosts / Math.max(1, evidence.simulation.durationDays / 30))} of monthly AI usage cost. The technical cases explicitly test current model cost, lower-cost routing, and routing plus caching/retry controls. Capacity, latency, concurrency, vendor rate limits, support demand, moderation, and outages still require measured operational data.`,
    financialAnalysis: `All values in this section cover the same ${evidence.simulation.durationDays}-day modeled period. The current case produces ${money(current.revenue)} in modeled revenue, ${money(current.aiUsageCosts)} in AI cost, ${money(current.paymentAndRefundCosts)} in payment and refund cost, and ${money(current.operatingContribution)} in operating contribution. The allowance case produces ${money(allowance.operatingContribution)}, the price-and-allowance case ${money(priceAllowance.operatingContribution)}, and the model-routing case ${money(routed.operatingContribution)}. These are comparison figures, not ending cash or a forecast.`,
    keyFindings: [
      `${unprofitable.length ? `${unprofitable.map((item) => item.name).join(" and ")} cohorts are directly loss-making under the entered flat plan.` : "No modeled usage cohort is directly loss-making, although the distribution is unverified."}`,
      `Financial break-even is ${percent(breakEvenRetention)} paid-volume retention, but that is not a healthy business outcome. The pricing test should retain at least ${percent(commercialRetention)} before it is considered commercially acceptable.`,
      `The first pricing test uses a moderate step to ${money(priceAllowance.monthlyPrice)}, not an extreme jump. It includes ${priceAllowance.includedUnits?.toLocaleString()} ${unit} and charges ${money(priceAllowance.overagePrice)} for each extra unit.`,
      `The defined-allowance case affects ${percent(allowance.capAffectedShare)} of modeled accounts and therefore changes usage cost and retention instead of duplicating the current scenario.`,
      `At ${analysis.scaleCases.at(-1)!.paidAccounts.toLocaleString()} paid accounts, modeled monthly AI cost is ${money(analysis.scaleCases.at(-1)!.monthlyAiCost)} and monthly operating contribution is ${money(analysis.scaleCases.at(-1)!.monthlyContribution)}.`,
      `A 30% modeled reduction in AI unit cost changes operating contribution from ${money(current.operatingContribution)} to ${money(routed.operatingContribution)} over the analysis period.`
    ],
    recommendations: [
      { recommendation: "Test allowance plus paid overage first, while routing simple tasks to cheaper models.", evidence: `This directly controls heavy-user cost without asking every customer to accept a major price increase. The first modelled price test is ${money(priceAllowance.monthlyPrice)} with ${priceAllowance.includedUnits?.toLocaleString()} included ${unit} and ${money(priceAllowance.overagePrice)} per extra unit.`, validation: testThreshold },
      { recommendation: "Define and reconcile the usage unit before rerunning the model.", evidence: `All AI cost is currently calculated as served ${unit} multiplied by ${money(evidence.operatingModel.variableCostPerUnit)} per unit, including the entered retry rate.`, validation: "Publish the exact unit definition and reconcile at least 95% of usage events to model-provider, tool, search, storage, moderation, and retry invoices." },
      { recommendation: "Segment profitability by observed usage percentile.", evidence: `${unprofitable.length || 0} modeled cohort(s) are directly loss-making under the current plan.`, validation: "Calculate account contribution at the median, 75th, 90th, 95th, and 99th percentiles and quantify the share of cost created by the top 1%, 5%, and 10% of accounts." },
      { recommendation: "Test pricing architecture and technical optimization together.", evidence: `The allowance and routing cases change different economic drivers: served usage versus cost per served unit.`, validation: "Compare flat subscription, allowance plus overage, usage-based or credit tiers, and model routing using the same qualified customer segments and pre-agreed retention thresholds." }
    ],
    risks: [
      { risk: "Price rejection or churn makes the test commercially unhealthy", probability: "High", impact: "High", earlyWarningSignal: `Paid-volume retention falls below ${percent(commercialRetention)} or 30-day churn rises by more than 2 points`, mitigation: "Use randomized new-customer cells and preserve an untreated control", owner: "Growth + Finance", reviewDate: "Weekly during test", stopCondition: `Stop the price cell if retained contribution declines or paid-volume retention falls below ${percent(commercialRetention)}. Financial break-even alone is not a pass.` },
      { risk: "Heavy accounts destroy plan margin", probability: "High", impact: "High", earlyWarningSignal: "95th-percentile direct AI cost exceeds plan net revenue", mitigation: "Use allowances, overage, routing, abuse controls, and enterprise terms", owner: "Product + Finance", reviewDate: "Weekly by usage percentile", stopCondition: "Block unlimited rollout while any material cohort has negative direct contribution." },
      { risk: "Vendor cost, outage, or policy change", probability: "Medium", impact: "High", earlyWarningSignal: "Unit cost, failed-task rate, latency, or rate-limit errors exceed the approved range", mitigation: "Use provider monitoring, routing, caching, fallback models, and contract review", owner: "Engineering", reviewDate: "Weekly and after provider changes", stopCondition: "Pause growth spend if AI cost exceeds 25% of net revenue or failed tasks exceed 2%." },
      { risk: "Usage-cost mapping is incomplete", probability: "High", impact: "High", earlyWarningSignal: "More than 5% of vendor cost cannot be assigned to customer activity", mitigation: "Instrument model calls, tools, retries, storage, and account attribution", owner: "Engineering + Finance", reviewDate: "Before experiment", stopCondition: "Do not approve pricing while less than 95% of usage cost reconciles." },
      { risk: "Acquisition economics remain unprofitable", probability: "Medium", impact: "High", earlyWarningSignal: "CAC payback exceeds the approved window or worsens by channel", mitigation: "Measure contribution-adjusted CAC by channel and segment", owner: "Growth", reviewDate: "Each billing cycle", stopCondition: "Stop acquisition cells whose contribution-adjusted payback exceeds 12 months." },
      { risk: "Privacy, copyright, or customer-data exposure", probability: "Medium", impact: "High", earlyWarningSignal: "Unapproved data retention, model-provider terms, or output-rights gaps are identified", mitigation: "Complete product-specific legal, privacy, security, and vendor reviews", owner: "Legal + Security", reviewDate: "Before external rollout", stopCondition: "Block the affected workflow until the legal or security control is approved." }
    ],
    actionPlan: [
      { action: "Define the product workflow and billable usage unit", owner: "Product + Engineering", timeline: "Week 1", successMetric: "Each customer action maps to a documented billable unit and direct-cost component", dependency: "Product workflow and provider architecture", decisionAfter: "Approve the measurement specification or block financial modeling." },
      { action: "Reconcile usage and vendor cost by account", owner: "Engineering + Finance", timeline: "Weeks 1–2", successMetric: "At least 95% of usage cost maps to account, task type, model, retries, and billing period", dependency: "Event instrumentation and vendor invoices", decisionAfter: "Accept the cost baseline or fix the attribution gaps." },
      { action: "Build observed usage and profitability percentiles", owner: "Data + Finance", timeline: "Week 2", successMetric: "Median, P75, P90, P95, and P99 usage and direct contribution are reported by plan", dependency: "Reconciled account-level usage and revenue", decisionAfter: "Choose which allowances and overage candidates enter testing." },
      { action: "Run controlled pricing and allowance cells", owner: "Growth + Product", timeline: "At least one billing cycle plus 30-day retention", successMetric: "At least 150 qualified new accounts per cell, less than 5% untracked cost variance, and all decision metrics recorded", dependency: "Approved segments, tracking, sample size, controls, and stop rules", decisionAfter: testThreshold },
      { action: "Validate 90-day retention before migration", owner: "Executive team", timeline: "After the retention window", successMetric: "Retained contribution, churn, refunds, failures, and support meet every approved threshold", dependency: "Completed test and cohort follow-up", decisionAfter: "Roll out only qualifying segment-plan combinations; grandfather or exclude the rest." }
    ],
    limitations: [
      "Usage cohorts and behavioral responses are modeled assumptions until replaced with account-level observations.",
      "Modeled operating contribution is not ending cash, EBITDA, net income, or cash flow and excludes tax, financing, working capital, capital expenditure, and acquisition spend.",
      "The scaling table assumes the entered unit-cost relationship; provider volume discounts, tier changes, concurrency, latency, and engineering capacity are not automatically inferred.",
      "External research is context, not proof of company performance, customer willingness to pay, or legal compliance.",
      "The price, allowance, overage, and technical cases are neutral experiments, not forecasts or approved plans.",
      "A permanent decision remains blocked until critical inputs are user-verified and test thresholds are met."
    ]
  };
}

export function buildLocalReportNarrative(evidence: ReportEvidence): ReportNarrative {
  if (evidence.industryDecisionAnalysis?.category === "hospitality") return hospitalityNarrative(evidence);
  if (evidence.industryDecisionAnalysis?.category === "subscription") return subscriptionNarrative(evidence);
  const winner = evidence.scenarioResults.find((scenario) => scenario.id === evidence.recommendation.recommendedScenarioId)!;
  const baseline = evidence.scenarioResults.find((scenario) => scenario.isBaseline)!;
  const comparison = evidence.comparison!;
  const company = evidence.company;
  const customerWord = company.customerProfile === "Research required / not provided" ? "the stated target customers" : company.customerProfile;
  const warning = winner.firstWarningSignal;
  const researchedMarket = evidence.research?.status === "completed" ? evidence.research.findings.filter((item) => item.category === "market" || item.category === "customer") : [];
  const researchedCompetitors = evidence.research?.status === "completed" ? evidence.research.findings.filter((item) => item.category === "competitor" || item.category === "pricing") : [];
  const marketGap = researchedMarket.length ? researchedMarket.map((item) => `${item.finding}${sourceMarkers(item.sourceIds)} Implication: ${item.implication}`).join(" ") : "No sourced market-size, growth, geography, or competitor dataset was supplied. TAM, SAM, SOM, industry growth, competitor names, and competitor pricing therefore remain research required and are not estimated in this report.";

  return {
    executiveSummary: `${company.name} was modeled across ${evidence.scenarioResults.length} operating scenarios over ${evidence.simulation.durationDays} days. Under the selected assumptions, ${winner.label} produced the strongest modeled result, ending with ${money(winner.metrics.endingCash)} in cash and a ${percent(winner.metrics.grossMargin)} gross margin. This is a synthetic scenario comparison, not a forecast; the recommended direction should be validated with actual demand, cost, and customer-behavior data before implementation.`,
    businessOverview: `${company.name} is described as ${company.description} The business is at the ${company.developmentStage} stage in ${company.industry}. It uses a ${company.revenueModel === "unit_sales" ? "unit-sales" : "subscription"} revenue model and is testing the decision: “${company.decisionQuestion}”`,
    problemAndMarketNeed: `The supplied description indicates a need addressed for ${customerWord}. The seriousness of the problem, evidence of demand, current alternatives, and reasons existing solutions are insufficient were not supplied as sourced evidence. These points should be validated through customer interviews, sales data, or cited market research.`,
    productAnalysis: `The modeled offer contains ${company.plans.length} pricing or purchase tiers: ${company.plans.map((plan) => `${plan.name} at ${money(plan.monthlyPrice)}${company.revenueModel === "unit_sales" ? ` per ${company.unitName}` : " per month"}`).join(", ")}. Product features, delivery method, roadmap, and product weaknesses were not fully specified, so this report does not invent them.`,
    marketAnalysis: marketGap,
    customerAnalysis: `The modeled customer profile is ${customerWord}. The base assumptions use ${evidence.operatingModel.averageDailyUsage} ${company.unitName} per customer per day, ${evidence.operatingModel.highVolumeDailyUsage} for a high-volume customer, and ${evidence.operatingModel.dailyCustomerArrivals} new customers per day. These are user inputs or modeling assumptions—not observed retention, satisfaction, or willingness-to-pay results.`,
    competitorAnalysis: researchedCompetitors.length ? researchedCompetitors.map((item) => `${item.finding}${sourceMarkers(item.sourceIds)} Implication: ${item.implication}`).join(" ") : `No verified competitor list, competitor pricing, feature comparison, or positioning research was provided. Research required: identify direct competitors, indirect alternatives, their verified prices, and the dimensions customers use to choose between them.`,
    businessModelAnalysis: `${company.name} earns revenue through ${company.revenueModel === "unit_sales" ? `sales of ${company.unitName}` : "recurring plans"}. The model starts with ${money(evidence.operatingModel.startingCash)}, fixed costs of ${money(evidence.operatingModel.fixedMonthlyCosts)} per month, and variable cost of ${money(evidence.operatingModel.variableCostPerUnit)} per ${company.unitName}. The scenario comparison tests whether pricing and cost guardrails improve sustainability under the same seeded customer environment.`,
    salesAndMarketingAnalysis: `The simulation assumes ${evidence.operatingModel.dailyCustomerArrivals} new customers per day, but no observed leads, conversion rate, acquisition cost, channel performance, pipeline, or sales-cycle data was provided. These metrics must be measured before treating modeled customer growth as achievable.`,
    operationalAnalysis: `The model includes ${evidence.operatingModel.supportHoursPerWeek} hours of weekly support capacity. In the recommended scenario, the ending support backlog is ${winner.metrics.supportBacklog} and modeled infrastructure failures total ${winner.metrics.infrastructureFailures}. ${warning ? `The first material warning was recorded on day ${warning.day}: ${warning.description}` : "No material warning threshold was crossed in the selected scenario."}`,
    financialAnalysis: `In the recommended scenario, modeled revenue is ${money(winner.metrics.revenue)}, variable cost is ${money(winner.metrics.variableCosts)}, fixed cost is ${money(winner.metrics.fixedCosts)}, gross profit is ${money(winner.metrics.grossProfit)}, gross margin is ${percent(winner.metrics.grossMargin)}, and ending cash is ${money(winner.metrics.endingCash)}. Relative to ${baseline.label}, ending cash changes by ${money(comparison.endingCashDifference)} and gross margin by ${comparison.grossMarginPointDifference.toFixed(1)} percentage points.`,
    keyFindings: [
      `${winner.label} ranked highest under the modeled decision score, with ${money(winner.metrics.endingCash)} ending cash.`,
      `The recommended scenario’s gross margin is ${percent(winner.metrics.grossMargin)}, compared with ${percent(baseline.metrics.grossMargin)} in the baseline.`,
      `The recommended downside-to-upside ending-cash range is ${money(winner.sensitivity.endingCash.low)} to ${money(winner.sensitivity.endingCash.high)}, showing the effect of arrival, usage, and unit-cost uncertainty.`,
      `${winner.mainCause}`
    ],
    recommendations: [
      {
        recommendation: `Validate ${winner.label} as the leading operating option before rollout.`,
        evidence: `It produced ${money(winner.metrics.endingCash)} ending cash and ${percent(winner.metrics.grossMargin)} gross margin in the base simulation.`,
        validation: "Test pricing or cost assumptions with real customers and actual invoices; compare measured margin and conversion with the modeled values."
      },
      {
        recommendation: "Replace the highest-impact assumptions with observed data.",
        evidence: `The simulated cash range spans ${money(winner.sensitivity.endingCash.low)} to ${money(winner.sensitivity.endingCash.high)}.`,
        validation: "Track actual unit cost, daily usage, new-customer arrivals, support demand, and churn by cohort for at least one full purchase or billing cycle."
      },
      {
        recommendation: "Commission focused market and competitor research before using this report externally.",
        evidence: "TAM, SAM, SOM, competitor prices, market growth, and demand evidence were not provided.",
        validation: "Add cited primary or reputable industry sources and rerun the report with those facts clearly separated from simulation outputs."
      }
    ],
    risks: [
      { risk: "Modeled customer arrivals do not materialize", probability: "Medium", impact: "High", earlyWarningSignal: "Weekly new customers remain below the modeled daily arrival rate", mitigation: "Run channel-level acquisition tests and update the arrival assumption", owner: "Growth", reviewDate: "Weekly", stopCondition: "Stop scaling spend when acquisition volume remains below the approved threshold for two review periods." },
      { risk: "Actual unit cost exceeds the input", probability: "Medium", impact: "High", earlyWarningSignal: "Invoice-based cost per unit exceeds the modeled value by 10%", mitigation: "Reconcile supplier, infrastructure, fulfillment, and payment costs monthly", owner: "Finance / Operations", reviewDate: "Monthly", stopCondition: "Reprice or pause the affected offer when contribution falls below the approved floor." },
      { risk: "High-usage customers create capacity pressure", probability: "Medium", impact: "Medium", earlyWarningSignal: "Usage or support demand moves toward the modeled high-volume cohort", mitigation: "Add usage alerts, capacity thresholds, and tier guardrails", owner: "Product / Operations", reviewDate: "Weekly", stopCondition: "Pause acquisition or add capacity when service levels cross the agreed limit." },
      { risk: "Market and competitor assumptions are incomplete", probability: "High", impact: "Medium", earlyWarningSignal: "Customer interviews identify alternatives or price anchors absent from the report", mitigation: "Complete cited market and competitor research", owner: "Strategy", reviewDate: "Before external use", stopCondition: "Do not present the report externally until competitor and substitute evidence is sourced." }
    ],
    actionPlan: [
      { action: "Validate variable cost per unit against actual bills", owner: "Finance / Operations", timeline: "Within 2 weeks", successMetric: "Documented cost-per-unit range and source evidence", dependency: "Invoices and cost allocation rules", decisionAfter: "Accept, revise, or reject the modeled unit cost." },
      { action: `Test the ${winner.label} offer with a limited customer sample`, owner: "Product / Growth", timeline: "Within 30 days", successMetric: "Measured conversion, usage, and gross margin", dependency: "Approved test cells and tracking", decisionAfter: "Roll out, revise, extend, or stop using predefined thresholds." },
      { action: "Measure customer arrivals, support demand, and retention by cohort", owner: "Operations", timeline: "Next full cycle", successMetric: "Observed values replace synthetic assumptions", dependency: "Cohort definitions and event tracking", decisionAfter: "Recalculate scenarios using observed behavior." },
      { action: "Add verified market and competitor evidence", owner: "Strategy", timeline: "Before external distribution", successMetric: "Cited market method and verified comparison set", dependency: "Defined geography, customer segment, and research owner", decisionAfter: "Approve the report for external use or retain it as an internal draft." }
    ],
    limitations: [
      "Results use synthetic customers, fixed cohort rules, and a deterministic seeded simulation.",
      "User-provided values and AI-suggested assumptions may not match observed business performance.",
      "The model does not prove market demand, product-market fit, competitor behavior, legal compliance, or financing availability.",
      "Sensitivity cases vary selected operating inputs; they do not cover every possible external event.",
      "Results represent possible scenarios and should not be treated as a guaranteed forecast or professional financial advice."
    ]
  };
}
