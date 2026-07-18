import type { AssumptionReview, AssumptionValidationIssue, BusinessAssumption, AssumptionValue } from "./types.js";

const numericRange: Record<string, [number, number]> = {
  "free-paid-conversion": [0, 1],
  "refund-probability": [0, 1],
  "payment-fee-rate": [0, 1],
  "infrastructure-failure-rate": [0, 1],
  "average-usage": [0, 10_000_000],
  "customer-lifetime": [0.1, 240],
  "support-demand": [0, 100],
  "high-volume-usage": [0, 10_000_000]
};

export function validateAssumptions(assumptions: BusinessAssumption[]): AssumptionValidationIssue[] {
  const issues: AssumptionValidationIssue[] = [];
  for (const assumption of assumptions) {
    if (!assumption.editable) issues.push({ assumptionId: assumption.id, message: "Every assumption must remain editable.", severity: "error" });
    if (assumption.value === null) {
      issues.push({ assumptionId: assumption.id, message: "Provide a value before running the simulation.", severity: "error" });
      continue;
    }
    const range = numericRange[assumption.id];
    if (range && (typeof assumption.value !== "number" || assumption.value < range[0] || assumption.value > range[1])) {
      issues.push({ assumptionId: assumption.id, message: `Value must be between ${range[0]} and ${range[1]}.`, severity: "error" });
    }
  }
  return issues;
}

export function reviewAssumptions(generated: BusinessAssumption[], edits: Record<string, AssumptionValue> = {}): AssumptionReview {
  const assumptions = generated.map((assumption) => edits[assumption.id] === undefined ? assumption : { ...assumption, value: edits[assumption.id], source: "user" as const });
  const issues = validateAssumptions(assumptions);
  return { assumptions, issues, readyForSimulation: !issues.some((issue) => issue.severity === "error") };
}
