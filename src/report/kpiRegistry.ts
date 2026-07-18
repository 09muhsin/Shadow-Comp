import type { DashboardCompanyInput } from "../web/dashboard.js";

export type KpiFormulaId =
  | "occupancy" | "adr" | "revpar" | "net_revpar" | "goppar"
  | "mrr" | "arr" | "gross_margin" | "logo_churn" | "net_revenue_retention" | "ltv_cac"
  | "ai_cost_per_account" | "ai_cost_share" | "task_failure_rate" | "unprofitable_account_share" | "cac_payback"
  | "average_order_value" | "unit_contribution" | "inventory_turnover" | "repeat_purchase_rate"
  | "billable_utilization" | "revenue_per_employee" | "project_margin" | "backlog_coverage"
  | "table_turnover" | "food_cost_percent" | "labor_cost_percent" | "average_check"
  | "capacity_utilization" | "yield" | "throughput" | "contribution_per_unit"
  | "take_rate" | "gross_merchandise_value" | "liquidity" | "buyer_retention"
  | "revenue_per_visit" | "provider_utilization" | "no_show_rate" | "patient_retention"
  | "noi" | "cap_rate" | "rent_per_area" | "lease_occupancy"
  | "revenue_growth" | "operating_margin" | "cash_conversion" | "customer_retention";

export type KpiDefinition = {
  id: KpiFormulaId;
  name: string;
  formula: string;
  format: "money" | "percent" | "number" | "multiple";
  requiredInputs: string[];
  whyItMatters: string;
};

export type IndustryKpiProfile = {
  category: string;
  label: string;
  source: "built_in" | "ai_proposed";
  decisionUnit: string;
  kpis: KpiDefinition[];
  instructionsForAi: string;
};

const kpi = (id: KpiFormulaId, name: string, formula: string, format: KpiDefinition["format"], requiredInputs: string[], whyItMatters: string): KpiDefinition => ({ id, name, formula, format, requiredInputs, whyItMatters });

