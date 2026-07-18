import { createServer } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboardExperience } from "../dist/web/dashboard.js";
import { completeBusinessBrief, organizeBusinessBrief } from "../dist/web/briefCompiler.js";
import { buildLocalReportNarrative, buildReportEvidence } from "../dist/report/businessReport.js";
import { renderBusinessReportPdf } from "../dist/report/pdf.js";
import { assessReportQuality } from "../dist/report/reportQuality.js";
import { assessEvidenceConfidence, enforceConfidenceRules } from "../dist/report/reportConfidence.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const webRoot = join(projectRoot, "web");
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const reports = new Map();
const requestBuckets = new Map();
const MAX_CACHED_REPORTS = Number(process.env.MAX_CACHED_REPORTS || 50);
const MAX_CONCURRENT_REPORTS = Number(process.env.MAX_CONCURRENT_REPORTS || 2);
let activeReportJobs = 0;
const apiKey = process.env.APP_API_KEY;
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const reportBucket = process.env.SUPABASE_REPORT_BUCKET || "shadow-company-reports";
const reportTable = process.env.SUPABASE_REPORT_TABLE || "generated_reports";
const adminUsername = process.env.ADMIN_USERNAME || "";
const adminPassword = process.env.ADMIN_PASSWORD || "";
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'"
};
const researchOutputSchema = {
  type: "object", additionalProperties: false, required: ["summary", "findings", "sources", "limitations", "recommendedKpiIds"],
  properties: {
    summary: { type: "string" },
    findings: { type: "array", minItems: 3, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["category", "finding", "implication", "timeHorizon", "evidenceStrength", "requiredAction", "sourceUrls"], properties: { category: { type: "string", enum: ["market", "customer", "competitor", "pricing", "operations", "risk"] }, finding: { type: "string" }, implication: { type: "string" }, timeHorizon: { type: "string", enum: ["Short", "Medium", "Long"] }, evidenceStrength: { type: "string", enum: ["Low", "Medium", "High"] }, requiredAction: { type: "string", enum: ["Test", "Invest", "Monitor", "Avoid"] }, sourceUrls: { type: "array", items: { type: "string" } } } } },
    sources: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["title", "url", "publisher", "publishedAt"], properties: { title: { type: "string" }, url: { type: "string" }, publisher: { type: "string" }, publishedAt: { type: ["string", "null"] } } } },
    limitations: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
    recommendedKpiIds: { type: "array", maxItems: 6, items: { type: "string", enum: ["occupancy", "adr", "revpar", "net_revpar", "goppar", "mrr", "arr", "gross_margin", "logo_churn", "net_revenue_retention", "ltv_cac", "ai_cost_per_account", "ai_cost_share", "task_failure_rate", "unprofitable_account_share", "cac_payback", "average_order_value", "unit_contribution", "inventory_turnover", "repeat_purchase_rate", "billable_utilization", "revenue_per_employee", "project_margin", "backlog_coverage", "table_turnover", "food_cost_percent", "labor_cost_percent", "average_check", "capacity_utilization", "yield", "throughput", "contribution_per_unit", "take_rate", "gross_merchandise_value", "liquidity", "buyer_retention", "revenue_per_visit", "provider_utilization", "no_show_rate", "patient_retention", "noi", "cap_rate", "rent_per_area", "lease_occupancy", "revenue_growth", "operating_margin", "cash_conversion", "customer_retention"] } }
  }
};
const reportNarrativeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["executiveSummary", "businessOverview", "problemAndMarketNeed", "productAnalysis", "marketAnalysis", "customerAnalysis", "competitorAnalysis", "businessModelAnalysis", "salesAndMarketingAnalysis", "operationalAnalysis", "financialAnalysis", "keyFindings", "recommendations", "risks", "actionPlan", "limitations"],
  properties: {
    executiveSummary: { type: "string" }, businessOverview: { type: "string" }, problemAndMarketNeed: { type: "string" }, productAnalysis: { type: "string" }, marketAnalysis: { type: "string" }, customerAnalysis: { type: "string" }, competitorAnalysis: { type: "string" }, businessModelAnalysis: { type: "string" }, salesAndMarketingAnalysis: { type: "string" }, operationalAnalysis: { type: "string" }, financialAnalysis: { type: "string" },
    keyFindings: { type: "array", minItems: 3, maxItems: 7, items: { type: "string" } },
    recommendations: { type: "array", minItems: 2, maxItems: 5, items: { type: "object", additionalProperties: false, required: ["recommendation", "evidence", "validation"], properties: { recommendation: { type: "string" }, evidence: { type: "string" }, validation: { type: "string" } } } },
    risks: { type: "array", minItems: 3, maxItems: 7, items: { type: "object", additionalProperties: false, required: ["risk", "probability", "impact", "earlyWarningSignal", "mitigation", "owner", "reviewDate", "stopCondition"], properties: { risk: { type: "string" }, probability: { type: "string", enum: ["Low", "Medium", "High"] }, impact: { type: "string", enum: ["Low", "Medium", "High"] }, earlyWarningSignal: { type: "string" }, mitigation: { type: "string" }, owner: { type: "string" }, reviewDate: { type: "string" }, stopCondition: { type: "string" } } } },
    actionPlan: { type: "array", minItems: 3, maxItems: 6, items: { type: "object", additionalProperties: false, required: ["action", "owner", "timeline", "successMetric", "dependency", "decisionAfter"], properties: { action: { type: "string" }, owner: { type: "string" }, timeline: { type: "string" }, successMetric: { type: "string" }, dependency: { type: "string" }, decisionAfter: { type: "string" } } } },
    limitations: { type: "array", minItems: 4, maxItems: 8, items: { type: "string" } }
  }
};
const businessModelSchema = {
  type: "object",
  additionalProperties: false,
  required: ["businessType", "name", "industry", "developmentStage", "description", "decisionQuestion", "customerProfile", "revenueModel", "unitName", "targetCustomers", "plans", "operatingModel", "simulation", "variableCostDrivers"],
  properties: {
    businessType: { type: "string", enum: ["subscription_api", "subscription_saas"] },
    name: { type: ["string", "null"] },
    industry: { type: ["string", "null"] },
    developmentStage: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    decisionQuestion: { type: ["string", "null"] },
    customerProfile: { type: ["string", "null"] },
    revenueModel: { type: "string", enum: ["subscription", "unit_sales"] },
    unitName: { type: ["string", "null"] },
    targetCustomers: { type: "array", items: { type: "string" } },
    plans: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["id", "name", "monthlyPrice", "includedUnits", "overagePrice", "rateLimit"], properties: { id: { type: "string" }, name: { type: "string" }, monthlyPrice: { type: "number" }, includedUnits: { type: ["number", "null"] }, overagePrice: { type: "number" }, rateLimit: { type: ["number", "null"] } } } },
    operatingModel: { type: "object", additionalProperties: false, required: ["startingCash", "fixedMonthlyCosts", "variableCostPerUnit", "averageDailyUsage", "highVolumeDailyUsage", "dailyCustomerArrivals", "supportHoursPerWeek"], properties: { startingCash: { type: ["number", "null"] }, fixedMonthlyCosts: { type: ["number", "null"] }, variableCostPerUnit: { type: ["number", "null"] }, averageDailyUsage: { type: ["number", "null"] }, highVolumeDailyUsage: { type: ["number", "null"] }, dailyCustomerArrivals: { type: ["number", "null"] }, supportHoursPerWeek: { type: ["number", "null"] } } },
    simulation: { type: "object", additionalProperties: false, required: ["customerTarget", "durationDays", "seed"], properties: { customerTarget: { type: ["number", "null"] }, durationDays: { type: ["number", "null"] }, seed: { type: ["number", "null"] } } },
    variableCostDrivers: { type: "array", items: { type: "string" } }
  }
};

