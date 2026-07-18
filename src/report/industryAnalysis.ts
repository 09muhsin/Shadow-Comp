import type { DashboardCompanyInput } from "../web/dashboard.js";

type AnalysisBase = {
  modelName: string;
  evidenceStatus: "insufficient" | "directional";
  recommendationStatus: "experiment_required" | "directional_option";
  recommendation: string;
  rationale: string;
  unitLabel: string;
  breakEvenVolumeDecline: number;
  criticalDataGaps: string[];
  assumptionSources: Record<string, "ai" | "user">;
  kpiDefinitions: Array<{ metric: string; value: number; format: "money" | "percent" | "number"; definition: string }>;
};

export type HospitalityScenario = {
  id: string; label: string; condition: string; averagePrice: number; utilization: number; volume: number; revenue: number; variableCosts: number; distributionCosts: number; fixedCosts: number; operatingContribution: number; contributionMargin: number; revenuePerAvailableUnit: number; netRevenuePerAvailableUnit: number; contributionPerAvailableUnit: number;
};

export type HospitalityDecisionAnalysis = AnalysisBase & {
  category: "hospitality";
  capacity: { locations: number; unitsPerLocation: number; totalUnits: number; availableUnits: number };
  baseline: { utilization: number; averagePrice: number; averageTransactionLength: number; cancellationRate: number; directChannelShare: number; thirdPartyFeeRate: number; priceElasticity: number };
  scenarios: HospitalityScenario[];
  elasticityCases: Array<{ priceChange: number; volumeChange: number; utilization: number; revenue: number; operatingContribution: number; contributionDelta: number }>;
};

export type SubscriptionScenario = {
  id: string;
  label: string;
  condition: string;
  monthlyPrice: number;
  includedUnits: number | null;
  overagePrice: number;
  paidVolumeRetention: number;
  activeAccounts: number;
  revenue: number;
  aiUsageCosts: number;
  paymentAndRefundCosts: number;
  directCosts: number;
  fixedCosts: number;
  grossProfit: number;
  grossMargin: number;
  operatingContribution: number;
  aiCostPerAccount: number;
  aiCostShare: number;
  capAffectedShare: number;
  unprofitableAccountShare: number;
};

export type SubscriptionDecisionAnalysis = AnalysisBase & {
  category: "subscription";
  revenueBreakEvenVolumeDecline: number;
  commercialRetentionGuardrail: number;
  baseline: {
    paidAccounts: number;
    startingPaidAccounts: number;
    averageMonthlyUsage: number;
    highVolumeMonthlyUsage: number;
    monthlyChurnRate: number;
    paidConversionRate: number;
    paymentProcessingRate: number;
    refundRate: number;
    failedTaskRate: number;
    customerAcquisitionCost: number;
    targetGrossMargin: number;
    priceElasticity: number;
  };
  scenarios: SubscriptionScenario[];
  elasticityCases: Array<{ priceChange: number; paidVolumeRetention: number; activeAccounts: number; revenue: number; grossMargin: number; operatingContribution: number; contributionDelta: number }>;
  usageCohorts: Array<{ name: string; share: number; monthlyUsage: number; monthlyRevenue: number; monthlyAiCost: number; monthlyContribution: number; contributionMargin: number; profitable: boolean }>;
  scaleCases: Array<{ paidAccounts: number; monthlyRevenue: number; monthlyAiCost: number; monthlyDirectCosts: number; monthlyContribution: number; grossMargin: number }>;
  growthTimeline: Array<{ day: number; paidAccounts: number; monthlyRevenueRunRate: number; monthlyAiCostRunRate: number; monthlyContributionRunRate: number }>;
  churnCases: Array<{ monthlyChurnRate: number; retainedAfterPeriod: number; revenueRetention: number }>;
  technicalCases: Array<{ strategy: string; unitCostFactor: number; monthlyAiCost: number; grossMargin: number; monthlyContribution: number }>;
};

