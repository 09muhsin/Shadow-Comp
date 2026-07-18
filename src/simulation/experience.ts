import type { BusinessAssumption, BusinessDecision, Company, Customer, ScenarioExplanation, SimulationConfig, SimulationEvent, SimulationEventType, SimulationRun } from "./types.js";
import { explainScenario } from "./explanation.js";
import { simulate } from "./engine.js";

export type TimelineItem = SimulationEvent & {
  important: boolean;
  category: "customer" | "financial" | "operations" | "decision";
};

export type DashboardSnapshot = {
  day: number;
  durationDays: number;
  activeCustomers: number;
  monthlyRecurringRevenue: number;
  revenue: number;
  variableCosts: number;
  cashBalance: number;
  grossMargin: number;
  supportBacklog: number;
  infrastructureFailures: number;
  events: TimelineItem[];
  warnings: TimelineItem[];
};

export type CustomerJourney = {
  customer: Customer;
  cohortName: string;
  planName: string;
  events: TimelineItem[];
  churnReason: string | null;
};

export type OutcomeReport = {
  metrics: SimulationRun["metrics"];
  explanation: ScenarioExplanation;
  disclaimer: string;
};

export type Scenario = {
  id: string;
  label: string;
  decision?: BusinessDecision;
  config: SimulationConfig;
  run?: SimulationRun;
};

export type ScenarioComparison = {
  scenarios: Array<{
    id: string;
    label: string;
    customers: number;
    revenue: number;
    monthlyRecurringRevenue: number;
    grossMargin: number;
    churn: number;
    supportBacklog: number;
    cashBalance: number;
    runwayMonths: number;
    infrastructureFailures: number;
  }>;
  strongestMarginScenarioId: string | null;
  fastestGrowthScenarioId: string | null;
  highestSupportBurdenScenarioId: string | null;
};

const IMPORTANT_EVENT_TYPES: SimulationEventType[] = ["infrastructure_incident", "customer_churn", "support_ticket", "refund", "pricing_change", "usage_limit_change", "team_capacity_change"];

function categoryFor(event: SimulationEvent): TimelineItem["category"] {
  if (["customer_signup", "customer_churn", "plan_upgrade", "plan_downgrade", "customer_referral"].includes(event.type)) return "customer";
  if (["product_usage", "usage_cost", "refund"].includes(event.type)) return "financial";
  if (["support_ticket", "support_ticket_resolved", "infrastructure_incident"].includes(event.type)) return "operations";
  return "decision";
}

function timelineItem(event: SimulationEvent): TimelineItem {
  return { ...event, important: IMPORTANT_EVENT_TYPES.includes(event.type), category: categoryFor(event) };
}

export function buildTimeline(run: SimulationRun, options: { dayFrom?: number; dayTo?: number } = {}): TimelineItem[] {
  const from = options.dayFrom ?? 1;
  const to = options.dayTo ?? run.durationDays;
  return run.events.filter((event) => event.day >= from && event.day <= to).map(timelineItem);
}

export function buildDashboardSnapshot(company: Company, run: SimulationRun, day: number): DashboardSnapshot {
  const visibleEvents = buildTimeline(run, { dayTo: Math.max(1, Math.min(day, run.durationDays)) });
  const revenue = visibleEvents.reduce((sum, event) => sum + event.revenueImpact, 0);
  const variableCosts = visibleEvents.reduce((sum, event) => sum + event.costImpact, 0);
  const supportCreated = visibleEvents.filter((event) => event.type === "support_ticket").length;
  const supportResolved = visibleEvents.filter((event) => event.type === "support_ticket_resolved").reduce((sum, event) => sum + Number(event.metadata.resolved ?? 0), 0);
  const activeCustomers = run.customers.filter((customer) => customer.signupDay <= day && !run.events.some((event) => event.type === "customer_churn" && event.customerId === customer.id && event.day <= day)).length;
  const monthlyRecurringRevenue = run.customers.filter((customer) => customer.signupDay <= day && !run.events.some((event) => event.type === "customer_churn" && event.customerId === customer.id && event.day <= day)).reduce((sum, customer) => sum + (company.plans.find((plan) => plan.id === customer.planId)?.monthlyPrice ?? 0), 0);
  const fixedCosts = company.fixedMonthlyCosts * day / 30;
  const cashBalance = company.startingCash + revenue - variableCosts - fixedCosts;
  const grossProfit = revenue - variableCosts;
  return { day, durationDays: run.durationDays, activeCustomers, monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue * 100) / 100, revenue: Math.round(revenue * 100) / 100, variableCosts: Math.round(variableCosts * 100) / 100, cashBalance: Math.round(cashBalance * 100) / 100, grossMargin: revenue ? Math.round((grossProfit / revenue) * 10_000) / 10_000 : 0, supportBacklog: Math.max(0, supportCreated - supportResolved), infrastructureFailures: visibleEvents.filter((event) => event.type === "infrastructure_incident").length, events: visibleEvents.slice(-50), warnings: visibleEvents.filter((event) => event.important).slice(-10) };
}

