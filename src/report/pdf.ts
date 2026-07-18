import PDFDocument from "pdfkit";
import type { ReportEvidence, ReportNarrative } from "./businessReport.js";
import type { ReportQualityAssessment } from "./reportQuality.js";
import { assessEvidenceConfidence, type ReportConfidenceProfile } from "./reportConfidence.js";

const C = { ink: "#17221d", green: "#1f6b4f", mint: "#dceee5", sand: "#f4efe4", coral: "#d46a4c", gray: "#68736d", line: "#dce3de", white: "#ffffff", pale: "#f7faf8" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(value));
const compactMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);

export type BusinessReportDocument = { evidence: ReportEvidence; narrative: ReportNarrative; confidenceProfile?: ReportConfidenceProfile; qualityAssessment?: ReportQualityAssessment; provider: string; generatedAt: string };

export async function renderBusinessReportPdf(report: BusinessReportDocument): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 46, bufferPages: true, info: { Title: `${report.evidence.company.name} Decision Report`, Author: "Shadow Company", Subject: "Evidence-gated business decision report" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const X = 46, W = doc.page.width - 92, BOTTOM = 735;
  const analysis = report.evidence.industryDecisionAnalysis;
  const quality = report.qualityAssessment;
  const confidence = report.confidenceProfile ?? assessEvidenceConfidence(report.evidence);
  const currency = report.evidence.company.currency || "USD";
  const showMoney = (value: number) => {
    const magnitude = Math.abs(value);
    const increment = confidence.numberPrecision === "rounded" ? (magnitude >= 10_000 ? 1_000 : magnitude >= 1_000 ? 100 : magnitude >= 100 ? 10 : 1) : confidence.numberPrecision === "standard" ? (magnitude >= 10_000 ? 100 : 1) : 0.01;
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: confidence.numberPrecision === "specific" ? 2 : 0 }).format(Math.round(value / increment) * increment);
  };
  const showCompact = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: confidence.numberPrecision === "rounded" ? 0 : 2 }).format(value);
  const showPercent = (value: number) => `${(value * 100).toFixed(confidence.numberPrecision === "rounded" ? 0 : 1)}%`;

  const resetX = () => { doc.x = X; };
  const body = (text: string, options: { size?: number; color?: string; bold?: boolean; gap?: number } = {}) => {
    resetX(); doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(options.size ?? 9.5).fillColor(options.color ?? C.ink).text(text, X, doc.y, { width: W, lineGap: 2, paragraphGap: options.gap ?? 7 }); resetX();
  };
  const page = (numberLabel: string, title: string, subtitle?: string) => {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.green).text(numberLabel.toUpperCase(), X, 47, { width: W, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(23).fillColor(C.ink).text(title, X, 67, { width: W, lineGap: 1 });
    if (subtitle) doc.font("Helvetica").fontSize(9).fillColor(C.gray).text(subtitle, X, doc.y + 5, { width: W, lineGap: 2 });
    doc.moveTo(X, doc.y + 12).lineTo(X + 52, doc.y + 12).lineWidth(4).strokeColor(C.coral).stroke();
    doc.y += 27; resetX();
  };
  const callout = (label: string, text: string, tone: "green" | "coral" = "green") => {
    const fill = tone === "green" ? C.mint : "#fff0e9", accent = tone === "green" ? C.green : C.coral;
    const h = Math.max(70, doc.heightOfString(text, { width: W - 32, lineGap: 2 }) + 42);
    if (doc.y + h > BOTTOM) doc.addPage();
    const y = doc.y;
    doc.roundedRect(X, y, W, h, 6).fill(fill);
    doc.rect(X, y, 4, h).fill(accent);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(accent).text(label.toUpperCase(), X + 17, y + 12, { width: W - 32, lineBreak: false });
    doc.font("Helvetica").fontSize(10).fillColor(C.ink).text(text, X + 17, y + 29, { width: W - 32, lineGap: 2 });
    doc.y = y + h + 12; resetX();
  };
  const metrics = (items: Array<[string, string]>) => {
    const gap = 7, boxW = (W - gap * (items.length - 1)) / items.length, y = doc.y;
    items.forEach(([label, value], index) => {
      const x = X + index * (boxW + gap);
      doc.roundedRect(x, y, boxW, 58, 5).fill(C.sand);
      doc.font("Helvetica-Bold").fontSize(6.7).fillColor(C.gray).text(label.toUpperCase(), x + 9, y + 10, { width: boxW - 18, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(13).fillColor(C.ink).text(value, x + 9, y + 29, { width: boxW - 18, lineBreak: false });
    });
    doc.y = y + 70; resetX();
  };
  const bullets = (items: string[]) => {
    items.forEach((item) => {
      const h = doc.heightOfString(item, { width: W - 25, lineGap: 2 }) + 9;
      if (doc.y + h > BOTTOM) doc.addPage();
      const y = doc.y;
      doc.circle(X + 5, y + 6, 2.5).fill(C.green);
      doc.font("Helvetica").fontSize(9.2).fillColor(C.ink).text(item, X + 18, y, { width: W - 18, lineGap: 2 });
      doc.y = y + h; resetX();
    });
  };
  const table = (headers: string[], rows: string[][], widths: number[], fontSize = 7.7) => {
    const drawRow = (cells: string[], header: boolean) => {
      doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      const h = Math.max(25, ...cells.map((cell, i) => doc.heightOfString(cell, { width: widths[i]! - 12, lineGap: 1 }) + 12));
      if (doc.y + h > BOTTOM) { doc.addPage(); drawRow(headers, true); }
      const y = doc.y;
      let x = X;
      cells.forEach((cell, i) => {
        doc.rect(x, y, widths[i]!, h).fill(header ? C.green : C.pale).strokeColor(C.line).lineWidth(.4).stroke();
        doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).fillColor(header ? C.white : C.ink).text(cell, x + 6, y + 6, { width: widths[i]! - 12, lineGap: 1 });
        x += widths[i]!;
      });
      doc.y = y + h; resetX();
    };
    drawRow(headers, true); rows.forEach((row) => drawRow(row, false)); doc.y += 10; resetX();
  };
  const section = (label: string, title: string) => {
    if (doc.y + 55 > BOTTOM) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.green).text(label.toUpperCase(), X, doc.y, { width: W, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(16).fillColor(C.ink).text(title, X, doc.y + 12, { width: W }); doc.y += 8; resetX();
  };

  // Cover
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(C.ink);
  doc.circle(doc.page.width - 35, 75, 155).fillOpacity(.12).fill(C.mint).fillOpacity(1);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#91c9b0").text("SHADOW COMPANY  /  EVIDENCE-GATED DECISION REPORT", 54, 62, { width: 470, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(34).fillColor(C.white).text(report.evidence.company.name, 54, 165, { width: 470, lineGap: 2 });
  doc.font("Helvetica").fontSize(19).fillColor("#bdcbc4").text(analysis?.modelName ?? "Business scenario analysis", 54, doc.y + 9, { width: 470 });
  doc.rect(54, doc.y + 25, 82, 5).fill(C.coral);
  doc.font("Helvetica").fontSize(11).fillColor(C.white).text(report.evidence.company.decisionQuestion, 54, doc.y + 62, { width: 470, lineGap: 4 });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#91c9b0").text("ANALYSIS PERIOD", 54, 610, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(C.white).text(report.evidence.reportHeader.analysisPeriod, 54, 627, { width: 470 });
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#91c9b0").text("DECISION STATUS", 54, 667, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(15).fillColor(C.white).text(confidence.decisionStatus.toUpperCase(), 54, 684, { width: 470 });
  doc.font("Helvetica").fontSize(8).fillColor("#9cadA4").text(`DATE OF ANALYSIS  /  ${new Date(report.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 54, 745, { lineBreak: false });

  page("01", "Founder verdict", "This is an idea evaluation: it explains what looks risky, what to test first, and what result would make the idea stronger.");
  callout("Recommended first test", analysis?.category === "subscription" ? analysis.recommendation : confidence.allowWinner ? (analysis?.recommendation ?? report.narrative.executiveSummary) : "Validate before deciding. The evidence rating does not permit a winning scenario.", "green");
  body(report.narrative.executiveSummary);
  section("The business in plain language", "What this report is evaluating");
  body(report.narrative.businessOverview);
  if (analysis) {
    if (analysis.category === "hospitality") {
      const current = analysis.scenarios[0]!;
      metrics([["Available room-nights", number(analysis.capacity.availableUnits)], ["Baseline occupancy", showPercent(current.utilization)], ["ADR", showMoney(current.averagePrice)], ["Break-even volume decline", showPercent(analysis.breakEvenVolumeDecline)]]);
    } else {
      const current = analysis.scenarios[0]!;
      metrics([["Modeled paid accounts", number(analysis.baseline.paidAccounts)], ["Typical AI cost / account", showMoney(current.aiCostPerAccount)], ["Loss-making user groups", String(analysis.usageCohorts.filter((item) => !item.profitable).length)], ["Test retention floor", showPercent(analysis.commercialRetentionGuardrail)]]);
    }
    callout("Why no winner", analysis.rationale, "coral");
  }

  page("02", "What to verify next", "Assumptions are expected at the idea stage. These are the inputs most likely to change the recommendation.");
  const ledger = report.evidence.evidenceLedger;
  metrics([["Evidence rating", confidence.evidenceRating], ["User-provided inputs", String(ledger.userProvidedInputs.length)], ["AI-suggested inputs", String(ledger.aiSuggestedInputs.length)], ["Research sources", String(ledger.externalResearchSources.length)]]);
  callout("Why this rating", confidence.reasons.join(" ") || "The evidence rating follows the verified input and source ledger.", confidence.evidenceRating === "Evidence-Based" ? "green" : "coral");
  if (confidence.reportLength === "short") {
    const rowCount = Math.max(ledger.userProvidedInputs.length, ledger.aiSuggestedInputs.length);
    table([`User-provided inputs (${ledger.userProvidedInputs.length})`, `AI-suggested inputs (${ledger.aiSuggestedInputs.length})`], Array.from({ length: rowCount }, (_, index) => {
      const user = ledger.userProvidedInputs[index], ai = ledger.aiSuggestedInputs[index];
      return [user ? `${user.name}: ${user.value} ${user.unit}` : "", ai ? `${ai.name}: ${ai.value} ${ai.unit} / ${ai.confidence} confidence` : ""];
    }), [251.5, 251.5], 6.5);
  } else {
    section("User-provided inputs", `${ledger.userProvidedInputs.length} listed inputs`);
    table(["Input", "Value / unit"], ledger.userProvidedInputs.map((item) => [item.name, `${item.value} ${item.unit}`]), [210, 293], 7.2);
    section("AI-suggested inputs", `${ledger.aiSuggestedInputs.length} listed assumptions`);
    if (ledger.aiSuggestedInputs.length) table(["Input", "Value / unit", "Confidence"], ledger.aiSuggestedInputs.map((item) => [item.name, `${item.value} ${item.unit}`, item.confidence]), [180, 245, 78], 7.2);
    else body("None. All listed operating inputs were entered or reviewed by the user.");
  }
  section("External research", `${ledger.externalResearchSources.length} cited sources`);
  if (ledger.externalResearchSources.length) table(["Citation", "Publisher / date", "Link"], ledger.externalResearchSources.map((source) => [`[${source.id}] ${source.title}`, `${source.publisher}${source.publishedAt ? ` / ${source.publishedAt}` : ""}`, source.url]), [200, 113, 190], 6.4);
  else body("No external research source is attached. Market, competitor, trend, regulatory, and benchmark claims remain unvalidated.");
  if (analysis?.criticalDataGaps.length && confidence.reportLength !== "short") { section("Critical gaps", analysis.category === "hospitality" ? "Required before a portfolio decision" : "Required before a pricing or infrastructure decision"); bullets(analysis.criticalDataGaps); }
  else if (analysis?.criticalDataGaps.length) body(`${analysis.criticalDataGaps.length} decision-critical gaps remain; each is identified in the AI-suggested input ledger above.`, { bold: true, color: C.coral });
  section("Plain-language note", "What “operating contribution” means");
  body(analysis?.category === "subscription" ? "Modeled operating contribution equals net subscription and overage revenue less direct AI usage, retries, payment processing, refunds, and entered fixed operating cost. Acquisition spend is shown separately through CAC payback. This is not EBITDA, net income, ending cash, or a full cash-flow forecast." : "Simplified operating contribution equals modeled revenue less variable cost, distribution cost, and entered fixed operating cost. It is not EBITDA, net income, ending cash, or a full cash-flow forecast. Tax, financing, debt service, capital expenditure, working capital, acquisitions, renovations, and owner distributions are outside this model.");

  page("03", "What the numbers say", "Every value on this page covers the same modeled period. It helps compare options; it does not predict the future.");
  table(["KPI", "Required inputs", "Missing inputs", "Evidence"], report.evidence.kpiInputStatus.map((item) => [item.name, item.requiredInputs.join(", "), item.missingInputs.length ? item.missingInputs.join(", ") : "None", item.evidenceStatus]), [105, 165, 165, 68], 6.8);
  if (analysis) {
    if (confidence.reportLength !== "short") {
      section("Calculated KPI values", "Values are model outputs, not observed company performance");
      table(["KPI", "Modeled value", "Definition"], analysis.kpiDefinitions.map((item) => [item.metric, item.format === "money" ? showMoney(item.value) : item.format === "percent" ? showPercent(item.value) : number(item.value), item.definition]), [120, 95, 288], 7.2);
    }
    if (analysis.category === "hospitality") {
      section("Capacity", "Physical operating boundary");
      body(`${analysis.capacity.locations} properties x ${analysis.capacity.unitsPerLocation} rooms x ${report.evidence.simulation.durationDays} days = ${analysis.capacity.availableUnits.toLocaleString()} available room-nights. Occupied room-nights cannot exceed this amount.`);
    } else {
      section("Scale curve", "Monthly economics as paid accounts grow");
      const cases = analysis.scaleCases, chartY = doc.y + 8, chartH = 142, chartW = W - 42, chartX = X + 40;
      const maxValue = Math.max(...cases.flatMap((item) => [item.monthlyRevenue, item.monthlyAiCost, Math.max(0, item.monthlyContribution)]), 1);
      doc.moveTo(chartX, chartY).lineTo(chartX, chartY + chartH - 25).lineTo(chartX + chartW, chartY + chartH - 25).lineWidth(.7).strokeColor(C.gray).stroke();
      const point = (index: number, value: number) => ({ x: chartX + index * chartW / Math.max(1, cases.length - 1), y: chartY + chartH - 25 - Math.max(0, value) / maxValue * (chartH - 35) });
      const drawSeries = (values: number[], color: string) => { values.forEach((value, index) => { const p = point(index, value); if (index === 0) doc.moveTo(p.x, p.y); else doc.lineTo(p.x, p.y); }); doc.lineWidth(2).strokeColor(color).stroke(); values.forEach((value, index) => { const p = point(index, value); doc.circle(p.x, p.y, 2.5).fill(color); }); };
      drawSeries(cases.map((item) => item.monthlyRevenue), C.green);
      drawSeries(cases.map((item) => item.monthlyAiCost), C.coral);
      drawSeries(cases.map((item) => item.monthlyContribution), C.ink);
      cases.forEach((item, index) => { const p = point(index, 0); doc.font("Helvetica").fontSize(6.5).fillColor(C.gray).text(number(item.paidAccounts), p.x - 18, chartY + chartH - 19, { width: 36, align: "center", lineBreak: false }); });
      doc.font("Helvetica-Bold").fontSize(6.7).fillColor(C.green).text("REVENUE", chartX, chartY + chartH + 1, { lineBreak: false });
      doc.fillColor(C.coral).text("AI COST", chartX + 72, chartY + chartH + 1, { lineBreak: false });
      doc.fillColor(C.ink).text("OPERATING CONTRIBUTION", chartX + 135, chartY + chartH + 1, { lineBreak: false });
      doc.y = chartY + chartH + 24; resetX();
    }
  } else {
    table(["KPI", "Formula", "Required inputs"], report.evidence.kpiProfile.kpis.map((item) => [item.name, item.formula, item.requiredInputs.join(", ")]), [125, 180, 198], 7.5);
  }

  page("04", "Options to compare", analysis?.category === "subscription" ? "The first option is a clear allowance with a real overage fee; every option is compared over the same period." : "Operating contribution is compared on the same capacity and analysis period.");
  if (analysis) {
    if (analysis.category === "hospitality") table(["Scenario", "Condition", "Occupancy", "Revenue", "Operating contribution"], analysis.scenarios.map((s) => [s.label, s.condition, showPercent(s.utilization), showCompact(s.revenue), showCompact(s.operatingContribution)]), [112, 175, 62, 72, 82], 7.2);
    else {
      table(["Option", "Price and usage rule", "Customers retained", "Gross margin", "Money left after costs"], analysis.scenarios.map((s) => [s.label, s.includedUnits === null ? `${showMoney(s.monthlyPrice)} / unlimited` : `${showMoney(s.monthlyPrice)} / ${number(s.includedUnits)} included + ${showMoney(s.overagePrice)} per extra unit`, showPercent(s.paidVolumeRetention), showPercent(s.grossMargin), showCompact(s.operatingContribution)]), [120, 160, 73, 70, 80], 7.1);
      section("Usage distribution", "Direct economics by account cohort");
      table(["Cohort", "Share", "Monthly usage", "AI cost", "Direct contribution", "Status"], analysis.usageCohorts.map((item) => [item.name, showPercent(item.share), number(item.monthlyUsage), showMoney(item.monthlyAiCost), showMoney(item.monthlyContribution), item.profitable ? "Profitable" : "Loss-making"]), [76, 55, 88, 82, 112, 90], 7.1);
    }
    const max = Math.max(...analysis.scenarios.map((s) => Math.abs(s.operatingContribution)), 1);
    analysis.scenarios.forEach((s) => {
      const y = doc.y + 5, barW = Math.max(4, Math.abs(s.operatingContribution) / max * 275);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.ink).text(s.label, X, y, { width: 145, lineBreak: false });
      doc.roundedRect(X + 150, y, barW, 13, 3).fill(s.id === "pricing" || s.id === "price-allowance" ? C.coral : C.green);
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.ink).text(showCompact(s.operatingContribution), X + 435, y + 1, { width: 68, align: "right", lineBreak: false });
      doc.y = y + 28;
    });
  } else {
    table(["Scenario", "Revenue", "Gross margin", "Modeled contribution"], report.evidence.scenarioResults.map((s) => [s.label, showMoney(s.metrics.revenue), showPercent(s.metrics.grossMargin), showMoney(s.metrics.endingCash - report.evidence.operatingModel.startingCash)]), [190, 100, 95, 118]);
  }

  page("05", "Price test and guardrails", "A financial break-even result is not automatically a commercially healthy result.");
  if (analysis) {
    if (analysis.category === "hospitality") {
      callout("Break-even", `A 12% rate increase matches baseline operating contribution when occupied room-nights decline by approximately ${showPercent(analysis.breakEvenVolumeDecline)} under the entered cost and channel assumptions.`);
      table(["Price change", "Volume response", "Resulting occupancy", "Operating contribution", "Change vs baseline"], analysis.elasticityCases.map((item) => [showPercent(item.priceChange), showPercent(item.volumeChange), showPercent(item.utilization), showMoney(item.operatingContribution), `${item.contributionDelta >= 0 ? "+" : ""}${showMoney(item.contributionDelta)}`]), [82, 88, 92, 128, 113], 8);
    } else {
      callout("Two thresholds", `Financial break-even is ${showPercent(1 - analysis.breakEvenVolumeDecline)} paid-volume retention. That only matches the current model; it is not success. Treat ${showPercent(analysis.commercialRetentionGuardrail)} retention as the minimum commercial guardrail for the test.`);
      table(["Price change", "Paid retention", "Paid accounts", "Gross margin", "Operating contribution", "Change"], analysis.elasticityCases.map((item) => [showPercent(item.priceChange), showPercent(item.paidVolumeRetention), number(item.activeAccounts), showPercent(item.grossMargin), showCompact(item.operatingContribution), `${item.contributionDelta >= 0 ? "+" : ""}${showCompact(item.contributionDelta)}`]), [70, 86, 72, 68, 116, 91], 7.2);
      section("Technical sensitivity", "AI cost strategy at the same paid-account scale");
      table(["Delivery strategy", "Unit-cost factor", "Monthly AI cost", "Gross margin", "Monthly contribution"], analysis.technicalCases.map((item) => [item.strategy, `${number(item.unitCostFactor)}x`, showCompact(item.monthlyAiCost), showPercent(item.grossMargin), showCompact(item.monthlyContribution)]), [175, 76, 88, 72, 92], 7.2);
    }
    const cases = analysis.elasticityCases, min = Math.min(...cases.map((c) => c.contributionDelta)), max = Math.max(...cases.map((c) => c.contributionDelta)), range = Math.max(1, max - min);
    cases.forEach((item) => {
      const y = doc.y + 4, x0 = X + 150, zero = x0 + (-min / range) * 260, valueX = x0 + ((item.contributionDelta - min) / range) * 260;
      const response = "volumeChange" in item ? `${showPercent(item.volumeChange)} volume` : `${showPercent(item.paidVolumeRetention)} retained`;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.ink).text(response, X, y, { width: 130, lineBreak: false });
      doc.moveTo(x0, y + 6).lineTo(x0 + 260, y + 6).lineWidth(1).strokeColor(C.line).stroke();
      doc.moveTo(zero, y).lineTo(zero, y + 13).strokeColor(C.gray).stroke();
      doc.circle(valueX, y + 6, 4).fill(item.contributionDelta >= 0 ? C.green : C.coral);
      doc.font("Helvetica").fontSize(7.5).fillColor(C.gray).text(`${item.contributionDelta >= 0 ? "+" : ""}${showCompact(item.contributionDelta)}`, X + 425, y + 1, { width: 78, align: "right", lineBreak: false });
      doc.y = y + 27;
    });
  }

  page("06", "Customer and behavioral evidence", "Assumed, synthetic, observed, and missing behavior are labeled separately.");
  section("Intended customer", report.evidence.company.customerProfile);
  body(report.narrative.customerAnalysis);
  table(["Behavior", "Value", "Evidence type", "What it means"], report.evidence.behaviorEvidence.map((item) => [item.metric, item.value, item.evidenceType, item.explanation]), [100, 110, 110, 183], 6.8);
  if (confidence.reportLength !== "short") {
    section("Market and competitor context", "External research is context, not company performance");
    body(report.narrative.marketAnalysis);
    if (report.evidence.research?.findings.length) table(["Trend", "Business impact", "Horizon", "Evidence", "Action"], report.evidence.research.findings.slice(0, confidence.reportLength === "full" ? 8 : 5).map((item) => [`${item.finding} [${item.sourceIds.join(", ")}]`, item.implication, item.timeHorizon, item.evidenceStrength, item.requiredAction]), [132, 185, 60, 63, 63], 6.7);
    body(report.narrative.competitorAnalysis);
  } else if (report.evidence.research?.status !== "completed") callout("Research unavailable", report.evidence.research?.summary || "No web research was completed.", "coral");

  page("07", "Risks and decision controls", "A risk is useful only when it has a measurable early-warning signal and an owner.");
  table(["Business-specific risk", "Probability / impact", "Early-warning signal", "Owner"], report.narrative.risks.map((r) => [r.risk, `${r.probability} / ${r.impact}`, r.earlyWarningSignal, r.owner]), [150, 78, 200, 75], 7.1);

  page("08", "Recommended experiment", "The next decision is a controlled learning plan, not a portfolio-wide rollout.");
  report.narrative.recommendations.slice(0, 4).forEach((item, index) => {
    section(`Recommendation ${index + 1}`, item.recommendation);
    body(`Evidence: ${item.evidence}`, { size: 8.8 }); body(`Validate next: ${item.validation}`, { size: 8.8, color: C.green });
  });

  page("09", "Action plan", "Owners, timing, and measurable decision rules.");
  table(["Action", "Owner", "Timing", "Success measure"], report.narrative.actionPlan.map((a) => [a.action, a.owner, a.timeline, a.successMetric]), [190, 90, 80, 143], 7.1);

  page("10", "Methodology, limitations, and sources", "Short by design: decision evidence stays in the main report; technical detail remains here.");
  section("Limitations", "What this report cannot claim"); bullets(report.narrative.limitations);
  section("Method", "How the analysis was produced");
  body(`Inputs were organized into an industry KPI profile, calculated through ${analysis?.modelName ?? "the general scenario engine"}, and then explained by ${report.provider}. Calculated values are formatted for business use and rounded only for display. Research sources are shown separately and are not treated as company operating data.`);
  if (quality) {
    section("Comprehension check", "Questions an ordinary reader should be able to answer");
    const checks = quality.comprehensionTest.map((item) => `${item.passed ? "PASS" : "GAP"}: ${item.question} - ${item.explanation}`);
    table(["Reader check", "Reader check"], Array.from({ length: Math.ceil(checks.length / 2) }, (_, index) => [checks[index * 2] ?? "", checks[index * 2 + 1] ?? ""]), [251.5, 251.5], 6.7);
  }
  if (report.evidence.research?.sources.length) {
    section("Sources", "Clickable external references");
    report.evidence.research.sources.forEach((source) => {
      if (doc.y + 34 > BOTTOM) doc.addPage();
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.green).text(`[${source.id}] ${source.title}`, X, y, { width: W, link: source.url, underline: true });
      doc.font("Helvetica").fontSize(7.5).fillColor(C.gray).text(`${source.publisher}${source.publishedAt ? ` · ${source.publishedAt}` : ""}\n${source.url}`, X, doc.y + 2, { width: W, link: source.url });
      doc.y += 8;
    });
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (i === 0) continue;
    // Keep footer text inside PDFKit's bottom-margin boundary. Drawing below it
    // causes PDFKit to create a new page even when lineBreak is disabled.
    const fy = 770;
    doc.moveTo(X, fy - 7).lineTo(X + W, fy - 7).lineWidth(.5).strokeColor(C.line).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(C.gray).text(`${report.evidence.company.name} · Decision report`, X, fy, { width: 370, lineBreak: false });
    doc.text(`${i + 1} / ${range.count}`, X + 420, fy, { width: 83, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
