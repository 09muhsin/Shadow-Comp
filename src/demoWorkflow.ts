import { runSyntheticApiJourney } from "./api/journey.js";
import { SandboxDocuFlowClient } from "./api/client.js";
import { buildOutcomeReport, compareScenarios, forkScenario, runScenario, type Scenario } from "./simulation/experience.js";
import { docuFlow } from "./simulation/sampleCompany.js";

export async function runDemoWorkflow() {
  const base: Scenario = { id: "unlimited-19", label: "$19 unlimited", config: { durationDays: 365, seed: 7, customerTarget: 1_000 } };
  const usageLimited = forkScenario(docuFlow, base, { id: "limited-19", label: "$19 usage-limited", decision: { type: "usage_limit_change", planId: "starter", rateLimit: 2_000 } });
  const premiumLimited = forkScenario(docuFlow, base, { id: "limited-49", label: "$49 limited", decision: { type: "pricing_change", planId: "starter", monthlyPrice: 49 } });
  const scenarios = [runScenario(docuFlow, base), runScenario(docuFlow, usageLimited), runScenario(docuFlow, premiumLimited)];
  const client = new SandboxDocuFlowClient();
  const apiJourney = await runSyntheticApiJourney(scenarios[0]!.run!.customers[0]!, client, base.config.seed);
  return { scenarios, comparison: compareScenarios(docuFlow, scenarios), reports: scenarios.map((scenario) => buildOutcomeReport(scenario.run!)), apiJourney };
}
