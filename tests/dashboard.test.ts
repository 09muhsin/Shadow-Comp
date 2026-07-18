import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { buildDashboardExperience } from "../src/web/dashboard.js";
import { organizeBusinessBrief } from "../src/web/briefCompiler.js";
import { buildLocalReportNarrative, buildReportEvidence } from "../src/report/businessReport.js";

const input = {
  name: "PulseDesk",
  description: "A customer-support SaaS for independent retail teams.",
  decisionQuestion: "Which pricing policy keeps PulseDesk sustainable?",
  customerProfile: "retail teams",
  unitName: "sessions",
  startingCash: 100_000,
  fixedMonthlyCosts: 18_000,
  variableCostPerUnit: 0.015,
  averageDailyUsage: 30,
  highVolumeDailyUsage: 400,
  dailyCustomerArrivals: 2,
  supportHoursPerWeek: 18,
  customerTarget: 160,
  durationDays: 90,
  seed: 11,
  plans: [
    { name: "Free", price: 0, units: 50 },
    { name: "Core", price: 24, units: null },
    { name: "Team", price: 89, units: null }
  ]
};

describe("dashboard experience", () => {
  it("completes an unlabeled hotel description with editable hospitality assumptions", () => {
    const brief = `Cedar & Stone Hotels business report
A branded portfolio of small boutique hotels in secondary cities, offering locally inspired, individually designed rooms and personalized, reliable service below luxury-chain pricing but above budget motels. Features include consistent design standards, direct booking with loyalty points, an in-house cafe and bar, flexible cancellation, and concierge recommendations and experiences.`;
    const organized = organizeBusinessBrief(brief);

    expect(organized.name).toBe("Cedar & Stone Hotels");
    expect(organized.industry).toContain("Hospitality");
    expect(organized.revenueModel).toBe("unit_sales");
    expect(organized.unitName).toBe("room nights");
    expect(organized.plans.map((item) => item.monthlyPrice)).toEqual([145, 195, 295]);
    expect(organized.operatingModel).toEqual({ startingCash: 1_200_000, fixedMonthlyCosts: 90_000, variableCostPerUnit: 45, averageDailyUsage: 0.04, highVolumeDailyUsage: 0.15, dailyCustomerArrivals: 12, supportHoursPerWeek: 150 });
    expect(organized.simulation).toEqual({ customerTarget: 2_000, durationDays: 180, seed: 7 });
    expect(organized.suggestedFields).toEqual(expect.arrayContaining(["plans", "startingCash", "averageDailyUsage", "highVolumeDailyUsage"]));
  });

  it("organizes a written physical-product brief into the full model", () => {
    const brief = `Startup name: Harvest & Co. Development stage: Early revenue. Industry: Food and beverage, specifically packaged healthy snacks.
One sentence description: Harvest & Co. makes small batch protein rich snack bars made from whole food ingredients.
Customer profile: Health conscious professionals and parents aged twenty five to forty five.
Revenue model: One time purchase, sold in multi packs. Pricing: three dollars and fifty cents per bar, or thirty dollars for a twelve pack subscription box.
Available startup capital: seventy five thousand dollars.
Single pack at three dollars and fifty cents per bar. Twelve pack subscription box at thirty dollars per month with free shipping. Variety bundle at fifty five dollars for two twelve packs.
Fixed costs per month: twelve thousand dollars. Variable cost per unit: one dollar and dot ten cents per bar. Average usage per customer per day: zero point four. High volume usage per day: two. New customers per day: fifteen. Support capacity per week: forty.
A good starting point is one thousand synthetic customers, a duration of one hundred twenty days, and a seed value of forty two.`;
    const organized = organizeBusinessBrief(brief);

    expect(organized.name).toBe("Harvest & Co");
    expect(organized.revenueModel).toBe("unit_sales");
    expect(organized.unitName).toBe("bars");
    expect(organized.operatingModel).toMatchObject({ startingCash: 75_000, fixedMonthlyCosts: 12_000, variableCostPerUnit: 1.1, averageDailyUsage: 0.4, highVolumeDailyUsage: 2, dailyCustomerArrivals: 15, supportHoursPerWeek: 40 });
    expect(organized.simulation).toEqual({ customerTarget: 1_000, durationDays: 120, seed: 42 });
    expect(organized.plans.map((plan) => plan.monthlyPrice)).toEqual([3.5, 2.5, 2.2917]);

    const experience = buildDashboardExperience({
      name: organized.name!, description: organized.description!, decisionQuestion: organized.decisionQuestion!, customerProfile: organized.customerProfile!, revenueModel: organized.revenueModel, unitName: organized.unitName!, plans: organized.plans,
      startingCash: organized.operatingModel.startingCash!, fixedMonthlyCosts: organized.operatingModel.fixedMonthlyCosts!, variableCostPerUnit: organized.operatingModel.variableCostPerUnit!, averageDailyUsage: organized.operatingModel.averageDailyUsage!, highVolumeDailyUsage: organized.operatingModel.highVolumeDailyUsage!, dailyCustomerArrivals: organized.operatingModel.dailyCustomerArrivals!, supportHoursPerWeek: organized.operatingModel.supportHoursPerWeek!,
      customerTarget: organized.simulation.customerTarget!, durationDays: organized.simulation.durationDays!, seed: organized.simulation.seed!
    });
    expect(experience.company.revenueModel).toBe("unit_sales");
    expect(experience.scenarios.map((scenario) => scenario.id)).toEqual(["current", "efficient", "premium"]);
    expect(experience.scenarios[0]?.metrics.revenue).toBeGreaterThan(0);
  });

  it("builds three traceable futures from a custom company", () => {
    const experience = buildDashboardExperience(input);

    expect(experience.scenarios).toHaveLength(3);
    expect(experience.decision.question).toBe(input.decisionQuestion);
    expect(experience.scenarios.some((scenario) => scenario.id === experience.decision.recommendedScenarioId)).toBe(true);
    expect(experience.scenarios.every((scenario) => scenario.cashSeries.at(-1)?.cash === scenario.metrics.endingCash)).toBe(true);
    expect(experience.scenarios.every((scenario) => scenario.range.endingCash.low <= scenario.range.endingCash.high)).toBe(true);
    expect(JSON.stringify(experience.scenarios)).not.toMatch(/document import|DocuFlow|processed pages/i);
    expect(experience.assumptions.every((assumption) => assumption.editable)).toBe(true);
  });

  it("replays the same metrics with the same model and seed", () => {
    const first = buildDashboardExperience(input);
    const second = buildDashboardExperience(input);

    expect(second.scenarios.map((scenario) => scenario.metrics)).toEqual(first.scenarios.map((scenario) => scenario.metrics));
    expect(second.decision).toEqual(first.decision);
  });

  it("renders the landing-to-report flow with a PDF handoff", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    const script = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
    const experience = buildDashboardExperience({ ...input, name: "DocuFlow", customerTarget: 80, durationDays: 60 });
    const evidence = buildReportEvidence({ ...input, name: "DocuFlow", customerTarget: 80, durationDays: 60 }, experience);
    const narrative = buildLocalReportNarrative(evidence);
    const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only", pretendToBeVisual: true });
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", { value() {} });
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", { value() { this.setAttribute("open", ""); } });
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", { value() { this.removeAttribute("open"); } });
    Object.defineProperty(dom.window, "fetch", { value: vi.fn(async () => new Response(JSON.stringify({ ok: true, provider: "local-report-writer", pdfUrl: "/api/reports/test.pdf", report: { evidence, narrative, provider: "local-report-writer", generatedAt: new Date().toISOString() } }), { status: 200, headers: { "Content-Type": "application/json" } })) });

    dom.window.eval(script);
    expect(dom.window.document.querySelector("#landing-screen")?.hasAttribute("hidden")).toBe(false);
    (dom.window.document.querySelector("#landing-demo") as HTMLButtonElement).click();

    await vi.waitFor(() => expect(dom.window.document.querySelector("#report-preview")?.hasAttribute("hidden")).toBe(false));
    expect(dom.window.document.querySelectorAll(".scenario-report")).toHaveLength(4);
    expect(dom.window.document.querySelector("#executive-heading")?.textContent).toMatch(/validate before deciding/i);
    expect(dom.window.document.querySelector("#scale-analysis")?.hasAttribute("hidden")).toBe(false);
    expect(dom.window.document.querySelectorAll(".recommendation-item").length).toBeGreaterThan(1);
    expect((dom.window.document.querySelector("#download-pdf") as HTMLAnchorElement).href).toContain("/api/reports/test.pdf");
  });

  it("accepts ordinary whole-number usage values without a 0.0001 offset", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    const dom = new JSDOM(html);
    const average = dom.window.document.querySelector('input[name="averageDailyUsage"]') as HTMLInputElement;
    const high = dom.window.document.querySelector('input[name="highVolumeDailyUsage"]') as HTMLInputElement;
    average.value = "3";
    high.value = "10";
    expect(average.checkValidity()).toBe(true);
    expect(high.checkValidity()).toBe(true);
  });

  it("offers contextual inputs before report generation", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    const dom = new JSDOM(html);
    expect(dom.window.document.querySelector('input[name="geography"]')).not.toBeNull();
    expect(dom.window.document.querySelector('select[name="currency"]')).not.toBeNull();
    expect(dom.window.document.querySelector('input[name="dataAsOf"]')).not.toBeNull();
    expect(dom.window.document.querySelector("#download-data")).not.toBeNull();
    expect(dom.window.document.querySelector('.report-nav a[href="#risks"]')?.textContent).toMatch(/risk register/i);
  });

  it("organizes a pasted brief into visible editable form fields", async () => {
    const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
    const script = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
    const brief = "Startup name: Harvest & Co. Industry: Food and beverage. One sentence description: Whole food snack bars. Revenue model: One time purchase. Fixed costs per month: twelve thousand dollars. Variable cost per unit: one dollar and dot ten cents per bar. Average usage per customer per day: zero point four. High volume usage per day: two. New customers per day: fifteen. Support capacity per week: forty. One thousand synthetic customers, a duration of one hundred twenty days, and a seed value of forty two.";
    const organized = organizeBusinessBrief(brief);
    const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only" });
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "showModal", { value() { this.setAttribute("open", ""); } });
    Object.defineProperty(dom.window.HTMLDialogElement.prototype, "close", { value() { this.removeAttribute("open"); } });
    Object.defineProperty(dom.window, "fetch", { value: vi.fn(async (url: string) => {
      const data = String(url).endsWith("/api/status") ? { ok: true, aiProvider: "local" } : { configured: true, provider: "local-compiler", model: "Deterministic local compiler", modelOutput: organized };
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    }) });

    dom.window.eval(script);
    (dom.window.document.querySelector("#landing-create") as HTMLButtonElement).click();
    const form = dom.window.document.querySelector("#company-form") as HTMLFormElement;
    (form.elements.namedItem("businessBrief") as HTMLTextAreaElement).value = brief;
    (dom.window.document.querySelector("#ai-compile") as HTMLButtonElement).click();

    await vi.waitFor(() => expect((form.elements.namedItem("name") as HTMLInputElement).value).toBe("Harvest & Co"));
    expect((form.elements.namedItem("revenueModel") as HTMLSelectElement).value).toBe("unit_sales");
    expect((form.elements.namedItem("fixedMonthlyCosts") as HTMLInputElement).value).toBe("12000");
    expect((form.elements.namedItem("variableCostPerUnit") as HTMLInputElement).value).toBe("1.1");
    expect((form.elements.namedItem("averageDailyUsage") as HTMLInputElement).value).toBe("0.4");
    expect(dom.window.document.querySelector("#ai-status")?.textContent).toContain("complete form was organized");
  });
});