function sendJson(response, status, data) {
  response.writeHead(status, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function audit(event, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

function requestIp(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function allowRequest(request, response, limit = 20, windowMs = 60_000) {
  const key = `${requestIp(request)}:${request.method}:${new URL(request.url || "/", "http://localhost").pathname}`;
  const now = Date.now();
  const bucket = requestBuckets.get(key) || { startedAt: now, count: 0 };
  if (now - bucket.startedAt >= windowMs) { bucket.startedAt = now; bucket.count = 0; }
  bucket.count++;
  requestBuckets.set(key, bucket);
  if (bucket.count <= limit) return true;
  response.writeHead(429, { ...securityHeaders, "Content-Type": "application/json; charset=utf-8", "Retry-After": String(Math.ceil((windowMs - (now - bucket.startedAt)) / 1000)) });
  response.end(JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }));
  audit("rate_limited", { ip: requestIp(request), path: key.split(":").slice(-1)[0] });
  return false;
}

function authorized(request) {
  if (!apiKey) return true;
  return request.headers.authorization === `Bearer ${apiKey}`;
}

function assertCompanyInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A company input object is required.");
  const strings = ["name", "description", "decisionQuestion", "industry", "customerProfile", "unitName", "geography", "currency", "dataAsOf"];
  for (const field of strings) if (input[field] !== undefined && (typeof input[field] !== "string" || input[field].length > 20_000)) throw new Error(`Invalid ${field} value.`);
  if (input.plans !== undefined && (!Array.isArray(input.plans) || input.plans.length > 4)) throw new Error("Provide between one and four pricing plans.");
}

function pruneReports() {
  const now = Date.now();
  for (const [id, cached] of reports) if (cached.expiresAt < now) reports.delete(id);
  while (reports.size >= MAX_CACHED_REPORTS) reports.delete(reports.keys().next().value);
}

const persistenceEnabled = () => Boolean(supabaseUrl && supabaseServiceKey);
const adminEnabled = () => Boolean(adminUsername && adminPassword && persistenceEnabled());
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);

