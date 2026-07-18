import type { BusinessDecision, Company, Customer, FinancialLedger, SimulationConfig, SimulationEvent, SimulationEventType, SimulationMetrics, SimulationRun } from "./types.js";

class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number { this.state = (1664525 * this.state + 1013904223) >>> 0; return this.state / 2 ** 32; }
  between(min: number, max: number): number { return min + (max - min) * this.next(); }
}

const money = (value: number) => Math.round(value * 100) / 100;

class EventQueue {
  private readonly items: SimulationEvent[] = [];

  push(event: SimulationEvent): void {
    this.items.push(event);
  }

  drainDay(day: number): SimulationEvent[] {
    const events = this.items.filter((event) => event.day === day);
    this.items.splice(0, this.items.length, ...this.items.filter((event) => event.day !== day));
    return events;
  }

  all(): SimulationEvent[] {
    return [...this.items];
  }
}

function applyDecisions(company: Company, decisions: BusinessDecision[]): Company {
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
    if (decision.type === "team_capacity_change" && decision.headcountDelta > 0) {
      for (let i = 0; i < decision.headcountDelta; i++) next.team.push({ id: `new-${decision.role}-${i}`, role: decision.role, weeklyCapacityHours: 40, supportHoursPerWeek: decision.role === "support" ? 34 : 4, engineeringHoursPerWeek: decision.role === "engineer" ? 34 : 4, interruptionCostPerTicket: decision.role === "support" ? 0.15 : 0.6 });
    }
  }
  return next;
}

