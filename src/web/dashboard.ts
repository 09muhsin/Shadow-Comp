import { simulate } from "../simulation/engine.js";
import { explainScenario } from "../simulation/explanation.js";
import type { BusinessAssumption, BusinessDecision, Company, Customer, Plan, SimulationEvent, SimulationRun } from "../simulation/types.js";

export type DashboardCompanyInput = {
  id?: string;
  name?: string;
  description?: string;
  decisionQuestion?: string;
  revenueModel?: string;
  developmentStage?: string;
  industry?: string;
  geography?: string;
  currency?: string;
  dataAsOf?: string;
  customerProfile?: string;
  unitName?: string;
  startingCash?: number;
  fixedMonthlyCosts?: number;
  variableCostPerUnit?: number;
  averageDailyUsage?: number;
  highVolumeDailyUsage?: number;
  dailyCustomerArrivals?: number;
  supportHoursPerWeek?: number;
  customerTarget?: number;
  durationDays?: number;
  seed?: number;
  assumptionSources?: Record<string, "ai" | "user">;
  capacityLocations?: number;
  capacityPerLocation?: number;
  baselineUtilization?: number;
  averageSellingPrice?: number;
  averageTransactionLength?: number;
  cancellationRate?: number;
  directChannelShare?: number;
  thirdPartyFeeRate?: number;
  priceElasticity?: number;
  startingPaidCustomers?: number;
  monthlyChurnRate?: number;
  paidConversionRate?: number;
  paymentProcessingRate?: number;
  refundRate?: number;
  failedTaskRate?: number;
  customerAcquisitionCost?: number;
  targetGrossMargin?: number;
  plans?: Array<Partial<Plan> & { price?: number; units?: number | null }>;
};

type ScenarioDefinition = {
  id: string;
  label: string;
  description: string;
  decisions: BusinessDecision[];
  isBaseline: boolean;
};

const money = (value: number) => Math.round(value * 100) / 100;
const formattedMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const numberWithin = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
const nearestHundred = (value: number) => Math.max(100, Math.round(value / 100) * 100);

function normalizePlans(input: DashboardCompanyInput): Plan[] {
  const source = Array.isArray(input.plans) && input.plans.length ? input.plans.slice(0, 4) : [
    { id: "free", name: "Free", monthlyPrice: 0, includedUnits: 1_000, rateLimit: 1_000 },
    { id: "starter", name: "Starter", monthlyPrice: 19, includedUnits: null, rateLimit: null },
    { id: "business", name: "Business", monthlyPrice: 79, includedUnits: null, rateLimit: null }
  ];
  return source.map((item, index) => {
    const included = item.includedUnits ?? item.units ?? null;
    const id = item.id || slug(item.name || `plan-${index + 1}`);
    return {
      id,
      name: item.name || `Plan ${index + 1}`,
      monthlyPrice: numberWithin(item.monthlyPrice ?? item.price, index === 0 ? 0 : 19 * index, 0, 1_000_000),
      includedUnits: included === null ? null : numberWithin(included, 1_000, 0, 100_000_000),
      overagePrice: numberWithin(item.overagePrice, 0, 0, 10_000),
      rateLimit: item.rateLimit === null || (item.rateLimit === undefined && included === null) ? null : numberWithin(item.rateLimit ?? included, 1_000, 0, 100_000_000)
    };
  });
}