async function supabaseRequest(path, options = {}) {
  if (!persistenceEnabled()) throw new Error("Persistent report storage is not configured.");
  const response = await fetch(`${supabaseUrl}${path}`, { ...options, headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}).`);
  return response;
}

async function persistReport(reportId, report, pdf, filename) {
  if (!persistenceEnabled()) return false;
  const storagePath = `${reportId}.pdf`;
  try {
    await supabaseRequest(`/storage/v1/object/${encodeURIComponent(reportBucket)}/${storagePath}`, { method: "POST", headers: { "Content-Type": "application/pdf", "x-upsert": "false" }, body: pdf });
    await supabaseRequest(`/rest/v1/${encodeURIComponent(reportTable)}`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ id: reportId, company_name: report.evidence.company.name, decision_status: report.confidenceProfile.decisionStatus, evidence_rating: report.confidenceProfile.evidenceRating, quality_score: report.qualityAssessment.totalScore, provider: report.provider, filename, storage_path: storagePath, created_at: report.generatedAt }) });
    audit("report_persisted", { reportId, provider: report.provider });
    return true;
  } catch (error) {
    audit("report_persistence_failed", { reportId, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function persistedReport(recordId) {
  const query = new URLSearchParams({ select: "id,storage_path,filename", id: `eq.${recordId}`, limit: "1" });
  const response = await supabaseRequest(`/rest/v1/${encodeURIComponent(reportTable)}?${query}`);
  const rows = await response.json();
  return rows[0] || null;
}

async function readPersistedPdf(recordId) {
  const record = await persistedReport(recordId);
  if (!record?.storage_path) return null;
  const response = await supabaseRequest(`/storage/v1/object/${encodeURIComponent(reportBucket)}/${record.storage_path}`);
  return { pdf: Buffer.from(await response.arrayBuffer()), filename: record.filename || "business-report.pdf" };
}

function hasAdminAccess(request) {
  if (!adminEnabled()) return false;
  const header = String(request.headers.authorization || "");
  if (!header.startsWith("Basic ")) return false;
  try {
    const received = Buffer.from(header.slice(6), "base64").toString("utf8");
    const expected = `${adminUsername}:${adminPassword}`;
    return Buffer.byteLength(received) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch { return false; }
}

function requestAdminAccess(response) {
  response.writeHead(401, { ...securityHeaders, "WWW-Authenticate": 'Basic realm="Shadow Company admin", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" });
  response.end("Admin authentication required.");
}

async function renderAdminReports(response) {
  const query = new URLSearchParams({ select: "id,company_name,decision_status,evidence_rating,quality_score,provider,filename,created_at", order: "created_at.desc", limit: "200" });
  const records = await (await supabaseRequest(`/rest/v1/${encodeURIComponent(reportTable)}?${query}`)).json();
  const rows = records.map((report) => `<tr><td>${escapeHtml(report.company_name)}</td><td>${escapeHtml(report.decision_status)}</td><td>${escapeHtml(report.evidence_rating)}</td><td>${escapeHtml(report.quality_score)}</td><td>${escapeHtml(new Date(report.created_at).toLocaleString("en-US"))}</td><td><a href="/admin/reports/${encodeURIComponent(report.id)}.pdf">Open PDF</a></td></tr>`).join("") || '<tr><td colspan="6">No saved reports yet.</td></tr>';
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shadow Company · Reports</title><style>body{font:16px system-ui;margin:40px;background:#f7faf8;color:#17221d}main{max-width:1100px;margin:auto}table{width:100%;border-collapse:collapse;background:white}th,td{padding:13px;border-bottom:1px solid #dce3de;text-align:left}th{background:#17221d;color:white}a{color:#1f6b4f;font-weight:700}</style><main><h1>Generated reports</h1><p>Private administrator view · ${records.length} saved report${records.length === 1 ? "" : "s"}</p><table><thead><tr><th>Company</th><th>Status</th><th>Evidence</th><th>Score</th><th>Generated</th><th>PDF</th></tr></thead><tbody>${rows}</tbody></table></main></html>`;
  response.writeHead(200, { ...securityHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(html);
}

const researchRules = `Research the current industry context relevant to this business and decision.
- Search the web; do not answer from memory alone.
- Prioritize primary sources, government statistics, established industry bodies, company filings, and dated reputable research.
- Research industry KPIs, recent operating trends, pricing behavior, customer behavior, channel economics, capacity constraints, and material risks.
- For AI and subscription businesses, also research dated competitor pricing and allowances, usage-based or credit pricing, model-provider cost trends, routing/caching practices, vendor dependence, privacy, copyright, security, and regulatory risks.
- Never claim that an industry benchmark is actual company performance.
- Never invent a competitor, price, market size, source, date, or geography.
- If geography is missing, say that local market conclusions cannot be made.
- Every factual finding must list the URLs that support it. Keep implications conditional and decision-focused.
- Do not use search snippets as sufficient evidence when a source page can be opened.
- Recommend up to 6 KPI formula IDs from the allowed schema that best fit the industry. These are suggestions only; do not calculate their values.
- For every trend, classify the time horizon, evidence strength, and required action using only the allowed values.
- Return no more than 6 high-quality findings and 8 sources. Finish promptly; this is focused decision research, not an exhaustive literature review.`;

function withTimeout(promise, milliseconds, message) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds))]);
}