export type IndustryDecisionAnalysis = HospitalityDecisionAnalysis | SubscriptionDecisionAnalysis;

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

function categoryFor(input: DashboardCompanyInput): "hospitality" | "subscription" | "other" {
  const text = `${input.industry ?? ""} ${input.description ?? ""}`;
  if (/hotel|hospitality|lodg|resort|room night|concierge/i.test(text)) return "hospitality";
  if (String(input.revenueModel ?? "subscription") === "subscription" && /ai|saas|software|platform|api|subscription|automation|cloud/i.test(text)) return "subscription";
  return "other";
}

function hotelScenario(input: { id: string; label: string; condition: string; price: number; utilization: number; availableUnits: number; variableCost: number; fixedCosts: number; directShare: number; thirdPartyFee: number }): HospitalityScenario {
  const volume = Math.min(input.availableUnits, input.availableUnits * input.utilization);
  const revenue = volume * input.price;
  const variableCosts = volume * input.variableCost;
  const distributionCosts = revenue * (1 - input.directShare) * input.thirdPartyFee;
  const operatingContribution = revenue - variableCosts - distributionCosts - input.fixedCosts;
  return { id: input.id, label: input.label, condition: input.condition, averagePrice: round(input.price), utilization: round(input.utilization), volume: round(volume), revenue: round(revenue), variableCosts: round(variableCosts), distributionCosts: round(distributionCosts), fixedCosts: round(input.fixedCosts), operatingContribution: round(operatingContribution), contributionMargin: revenue ? round(operatingContribution / revenue) : 0, revenuePerAvailableUnit: round(revenue / input.availableUnits), netRevenuePerAvailableUnit: round((revenue - distributionCosts) / input.availableUnits), contributionPerAvailableUnit: round(operatingContribution / input.availableUnits) };
}