export function normalizeDashboardCompany(input: DashboardCompanyInput): { company: Company; settings: Required<Pick<DashboardCompanyInput, "unitName" | "averageDailyUsage" | "highVolumeDailyUsage" | "dailyCustomerArrivals" | "supportHoursPerWeek" | "customerTarget" | "durationDays" | "seed">>; decisionQuestion: string } {
  const name = String(input.name || "Untitled company").trim().slice(0, 80);
  const plans = normalizePlans(input);
  const revenueModel = String(input.revenueModel).toLowerCase().replace(/[- ]/g, "_") === "unit_sales" || /one.?time|unit|retail|physical product/i.test(String(input.revenueModel)) ? "unit_sales" : "subscription";
  if (revenueModel === "unit_sales") plans.forEach((plan) => { plan.rateLimit = null; });
  const paidPlan = plans.find((plan) => plan.monthlyPrice > 0) ?? plans[0]!;
  const unitName = String(input.unitName || (/api|developer|data/i.test(`${input.description} ${input.industry}`) ? "usage units" : "sessions")).trim().slice(0, 40);
  const averageDailyUsage = numberWithin(input.averageDailyUsage, 420, 1, 10_000_000);
  const highVolumeDailyUsage = numberWithin(input.highVolumeDailyUsage, Math.max(averageDailyUsage * 8, 2_000), averageDailyUsage, 100_000_000);
  const dailyCustomerArrivals = numberWithin(input.dailyCustomerArrivals, 4.5, 0.05, 1_000);
  const supportHoursPerWeek = numberWithin(input.supportHoursPerWeek, 14, 1, 2_000);
  const customerTarget = Math.round(numberWithin(input.customerTarget, 1_000, 10, 5_000));
  const durationDays = Math.round(numberWithin(input.durationDays, 365, 30, 730));
  const seed = Math.round(numberWithin(input.seed, 7, 1, 2_147_483_647));
  const customerLabel = String(input.customerProfile || "customers").split(",")[0]!.trim().slice(0, 42) || "customers";
  const arrivalShares = [0.25, 0.28, 0.22, 0.15, 0.10];
  const cohortPlan = (preferredIndex: number) => plans[preferredIndex]?.id ?? paidPlan.id;
  const company: Company = {
    id: slug(input.id || name),
    name,
    description: String(input.description || `${name} subscription business`).trim().slice(0, 400),
    startingCash: numberWithin(input.startingCash, 125_000, 0, 1_000_000_000),
    fixedMonthlyCosts: numberWithin(input.fixedMonthlyCosts, 28_000, 0, 100_000_000),
    variableCostPerUnit: numberWithin(input.variableCostPerUnit, 0.006, 0, 100_000),
    revenueModel,
    unitName,
    team: [
      { id: "founder", role: "founder", weeklyCapacityHours: 45, supportHoursPerWeek: Math.min(8, supportHoursPerWeek), engineeringHoursPerWeek: 25, interruptionCostPerTicket: 0.4 },
      { id: "operator-1", role: "engineer", weeklyCapacityHours: 40, supportHoursPerWeek: Math.max(0, supportHoursPerWeek - Math.min(8, supportHoursPerWeek)), engineeringHoursPerWeek: 32, interruptionCostPerTicket: 0.6 }
    ],
    plans,
    cohorts: [
      { id: "explorers", name: `${customerLabel} explorers`, arrivalRatePerDay: dailyCustomerArrivals * arrivalShares[0]!, initialPlanId: cohortPlan(0), averageDailyUsage: Math.max(1, averageDailyUsage * 0.15), usageVariability: 0.35, priceSensitivity: 0.9, supportSensitivity: 0.55, reliabilitySensitivity: 0.5, upgradeProbability: 0.002, churnTriggers: ["reliability"], referralProbability: 0.015 },
      { id: "core", name: `Core ${customerLabel}`, arrivalRatePerDay: dailyCustomerArrivals * arrivalShares[1]!, initialPlanId: paidPlan.id, averageDailyUsage, usageVariability: 0.42, priceSensitivity: 0.7, supportSensitivity: 0.65, reliabilitySensitivity: 0.7, upgradeProbability: 0.004, churnTriggers: ["limit", "support"], referralProbability: 0.02 },
      { id: "teams", name: `${customerLabel} teams`, arrivalRatePerDay: dailyCustomerArrivals * arrivalShares[2]!, initialPlanId: paidPlan.id, averageDailyUsage: averageDailyUsage * 2.6, usageVariability: 0.5, priceSensitivity: 0.5, supportSensitivity: 0.75, reliabilitySensitivity: 0.8, upgradeProbability: 0.006, churnTriggers: ["limit", "support"], referralProbability: 0.025 },
      { id: "high-volume", name: `High-volume ${customerLabel}`, arrivalRatePerDay: dailyCustomerArrivals * arrivalShares[3]!, initialPlanId: paidPlan.id, averageDailyUsage: highVolumeDailyUsage, usageVariability: 0.65, priceSensitivity: 0.25, supportSensitivity: 0.85, reliabilitySensitivity: 0.9, upgradeProbability: 0.01, churnTriggers: ["limit", "reliability"], referralProbability: 0.03 },
      { id: "enterprise", name: `Enterprise ${customerLabel}`, arrivalRatePerDay: dailyCustomerArrivals * arrivalShares[4]!, initialPlanId: cohortPlan(Math.min(2, plans.length - 1)), averageDailyUsage: highVolumeDailyUsage * 0.45, usageVariability: 0.4, priceSensitivity: 0.2, supportSensitivity: 0.9, reliabilitySensitivity: 0.95, upgradeProbability: 0.012, churnTriggers: ["reliability", "support"], referralProbability: 0.035 }
    ]
  };
  return {
    company,
    settings: { unitName, averageDailyUsage, highVolumeDailyUsage, dailyCustomerArrivals, supportHoursPerWeek, customerTarget, durationDays, seed },
    decisionQuestion: String(input.decisionQuestion || `Which pricing guardrail gives ${name} the strongest path to sustainable growth?`).trim().slice(0, 240)
  };
}

