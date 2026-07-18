import type { BusinessAssumption, ScenarioExplanation, SimulationEvent, SimulationMetrics, SimulationRun } from "./types.js";

export function explainScenario(run: Pick<SimulationRun, "events" | "metrics">, assumptions: BusinessAssumption[] = []): ScenarioExplanation {
  const { metrics, events } = run;
  const warnings = events.filter((event) => event.type === "infrastructure_incident" || event.type === "support_ticket");
  const infrastructureEvents = events.filter((event) => event.type === "infrastructure_incident");
  const supportEvents = events.filter((event) => event.type === "support_ticket");
  const outcome = metrics.endingCash < 0 ? "The company ran out of cash." : metrics.supportBacklog > 0 ? "The company grew beyond its support capacity." : metrics.churnedCustomers > 0 ? "The company grew with customer loss." : "The company completed the scenario without a major failure.";
  const mainCause = infrastructureEvents.length > 0 ? "Variable infrastructure usage created repeated cost pressure." : supportEvents.length > 0 ? "Support demand exceeded the team's available response capacity." : "No dominant failure cause was detected in the recorded events.";
  const highestRiskAssumption = assumptions.filter((assumption) => assumption.confidence === "low").find((assumption) => /usage|failure|support/i.test(assumption.name)) ?? assumptions.find((assumption) => assumption.confidence === "low") ?? null;
  return {
    primaryOutcome: outcome,
    mainCause,
    secondaryCauses: [
      metrics.supportBacklog > 0 ? "Support backlog remained at the end of the run." : "Support backlog did not remain at the end of the run.",
      metrics.churnedCustomers > 0 ? `${metrics.churnedCustomers} customers churned during the run.` : "No customers churned during the run."
    ],
    firstWarningSignal: warnings[0] ? { day: warnings[0].day, eventId: warnings[0].id, description: warnings[0].description } : null,
    highestRiskAssumption,
    recommendedNextScenarios: infrastructureEvents.length > 0 ? ["Replace unlimited pricing with a usage limit.", "Increase the included allowance and add overage pricing.", "Test an infrastructure-cost increase."] : ["Test a pricing change.", "Test one additional support employee.", "Test a slower market-growth scenario."],
    evidenceEventIds: warnings.slice(0, 10).map((event) => event.id),
    evidenceMetrics: { revenue: metrics.revenue, grossMargin: metrics.grossMargin, endingCash: metrics.endingCash, supportBacklog: metrics.supportBacklog, infrastructureFailures: metrics.infrastructureFailures, churnedCustomers: metrics.churnedCustomers }
  };
}