function hospitalityAnalysis(input: DashboardCompanyInput): HospitalityDecisionAnalysis {
  const durationDays = clamp(input.durationDays, 180, 30, 730);
  const locations = Math.round(clamp(input.capacityLocations, 3, 1, 10_000));
  const unitsPerLocation = Math.round(clamp(input.capacityPerLocation, 60, 1, 10_000));
  const totalUnits = locations * unitsPerLocation;
  const availableUnits = totalUnits * durationDays;
  const utilization = clamp(input.baselineUtilization, 0.7, 0.01, 1);
  const averagePrice = clamp(input.averageSellingPrice ?? input.plans?.[0]?.monthlyPrice, 195, 1, 1_000_000);
  const averageTransactionLength = clamp(input.averageTransactionLength, 2.2, 0.1, 365);
  const cancellationRate = clamp(input.cancellationRate, 0.12, 0, 0.95);
  const directChannelShare = clamp(input.directChannelShare, 0.45, 0, 1);
  const thirdPartyFeeRate = clamp(input.thirdPartyFeeRate, 0.17, 0, 0.8);
  const priceElasticity = clamp(input.priceElasticity, 1, 0, 10);
  const variableCost = clamp(input.variableCostPerUnit, 45, 0, 1_000_000);
  const fixedCosts = clamp(input.fixedMonthlyCosts, 90_000, 0, 1_000_000_000) * durationDays / 30;
  const priceIncrease = 0.12;
  const sources = input.assumptionSources ?? {};
  const criticalFields: Array<[string, string]> = [["capacityLocations", "Actual property count"], ["capacityPerLocation", "Rooms available per property"], ["baselineUtilization", "Observed occupancy"], ["averageSellingPrice", "Observed average daily rate"], ["variableCostPerUnit", "Defined cost per occupied room-night"], ["fixedMonthlyCosts", "Complete property and central fixed costs"], ["directChannelShare", "Observed booking-channel mix"], ["thirdPartyFeeRate", "Actual OTA and third-party commissions"], ["priceElasticity", "Historical or tested booking-price elasticity"]];
  const criticalDataGaps = criticalFields.filter(([field]) => sources[field] !== "user").map(([, label]) => label);
  const evidenceStatus = criticalDataGaps.length ? "insufficient" : "directional";
  const baselineScenario = hotelScenario({ id: "current", label: "Current operating case", condition: "Observed or entered ADR and occupancy", price: averagePrice, utilization, availableUnits, variableCost, fixedCosts, directShare: directChannelShare, thirdPartyFee: thirdPartyFeeRate });
  const efficiency = hotelScenario({ id: "efficiency", label: "Room-cost efficiency", condition: "15% lower variable room cost; ADR and occupancy unchanged", price: averagePrice, utilization, availableUnits, variableCost: variableCost * 0.85, fixedCosts, directShare: directChannelShare, thirdPartyFee: thirdPartyFeeRate });
  const expectedVolumeChange = -priceIncrease * priceElasticity;
  const premium = hotelScenario({ id: "pricing", label: "12% controlled price case", condition: `${(expectedVolumeChange * 100).toFixed(1)}% occupied-room response from entered elasticity`, price: averagePrice * 1.12, utilization: utilization * (1 + expectedVolumeChange), availableUnits, variableCost, fixedCosts, directShare: directChannelShare, thirdPartyFee: thirdPartyFeeRate });
  const elasticityCases = [0, -0.05, -0.10, -0.15, -0.20].map((volumeChange) => {
    const result = hotelScenario({ id: `price-${Math.abs(volumeChange * 100)}`, label: "", condition: "", price: averagePrice * 1.12, utilization: utilization * (1 + volumeChange), availableUnits, variableCost, fixedCosts, directShare: directChannelShare, thirdPartyFee: thirdPartyFeeRate });
    return { priceChange: priceIncrease, volumeChange, utilization: result.utilization, revenue: result.revenue, operatingContribution: result.operatingContribution, contributionDelta: round(result.operatingContribution - baselineScenario.operatingContribution) };
  });
  let low = -0.8, high = 0;
  for (let iteration = 0; iteration < 50; iteration++) {
    const mid = (low + high) / 2;
    const result = hotelScenario({ id: "break-even", label: "", condition: "", price: averagePrice * 1.12, utilization: utilization * (1 + mid), availableUnits, variableCost, fixedCosts, directShare: directChannelShare, thirdPartyFee: thirdPartyFeeRate });
    if (result.operatingContribution >= baselineScenario.operatingContribution) high = mid; else low = mid;
  }
  const breakEvenVolumeDecline = Math.abs((low + high) / 2);
  return {
    category: "hospitality", modelName: "Capacity-constrained hotel operating model", evidenceStatus, recommendationStatus: evidenceStatus === "insufficient" ? "experiment_required" : "directional_option", recommendation: evidenceStatus === "insufficient" ? "Insufficient evidence to select a winning scenario. Run a controlled pricing experiment before any portfolio-wide change." : "Treat the pricing case as directional and proceed through a controlled property-level experiment.", rationale: `A 12% price increase breaks even at approximately ${(breakEvenVolumeDecline * 100).toFixed(1)}% lower occupied room-nights under the entered cost and channel mix.`, unitLabel: "room-night", capacity: { locations, unitsPerLocation, totalUnits, availableUnits }, baseline: { utilization, averagePrice, averageTransactionLength, cancellationRate, directChannelShare, thirdPartyFeeRate, priceElasticity }, breakEvenVolumeDecline: round(breakEvenVolumeDecline), scenarios: [baselineScenario, efficiency, premium], elasticityCases,
    kpiDefinitions: [{ metric: "Occupancy", value: baselineScenario.utilization, format: "percent", definition: "Occupied room-nights divided by available room-nights." }, { metric: "ADR", value: baselineScenario.averagePrice, format: "money", definition: "Average room revenue per occupied room-night." }, { metric: "RevPAR", value: baselineScenario.revenuePerAvailableUnit, format: "money", definition: "Room revenue divided by available room-nights." }, { metric: "Net RevPAR", value: baselineScenario.netRevenuePerAvailableUnit, format: "money", definition: "Room revenue after modeled distribution cost per available room-night." }, { metric: "Operating contribution / available room", value: baselineScenario.contributionPerAvailableUnit, format: "money", definition: "Simplified operating contribution before tax, financing and capital expenditure per available room-night." }],
    criticalDataGaps, assumptionSources: Object.fromEntries(criticalFields.map(([field]) => [field, sources[field] === "user" ? "user" : "ai"]))
  };
}