function normalizeResearch(raw, provider, query, actualSources = []) {
  const allSources = [...actualSources, ...(raw.sources || [])].filter((item) => /^https?:\/\//i.test(String(item.url || "")));
  const unique = [...new Map(allSources.map((item) => [item.url, item])).values()].slice(0, 20).map((item, index) => ({ id: `S${index + 1}`, title: String(item.title || item.url), url: String(item.url), publisher: String(item.publisher || (() => { try { return new URL(item.url).hostname; } catch { return "Source"; } })()), publishedAt: item.publishedAt ? String(item.publishedAt) : null }));
  const idByUrl = new Map(unique.map((item) => [item.url, item.id]));
  const findings = (raw.findings || []).map((item) => ({ category: item.category, finding: String(item.finding || ""), implication: String(item.implication || ""), timeHorizon: item.timeHorizon, evidenceStrength: item.evidenceStrength, requiredAction: item.requiredAction, sourceIds: (item.sourceUrls || []).map((url) => idByUrl.get(url)).filter(Boolean) })).filter((item) => item.finding && item.sourceIds.length);
  return { status: findings.length ? "completed" : "unavailable", searchedAt: new Date().toISOString(), query, summary: findings.length ? String(raw.summary || "") : "Research ran but returned no findings with verifiable source URLs.", findings, sources: unique, limitations: [...(raw.limitations || []), `Research provider: ${provider}. External sources provide context and are not company operating data.`], recommendedKpiIds: raw.recommendedKpiIds || [] };
}

async function researchWithOpenAI(companyInput) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_RESEARCH_MODEL || process.env.OPENAI_MODEL || "gpt-5.6";
  const geography = companyInput.geography ? ` in ${companyInput.geography}` : "";
  const query = `${companyInput.name || "Business"}: ${companyInput.industry || "industry"}${geography} trends, benchmarks, KPIs, pricing, capacity, channels, and risks relevant to ${companyInput.decisionQuestion || "the stated decision"}`;
  const apiResponse = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, reasoning: { effort: "high" }, tools: [{ type: "web_search", search_context_size: "high" }], tool_choice: "required", include: ["web_search_call.action.sources"], input: [{ role: "developer", content: researchRules }, { role: "user", content: `${query}\n\nBUSINESS DESCRIPTION:\n${companyInput.description || "Not provided"}` }], text: { format: { type: "json_schema", name: "industry_research", strict: true, schema: researchOutputSchema } }, store: false }) });
  const result = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(result.error?.message || `Research request failed with status ${apiResponse.status}.`);
  const outputText = result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("Research returned no structured output.");
  const actualSources = result.output?.filter((item) => item.type === "web_search_call").flatMap((item) => item.action?.sources || []).map((item) => ({ title: item.title, url: item.url, publisher: item.publisher, publishedAt: item.published_at })) || [];
  return normalizeResearch(JSON.parse(outputText), "OpenAI web search", query, actualSources);
}