function scenarioDefinitions(company: Company, averageDailyUsage: number, highVolumeDailyUsage: number): ScenarioDefinition[] {
  const plan = company.plans.find((item) => item.monthlyPrice > 0) ?? company.plans[0]!;
  const paidPlans = company.plans.filter((item) => item.monthlyPrice > 0);
  if (company.revenueModel === "unit_sales") {
    const efficientCost = money(company.variableCostPerUnit * 0.85);
    const premiumDecisions: BusinessDecision[] = paidPlans.map((item) => ({ type: "pricing_change", planId: item.id, monthlyPrice: money(item.monthlyPrice * 1.12) }));
    return [
      { id: "current", label: `Current · $${plan.monthlyPrice}/${company.unitName ?? "unit"}`, description: "Keep current selling prices and production cost.", decisions: [], isBaseline: true },
      { id: "efficient", label: `Efficiency · $${efficientCost} cost`, description: "Keep prices and model a 15% reduction in ingredient, packaging, or fulfillment cost.", decisions: [{ type: "unit_cost_change", variableCostPerUnit: efficientCost }], isBaseline: false },
      { id: "premium", label: "Premium · +12% pricing", description: "Increase purchase-tier unit prices by 12% while keeping the current cost structure.", decisions: premiumDecisions, isBaseline: false }
    ];
  }
  const protectedDecisions: BusinessDecision[] = paidPlans.map((item) => ({ type: "usage_limit_change", planId: item.id, rateLimit: nearestHundred(Math.max(100, item.monthlyPrice / Math.max(company.variableCostPerUnit * 30, 0.0001) * 0.7)) }));
  const premiumDecisions: BusinessDecision[] = [];
  paidPlans.forEach((item, index) => {
    const modeledUsage = index === 0 ? averageDailyUsage : highVolumeDailyUsage * 0.45;
    const sustainablePrice = modeledUsage * company.variableCostPerUnit * 30 / 0.6;
    const price = Math.ceil(Math.max(item.monthlyPrice + 20, item.monthlyPrice * 1.5, sustainablePrice, index === 0 ? 49 : item.monthlyPrice) / 5) * 5;
    const limit = nearestHundred(Math.max(100, price / Math.max(company.variableCostPerUnit * 30, 0.0001) * 0.72));
    premiumDecisions.push({ type: "pricing_change", planId: item.id, monthlyPrice: price }, { type: "usage_limit_change", planId: item.id, rateLimit: limit });
  });
  const premiumPrice = (premiumDecisions.find((decision) => decision.type === "pricing_change" && decision.planId === plan.id) as Extract<BusinessDecision, { type: "pricing_change" }> | undefined)?.monthlyPrice ?? plan.monthlyPrice;
  const currentAllowance = plan.rateLimit === null ? "unlimited" : `${plan.rateLimit.toLocaleString()} unit cap`;
  return [
    { id: "current", label: `Current · $${plan.monthlyPrice} ${currentAllowance}`, description: "Keep the current price and usage policy.", decisions: [], isBaseline: true },
    { id: "protected", label: "Protected · plan caps", description: "Keep current prices and add an economically bounded usage cap to every paid plan.", decisions: protectedDecisions, isBaseline: false },
    { id: "premium", label: `Sustainable · from $${premiumPrice}`, description: "Reprice each paid plan against its modeled cost-to-serve and add a compatible usage guardrail.", decisions: premiumDecisions, isBaseline: false }
  ];
}