type UsageCohortInput = { name: string; share: number; monthlyUsage: number };

function subscriptionAnalysis(input: DashboardCompanyInput): SubscriptionDecisionAnalysis {
  const durationDays = clamp(input.durationDays, 90, 30, 730);
  const months = durationDays / 30;
  const paidAccounts = Math.round(clamp(input.customerTarget, 700, 10, 100_000));
  const startingPaidAccounts = Math.round(clamp(input.startingPaidCustomers, Math.max(1, paidAccounts * 0.25), 0, paidAccounts));
  const averageMonthlyUsage = clamp(input.averageDailyUsage, 3, 0.01, 10_000_000) * 30;
  const highVolumeMonthlyUsage = clamp(input.highVolumeDailyUsage, 10, 0.01, 100_000_000) * 30;
  const unitCost = clamp(input.variableCostPerUnit, 0.4, 0, 100_000);
  const fixedMonthlyCosts = clamp(input.fixedMonthlyCosts, 17_000, 0, 1_000_000_000);
  const monthlyChurnRate = clamp(input.monthlyChurnRate, 0.05, 0, 0.8);
  const paidConversionRate = clamp(input.paidConversionRate, 0.08, 0.001, 1);
  const paymentProcessingRate = clamp(input.paymentProcessingRate, 0.029, 0, 0.3);
  const refundRate = clamp(input.refundRate, 0.02, 0, 0.5);
  const failedTaskRate = clamp(input.failedTaskRate, 0.03, 0, 1);
  const customerAcquisitionCost = clamp(input.customerAcquisitionCost, 150, 0, 1_000_000);
  const targetGrossMargin = clamp(input.targetGrossMargin, 0.7, 0.05, 0.95);
  const priceElasticity = clamp(input.priceElasticity, 1, 0, 5);
  const plans = (input.plans ?? []).filter((item) => Number(item.monthlyPrice ?? item.price) > 0);
  const currentPlan = plans[0] ?? { name: "Current plan", monthlyPrice: 99, includedUnits: null, overagePrice: 0 };
  const currentPrice = clamp(currentPlan.monthlyPrice ?? currentPlan.price, 99, 1, 1_000_000);
  const currentIncluded = currentPlan.includedUnits ?? currentPlan.units ?? null;
  const currentOverage = clamp(currentPlan.overagePrice, 0, 0, 100_000);
  const enteredHigherPlan = plans.find((plan) => Number(plan.monthlyPrice ?? plan.price) > currentPrice);
  // A $29 to $99 jump is useful as a future tier, but not as the first experiment.
  // Start with a moderate step that gives the founder a more readable signal.
  const candidatePlan = enteredHigherPlan && Number(enteredHigherPlan.monthlyPrice ?? enteredHigherPlan.price) <= currentPrice * 1.75 ? enteredHigherPlan : undefined;
  const candidatePrice = candidatePlan ? clamp(candidatePlan.monthlyPrice ?? candidatePlan.price, currentPrice * 1.1, currentPrice, 1_000_000) : Math.ceil(Math.max(currentPrice * 1.5, currentPrice + 10) / 5) * 5;
  const usageCohortInputs: UsageCohortInput[] = [{ name: "Light", share: 0.40, monthlyUsage: averageMonthlyUsage * 0.35 }, { name: "Typical", share: 0.45, monthlyUsage: averageMonthlyUsage }, { name: "Heavy", share: 0.12, monthlyUsage: highVolumeMonthlyUsage }, { name: "Extreme", share: 0.03, monthlyUsage: highVolumeMonthlyUsage * 1.8 }];
  const averageWeightedUsage = usageCohortInputs.reduce((sum, cohort) => sum + cohort.share * cohort.monthlyUsage, 0);
  const directBudget = (price: number) => Math.max(0, price * (1 - targetGrossMargin - paymentProcessingRate - refundRate));
  const safeAllowance = Math.max(1, Math.floor(directBudget(currentPrice) / Math.max(unitCost * (1 + failedTaskRate), 0.000001)));
  const candidateAllowance = candidatePlan?.includedUnits ?? candidatePlan?.units ?? Math.max(safeAllowance, Math.floor(directBudget(candidatePrice) / Math.max(unitCost * (1 + failedTaskRate), 0.000001)));
  const candidateOverage = Math.max(clamp(candidatePlan?.overagePrice, 0, 0, 100_000), round(unitCost * (1 + failedTaskRate) / Math.max(0.05, 1 - targetGrossMargin)));

  const calculateScenario = (definition: { id: string; label: string; condition: string; price: number; includedUnits: number | null; overagePrice: number; retention: number; unitCostFactor?: number }): SubscriptionScenario => {
    const activeAccounts = paidAccounts * definition.retention;
    let revenuePerAccount = 0, aiCostPerAccount = 0, affectedShare = 0, unprofitableShare = 0;
    for (const cohort of usageCohortInputs) {
      const attempted = cohort.monthlyUsage;
      const served = definition.includedUnits === null ? attempted : Math.min(attempted, definition.includedUnits);
      const overageUnits = definition.includedUnits === null ? 0 : Math.max(0, attempted - definition.includedUnits);
      const grossRevenue = definition.price + overageUnits * definition.overagePrice;
      const netRevenue = grossRevenue * (1 - refundRate);
      const aiCost = served * unitCost * (definition.unitCostFactor ?? 1) * (1 + failedTaskRate);
      const processing = grossRevenue * paymentProcessingRate;
      revenuePerAccount += cohort.share * netRevenue;
      aiCostPerAccount += cohort.share * aiCost;
      if (definition.includedUnits !== null && attempted > definition.includedUnits) affectedShare += cohort.share;
      if (netRevenue - processing - aiCost < 0) unprofitableShare += cohort.share;
    }
    const revenue = revenuePerAccount * activeAccounts * months;
    const aiUsageCosts = aiCostPerAccount * activeAccounts * months;
    const paymentAndRefundCosts = revenuePerAccount * activeAccounts * months * paymentProcessingRate / Math.max(0.0001, 1 - refundRate);
    const directCosts = aiUsageCosts + paymentAndRefundCosts;
    const grossProfit = revenue - directCosts;
    const fixedCosts = fixedMonthlyCosts * months;
    return { id: definition.id, label: definition.label, condition: definition.condition, monthlyPrice: round(definition.price), includedUnits: definition.includedUnits === null ? null : round(definition.includedUnits), overagePrice: round(definition.overagePrice), paidVolumeRetention: round(definition.retention), activeAccounts: round(activeAccounts), revenue: round(revenue), aiUsageCosts: round(aiUsageCosts), paymentAndRefundCosts: round(paymentAndRefundCosts), directCosts: round(directCosts), fixedCosts: round(fixedCosts), grossProfit: round(grossProfit), grossMargin: revenue ? round(grossProfit / revenue) : 0, operatingContribution: round(grossProfit - fixedCosts), aiCostPerAccount: round(aiCostPerAccount), aiCostShare: revenue ? round(aiUsageCosts / revenue) : 0, capAffectedShare: round(affectedShare), unprofitableAccountShare: round(unprofitableShare) };
  };

  const current = calculateScenario({ id: "current-flat", label: `${currentPlan.name ?? "Current plan"}: ${currentPrice.toFixed(0)} monthly`, condition: currentIncluded === null ? "Current price with unlimited modeled usage" : `Current price with ${currentIncluded} included units`, price: currentPrice, includedUnits: currentIncluded, overagePrice: currentOverage, retention: 1 });
  const capAffected = usageCohortInputs.filter((cohort) => cohort.monthlyUsage > safeAllowance).reduce((sum, cohort) => sum + cohort.share, 0);
  const allowance = calculateScenario({ id: "current-allowance", label: `${currentPrice.toFixed(0)} monthly with defined allowance`, condition: `${safeAllowance} included ${input.unitName || "units"}; no modeled overage`, price: currentPrice, includedUnits: safeAllowance, overagePrice: 0, retention: Math.max(0.5, 1 - capAffected * 0.08) });
  const priceChange = candidatePrice / currentPrice - 1;
  const candidateRetention = Math.max(0.1, 1 - priceChange * priceElasticity);
  const priceAllowance = calculateScenario({ id: "price-allowance", label: `${candidatePrice.toFixed(0)} monthly with allowance and overage`, condition: `${candidateAllowance} included ${input.unitName || "units"}; ${candidateOverage.toFixed(2)} per extra unit`, price: candidatePrice, includedUnits: candidateAllowance, overagePrice: candidateOverage, retention: candidateRetention });
  const routed = calculateScenario({ id: "model-routing", label: `${currentPrice.toFixed(0)} monthly with model routing`, condition: "Current price and usage policy with 30% lower AI cost per served unit", price: currentPrice, includedUnits: currentIncluded, overagePrice: currentOverage, retention: 1, unitCostFactor: 0.7 });
  const scenarios = [current, allowance, priceAllowance, routed];

  const elasticityCases = [1, 0.9, 0.75, round(currentPrice / candidatePrice), 0.5].map((retention) => {
    const result = calculateScenario({ id: `retention-${retention}`, label: "", condition: "", price: candidatePrice, includedUnits: candidateAllowance, overagePrice: candidateOverage, retention });
    return { priceChange: round(priceChange), paidVolumeRetention: retention, activeAccounts: result.activeAccounts, revenue: result.revenue, grossMargin: result.grossMargin, operatingContribution: result.operatingContribution, contributionDelta: round(result.operatingContribution - current.operatingContribution) };
  });
  let low = 0, high = 1;
  for (let iteration = 0; iteration < 50; iteration++) {
    const retention = (low + high) / 2;
    const result = calculateScenario({ id: "break-even", label: "", condition: "", price: candidatePrice, includedUnits: candidateAllowance, overagePrice: candidateOverage, retention });
    if (result.operatingContribution >= current.operatingContribution) high = retention; else low = retention;
  }
  const breakEvenRetention = (low + high) / 2;
  const breakEvenVolumeDecline = 1 - breakEvenRetention;
  const commercialRetentionGuardrail = 0.75;

  const usageCohorts = usageCohortInputs.map((cohort) => {
    const monthlyRevenue = currentPrice * (1 - refundRate);
    const monthlyAiCost = cohort.monthlyUsage * unitCost * (1 + failedTaskRate);
    const monthlyContribution = monthlyRevenue - monthlyAiCost - currentPrice * paymentProcessingRate;
    return { name: cohort.name, share: cohort.share, monthlyUsage: round(cohort.monthlyUsage), monthlyRevenue: round(monthlyRevenue), monthlyAiCost: round(monthlyAiCost), monthlyContribution: round(monthlyContribution), contributionMargin: monthlyRevenue ? round(monthlyContribution / monthlyRevenue) : 0, profitable: monthlyContribution >= 0 };
  });
  const scaleLevels = [...new Set([100, 250, 500, 700, 1_000, 2_500, 5_000, paidAccounts])].sort((a, b) => a - b);
  const monthlyPerAccountRevenue = current.revenue / Math.max(1, current.activeAccounts * months);
  const monthlyPerAccountAiCost = current.aiUsageCosts / Math.max(1, current.activeAccounts * months);
  const monthlyPerAccountDirectCost = current.directCosts / Math.max(1, current.activeAccounts * months);
  const scaleCases = scaleLevels.map((accounts) => { const monthlyRevenue = monthlyPerAccountRevenue * accounts, monthlyAiCost = monthlyPerAccountAiCost * accounts, monthlyDirectCosts = monthlyPerAccountDirectCost * accounts, grossProfit = monthlyRevenue - monthlyDirectCosts; return { paidAccounts: accounts, monthlyRevenue: round(monthlyRevenue), monthlyAiCost: round(monthlyAiCost), monthlyDirectCosts: round(monthlyDirectCosts), monthlyContribution: round(grossProfit - fixedMonthlyCosts), grossMargin: monthlyRevenue ? round(grossProfit / monthlyRevenue) : 0 }; });
  const timelineDays = [...new Set([0, 30, 60, 90, Math.round(durationDays)].filter((day) => day <= durationDays))].sort((a, b) => a - b);
  const activeAtDay = (day: number) => { let active = startingPaidAccounts; for (let d = 1; d <= day; d++) active = Math.min(paidAccounts, active * (1 - monthlyChurnRate / 30) + clamp(input.dailyCustomerArrivals, 4, 0, 100_000)); return active; };
  const growthTimeline = timelineDays.map((day) => { const accounts = activeAtDay(day); const monthlyRevenueRunRate = monthlyPerAccountRevenue * accounts, monthlyAiCostRunRate = monthlyPerAccountAiCost * accounts, monthlyDirect = monthlyPerAccountDirectCost * accounts; return { day, paidAccounts: round(accounts), monthlyRevenueRunRate: round(monthlyRevenueRunRate), monthlyAiCostRunRate: round(monthlyAiCostRunRate), monthlyContributionRunRate: round(monthlyRevenueRunRate - monthlyDirect - fixedMonthlyCosts) }; });
  const churnCases = [0.02, 0.05, 0.10, monthlyChurnRate].filter((value, index, all) => all.indexOf(value) === index).sort((a, b) => a - b).map((churn) => ({ monthlyChurnRate: churn, retainedAfterPeriod: round((1 - churn) ** months), revenueRetention: round((1 - churn) ** months) }));
  const technicalCases = [{ strategy: "Premium model for all tasks", unitCostFactor: 1 }, { strategy: "Route simple tasks to lower-cost models", unitCostFactor: 0.75 }, { strategy: "Routing plus caching and retry controls", unitCostFactor: 0.60 }].map((item) => { const monthlyAiCost = monthlyPerAccountAiCost * paidAccounts * item.unitCostFactor, monthlyRevenue = monthlyPerAccountRevenue * paidAccounts, processing = (monthlyPerAccountDirectCost - monthlyPerAccountAiCost) * paidAccounts, grossProfit = monthlyRevenue - monthlyAiCost - processing; return { ...item, monthlyAiCost: round(monthlyAiCost), grossMargin: monthlyRevenue ? round(grossProfit / monthlyRevenue) : 0, monthlyContribution: round(grossProfit - fixedMonthlyCosts) }; });

  const sources = input.assumptionSources ?? {};
  const criticalFields: Array<[string, string]> = [["unitName", "A defined billable usage unit"], ["plans", "Observed plan price, billing period, allowance, and overage rules"], ["variableCostPerUnit", "Vendor-invoice-reconciled cost per usage unit"], ["averageDailyUsage", "Observed typical account usage"], ["highVolumeDailyUsage", "Observed high-percentile account usage"], ["monthlyChurnRate", "Observed paid-account churn"], ["paidConversionRate", "Observed visitor or trial-to-paid conversion"], ["paymentProcessingRate", "Actual payment processing cost"], ["refundRate", "Observed refund and credit rate"], ["failedTaskRate", "Observed failed and retried task rate"], ["customerAcquisitionCost", "Observed blended and channel CAC"], ["priceElasticity", "Tested paid-volume response to price"]];
  const genericUnit = !input.unitName || /^units?|usage units?$/i.test(input.unitName.trim());
  const criticalDataGaps = criticalFields.filter(([field]) => sources[field] !== "user" || (field === "unitName" && genericUnit)).map(([, label]) => label);
  const evidenceStatus = criticalDataGaps.length ? "insufficient" : "directional";
  const lossMaking = usageCohorts.filter((cohort) => !cohort.profitable).map((cohort) => cohort.name.toLowerCase());
  const recommendation = "First test a clear monthly allowance with paid overages, alongside lower-cost AI routing. Use a moderate price step before considering a major price increase.";
  const rationale = `${lossMaking.length ? `${lossMaking.join(" and ")} usage cohorts are loss-making under the current flat plan. ` : "All modeled cohorts cover direct AI cost, but observed usage is still required. "}The ${candidatePrice.toFixed(0)} test price financially matches baseline operating contribution at ${(breakEvenRetention * 100).toFixed(1)}% paid-volume retention, but a commercially healthy test should retain at least ${(commercialRetentionGuardrail * 100).toFixed(0)}%.`;
  return {
    category: "subscription", modelName: "AI subscription scaling and unit-economics model", evidenceStatus, recommendationStatus: "experiment_required", recommendation, rationale, unitLabel: input.unitName || "undefined usage unit", breakEvenVolumeDecline: round(breakEvenVolumeDecline), baseline: { paidAccounts, startingPaidAccounts, averageMonthlyUsage: round(averageMonthlyUsage), highVolumeMonthlyUsage: round(highVolumeMonthlyUsage), monthlyChurnRate, paidConversionRate, paymentProcessingRate, refundRate, failedTaskRate, customerAcquisitionCost, targetGrossMargin, priceElasticity }, scenarios, elasticityCases, usageCohorts, scaleCases, growthTimeline, churnCases, technicalCases,
    revenueBreakEvenVolumeDecline: round(1 - currentPrice / candidatePrice), commercialRetentionGuardrail,
    kpiDefinitions: [{ metric: "Monthly recurring revenue", value: round(monthlyPerAccountRevenue * paidAccounts), format: "money", definition: "Normalized monthly subscription and overage revenue at the modeled paid-account count." }, { metric: "AI cost per paid account", value: current.aiCostPerAccount, format: "money", definition: "Modeled inference and retry cost per paid account per month." }, { metric: "AI cost as share of revenue", value: current.aiCostShare, format: "percent", definition: "Modeled AI usage cost divided by net revenue." }, { metric: "Gross margin", value: current.grossMargin, format: "percent", definition: "Net revenue less AI usage and payment processing cost, divided by net revenue." }, { metric: "Loss-making account share", value: current.unprofitableAccountShare, format: "percent", definition: "Share of usage cohorts whose direct cost exceeds net plan revenue." }, { metric: "Monthly paid churn", value: monthlyChurnRate, format: "percent", definition: "Entered monthly paid-account cancellation assumption; not observed unless user-verified." }, { metric: "CAC payback", value: round(customerAcquisitionCost / Math.max(0.01, current.grossProfit / Math.max(1, current.activeAccounts * months))), format: "number", definition: "Acquisition cost divided by modeled monthly gross profit per paid account." }],
    criticalDataGaps, assumptionSources: Object.fromEntries(criticalFields.map(([field]) => [field, sources[field] === "user" ? "user" : "ai"]))
  };
}

export function buildIndustryDecisionAnalysis(input: DashboardCompanyInput): IndustryDecisionAnalysis | null {
  const category = categoryFor(input);
  if (category === "hospitality") return hospitalityAnalysis(input);
  if (category === "subscription") return subscriptionAnalysis(input);
  return null;
}