async function researchWithCodex(companyInput) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !process.env.CODEX_API_KEY) throw new Error("Public Codex mode requires CODEX_API_KEY. Local Codex-account mode is restricted to localhost.");
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex(process.env.CODEX_API_KEY ? { apiKey: process.env.CODEX_API_KEY } : undefined);
  const geography = companyInput.geography ? ` in ${companyInput.geography}` : "";
  const query = `${companyInput.name || "Business"}: ${companyInput.industry || "industry"}${geography} trends, benchmarks, KPIs, pricing, capacity, channels, and risks relevant to ${companyInput.decisionQuestion || "the stated decision"}`;
  const thread = codex.startThread({ workingDirectory: projectRoot, skipGitRepoCheck: true, sandboxMode: "read-only", approvalPolicy: "never", networkAccessEnabled: true, webSearchMode: "live", modelReasoningEffort: "medium" });
  const result = await thread.run(`${researchRules}\nDo not inspect or change local files and do not run shell commands.\n\nQUERY:\n${query}\n\nBUSINESS DESCRIPTION:\n${companyInput.description || "Not provided"}`, { outputSchema: researchOutputSchema });
  return normalizeResearch(JSON.parse(result.finalResponse), "Codex web search", query);
}

async function performIndustryResearch(companyInput) {
  const selected = String(process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "local")).toLowerCase();
  if (String(process.env.ENABLE_WEB_RESEARCH || "true").toLowerCase() === "false" || selected === "local") return { status: "not_requested", searchedAt: null, query: "", summary: "Web research was not run. Enable a connected AI provider to add sourced industry context.", findings: [], sources: [], limitations: ["No external research was performed."], recommendedKpiIds: [] };
  try { return await withTimeout(selected === "codex" ? researchWithCodex(companyInput) : researchWithOpenAI(companyInput), Number(process.env.RESEARCH_TIMEOUT_MS || 120000), "Live research exceeded the time limit. Generate again or use OpenAI API research for a hosted search workflow."); }
  catch (error) { return { status: "unavailable", searchedAt: new Date().toISOString(), query: "", summary: "External research was unavailable; no market or competitor facts were added.", findings: [], sources: [], limitations: [error instanceof Error ? error.message : String(error)], recommendedKpiIds: [] }; }
}

async function readJson(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 1_000_000) throw new Error("Request body is too large.");
  }
  return JSON.parse(value || "{}");
}

async function compileWithOpenAI(description) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_MODEL || "gpt-5.6";
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: [{ role: "developer", content: "Organize the business brief into the complete structured model. Extract explicit values before inferring missing ones. Support subscription and physical unit-sales businesses. For unit_sales plans, monthlyPrice must contain the effective selling price per usage unit, not the total pack price. Suggest inputs only; never invent simulation outcomes or accounting results." }, { role: "user", content: description }], text: { format: { type: "json_schema", name: "business_model", strict: true, schema: businessModelSchema } }, store: false })
  });
  const result = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(result.error?.message || `OpenAI request failed with status ${apiResponse.status}.`);
  const outputText = result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI returned no structured output.");
  return { configured: true, provider: "openai-api", model, modelOutput: JSON.parse(outputText) };
}