const profiles: Record<string, Omit<IndustryKpiProfile, "source">> = {
  hospitality: {
    category: "hospitality", label: "Hotels and lodging", decisionUnit: "available and occupied room-night",
    kpis: [
      kpi("occupancy", "Occupancy", "occupied room-nights / available room-nights", "percent", ["occupied room-nights", "available room-nights"], "Shows physical inventory utilization."),
      kpi("adr", "ADR", "room revenue / occupied room-nights", "money", ["room revenue", "occupied room-nights"], "Shows realized room price."),
      kpi("revpar", "RevPAR", "room revenue / available room-nights", "money", ["room revenue", "available room-nights"], "Combines rate and occupancy."),
      kpi("net_revpar", "Net RevPAR", "(room revenue - distribution cost) / available room-nights", "money", ["room revenue", "distribution cost", "available room-nights"], "Accounts for OTA and channel economics."),
      kpi("goppar", "Operating contribution / available room", "simplified operating contribution / available room-nights", "money", ["revenue", "variable cost", "distribution cost", "fixed operating cost", "available room-nights"], "Connects capacity to operating economics before financing, tax, and capital expenditure.")
    ],
    instructionsForAi: "Use hotel terminology. Never describe guests as SaaS users, signups, plans, or churn unless loyalty attrition is explicitly defined. Capacity must constrain every room-night result."
  },
  subscription: {
    category: "subscription", label: "SaaS and subscriptions", decisionUnit: "active paying account",
    kpis: [kpi("mrr", "MRR", "sum of normalized monthly recurring revenue", "money", ["recurring subscriptions"], "Core recurring revenue run rate."), kpi("arr", "ARR", "MRR × 12", "money", ["MRR"], "Annualizes recurring run rate."), kpi("gross_margin", "Gross margin", "(revenue - cost to serve) / revenue", "percent", ["revenue", "cost to serve"], "Tests scalable delivery economics."), kpi("logo_churn", "Logo churn", "lost accounts / opening accounts", "percent", ["opening accounts", "lost accounts"], "Measures account retention."), kpi("net_revenue_retention", "Net revenue retention", "ending cohort revenue / opening cohort revenue", "percent", ["cohort revenue"], "Captures churn, contraction, and expansion."), kpi("ltv_cac", "LTV:CAC", "customer lifetime value / acquisition cost", "multiple", ["gross profit retention", "CAC"], "Tests acquisition efficiency.")],
    instructionsForAi: "Use subscription metrics only when the revenue model is genuinely recurring. Distinguish observed churn from simulated churn."
  },
  ai_subscription: {
    category: "ai_subscription", label: "AI subscriptions and agent platforms", decisionUnit: "active paying account and defined AI task unit",
    kpis: [
      kpi("mrr", "MRR", "sum of normalized monthly recurring and overage revenue", "money", ["paid accounts", "plan price", "overage revenue"], "Shows the recurring revenue run rate."),
      kpi("gross_margin", "Gross margin", "(net revenue - direct AI, tool, payment, refund, and support cost) / net revenue", "percent", ["net revenue", "direct cost by component"], "Tests delivery economics without calling contribution cash."),
      kpi("ai_cost_per_account", "AI cost per paid account", "direct AI and tool cost / active paying accounts", "money", ["model calls", "tool calls", "retries", "vendor cost", "paid accounts"], "Shows cost-to-serve at customer level."),
      kpi("ai_cost_share", "AI cost as share of revenue", "direct AI and tool cost / net revenue", "percent", ["direct AI cost", "net revenue"], "Shows exposure to usage and provider pricing."),
      kpi("unprofitable_account_share", "Loss-making account share", "accounts with negative direct contribution / paid accounts", "percent", ["account revenue", "account direct cost"], "Exposes heavy-user concentration hidden by averages."),
      kpi("task_failure_rate", "Failed-task rate", "failed or retried tasks / attempted tasks", "percent", ["attempted tasks", "failed tasks", "retries"], "Connects reliability to cost and retention."),
      kpi("logo_churn", "Paid-account churn", "lost paid accounts / opening paid accounts", "percent", ["opening paid accounts", "lost paid accounts"], "Measures paid retention."),
      kpi("net_revenue_retention", "Net revenue retention", "ending cohort recurring revenue / opening cohort recurring revenue", "percent", ["cohort recurring revenue", "expansion", "contraction", "churn"], "Captures retained revenue quality."),
      kpi("cac_payback", "CAC payback", "customer acquisition cost / monthly gross profit per new account", "number", ["CAC", "monthly gross profit per account"], "Tests whether growth can fund itself.")
    ],
    instructionsForAi: "Define the AI task unit first. Separate paid accounts from trials, account usage percentiles from averages, and observed churn from assumptions. Include provider, tool, retry, search, storage, moderation, payment, refund, and direct-support costs only when mapped."
  },
  physical_product: {
    category: "physical_product", label: "Consumer products and e-commerce", decisionUnit: "unit or order",
    kpis: [kpi("average_order_value", "Average order value", "net sales / orders", "money", ["net sales", "orders"], "Shows transaction value."), kpi("unit_contribution", "Contribution per unit", "net unit price - variable unit cost", "money", ["net price", "unit cost"], "Shows unit-level economic value."), kpi("gross_margin", "Gross margin", "gross profit / net sales", "percent", ["net sales", "cost of goods"], "Shows product economics."), kpi("inventory_turnover", "Inventory turnover", "cost of goods sold / average inventory", "multiple", ["COGS", "average inventory"], "Shows inventory productivity."), kpi("repeat_purchase_rate", "Repeat purchase rate", "repeat buyers / buyers", "percent", ["buyers", "repeat buyers"], "Shows retention without misusing SaaS churn.")],
    instructionsForAi: "Use orders, units, inventory, and repeat purchases. Do not use SaaS plan or churn language."
  },
  professional_services: {
    category: "professional_services", label: "Professional services", decisionUnit: "billable hour or engagement",
    kpis: [kpi("billable_utilization", "Billable utilization", "billable hours / available delivery hours", "percent", ["billable hours", "capacity hours"], "Shows delivery capacity use."), kpi("revenue_per_employee", "Revenue per employee", "revenue / average headcount", "money", ["revenue", "headcount"], "Shows team productivity."), kpi("project_margin", "Project margin", "project contribution / project revenue", "percent", ["project revenue", "delivery cost"], "Shows engagement quality."), kpi("backlog_coverage", "Backlog coverage", "contracted backlog / monthly delivery capacity", "multiple", ["backlog", "capacity"], "Shows forward workload.")],
    instructionsForAi: "Model constrained human delivery capacity, utilization, project mix, and pipeline."
  },
  restaurant: {
    category: "restaurant", label: "Restaurants and food service", decisionUnit: "seat, cover, or order",
    kpis: [kpi("average_check", "Average check", "net sales / covers", "money", ["net sales", "covers"], "Shows spend per guest."), kpi("table_turnover", "Table turnover", "covers / available seats", "multiple", ["covers", "seats"], "Shows capacity use."), kpi("food_cost_percent", "Food cost %", "food cost / food sales", "percent", ["food cost", "food sales"], "Controls menu economics."), kpi("labor_cost_percent", "Labor cost %", "labor cost / net sales", "percent", ["labor cost", "net sales"], "Shows staffing efficiency.")],
    instructionsForAi: "Use covers, seats, dayparts, checks, food cost, and labor; include capacity and seasonality."
  },
  manufacturing: {
    category: "manufacturing", label: "Manufacturing", decisionUnit: "production unit or machine hour",
    kpis: [kpi("capacity_utilization", "Capacity utilization", "actual output / rated capacity", "percent", ["actual output", "capacity"], "Shows production constraint use."), kpi("yield", "First-pass yield", "good units / total units", "percent", ["good units", "total units"], "Shows quality."), kpi("throughput", "Throughput", "good units / operating time", "number", ["good units", "operating time"], "Shows production rate."), kpi("contribution_per_unit", "Contribution per unit", "net price - variable manufacturing cost", "money", ["net price", "variable cost"], "Shows product economics.")],
    instructionsForAi: "Constrain output by rated capacity and model scrap, yield, downtime, and changeovers."
  },
  marketplace: {
    category: "marketplace", label: "Marketplaces", decisionUnit: "completed transaction",
    kpis: [kpi("gross_merchandise_value", "GMV", "sum of completed transaction value", "money", ["transactions"], "Shows marketplace activity."), kpi("take_rate", "Take rate", "marketplace revenue / GMV", "percent", ["revenue", "GMV"], "Shows monetization."), kpi("liquidity", "Marketplace liquidity", "fulfilled demand / qualified demand", "percent", ["demand", "fulfilled demand"], "Shows matching quality."), kpi("buyer_retention", "Buyer retention", "returning buyers / prior buyers", "percent", ["buyer cohorts"], "Shows repeat demand.")],
    instructionsForAi: "Keep buyer, seller, GMV, take rate, and liquidity distinct."
  },
  healthcare: {
    category: "healthcare", label: "Clinics and healthcare services", decisionUnit: "appointment or episode",
    kpis: [kpi("provider_utilization", "Provider utilization", "completed clinical hours / available clinical hours", "percent", ["clinical hours", "capacity"], "Shows constrained care capacity."), kpi("revenue_per_visit", "Revenue per visit", "net patient revenue / completed visits", "money", ["net revenue", "visits"], "Shows realized visit economics."), kpi("no_show_rate", "No-show rate", "no-shows / scheduled visits", "percent", ["scheduled visits", "no-shows"], "Shows lost capacity."), kpi("patient_retention", "Patient retention", "returning patients / eligible patients", "percent", ["patient cohorts"], "Shows continuity.")],
    instructionsForAi: "Do not make clinical claims. Keep operational analysis separate from medical outcomes and regulatory compliance."
  },
  real_estate: {
    category: "real_estate", label: "Income-producing real estate", decisionUnit: "rentable area or occupied unit",
    kpis: [kpi("lease_occupancy", "Lease occupancy", "occupied rentable area / available rentable area", "percent", ["occupied area", "available area"], "Shows physical utilization."), kpi("rent_per_area", "Rent per area", "rental revenue / occupied area", "money", ["rent revenue", "occupied area"], "Shows realized pricing."), kpi("noi", "NOI", "property revenue - property operating expenses", "money", ["property revenue", "operating expenses"], "Shows unlevered property operations."), kpi("cap_rate", "Capitalization rate", "annual NOI / property value", "percent", ["NOI", "property value"], "Connects income to valuation.")],
    instructionsForAi: "Separate property operations from financing, taxes, acquisitions, and capital expenditure."
  },
  logistics: {
    category: "logistics", label: "Logistics, delivery, and field operations", decisionUnit: "delivered order, route, or vehicle hour",
    kpis: [kpi("throughput", "Delivered throughput", "completed deliveries / operating time", "number", ["completed deliveries", "operating time"], "Shows usable delivery capacity."), kpi("capacity_utilization", "Fleet or route utilization", "used delivery capacity / available delivery capacity", "percent", ["used capacity", "available capacity"], "Shows whether fixed operating capacity is productive."), kpi("contribution_per_unit", "Contribution per delivery", "net delivery revenue - direct delivery cost", "money", ["net delivery revenue", "direct delivery cost", "completed deliveries"], "Shows whether each completed order supports the operation."), kpi("customer_retention", "Repeat customer retention", "returning customers / eligible prior customers", "percent", ["customer cohorts"], "Shows whether service quality supports repeat demand.")],
    instructionsForAi: "Use completed deliveries, routes, capacity, direct delivery costs, and repeat customers. Keep delivery performance separate from unverified service-level claims."
  },
  membership: {
    category: "membership", label: "Memberships, fitness, and education services", decisionUnit: "active member, class, or attendance slot",
    kpis: [kpi("customer_retention", "Member retention", "retained members / opening members", "percent", ["member cohorts"], "Shows whether members continue after the initial period."), kpi("capacity_utilization", "Class or seat utilization", "attendances / available attendance capacity", "percent", ["attendances", "available capacity"], "Shows use of fixed instructor or venue capacity."), kpi("revenue_per_visit", "Revenue per attendance", "net member revenue / completed attendances", "money", ["net member revenue", "completed attendances"], "Connects attendance to monetization."), kpi("contribution_per_unit", "Contribution per attendance", "attendance revenue - direct attendance cost", "money", ["attendance revenue", "direct attendance cost"], "Shows unit economics without treating attendance as a subscription metric.")],
    instructionsForAi: "Use members, attendance, instructor or seat capacity, and renewals. Do not claim learning, health, or clinical outcomes without supplied evidence."
  },
  general: {
    category: "general", label: "General business", decisionUnit: "verified transaction or capacity unit",
    kpis: [kpi("revenue_growth", "Revenue growth", "(current revenue - prior revenue) / prior revenue", "percent", ["current revenue", "prior revenue"], "Shows direction of scale."), kpi("gross_margin", "Gross margin", "gross profit / revenue", "percent", ["revenue", "direct cost"], "Shows delivery economics."), kpi("operating_margin", "Operating margin", "operating profit / revenue", "percent", ["revenue", "operating expenses"], "Shows operating efficiency."), kpi("cash_conversion", "Cash conversion", "operating cash flow / operating profit", "percent", ["cash flow", "operating profit"], "Shows earnings quality."), kpi("customer_retention", "Customer retention", "retained customers / opening customers", "percent", ["customer cohorts"], "Shows repeat relationship.")],
    instructionsForAi: "First define the transaction, capacity unit, and accounting boundary. Do not calculate unsupported KPIs."
  }
};

