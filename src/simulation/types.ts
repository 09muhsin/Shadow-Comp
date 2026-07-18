export type Plan = {
  id: string;
  name: string;
  monthlyPrice: number;
  includedUnits: number | null;
  overagePrice: number;
  rateLimit: number | null;
};

export type TeamMember = {
  id: string;
  role: "founder" | "engineer" | "support";
  weeklyCapacityHours: number;
  supportHoursPerWeek: number;
  engineeringHoursPerWeek: number;
  interruptionCostPerTicket: number;
};

export type CustomerCohort = {
  id: string;
  name: string;
  arrivalRatePerDay: number;
  initialPlanId: string;
  averageDailyUsage: number;
  usageVariability: number;
  priceSensitivity: number;
  supportSensitivity: number;
  reliabilitySensitivity: number;
  upgradeProbability: number;
  churnTriggers: string[];
  referralProbability: number;
};

export type Company = {
  id: string;
  name: string;
  description: string;
  startingCash: number;
  fixedMonthlyCosts: number;
  variableCostPerUnit: number;
  revenueModel?: "subscription" | "unit_sales";
  unitName?: string;
  team: TeamMember[];
  plans: Plan[];
  cohorts: CustomerCohort[];
};

export type BusinessDecision =
  | { type: "pricing_change"; planId: string; monthlyPrice: number }
  | { type: "usage_limit_change"; planId: string; rateLimit: number | null }
  | { type: "unit_cost_change"; variableCostPerUnit: number }
  | { type: "team_capacity_change"; role: TeamMember["role"]; headcountDelta: number };

export type SimulationConfig = {
  durationDays: number;
  seed: number;
  customerTarget?: number;
  decision?: BusinessDecision;
  decisions?: BusinessDecision[];
};

export type SimulationEventType =
  | "customer_signup"
  | "product_usage"
  | "usage_cost"
  | "plan_upgrade"
  | "plan_downgrade"
  | "support_ticket"
  | "support_ticket_resolved"
  | "refund"
  | "customer_churn"
  | "customer_referral"
  | "infrastructure_incident"
  | "external_market_event"
  | "team_capacity_change"
  | "pricing_change"
  | "usage_limit_change";

export type Customer = {
  id: string;
  cohortId: string;
  signupDay: number;
  planId: string;
  usage: number;
  lifetimeRevenue: number;
  lifetimeCost: number;
  supportTickets: number;
  satisfaction: number;
  status: "active" | "churned";
};

export type SimulationEvent = {
  id: string;
  day: number;
  type: SimulationEventType;
  customerId?: string;
  title: string;
  description: string;
  revenueImpact: number;
  costImpact: number;
  metadata: Record<string, unknown>;
};

export type FinancialLedger = {
  revenue: number;
  variableCosts: number;
  fixedCosts: number;
  refunds: number;
  endingCash: number;
};

export type BusinessType = "subscription_saas" | "subscription_api";

export type CompiledPlan = Plan & {
  source: "ai" | "user";
};

export type CompiledBusinessModel = {
  businessType: BusinessType;
  targetCustomers: string[];
  plans: CompiledPlan[];
  variableCostDrivers: string[];
  sourceDescription: string;
  confidence: "low" | "medium" | "high";
};

export type AssumptionValue = string | number | boolean | null;

export type BusinessAssumption = {
  id: string;
  name: string;
  value: AssumptionValue;
  unit: string;
  explanation: string;
  confidence: "low" | "medium" | "high";
  source: "ai" | "user";
  editable: true;
};

export type AssumptionValidationIssue = {
  assumptionId: string;
  message: string;
  severity: "error" | "warning";
};

export type AssumptionReview = {
  assumptions: BusinessAssumption[];
  issues: AssumptionValidationIssue[];
  readyForSimulation: boolean;
};

export type ScenarioExplanation = {
  primaryOutcome: string;
  mainCause: string;
  secondaryCauses: string[];
  firstWarningSignal: { day: number; eventId: string; description: string } | null;
  highestRiskAssumption: BusinessAssumption | null;
  recommendedNextScenarios: string[];
  evidenceEventIds: string[];
  evidenceMetrics: Partial<Pick<SimulationMetrics, "revenue" | "grossMargin" | "endingCash" | "supportBacklog" | "infrastructureFailures" | "churnedCustomers">>;
};

export type SimulationMetrics = {
  customers: number;
  activeCustomers: number;
  churnedCustomers: number;
  revenue: number;
  variableCosts: number;
  fixedCosts: number;
  refunds: number;
  grossProfit: number;
  grossMargin: number;
  endingCash: number;
  supportBacklog: number;
  infrastructureFailures: number;
  estimatedRunwayMonths: number;
};

export type SimulationRun = {
  id: string;
  companyId: string;
  durationDays: number;
  seed: number;
  status: "completed" | "failed";
  decisions: BusinessDecision[];
  metrics: SimulationMetrics;
  customers: Customer[];
  events: SimulationEvent[];
};
