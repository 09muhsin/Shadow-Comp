import type { Company } from "./types.js";

export const docuFlow: Company = {
  id: "docuflow",
  name: "DocuFlow",
  description: "An AI document-processing API that turns uploaded documents into structured JSON.",
  startingCash: 125_000,
  fixedMonthlyCosts: 28_000,
  variableCostPerUnit: 0.006,
  team: [
    { id: "founder", role: "founder", weeklyCapacityHours: 45, supportHoursPerWeek: 8, engineeringHoursPerWeek: 25, interruptionCostPerTicket: 0.4 },
    { id: "engineer-1", role: "engineer", weeklyCapacityHours: 40, supportHoursPerWeek: 3, engineeringHoursPerWeek: 34, interruptionCostPerTicket: 0.7 },
    { id: "engineer-2", role: "engineer", weeklyCapacityHours: 40, supportHoursPerWeek: 3, engineeringHoursPerWeek: 34, interruptionCostPerTicket: 0.7 }
  ],
  plans: [
    { id: "free", name: "Free", monthlyPrice: 0, includedUnits: 1_000, overagePrice: 0, rateLimit: 1_000 },
    { id: "starter", name: "Starter", monthlyPrice: 19, includedUnits: null, overagePrice: 0, rateLimit: null },
    { id: "business", name: "Business", monthlyPrice: 79, includedUnits: null, overagePrice: 0, rateLimit: null }
  ],
  cohorts: [
    { id: "free-explorer", name: "Free explorers", arrivalRatePerDay: 1.4, initialPlanId: "free", averageDailyUsage: 55, usageVariability: 0.35, priceSensitivity: 0.95, supportSensitivity: 0.65, reliabilitySensitivity: 0.55, upgradeProbability: 0.002, churnTriggers: ["repeated_failures"], referralProbability: 0.015 },
    { id: "indie-dev", name: "Independent developers", arrivalRatePerDay: 1.0, initialPlanId: "starter", averageDailyUsage: 420, usageVariability: 0.45, priceSensitivity: 0.7, supportSensitivity: 0.6, reliabilitySensitivity: 0.7, upgradeProbability: 0.004, churnTriggers: ["rate_limit", "slow_support"], referralProbability: 0.02 },
    { id: "small-agency", name: "Small agencies", arrivalRatePerDay: 0.9, initialPlanId: "starter", averageDailyUsage: 1_200, usageVariability: 0.5, priceSensitivity: 0.5, supportSensitivity: 0.75, reliabilitySensitivity: 0.8, upgradeProbability: 0.006, churnTriggers: ["rate_limit", "slow_support"], referralProbability: 0.025 },
    { id: "high-volume", name: "High-volume automation users", arrivalRatePerDay: 0.7, initialPlanId: "starter", averageDailyUsage: 8_500, usageVariability: 0.65, priceSensitivity: 0.25, supportSensitivity: 0.85, reliabilitySensitivity: 0.9, upgradeProbability: 0.01, churnTriggers: ["rate_limit", "failed_import"], referralProbability: 0.03 },
    { id: "enterprise-evaluator", name: "Enterprise evaluators", arrivalRatePerDay: 0.5, initialPlanId: "business", averageDailyUsage: 3_500, usageVariability: 0.4, priceSensitivity: 0.2, supportSensitivity: 0.9, reliabilitySensitivity: 0.95, upgradeProbability: 0.012, churnTriggers: ["outage", "slow_support"], referralProbability: 0.035 }
  ]
};