function assumptions(company: Company, settings: ReturnType<typeof normalizeDashboardCompany>["settings"], sources: DashboardCompanyInput["assumptionSources"] = {}): BusinessAssumption[] {
  const source = (field: string) => sources?.[field] === "ai" ? "ai" as const : "user" as const;
  const confidence = (field: string, fallback: BusinessAssumption["confidence"]) => source(field) === "ai" ? "low" as const : fallback;
  return [
    { id: "starting-cash", name: "Starting cash", value: company.startingCash, unit: "USD", explanation: "Cash available before the rehearsal begins.", confidence: confidence("startingCash", "high"), source: source("startingCash"), editable: true },
    { id: "fixed-costs", name: "Fixed monthly costs", value: company.fixedMonthlyCosts, unit: "USD/month", explanation: "Payroll, software, rent, and other costs that do not scale directly with usage.", confidence: confidence("fixedMonthlyCosts", "medium"), source: source("fixedMonthlyCosts"), editable: true },
    { id: "unit-cost", name: "Variable cost", value: company.variableCostPerUnit, unit: `USD/${settings.unitName}`, explanation: "Infrastructure or fulfillment cost created by each unit of customer activity.", confidence: confidence("variableCostPerUnit", "medium"), source: source("variableCostPerUnit"), editable: true },
    { id: "average-usage", name: "Average customer usage", value: settings.averageDailyUsage, unit: `${settings.unitName}/day`, explanation: "Daily activity for the core customer cohort.", confidence: confidence("averageDailyUsage", "low"), source: source("averageDailyUsage"), editable: true },
    { id: "high-volume-usage", name: "High-volume usage", value: settings.highVolumeDailyUsage, unit: `${settings.unitName}/day`, explanation: "Daily activity for the costliest customer cohort.", confidence: confidence("highVolumeDailyUsage", "low"), source: source("highVolumeDailyUsage"), editable: true },
    { id: "customer-arrivals", name: "Customer arrivals", value: settings.dailyCustomerArrivals, unit: "customers/day", explanation: "Expected signups across all modeled customer cohorts.", confidence: confidence("dailyCustomerArrivals", "low"), source: source("dailyCustomerArrivals"), editable: true },
    { id: "support-capacity", name: "Support capacity", value: settings.supportHoursPerWeek, unit: "hours/week", explanation: "Weekly time the current team can spend resolving customer problems.", confidence: confidence("supportHoursPerWeek", "medium"), source: source("supportHoursPerWeek"), editable: true }
  ];
}

function companyWithDecisions(company: Company, decisions: BusinessDecision[]): Company {
  const next = structuredClone(company);
  for (const decision of decisions) {
    if (decision.type === "pricing_change") {
      const plan = next.plans.find((item) => item.id === decision.planId);
      if (plan) plan.monthlyPrice = decision.monthlyPrice;
    }
    if (decision.type === "usage_limit_change") {
      const plan = next.plans.find((item) => item.id === decision.planId);
      if (plan) plan.rateLimit = decision.rateLimit;
    }
    if (decision.type === "unit_cost_change") next.variableCostPerUnit = decision.variableCostPerUnit;
  }
  return next;
}