async function compileWithCodex(description) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !process.env.CODEX_API_KEY) {
    throw new Error("Public Codex mode requires CODEX_API_KEY. Local Codex-account mode is restricted to localhost.");
  }
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex(process.env.CODEX_API_KEY ? { apiKey: process.env.CODEX_API_KEY } : undefined);
  const thread = codex.startThread({ workingDirectory: projectRoot, skipGitRepoCheck: true, sandboxMode: "read-only", approvalPolicy: "never", networkAccessEnabled: false, modelReasoningEffort: "medium" });
  const result = await thread.run(`Organize this complete business brief into the requested model. Extract every explicit company, price, cost, usage, capacity, customer, and simulation value. Support subscription and physical unit-sales businesses. For unit_sales purchase tiers, return the effective selling price per usage unit in monthlyPrice rather than the total package price. Infer only genuinely missing fields. Do not modify files, run commands, browse, or calculate outcome metrics.\n\n${description}`, { outputSchema: businessModelSchema });
  return { configured: true, provider: process.env.CODEX_API_KEY ? "codex-api" : "codex-account", model: process.env.CODEX_API_KEY ? "Codex API" : "Codex account", modelOutput: JSON.parse(result.finalResponse), usage: result.usage };
}

const reportWritingRules = `Write a concise, decision-ready business report narrative from the supplied evidence packet.
NON-NEGOTIABLE EVIDENCE RULES:
- Treat every calculated metric as locked. Copy it exactly; do not recalculate, adjust, or replace it.
- Never invent TAM, SAM, SOM, market growth, competitor names, competitor prices, citations, legal claims, product features, observed demand, CAC, conversion, or real customer behavior.
- If a fact is absent, explicitly say “Research required / not provided” and state what evidence should be collected.
- Clearly distinguish user inputs, AI-suggested assumptions, and synthetic simulation outputs.
- Describe results as modeled scenarios, never guarantees or forecasts.
- Recommendations must name their supporting modeled evidence and the real-world test required next.
- Follow the supplied industry KPI profile and terminology rules. Do not substitute SaaS KPIs into another industry.
- If evidenceStatus is insufficient or recommendationStatus is experiment_required, do not name a winning scenario. The decision is to collect data or run the specified experiment.
- Never call simplified operating contribution “ending cash”, EBITDA, profit, or cash flow.
- Keep each prose section between 45 and 130 words. Avoid hype and repetition.`;

async function writeReportWithOpenAI(evidence) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const model = process.env.OPENAI_MODEL || "gpt-5.6";
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: [{ role: "developer", content: reportWritingRules }, { role: "user", content: JSON.stringify(evidence) }], text: { format: { type: "json_schema", name: "business_report_narrative", strict: true, schema: reportNarrativeSchema } }, store: false })
  });
  const result = await apiResponse.json();
  if (!apiResponse.ok) throw new Error(result.error?.message || `OpenAI request failed with status ${apiResponse.status}.`);
  const outputText = result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI returned no report narrative.");
  return { provider: "openai-api", model, narrative: JSON.parse(outputText) };
}

async function writeReportWithCodex(evidence) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !process.env.CODEX_API_KEY) throw new Error("Public Codex mode requires CODEX_API_KEY. Local Codex-account mode is restricted to localhost.");
  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex(process.env.CODEX_API_KEY ? { apiKey: process.env.CODEX_API_KEY } : undefined);
  const thread = codex.startThread({ workingDirectory: projectRoot, skipGitRepoCheck: true, sandboxMode: "read-only", approvalPolicy: "never", networkAccessEnabled: false, modelReasoningEffort: "medium" });
  const result = await thread.run(`${reportWritingRules}\nDo not inspect or change any file and do not run commands. Return only the requested structured report.\n\nEVIDENCE PACKET:\n${JSON.stringify(evidence)}`, { outputSchema: reportNarrativeSchema });
  return { provider: process.env.CODEX_API_KEY ? "codex-api" : "codex-account", model: process.env.CODEX_API_KEY ? "Codex API" : "Codex account", narrative: JSON.parse(result.finalResponse), usage: result.usage };
}

function writeReportLocally(evidence, fallbackReason) {
  return { provider: "local-report-writer", model: "Deterministic local writer", narrative: buildLocalReportNarrative(evidence), fallbackReason };
}

function enforceReportEvidenceBoundary(evidence, written) {
  const verifiedFallback = buildLocalReportNarrative(evidence);
  if (evidence.industryDecisionAnalysis) return { ...written, narrative: verifiedFallback };
  return {
    ...written,
    narrative: {
      ...written.narrative,
      marketAnalysis: verifiedFallback.marketAnalysis,
      competitorAnalysis: verifiedFallback.competitorAnalysis,
      limitations: verifiedFallback.limitations
    }
  };
}