export function simulate(company: Company, config: SimulationConfig): SimulationRun {
  const decisions = config.decisions ?? (config.decision ? [config.decision] : []);
  const model = applyDecisions(company, decisions);
  const rng = new SeededRandom(config.seed);
  const customers: Customer[] = [];
  const events: SimulationEvent[] = [];
  const queue = new EventQueue();
  let revenue = 0, variableCosts = 0, refunds = 0, fixedCosts = 0, supportBacklog = 0, infrastructureFailures = 0;
  let customerSequence = 0;
  const addEvent = (event: Omit<SimulationEvent, "id">) => queue.push({ ...event, id: `event-${events.length + queue.all().length + 1}` });

  for (let day = 1; day <= config.durationDays; day++) {
    const dailyFixedCost = model.fixedMonthlyCosts / 30;
    fixedCosts += dailyFixedCost;
    let dailyRevenueTotal = 0, dailyVariableCostTotal = 0, dailyUsageTotal = 0, dailyActiveCustomers = 0;
    for (const cohort of model.cohorts) {
      const arrivals = Math.floor(cohort.arrivalRatePerDay) + (rng.next() < cohort.arrivalRatePerDay % 1 ? 1 : 0);
      for (let i = 0; i < arrivals && (!config.customerTarget || customers.length < config.customerTarget); i++) {
        const customer: Customer = { id: `customer-${++customerSequence}`, cohortId: cohort.id, signupDay: day, planId: cohort.initialPlanId, usage: 0, lifetimeRevenue: 0, lifetimeCost: 0, supportTickets: 0, satisfaction: 1, status: "active" };
        customers.push(customer);
        const signupPlan = model.plans.find((item) => item.id === cohort.initialPlanId);
        addEvent({ day, type: "customer_signup", customerId: customer.id, title: `${cohort.name} joined`, description: `${cohort.name} signed up for the ${signupPlan?.name ?? cohort.initialPlanId} plan.`, revenueImpact: 0, costImpact: 0, metadata: { cohortId: cohort.id } });
      }
    }
    for (const customer of customers.filter((item) => item.status === "active")) {
      dailyActiveCustomers++;
      const cohort = model.cohorts.find((item) => item.id === customer.cohortId)!;
      const plan = model.plans.find((item) => item.id === customer.planId)!;
      const attemptedUsage = Math.max(0, Math.round(cohort.averageDailyUsage * (1 + (rng.next() - 0.5) * cohort.usageVariability * 2)));
      const limitBreached = plan.rateLimit !== null && attemptedUsage > plan.rateLimit;
      const usage = plan.rateLimit === null ? attemptedUsage : Math.min(attemptedUsage, plan.rateLimit);
      customer.usage += usage;
      const dailyRevenue = model.revenueModel === "unit_sales" ? usage * plan.monthlyPrice : plan.monthlyPrice / 30;
      const dailyCost = usage * model.variableCostPerUnit;
      revenue += dailyRevenue;
      variableCosts += dailyCost;
      dailyRevenueTotal += dailyRevenue;
      dailyVariableCostTotal += dailyCost;
      dailyUsageTotal += usage;
      customer.lifetimeRevenue += dailyRevenue;
      customer.lifetimeCost += dailyCost;
      if ((limitBreached && rng.next() < 0.0025) || (attemptedUsage > 5_000 && rng.next() < 0.01)) {
        customer.supportTickets++;
        supportBacklog++;
        customer.satisfaction -= (limitBreached ? 0.025 : 0.04) * cohort.supportSensitivity;
        addEvent({ day, type: "support_ticket", customerId: customer.id, title: "Support demand increased", description: `${cohort.name} reported a usage-limit or reliability problem.`, revenueImpact: 0, costImpact: 0, metadata: { usage, attemptedUsage, limit: plan.rateLimit } });
      }
      if (customer.supportTickets > 0 && supportBacklog > model.team.reduce((sum, member) => sum + member.supportHoursPerWeek, 0) / 4 && rng.next() < 0.05) customer.satisfaction -= 0.01 * cohort.supportSensitivity;
      const negativeUnitEconomics = model.revenueModel === "unit_sales" ? dailyRevenue < dailyCost : plan.monthlyPrice < dailyCost * 30;
      if (attemptedUsage > 4_000 && negativeUnitEconomics && rng.next() < 0.005) {
        infrastructureFailures++;
        customer.satisfaction -= 0.02 * cohort.reliabilitySensitivity;
        addEvent({ day, type: "infrastructure_incident", customerId: customer.id, title: "Cost pressure detected", description: `${cohort.name} is costing more to serve than the revenue it generates.`, revenueImpact: 0, costImpact: dailyCost, metadata: { usage, dailyCost, price: plan.monthlyPrice, revenueModel: model.revenueModel ?? "subscription" } });
      }
      if (day > customer.signupDay + 30 && customer.satisfaction < 0.55 && rng.next() < 0.08) {
        customer.status = "churned";
        addEvent({ day, type: "customer_churn", customerId: customer.id, title: "Customer churned", description: `${cohort.name} cancelled after reliability or support issues.`, revenueImpact: 0, costImpact: 0, metadata: { satisfaction: customer.satisfaction, monthlyRevenueLost: dailyRevenue * 30 } });
      }
    }
    if (dailyActiveCustomers > 0) {
      addEvent({ day, type: "product_usage", title: "Daily product activity recorded", description: `${dailyActiveCustomers.toLocaleString()} active customers used ${dailyUsageTotal.toLocaleString()} units.`, revenueImpact: dailyRevenueTotal, costImpact: 0, metadata: { activeCustomers: dailyActiveCustomers, usage: dailyUsageTotal } });
      addEvent({ day, type: "usage_cost", title: "Daily variable cost recorded", description: `Variable cost was calculated from ${dailyUsageTotal.toLocaleString()} served units.`, revenueImpact: 0, costImpact: dailyVariableCostTotal, metadata: { usage: dailyUsageTotal, unitCost: model.variableCostPerUnit } });
    }
    const dailyResolutionCapacity = model.team.reduce((sum, member) => sum + member.supportHoursPerWeek, 0) / 14;
    const resolvedCapacity = Math.floor(dailyResolutionCapacity) + (rng.next() < dailyResolutionCapacity % 1 ? 1 : 0);
    const resolved = Math.min(supportBacklog, resolvedCapacity);
    supportBacklog -= resolved;
    if (resolved > 0) addEvent({ day, type: "support_ticket_resolved", title: "Support tickets resolved", description: `${resolved} support ticket${resolved === 1 ? "" : "s"} resolved by the team.`, revenueImpact: 0, costImpact: 0, metadata: { resolved } });
    events.push(...queue.drainDay(day));
  }

  const ledger: FinancialLedger = { revenue: money(revenue), variableCosts: money(variableCosts), fixedCosts: money(fixedCosts), refunds: money(refunds), endingCash: money(model.startingCash + money(revenue) - money(variableCosts) - money(fixedCosts) - money(refunds)) };
  const activeCustomers = customers.filter((customer) => customer.status === "active").length;
  const grossProfit = money(ledger.revenue - ledger.variableCosts - ledger.refunds);
  const averageMonthlyBurn = ledger.fixedCosts / Math.max(config.durationDays / 30, 1) + ledger.variableCosts / Math.max(config.durationDays / 30, 1);
  const metrics: SimulationMetrics = { customers: customers.length, activeCustomers, churnedCustomers: customers.length - activeCustomers, revenue: ledger.revenue, variableCosts: ledger.variableCosts, fixedCosts: ledger.fixedCosts, refunds: ledger.refunds, grossProfit, grossMargin: ledger.revenue ? money(grossProfit / ledger.revenue) : 0, endingCash: ledger.endingCash, supportBacklog, infrastructureFailures, estimatedRunwayMonths: averageMonthlyBurn > 0 ? money(ledger.endingCash / averageMonthlyBurn) : 0 };
  return { id: `run-${config.seed}`, companyId: model.id, durationDays: config.durationDays, seed: config.seed, status: "completed", decisions, metrics, customers, events };
}