function cashSeries(company: Company, run: SimulationRun) {
  const checkpoints = Array.from(new Set([0, ...Array.from({ length: 12 }, (_, index) => Math.round(run.durationDays * (index + 1) / 12))]));
  const events = [...run.events].sort((a, b) => a.day - b.day);
  let eventIndex = 0, revenue = 0, variableCosts = 0;
  const series = checkpoints.map((day) => {
    while (eventIndex < events.length && events[eventIndex]!.day <= day) {
      revenue += events[eventIndex]!.revenueImpact;
      variableCosts += events[eventIndex]!.costImpact;
      eventIndex++;
    }
    return { day, cash: money(company.startingCash + revenue - variableCosts - company.fixedMonthlyCosts * day / 30) };
  });
  if (series.length) series[series.length - 1]!.cash = run.metrics.endingCash;
  return series;
}

function selectTimeline(events: SimulationEvent[]) {
  const priority = ["infrastructure_incident", "support_ticket", "customer_churn", "usage_limit_change", "pricing_change"];
  const selected: SimulationEvent[] = [];
  for (const type of priority) {
    const event = events.find((item) => item.type === type);
    if (event) selected.push(event);
  }
  if (!selected.length && events[0]) selected.push(events[0]);
  return selected.sort((a, b) => a.day - b.day).slice(0, 6).map((event) => ({ id: event.id, day: event.day, type: event.type, title: event.title, description: event.description, metadata: event.metadata }));
}

function representativeCustomer(run: SimulationRun): Customer | null {
  if (!run.customers.length) return null;
  return [...run.customers].sort((a, b) => {
    const score = (customer: Customer) => (customer.status === "churned" ? 1_000_000 : 0) + customer.supportTickets * 10_000 + customer.lifetimeCost;
    return score(b) - score(a);
  })[0] ?? null;
}

function customerJourney(company: Company, run: SimulationRun) {
  const customer = representativeCustomer(run);
  if (!customer) return null;
  const all = run.events.filter((event) => event.customerId === customer.id);
  const types = ["customer_signup", "support_ticket", "infrastructure_incident", "customer_churn"];
  const selected = types.map((type) => all.find((event) => event.type === type)).filter((event): event is SimulationEvent => Boolean(event));
  const cohort = company.cohorts.find((item) => item.id === customer.cohortId);
  const plan = company.plans.find((item) => item.id === customer.planId);
  return {
    id: customer.id,
    cohortName: cohort?.name ?? customer.cohortId,
    planName: plan?.name ?? customer.planId,
    status: customer.status,
    lifetimeRevenue: money(customer.lifetimeRevenue),
    lifetimeCost: money(customer.lifetimeCost),
    usage: customer.usage,
    supportTickets: customer.supportTickets,
    events: [
      ...selected.map((event) => ({ id: event.id, day: event.day, type: event.type, title: event.title, description: event.description })),
      { id: `${customer.id}-usage-summary`, day: run.durationDays, type: "usage_summary", title: "Journey usage total", description: `${customer.usage.toLocaleString()} units accumulated during the customer journey.` }
    ].sort((a, b) => a.day - b.day)
  };
}

function stressCompany(company: Company, mode: "downside" | "upside"): Company {
  const next = structuredClone(company);
  const downside = mode === "downside";
  next.variableCostPerUnit *= downside ? 1.15 : 0.9;
  next.cohorts.forEach((cohort) => {
    cohort.arrivalRatePerDay *= downside ? 0.82 : 1.12;
    cohort.averageDailyUsage *= downside ? 1.2 : 0.9;
  });
  return next;
}

function compactMetrics(run: SimulationRun) {
  const churn = run.metrics.customers ? run.metrics.churnedCustomers / run.metrics.customers : 0;
  return {
    customers: run.metrics.customers,
    activeCustomers: run.metrics.activeCustomers,
    churnedCustomers: run.metrics.churnedCustomers,
    churn: money(churn),
    revenue: run.metrics.revenue,
    variableCosts: run.metrics.variableCosts,
    fixedCosts: run.metrics.fixedCosts,
    refunds: run.metrics.refunds,
    grossProfit: run.metrics.grossProfit,
    grossMargin: run.metrics.grossMargin,
    endingCash: run.metrics.endingCash,
    supportBacklog: run.metrics.supportBacklog,
    infrastructureFailures: run.metrics.infrastructureFailures,
    estimatedRunwayMonths: run.metrics.estimatedRunwayMonths
  };
}