export function detectKpiCategory(input: DashboardCompanyInput): keyof typeof profiles {
  const text = `${input.industry ?? ""} ${input.description ?? ""}`.toLowerCase();
  if (/hotel|hospitality|lodg|resort|room night/.test(text)) return "hospitality";
  if (/restaurant|cafe|food service/.test(text)) return "restaurant";
  if (/\bai\b|artificial intelligence|generative|agentic|llm|model inference/.test(text) && /saas|software|subscription|api|platform|automation/.test(text)) return "ai_subscription";
  if (/saas|software|subscription|api/.test(text)) return "subscription";
  if (/marketplace|two-sided|buyers and sellers/.test(text)) return "marketplace";
  if (/manufactur|factory|production line/.test(text)) return "manufacturing";
  if (/clinic|healthcare|medical practice|dental/.test(text)) return "healthcare";
  if (/real estate|property|rental portfolio|apartments/.test(text)) return "real_estate";
  if (/logistics|delivery|courier|freight|fleet|warehous|last mile/.test(text)) return "logistics";
  if (/gym|fitness|membership|training center|course provider|education service/.test(text)) return "membership";
  if (/agency|consult|professional service|studio|advisory/.test(text)) return "professional_services";
  if (/food|beverage|retail|product|e-?commerce|consumer brand/.test(text)) return "physical_product";
  return "general";
}

export function getIndustryKpiProfile(input: DashboardCompanyInput, aiProposedIds: string[] = []): IndustryKpiProfile {
  const category = detectKpiCategory(input);
  if (category !== "general" || !aiProposedIds.length) return { ...profiles[category]!, source: "built_in" };
  const library = new Map(Object.values(profiles).flatMap((profile) => profile.kpis).map((definition) => [definition.id, definition]));
  const selected = [...new Set(aiProposedIds)].map((id) => library.get(id as KpiFormulaId)).filter((item): item is KpiDefinition => Boolean(item)).slice(0, 6);
  if (!selected.length) return { ...profiles.general!, source: "built_in" };
  return {
    category: "custom", label: `AI-proposed KPI profile for ${input.industry || "the supplied industry"}`, source: "ai_proposed", decisionUnit: input.unitName || "verified transaction or capacity unit", kpis: selected,
    instructionsForAi: "Use only these approved KPI definitions. Do not calculate a value until every required input is provided and mapped. Label the profile AI-proposed and require user review."
  };
}