async function writeBusinessReport(evidence) {
  const selected = String(process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "local")).toLowerCase();
  if (evidence.industryDecisionAnalysis) return { provider: "evidence-gated-industry-writer", model: `Deterministic ${evidence.industryDecisionAnalysis.category} writer`, narrative: buildLocalReportNarrative(evidence) };
  try {
    if (selected === "codex") return enforceReportEvidenceBoundary(evidence, await writeReportWithCodex(evidence));
    if (selected === "openai") return enforceReportEvidenceBoundary(evidence, await writeReportWithOpenAI(evidence));
    return enforceReportEvidenceBoundary(evidence, writeReportLocally(evidence));
  } catch (error) {
    return enforceReportEvidenceBoundary(evidence, writeReportLocally(evidence, error instanceof Error ? error.message : String(error)));
  }
}

function compileLocally(description, fallbackReason) {
  const modelOutput = organizeBusinessBrief(description);
  return { configured: true, provider: "local-compiler", model: "Deterministic local compiler", modelOutput, fallbackReason };
}

async function compileBusinessModel(description) {
  if (!description.trim()) throw new Error("Add a company description before generating suggestions.");
  const selected = String(process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "local")).toLowerCase();
  try {
    const compiled = selected === "codex" ? await compileWithCodex(description) : selected === "openai" ? await compileWithOpenAI(description) : compileLocally(description);
    return { ...compiled, modelOutput: completeBusinessBrief(compiled.modelOutput, description) };
  } catch (error) {
    return compileLocally(description, error instanceof Error ? error.message : String(error));
  }
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname.replace(/\/+$/, "") || "/";
  try {
    if (pathname === "/admin" && request.method === "GET") {
      if (!hasAdminAccess(request)) return requestAdminAccess(response);
      response.writeHead(302, { ...securityHeaders, Location: "/admin/reports" });
      return response.end();
    }
    if (pathname === "/admin/reports" && request.method === "GET") {
      if (!hasAdminAccess(request)) return requestAdminAccess(response);
      return renderAdminReports(response);
    }
    const adminPdfMatch = request.method === "GET" && pathname.match(/^\/admin\/reports\/([a-f0-9-]+)\.pdf$/i);
    if (adminPdfMatch) {
      if (!hasAdminAccess(request)) return requestAdminAccess(response);
      const stored = await readPersistedPdf(adminPdfMatch[1]);
      if (!stored) return sendJson(response, 404, { error: "The saved report was not found." });
      response.writeHead(200, { ...securityHeaders, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${stored.filename}"`, "Content-Length": stored.pdf.length, "Cache-Control": "private, no-store" });
      return response.end(stored.pdf);
    }
    if (!allowRequest(request, response, pathname === "/api/report" ? 6 : 30)) return;
    if (pathname.startsWith("/api/") && request.method !== "GET" && !authorized(request)) return sendJson(response, 401, { error: "Authorization is required for this deployment." });
    if (request.method === "GET" && pathname === "/api/status") {
      const selected = String(process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "local")).toLowerCase();
      return sendJson(response, 200, { ok: true, simulationEngine: "deterministic", aiProvider: selected, codexAccountMode: selected === "codex" && !process.env.CODEX_API_KEY, codexApiMode: selected === "codex" && Boolean(process.env.CODEX_API_KEY), apiKeyMode: selected === "openai", webResearch: selected === "codex" || selected === "openai", reportCapacity: { active: activeReportJobs, maximum: MAX_CONCURRENT_REPORTS }, authenticatedDeployment: Boolean(apiKey) });
    }
    if (request.method === "POST" && pathname === "/api/compile") {
      const input = await readJson(request);
      const compiled = await compileBusinessModel(String(input.description || ""));
      audit("brief_compiled", { provider: compiled.provider, chars: String(input.description || "").length });
      return sendJson(response, 200, compiled);
    }
    if (request.method === "POST" && pathname === "/api/research") {
      const input = await readJson(request);
      assertCompanyInput(input.company || {});
      return sendJson(response, 200, { ok: true, research: await performIndustryResearch(input.company || {}) });
    }
    if (request.method === "POST" && pathname === "/api/simulate") {
      const input = await readJson(request);
      assertCompanyInput(input.company || {});
      const startedAt = performance.now();
      const result = buildDashboardExperience(input.company || {});
      return sendJson(response, 200, { ok: true, source: "real-simulation-engine", elapsedMs: Math.round(performance.now() - startedAt), ...result });
    }
    if (request.method === "POST" && pathname === "/api/report") {
      const input = await readJson(request);
      assertCompanyInput(input.company || {});
      if (activeReportJobs >= MAX_CONCURRENT_REPORTS) return sendJson(response, 429, { error: "Report capacity is busy. Please retry in a moment." });
      activeReportJobs++;
      const startedAt = performance.now();
      const companyInput = input.company || {};
      try {
        const experience = buildDashboardExperience(companyInput);
        const research = await performIndustryResearch(companyInput);
        const evidence = buildReportEvidence(companyInput, experience, research);
        const written = await writeBusinessReport(evidence);
        const reportId = randomUUID();
        const generatedAt = new Date().toISOString();
        const confidenceProfile = assessEvidenceConfidence(evidence);
        const governedNarrative = enforceConfidenceRules(evidence, written.narrative, confidenceProfile);
        const qualityAssessment = assessReportQuality(evidence, governedNarrative);
        const narrative = {
          ...governedNarrative,
          risks: governedNarrative.risks.map(({ risk, probability, impact, earlyWarningSignal, owner }) => ({ risk, probability, impact, earlyWarningSignal, owner })),
          actionPlan: governedNarrative.actionPlan.map(({ action, owner, timeline, successMetric }) => ({ action, owner, timeline, successMetric }))
        };
        const report = { evidence, narrative, confidenceProfile, qualityAssessment, provider: written.provider, generatedAt };
        const pdf = await renderBusinessReportPdf(report);
        pruneReports();
        const filename = `${evidence.company.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "business"}-report.pdf`;
        const persisted = await persistReport(reportId, report, pdf, filename);
        reports.set(reportId, { report, pdf, filename, expiresAt: Date.now() + 60 * 60 * 1000 });
        const elapsedMs = Math.round(performance.now() - startedAt);
        audit("report_generated", { provider: written.provider, research: research.status, elapsedMs, quality: qualityAssessment.totalScore, persisted });
        return sendJson(response, 200, { ok: true, reportId, pdfUrl: `/api/reports/${reportId}.pdf`, provider: written.provider, model: written.model, fallbackReason: written.fallbackReason, usage: written.usage, elapsedMs, persistentStorage: persisted, report });
      } finally { activeReportJobs--; }
    }
    const pdfMatch = request.method === "GET" && pathname.match(/^\/api\/reports\/([a-f0-9-]+)\.pdf$/i);
    if (pdfMatch) {
      const cached = reports.get(pdfMatch[1]);
      if (cached && cached.expiresAt >= Date.now()) {
        response.writeHead(200, { ...securityHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${cached.filename}"`, "Content-Length": cached.pdf.length, "Cache-Control": "private, max-age=3600" });
        return response.end(cached.pdf);
      }
      if (persistenceEnabled()) {
        const stored = await readPersistedPdf(pdfMatch[1]);
        if (stored) {
          response.writeHead(200, { ...securityHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${stored.filename}"`, "Content-Length": stored.pdf.length, "Cache-Control": "private, max-age=3600" });
          return response.end(stored.pdf);
        }
      }
      return sendJson(response, 404, { error: "This report link has expired. Generate the report again." });
    }
    if (pathname.startsWith("/api/")) return sendJson(response, 404, { error: `Unknown API route: ${request.method} ${pathname}. Restart the server if the web app was updated while it was running.` });
    const requested = pathname === "/" ? "/index.html" : pathname;
    const file = normalize(join(webRoot, requested));
    if (!file.startsWith(webRoot)) return response.writeHead(403).end("Forbidden");
    const fileBody = await readFile(file);
    response.writeHead(200, { ...securityHeaders, "Content-Type": mime[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(fileBody);
  } catch (error) {
    if (pathname.startsWith("/api/")) return sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    response.writeHead(404).end("Not found");
  }
});

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
if (!apiKey && !["127.0.0.1", "localhost", "::1"].includes(host)) audit("security_warning", { message: "Public binding without APP_API_KEY. Set APP_API_KEY or protect the app at a reverse proxy." });
server.listen(port, host, () => console.log(`Shadow Company listening on http://${host}:${port}`));