export function buildDashboardExperience(input: DashboardCompanyInput) {
  const normalized = normalizeDashboardCompany(input);
  const { company, settings } = normalized;
  const modelAssumptions = assumptions(company, settings, input.assumptionSources);
  const definitions = scenarioDefinitions(company, settings.averageDailyUsage, settings.highVolumeDailyUsage);
  const scenarios = definitions.map((definition) => {
    const effectiveCompany = companyWithDecisions(company, definition.decisions);
    const config = { durationDays: settings.durationDays, customerTarget: settings.customerTarget, seed: settings.seed, decisions: definition.decisions };
    const run = simulate(company, config);
    const downsideRun = simulate(stressCompany(company, "downside"), config);
    const upsideRun = simulate(stressCompany(company, "upside"), config);
    const explanation = explainScenario(run, modelAssumptions);
    const cashOutcomes = [downsideRun.metrics.endingCash, run.metrics.endingCash, upsideRun.metrics.endingCash];
    const marginOutcomes = [downsideRun.metrics.grossMargin, run.metrics.grossMargin, upsideRun.metrics.grossMargin];
    return {
      ...definition,
      effectivePlan: effectiveCompany.plans.find((plan) => plan.monthlyPrice > 0),
      metrics: compactMetrics(run),
      range: {
        endingCash: { low: Math.min(...cashOutcomes), base: run.metrics.endingCash, high: Math.max(...cashOutcomes) },
        grossMargin: { low: Math.min(...marginOutcomes), base: run.metrics.grossMargin, high: Math.max(...marginOutcomes) }
      },
      cashSeries: cashSeries(effectiveCompany, run),
      explanation,
      timeline: selectTimeline(run.events),
      journey: customerJourney(effectiveCompany, run)
    };
  });
  const score = (scenario: typeof scenarios[number]) => scenario.metrics.endingCash + scenario.metrics.grossMargin * 50_000 - scenario.metrics.churn * 35_000 - scenario.metrics.supportBacklog * 250;
  const recommended = [...scenarios].sort((a, b) => score(b) - score(a))[0]!;
  const baseline = scenarios.find((scenario) => scenario.isBaseline)!;
  const cashDelta = money(recommended.metrics.endingCash - baseline.metrics.endingCash);
  const marginDelta = money((recommended.metrics.grossMargin - baseline.metrics.grossMargin) * 100);
  const rangeWidth = recommended.range.endingCash.high - recommended.range.endingCash.low;
  const confidence = rangeWidth > Math.max(company.startingCash, 1) ? "low" : rangeWidth > Math.max(company.startingCash * 0.45, 1) ? "medium" : "high";
  return {
    generatedAt: new Date().toISOString(),
    engine: { name: "Shadow Company deterministic engine", version: "1", seed: settings.seed, durationDays: settings.durationDays, sensitivityCases: ["downside", "base", "upside"] },
    company: { id: company.id, name: company.name, description: company.description, revenueModel: company.revenueModel, unitName: company.unitName, plans: company.plans, settings },
    decision: {
      question: normalized.decisionQuestion,
      recommendedScenarioId: recommended.id,
      recommendation: `Choose “${recommended.label}” for the strongest modeled outcome.`,
      rationale: `${recommended.label} ends with ${formattedMoney(recommended.metrics.endingCash)} cash and ${(recommended.metrics.grossMargin * 100).toFixed(1)}% gross margin. Compared with the current plan, that is ${cashDelta >= 0 ? "+" : ""}${formattedMoney(cashDelta)} cash and ${marginDelta >= 0 ? "+" : ""}${marginDelta.toFixed(1)} margin points.`,
      confidence,
      disclaimer: "This is a scenario rehearsal based on editable assumptions, not a forecast or guarantee."
    },
    scenarios,
    assumptions: modelAssumptions
  };
}