export function inspectCustomerJourney(run: SimulationRun, company: Company, customerId: string): CustomerJourney | null {
  const customer = run.customers.find((item) => item.id === customerId);
  if (!customer) return null;
  const events = buildTimeline(run).filter((event) => event.customerId === customerId);
  const churn = events.find((event) => event.type === "customer_churn");
  return { customer, cohortName: company.cohorts.find((cohort) => cohort.id === customer.cohortId)?.name ?? customer.cohortId, planName: company.plans.find((plan) => plan.id === customer.planId)?.name ?? customer.planId, events, churnReason: churn?.description ?? null };
}

export function buildOutcomeReport(run: SimulationRun, assumptions: BusinessAssumption[] = []): OutcomeReport {
  return { metrics: run.metrics, explanation: explainScenario(run, assumptions), disclaimer: "These outcomes are generated from user-defined and AI-assisted assumptions. They are scenarios, not guaranteed predictions." };
}

export function forkScenario(company: Company, base: Scenario, fork: Omit<Scenario, "run" | "config"> & { config?: Partial<SimulationConfig> }): Scenario {
  const config: SimulationConfig = { ...base.config, ...fork.config, decision: fork.decision };
  return { id: fork.id, label: fork.label, decision: fork.decision, config };
}

export function runScenario(company: Company, scenario: Scenario): Scenario {
  return { ...scenario, run: simulate(company, scenario.config) };
}

function monthlyRecurringRevenue(company: Company, run: SimulationRun): number {
  return run.customers.filter((customer) => customer.status === "active").reduce((sum, customer) => sum + (company.plans.find((plan) => plan.id === customer.planId)?.monthlyPrice ?? 0), 0);
}

export function compareScenarios(company: Company, scenarios: Scenario[]): ScenarioComparison {
  const rows = scenarios.filter((scenario): scenario is Scenario & { run: SimulationRun } => Boolean(scenario.run)).map((scenario) => ({ id: scenario.id, label: scenario.label, customers: scenario.run.metrics.customers, revenue: scenario.run.metrics.revenue, monthlyRecurringRevenue: monthlyRecurringRevenue(company, scenario.run), grossMargin: scenario.run.metrics.grossMargin, churn: scenario.run.metrics.customers ? scenario.run.metrics.churnedCustomers / scenario.run.metrics.customers : 0, supportBacklog: scenario.run.metrics.supportBacklog, cashBalance: scenario.run.metrics.endingCash, runwayMonths: scenario.run.metrics.estimatedRunwayMonths, infrastructureFailures: scenario.run.metrics.infrastructureFailures }));
  const maxBy = <K extends keyof typeof rows[number]>(key: K) => rows.length ? rows.reduce((best, row) => row[key] > best[key] ? row : best).id : null;
  const minBy = <K extends keyof typeof rows[number]>(key: K) => rows.length ? rows.reduce((best, row) => row[key] < best[key] ? row : best).id : null;
  return { scenarios: rows, strongestMarginScenarioId: maxBy("grossMargin"), fastestGrowthScenarioId: maxBy("customers"), highestSupportBurdenScenarioId: maxBy("supportBacklog") };
}
