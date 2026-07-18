const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'shadow-company-report-inputs-v2';
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const numberOr = (value, fallback) => value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? fallback : Number(value);
let displayPrecision = 'standard';
let displayCurrency = 'USD';
const money = (value) => { const amount = Number(value) || 0; const magnitude = Math.abs(amount); const increment = displayPrecision === 'rounded' ? (magnitude >= 10000 ? 1000 : magnitude >= 1000 ? 100 : magnitude >= 100 ? 10 : 1) : displayPrecision === 'specific' ? .01 : 1; return new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency, maximumFractionDigits: displayPrecision === 'specific' ? 2 : 0 }).format(Math.round(amount / increment) * increment); };
const percent = (value) => `${(Number(value) * 100).toFixed(displayPrecision === 'rounded' ? 0 : 1)}%`;

const blankCompany = {
  name: '', industry: '', geography: '', currency: 'USD', dataAsOf: '', developmentStage: 'Early revenue', description: '', decisionQuestion: '', customerProfile: '', revenueModel: 'subscription', unitName: 'units',
  startingCash: 75000, fixedMonthlyCosts: 12000, variableCostPerUnit: 1.1, averageDailyUsage: .4, highVolumeDailyUsage: 2, dailyCustomerArrivals: 15, supportHoursPerWeek: 40, customerTarget: 1000, durationDays: 120, seed: 42,
  capacityLocations: 1, capacityPerLocation: 100, baselineUtilization: .65, averageSellingPrice: 50, averageTransactionLength: 1, cancellationRate: .05, directChannelShare: .7, thirdPartyFeeRate: .03, priceElasticity: 1,
  startingPaidCustomers: 100, monthlyChurnRate: .05, paidConversionRate: .08, paymentProcessingRate: .029, refundRate: .02, failedTaskRate: .03, customerAcquisitionCost: 150, targetGrossMargin: .7,
  plans: [{ name: 'Standard', price: 99, units: null, overagePrice: 0 }, { name: 'Growth', price: 150, units: 120, overagePrice: 1 }]
};
const defaultCompany = {
  name: 'Harvest & Co.', industry: 'Food and beverage · packaged healthy snacks', geography: 'United States', currency: 'USD', dataAsOf: '', developmentStage: 'Early revenue', description: 'Harvest & Co. makes small-batch, protein-rich snack bars from whole-food ingredients for health-conscious professionals and parents.', decisionQuestion: 'Which pricing and cost structure creates the strongest path to sustainable growth?', customerProfile: 'Health-conscious professionals and parents aged 25–45', revenueModel: 'unit_sales', unitName: 'bars',
  startingCash: 75000, fixedMonthlyCosts: 12000, variableCostPerUnit: 1.1, averageDailyUsage: .4, highVolumeDailyUsage: 2, dailyCustomerArrivals: 15, supportHoursPerWeek: 40, customerTarget: 1000, durationDays: 120, seed: 42,
  capacityLocations: 1, capacityPerLocation: 100, baselineUtilization: .65, averageSellingPrice: 3.5, averageTransactionLength: 1, cancellationRate: .02, directChannelShare: .8, thirdPartyFeeRate: .03, priceElasticity: 1,
  startingPaidCustomers: 100, monthlyChurnRate: .05, paidConversionRate: .08, paymentProcessingRate: .029, refundRate: .02, failedTaskRate: .03, customerAcquisitionCost: 150, targetGrossMargin: .7,
  plans: [{ id: 'single', name: 'Single bar', price: 3.5, units: 1 }, { id: 'subscription', name: '12-pack subscription', price: 2.5, units: 12 }, { id: 'variety', name: 'Variety bundle', price: 2.2917, units: 24 }]
};

let company = null;
let reportResult = null;
let generating = false;
let progressTimer = null;
let suggestedFields = new Set();

function normalizeCompany(source) {
  return {
    ...clone(blankCompany), ...source,
    plans: (source.plans?.length ? source.plans : blankCompany.plans).slice(0, 4).map((plan, index) => ({ id: plan.id || `plan-${index + 1}`, name: plan.name || `Tier ${index + 1}`, price: numberOr(plan.price ?? plan.monthlyPrice, 0), units: plan.units ?? plan.includedUnits ?? null, overagePrice: numberOr(plan.overagePrice, 0), rateLimit: plan.rateLimit ?? null }))
  };
}

function renderShell() {
  const workspace = Boolean(company);
  $('landing-screen').hidden = workspace;
  $('report-workspace').hidden = !workspace;
  $('workspace-actions').hidden = !workspace;
  if (!workspace) return;
  $('company-name').textContent = company.name.toUpperCase();
  $('report-title').textContent = `${company.name} business report`;
  $('report-subtitle').textContent = company.description;
  $('report-loading').hidden = !generating;
  $('report-preview').hidden = generating || !reportResult;
  $('download-card').hidden = generating || !reportResult;
}

function startProgress() {
  const states = [
    ['Organizing business evidence…', 'Checking inputs, pricing, costs, and assumptions before calculation.'],
    ['Running three deterministic scenarios…', 'Using the same customer population, duration, and seed for a fair comparison.'],
    ['Researching industry context…', 'Connected AI searches current sources; unverified trends cannot become company data.'],
    ['Rendering the report PDF…', 'Building the tables, risk register, recommendations, and calculation trace.']
  ];
  let index = 0;
  const update = () => {
    const state = states[index];
    $('loading-title').textContent = state[0]; $('loading-copy').textContent = state[1];
    $('progress-bar').style.width = `${22 + index * 24}%`;
    document.querySelectorAll('.report-loading li').forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === index));
    index = Math.min(states.length - 1, index + 1);
  };
  update(); progressTimer = setInterval(update, 1100);
}

function renderReport(data) {
  const { report } = data;
  const { evidence, narrative } = report;
  const quality = report.qualityAssessment;
  const confidence = report.confidenceProfile || { evidenceRating: 'Directional', decisionStatus: 'Directional Scenario', numberPrecision: 'rounded', allowWinner: false, reasons: ['Evidence rating was not attached.'] };
  displayPrecision = confidence.numberPrecision || 'standard';
  displayCurrency = company?.currency || evidence.company.currency || 'USD';
  const industryAnalysis = evidence.industryDecisionAnalysis;
  const winner = evidence.scenarioResults.find((scenario) => scenario.id === evidence.recommendation.recommendedScenarioId);
  $('header-company').textContent = evidence.reportHeader.companyName;
  $('header-date').textContent = new Date(report.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  $('header-period').textContent = evidence.reportHeader.analysisPeriod;
  $('header-status').textContent = confidence.decisionStatus;
  $('header-question').textContent = evidence.reportHeader.decisionQuestion;
  $('report-provider').textContent = data.provider === 'codex-account' ? 'CODEX ACCOUNT' : data.provider === 'codex-api' ? 'CODEX API' : data.provider === 'openai-api' ? 'OPENAI API' : evidence.research?.status === 'completed' ? 'INDUSTRY MODEL + SOURCED RESEARCH' : 'EVIDENCE-GATED INDUSTRY MODEL';
  $('executive-heading').textContent = industryAnalysis?.category === 'subscription' ? 'Validate before deciding: fix the pricing risk before you scale it.' : confidence.evidenceRating === 'Directional' ? 'Validate before deciding.' : confidence.evidenceRating === 'Partially Validated' ? 'A provisional direction may be tested, not treated as final.' : industryAnalysis?.recommendation || evidence.recommendation.recommendation;
  $('executive-copy').textContent = narrative.executiveSummary;
  const executiveMetrics = industryAnalysis?.category === 'hospitality' ? [['AVAILABLE ROOM-NIGHTS', industryAnalysis.capacity.availableUnits.toLocaleString()], ['BASELINE OCCUPANCY', percent(industryAnalysis.scenarios[0].utilization)], ['ADR', money(industryAnalysis.scenarios[0].averagePrice)], ['BREAK-EVEN DECLINE', percent(industryAnalysis.breakEvenVolumeDecline)]] : industryAnalysis?.category === 'subscription' ? [['MODELED PAID ACCOUNTS', industryAnalysis.baseline.paidAccounts.toLocaleString()], ['TYPICAL AI COST / ACCOUNT', money(industryAnalysis.scenarios[0].aiCostPerAccount)], ['LOSS-MAKING USER GROUPS', String(industryAnalysis.usageCohorts.filter((item) => !item.profitable).length)], ['FIRST TEST RETENTION FLOOR', percent(industryAnalysis.commercialRetentionGuardrail)]] : [['MODELED CONTRIBUTION', money(winner.metrics.endingCash - evidence.operatingModel.startingCash)], ['GROSS MARGIN', percent(winner.metrics.grossMargin)], ['CUSTOMERS', winner.metrics.customers.toLocaleString()], ['CONFIDENCE', evidence.recommendation.confidence.toUpperCase()]];
  $('executive-metrics').innerHTML = executiveMetrics.map(([label, value]) => `<div class="metric"><span>${label}</span><b>${escapeHtml(value)}</b></div>`).join('');
  $('decision-direction').textContent = industryAnalysis?.category === 'subscription' ? industryAnalysis.recommendation : confidence.allowWinner ? (industryAnalysis?.recommendation || evidence.recommendation.recommendation) : 'Validate before deciding. No winning scenario is permitted at this evidence level.';
  $('decision-rationale').textContent = confidence.reasons?.join(' ') || industryAnalysis?.rationale || evidence.recommendation.rationale;
  $('business-overview').textContent = narrative.businessOverview;
  $('problem-and-need').textContent = narrative.problemAndMarketNeed;
  $('product-analysis').textContent = narrative.productAnalysis;
  $('comparison-period').textContent = `Every figure below covers the same ${evidence.simulation.durationDays}-day modeled period, so the options can be compared fairly. These are planning scenarios, not a forecast.`;
  const ledger = evidence.evidenceLedger;
  $('evidence-rating').textContent = confidence.evidenceRating;
  $('user-input-count').textContent = `${ledger.userProvidedInputs.length} USER-PROVIDED INPUTS`;
  $('user-input-list').innerHTML = ledger.userProvidedInputs.map((item) => `<div class="ledger-item"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.value)} ${escapeHtml(item.unit)}</span></div>`).join('') || '<p>None listed.</p>';
  $('ai-input-count').textContent = `${ledger.aiSuggestedInputs.length} AI-SUGGESTED INPUTS`;
  $('ai-input-list').innerHTML = ledger.aiSuggestedInputs.map((item) => `<div class="ledger-item"><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.value)} ${escapeHtml(item.unit)}</span><small>${escapeHtml(item.confidence)} confidence</small></div>`).join('') || '<p>None listed.</p>';
  $('ledger-sources').innerHTML = ledger.externalResearchSources.length ? ledger.externalResearchSources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener"><b>[${escapeHtml(source.id)}] ${escapeHtml(source.title)}</b><small>${escapeHtml(source.publisher)}${source.publishedAt ? ` · ${escapeHtml(source.publishedAt)}` : ''}</small></a>`).join('') : '<p>No external sources attached.</p>';
  $('kpi-input-table').innerHTML = evidence.kpiInputStatus.map((item) => `<tr><td><b>${escapeHtml(item.name)}</b></td><td>${escapeHtml(item.requiredInputs.join(', '))}</td><td>${escapeHtml(item.missingInputs.length ? item.missingInputs.join(', ') : 'None')}</td><td>${escapeHtml(item.evidenceStatus)}</td></tr>`).join('');
  $('customer-heading').textContent = `Intended customer: ${evidence.company.customerProfile}`;
  $('behavior-table').innerHTML = evidence.behaviorEvidence.map((item) => `<tr><td><b>${escapeHtml(item.metric)}</b></td><td>${escapeHtml(item.value)}</td><td>${escapeHtml(item.evidenceType)}</td><td>${escapeHtml(item.explanation)}</td></tr>`).join('');
  $('quality-total').textContent = quality ? `${quality.totalScore}/100` : 'Not scored';
  $('quality-classification').textContent = quality?.classification || 'Quality assessment unavailable';
  $('quality-use').textContent = quality?.decisionUse === 'external_decision_ready' ? 'Decision-ready for external use' : quality?.decisionUse === 'conditional_internal_use' ? 'Conditional internal use' : quality?.decisionUse === 'internal_draft_only' ? 'Internal draft only' : 'Not suitable for business decisions';
  $('quality-dimensions').innerHTML = (quality?.dimensions || []).map((item) => `<div><span>${escapeHtml(item.category)} <small>${item.weight}%</small></span><i><b style="width:${item.score}%"></b></i><strong>${item.score}</strong></div>`).join('');
  $('quality-blockers').innerHTML = (quality?.blockingIssues || []).slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  $('scenario-report-grid').innerHTML = industryAnalysis?.category === 'hospitality' ? industryAnalysis.scenarios.map((scenario) => `<div class="scenario-report ${scenario.id === 'current' ? 'baseline' : ''}"><small>${scenario.id === 'current' ? 'CURRENT MODEL' : 'OPTION TO TEST'}</small><h3>${escapeHtml(scenario.label)}</h3><strong>${money(scenario.operatingContribution)}</strong><dl><div><dt>Revenue</dt><dd>${money(scenario.revenue)}</dd></div><div><dt>Occupancy</dt><dd>${percent(scenario.utilization)}</dd></div><div><dt>ADR</dt><dd>${money(scenario.averagePrice)}</dd></div><div><dt>RevPAR</dt><dd>${money(scenario.revenuePerAvailableUnit)}</dd></div></dl></div>`).join('') : industryAnalysis?.category === 'subscription' ? industryAnalysis.scenarios.map((scenario) => `<div class="scenario-report ${scenario.id === 'current-flat' ? 'baseline' : scenario.id === 'current-allowance' ? 'candidate-test' : ''}"><small>${scenario.id === 'current-flat' ? 'CURRENT MODEL' : scenario.id === 'current-allowance' ? 'CANDIDATE TEST — NOT A WINNER' : 'OPTION TO TEST'}</small><h3>${escapeHtml(scenario.label)}</h3><strong>${money(scenario.operatingContribution)}</strong><dl><div><dt>Money left after costs</dt><dd>${money(scenario.operatingContribution)}</dd></div><div><dt>Gross margin</dt><dd>${percent(scenario.grossMargin)}</dd></div><div><dt>Customers retained</dt><dd>${percent(scenario.paidVolumeRetention)}</dd></div><div><dt>Users costing too much</dt><dd>${percent(scenario.unprofitableAccountShare)}</dd></div></dl></div>`).join('') : evidence.scenarioResults.map((scenario) => `<div class="scenario-report ${confidence.allowWinner && scenario.id === winner.id ? 'winner' : ''}">${confidence.allowWinner && scenario.id === winner.id ? '<span class="winner-label">PROVISIONAL DIRECTION</span>' : ''}<small>${scenario.isBaseline ? 'BASELINE' : 'ALTERNATIVE'}</small><h3>${escapeHtml(scenario.label)}</h3><strong>${money(scenario.metrics.endingCash - evidence.operatingModel.startingCash)}</strong><dl><div><dt>Revenue</dt><dd>${money(scenario.metrics.revenue)}</dd></div><div><dt>Gross margin</dt><dd>${percent(scenario.metrics.grossMargin)}</dd></div><div><dt>Churn</dt><dd>${percent(scenario.metrics.churn)}</dd></div><div><dt>Support backlog</dt><dd>${scenario.metrics.supportBacklog}</dd></div></dl></div>`).join('');
  $('scale-analysis').hidden = industryAnalysis?.category !== 'subscription';
  if (industryAnalysis?.category === 'subscription') {
    const maxRevenue = Math.max(...industryAnalysis.scaleCases.map((item) => item.monthlyRevenue), 1);
    $('scale-chart').innerHTML = industryAnalysis.scaleCases.map((item) => `<div><span>${item.paidAccounts.toLocaleString()} paid</span><i><b class="revenue" style="width:${Math.max(2, item.monthlyRevenue / maxRevenue * 100)}%"></b><b class="cost" style="width:${Math.max(1, item.monthlyAiCost / maxRevenue * 100)}%"></b></i><strong>${money(item.monthlyRevenue)} revenue · ${money(item.monthlyAiCost)} AI cost · ${money(item.monthlyContribution)} contribution</strong></div>`).join('');
    $('usage-cohort-table').innerHTML = industryAnalysis.usageCohorts.map((item) => `<tr><td><b>${escapeHtml(item.name)}</b></td><td>${percent(item.share)}</td><td>${item.monthlyUsage.toLocaleString()}</td><td>${money(item.monthlyAiCost)}</td><td>${money(item.monthlyContribution)}</td><td>${item.profitable ? 'Profitable' : '<b class="loss-label">Loss-making</b>'}</td></tr>`).join('');
  }
  $('findings-list').innerHTML = narrative.keyFindings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join('');
  $('market-gap').textContent = narrative.marketAnalysis;
  $('trend-list').innerHTML = (evidence.research?.findings || []).slice(0, 6).map((item) => `<div><b>${escapeHtml(item.finding)}</b><span>${escapeHtml(item.timeHorizon)} · ${escapeHtml(item.evidenceStrength)} evidence · ${escapeHtml(item.requiredAction)}</span><p>${escapeHtml(item.implication)}</p></div>`).join('');
  $('recommendation-list').innerHTML = narrative.recommendations.slice(0, 4).map((item, index) => `<div class="recommendation-item"><span>${String(index + 1).padStart(2, '0')}</span><div><h3>${escapeHtml(item.recommendation)}</h3><p><small>EVIDENCE · </small>${escapeHtml(item.evidence)}</p><p><small>VALIDATE NEXT · </small>${escapeHtml(item.validation)}</p></div></div>`).join('');
  $('risk-table').innerHTML = narrative.risks.map((risk) => `<tr><td><b>${escapeHtml(risk.risk)}</b></td><td class="risk-level">${risk.probability} / ${risk.impact}</td><td>${escapeHtml(risk.earlyWarningSignal)}</td><td>${escapeHtml(risk.owner)}</td></tr>`).join('');
  $('action-table').innerHTML = narrative.actionPlan.map((action) => `<tr><td><b>${escapeHtml(action.action)}</b></td><td>${escapeHtml(action.owner)}</td><td>${escapeHtml(action.timeline)}</td><td>${escapeHtml(action.successMetric)}</td></tr>`).join('');
  $('limitations-list').innerHTML = narrative.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  $('report-disclaimer').textContent = evidence.recommendation.disclaimer;
  const sources = evidence.research?.sources || [];
  $('research-sources').innerHTML = sources.length ? sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener"><b>[${escapeHtml(source.id)}] ${escapeHtml(source.title)}</b><small>${escapeHtml(source.publisher)}${source.publishedAt ? ` · ${escapeHtml(source.publishedAt)}` : ''}</small></a>`).join('') : '<p>No external sources were used. Connect Codex or the OpenAI API to run sourced industry research.</p>';
  $('download-pdf').href = data.pdfUrl;
  $('download-pdf').download = `${company.name.replace(/[^a-z0-9]+/gi, '-')}-report.pdf`;
  observeReportNavigation();
}

async function generateReport() {
  if (!company || generating) return;
  generating = true; reportResult = null; $('report-error').hidden = true; renderShell(); startProgress();
  try {
    const response = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'The business report could not be generated.');
    reportResult = data; renderReport(data);
  } catch (error) {
    $('report-error').textContent = error.message; $('report-error').hidden = false;
  } finally {
    clearInterval(progressTimer); progressTimer = null; generating = false; renderShell();
  }
}

function renderPlanInputs(plans) {
  const safePlans = plans?.length ? plans.slice(0, 4) : blankCompany.plans;
  $('plans-form').innerHTML = safePlans.map((plan, index) => `<div class="plan-row"><label>PLAN OR TIER<input name="planName${index}" value="${escapeHtml(plan.name)}" required /></label><label>PRICE / MONTH OR UNIT ($)<input name="planPrice${index}" value="${numberOr(plan.price ?? plan.monthlyPrice, 0)}" type="number" min="0" step="0.01" required /></label><label>PACK / INCLUDED UNITS<input name="planUnits${index}" value="${plan.units ?? plan.includedUnits ?? ''}" type="number" min="0" step="1" placeholder="Unlimited" /></label><label>OVERAGE / EXTRA UNIT ($)<input name="planOverage${index}" value="${numberOr(plan.overagePrice, 0)}" type="number" min="0" step="0.0001" /></label></div>`).join('');
  $('company-form').dataset.planCount = String(safePlans.length);
}

function updateUnitLabels(unitName) {
  const unit = String(unitName || 'unit').replace(/s$/, '');
  $('variable-cost-label').textContent = `Variable cost / ${unit} ($)`;
  $('average-usage-label').textContent = `Average ${unitName || 'usage'} / customer / day`;
  $('high-usage-label').textContent = `High-frequency ${unitName || 'usage'} / day`;
}

function updateIndustryModelVisibility(source) {
  const hospitality = /hotel|hospitality|lodg|resort|room night|concierge/i.test(`${source.industry || ''} ${source.description || ''} ${source.unitName || ''}`);
  const subscription = !hospitality && /ai|saas|software|platform|api|subscription|automation/i.test(`${source.industry || ''} ${source.description || ''}`) && String(source.revenueModel || 'subscription') === 'subscription';
  $('industry-model-section').hidden = !hospitality;
  $('subscription-model-section').hidden = !subscription;
}

function setIndustryModelFields(form, source) {
  const percentFields = new Set(['baselineUtilization', 'cancellationRate', 'directChannelShare', 'thirdPartyFeeRate', 'monthlyChurnRate', 'paidConversionRate', 'paymentProcessingRate', 'refundRate', 'failedTaskRate', 'targetGrossMargin']);
  ['capacityLocations', 'capacityPerLocation', 'baselineUtilization', 'averageSellingPrice', 'averageTransactionLength', 'cancellationRate', 'directChannelShare', 'thirdPartyFeeRate', 'priceElasticity', 'startingPaidCustomers', 'monthlyChurnRate', 'paidConversionRate', 'paymentProcessingRate', 'refundRate', 'failedTaskRate', 'customerAcquisitionCost', 'targetGrossMargin'].forEach((name) => {
    const field = form.elements.namedItem(name); if (!field) return;
    const value = source[name]; field.value = value === null || value === undefined ? '' : percentFields.has(name) ? Number(value) * 100 : value;
  });
  const subscriptionElasticity = form.elements.namedItem('subscriptionPriceElasticity');
  if (subscriptionElasticity) subscriptionElasticity.value = source.priceElasticity ?? 1;
  updateIndustryModelVisibility(source);
}

function openSetup(isNew = false) {
  const source = isNew ? clone(blankCompany) : clone(company || blankCompany);
  const form = $('company-form');
  Object.entries(source).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field && typeof value !== 'object') field.value = value ?? ''; });
  renderPlanInputs(source.plans); updateUnitLabels(source.unitName); setIndustryModelFields(form, source); form.dataset.isNew = String(isNew); $('form-error').hidden = true; $('ai-status').textContent = '';
  suggestedFields = new Set(Object.entries(source.assumptionSources || {}).filter(([, value]) => value === 'ai').map(([name]) => name));
  markSuggestedFields([...suggestedFields]); $('setup-dialog').showModal(); updateProviderStatus();
}

function markSuggestedFields(fields) {
  document.querySelectorAll('#company-form .ai-filled').forEach((field) => field.classList.remove('ai-filled'));
  fields.forEach((name) => {
    if (name === 'plans') document.querySelectorAll('#plans-form input').forEach((field) => field.classList.add('ai-filled'));
    else if (name === 'priceElasticity') { $('company-form').elements.namedItem('priceElasticity')?.classList?.add('ai-filled'); $('company-form').elements.namedItem('subscriptionPriceElasticity')?.classList?.add('ai-filled'); }
    else $('company-form').elements.namedItem(name)?.classList?.add('ai-filled');
  });
  $('suggested-note').hidden = fields.length === 0;
}

function plansFromForm(form) {
  return Array.from({ length: numberOr(form.dataset.planCount, 2) }, (_, index) => {
    const name = String(form.elements.namedItem(`planName${index}`).value).trim(); const unitsValue = form.elements.namedItem(`planUnits${index}`).value;
    return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `plan-${index + 1}`, name, price: numberOr(form.elements.namedItem(`planPrice${index}`).value, 0), units: unitsValue === '' ? null : numberOr(unitsValue, null), overagePrice: numberOr(form.elements.namedItem(`planOverage${index}`).value, 0), rateLimit: unitsValue === '' ? null : numberOr(unitsValue, null) };
  });
}

function saveCompany(event) {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  try {
    const data = Object.fromEntries(new FormData(form));
    const sourceFields = ['unitName', 'plans', 'startingCash', 'fixedMonthlyCosts', 'variableCostPerUnit', 'averageDailyUsage', 'highVolumeDailyUsage', 'dailyCustomerArrivals', 'supportHoursPerWeek', 'capacityLocations', 'capacityPerLocation', 'baselineUtilization', 'averageSellingPrice', 'averageTransactionLength', 'cancellationRate', 'directChannelShare', 'thirdPartyFeeRate', 'priceElasticity', 'startingPaidCustomers', 'monthlyChurnRate', 'paidConversionRate', 'paymentProcessingRate', 'refundRate', 'failedTaskRate', 'customerAcquisitionCost', 'targetGrossMargin'];
    const assumptionSources = Object.fromEntries(sourceFields.map((name) => [name, suggestedFields.has(name) ? 'ai' : 'user']));
    company = normalizeCompany({ ...data, assumptionSources, startingCash: numberOr(data.startingCash, 0), fixedMonthlyCosts: numberOr(data.fixedMonthlyCosts, 0), variableCostPerUnit: numberOr(data.variableCostPerUnit, 0), averageDailyUsage: numberOr(data.averageDailyUsage, 1), highVolumeDailyUsage: numberOr(data.highVolumeDailyUsage, 1), dailyCustomerArrivals: numberOr(data.dailyCustomerArrivals, 1), supportHoursPerWeek: numberOr(data.supportHoursPerWeek, 1), capacityLocations: numberOr(data.capacityLocations, 1), capacityPerLocation: numberOr(data.capacityPerLocation, 100), baselineUtilization: numberOr(data.baselineUtilization, 65) / 100, averageSellingPrice: numberOr(data.averageSellingPrice, 50), averageTransactionLength: numberOr(data.averageTransactionLength, 1), cancellationRate: numberOr(data.cancellationRate, 5) / 100, directChannelShare: numberOr(data.directChannelShare, 70) / 100, thirdPartyFeeRate: numberOr(data.thirdPartyFeeRate, 3) / 100, priceElasticity: numberOr(data.subscriptionPriceElasticity || data.priceElasticity, 1), startingPaidCustomers: numberOr(data.startingPaidCustomers, 100), monthlyChurnRate: numberOr(data.monthlyChurnRate, 5) / 100, paidConversionRate: numberOr(data.paidConversionRate, 8) / 100, paymentProcessingRate: numberOr(data.paymentProcessingRate, 2.9) / 100, refundRate: numberOr(data.refundRate, 2) / 100, failedTaskRate: numberOr(data.failedTaskRate, 3) / 100, customerAcquisitionCost: numberOr(data.customerAcquisitionCost, 150), targetGrossMargin: numberOr(data.targetGrossMargin, 70) / 100, customerTarget: numberOr(data.customerTarget, 1000), durationDays: numberOr(data.durationDays, 120), seed: numberOr(data.seed, 42), plans: plansFromForm(form) });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(company)); $('setup-dialog').close(); renderShell(); generateReport();
  } catch (error) { $('form-error').textContent = error.message; $('form-error').hidden = false; }
}

async function updateProviderStatus() {
  try {
    const response = await fetch('/api/status'); const status = await response.json();
    const labels = { codex: status.codexApiMode ? 'CODEX API MODE' : 'CODEX ACCOUNT MODE', openai: 'OPENAI API MODE', local: 'LOCAL REPORT MODE' };
    $('ai-connection').textContent = labels[status.aiProvider] || String(status.aiProvider).toUpperCase();
    $('ai-status').textContent = status.aiProvider === 'codex' ? (status.codexApiMode ? 'Codex API will organize the brief and run focused live research from this hosted service.' : 'Codex will organize the brief and attempt focused live research. Slow research times out safely without blocking the calculated report.') : status.aiProvider === 'openai' ? 'The OpenAI Responses API will organize inputs and run hosted web search with clickable sources.' : 'The deterministic organizer and industry KPI profiles are active. No external research will run.';
  } catch { $('ai-connection').textContent = 'REPORT ENGINE UNAVAILABLE'; }
}

async function organizeBrief() {
  const form = $('company-form');
  const description = form.elements.namedItem('businessBrief').value.trim() || [form.elements.namedItem('name').value, form.elements.namedItem('description').value].filter(Boolean).join('\n');
  if (!description) { $('ai-status').textContent = 'Paste a business brief first.'; $('ai-status').className = 'ai-status error'; return; }
  $('ai-compile').disabled = true; $('ai-status').textContent = 'Organizing company, pricing, costs, customers, and simulation inputs…'; $('ai-status').className = 'ai-status';
  try {
    const response = await fetch('/api/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description }) }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The brief could not be organized.'); const model = data.modelOutput;
    ['name', 'industry', 'developmentStage', 'description', 'decisionQuestion', 'customerProfile', 'revenueModel', 'unitName'].forEach((name) => { const field = form.elements.namedItem(name); if (field && model[name] !== null && model[name] !== undefined) field.value = model[name]; });
    Object.entries(model.operatingModel || {}).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field && value !== null && value !== undefined) field.value = value; });
    Object.entries(model.simulation || {}).forEach(([name, value]) => { const field = form.elements.namedItem(name); if (field && value !== null && value !== undefined) field.value = value; });
    setIndustryModelFields(form, { ...model, ...(model.industryModel || {}) });
    if (model.plans?.length) renderPlanInputs(model.plans);
    updateUnitLabels(model.unitName);
    suggestedFields = new Set(model.suggestedFields || []); markSuggestedFields([...suggestedFields]);
    $('ai-status').textContent = `The complete form was organized by ${data.model}. Review every value, then generate the report.${data.fallbackReason ? ` Local fallback reason: ${data.fallbackReason}` : ''}`; $('ai-status').className = 'ai-status success';
    $('ai-connection').textContent = data.provider === 'codex-account' ? 'CODEX ACCOUNT CONNECTED' : data.provider === 'codex-api' ? 'CODEX API CONNECTED' : data.provider === 'openai-api' ? 'OPENAI API CONNECTED' : 'LOCAL ORGANIZER';
  } catch (error) { $('ai-status').textContent = error.message; $('ai-status').className = 'ai-status error'; } finally { $('ai-compile').disabled = false; }
}

function loadDemo() { company = clone(defaultCompany); localStorage.setItem(STORAGE_KEY, JSON.stringify(company)); renderShell(); generateReport(); }
let reportNavObserver = null;

function observeReportNavigation() {
  if (!('IntersectionObserver' in window)) return;
  reportNavObserver?.disconnect();
  const links = [...document.querySelectorAll('.report-nav a')];
  reportNavObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
  }, { rootMargin: '-20% 0px -70% 0px', threshold: [0, .1, .4] });
  document.querySelectorAll('.report-section[id]').forEach((section) => reportNavObserver.observe(section));
}

function parseCsv(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map((line) => {
    const values = []; let value = ''; let quoted = false;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
      else value += char;
    }
    values.push(value.trim());
    return values;
  });
}

async function importCsvMetrics(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const form = $('company-form');
  try {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error('Use a CSV with a header and at least one value row.');
    const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases = {
      startingcash: 'startingCash', fixedmonthlycosts: 'fixedMonthlyCosts', variablecostperunit: 'variableCostPerUnit', averagedailyusage: 'averageDailyUsage', highvolumedailyusage: 'highVolumeDailyUsage', newcustomersperday: 'dailyCustomerArrivals', dailycustomerarrivals: 'dailyCustomerArrivals', supporthoursperweek: 'supportHoursPerWeek', customeracquisitioncost: 'customerAcquisitionCost', monthlychurnrate: 'monthlyChurnRate', paidconversionrate: 'paidConversionRate', paymentprocessingrate: 'paymentProcessingRate', refundrate: 'refundRate', failedtaskrate: 'failedTaskRate', targetgrossmargin: 'targetGrossMargin', currentpayingaccounts: 'startingPaidCustomers', startingpaidcustomers: 'startingPaidCustomers'
    };
    const header = rows[0].map(normalize); const metricColumn = header.findIndex((value) => /metric|field|name/.test(value)); const valueColumn = header.findIndex((value) => /value|amount|number/.test(value));
    const pairs = metricColumn >= 0 && valueColumn >= 0 ? rows.slice(1).map((row) => [row[metricColumn], row[valueColumn]]) : header.map((name, index) => [name, rows[1][index]]);
    let imported = 0;
    pairs.forEach(([rawName, rawValue]) => {
      const fieldName = aliases[normalize(rawName)]; const field = fieldName && form.elements.namedItem(fieldName);
      if (!field || !Number.isFinite(Number(rawValue))) return;
      field.value = String(rawValue); field.classList.remove('ai-filled'); suggestedFields.delete(fieldName); imported++;
    });
    if (!imported) throw new Error('No recognised metrics were found. Use columns such as “metric,value” or fields like “fixed monthly costs”.');
    $('ai-status').textContent = `${imported} verified CSV metrics were imported. Review them before generating.`; $('ai-status').className = 'ai-status success';
  } catch (error) { $('ai-status').textContent = error.message; $('ai-status').className = 'ai-status error'; }
  event.target.value = '';
}

function downloadModelData() {
  if (!reportResult) return;
  const evidence = reportResult.report.evidence;
  const rows = [['type', 'metric', 'value', 'unit', 'basis']];
  evidence.evidenceLedger.userProvidedInputs.concat(evidence.evidenceLedger.aiSuggestedInputs).forEach((item) => rows.push(['input', item.name, item.value, item.unit, item.source]));
  (evidence.industryDecisionAnalysis?.scenarios || evidence.scenarioResults || []).forEach((scenario) => Object.entries(scenario).filter(([, value]) => typeof value === 'number').forEach(([metric, value]) => rows.push(['scenario', `${scenario.label || scenario.id}: ${metric}`, value, company?.currency || 'USD', 'modeled'])));
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `${company.name.replace(/[^a-z0-9]+/gi, '-')}-model-data.csv`; link.click(); URL.revokeObjectURL(link.href);
}

$('go-home').addEventListener('click', () => { company = null; reportResult = null; renderShell(); });
$('landing-create').addEventListener('click', () => openSetup(true)); $('landing-demo').addEventListener('click', loadDemo);
$('edit-company').addEventListener('click', () => openSetup(false)); $('generate-report').addEventListener('click', generateReport);
$('company-form').addEventListener('submit', saveCompany); $('ai-compile').addEventListener('click', organizeBrief);
$('csv-import').addEventListener('change', importCsvMetrics); $('download-data').addEventListener('click', downloadModelData);
$('company-form').addEventListener('input', (event) => { const field = event.target; if (!field?.name) return; field.classList.remove('ai-filled'); suggestedFields.delete(field.name === 'subscriptionPriceElasticity' ? 'priceElasticity' : field.name); if (field.name.startsWith('plan')) suggestedFields.delete('plans'); if (field.name === 'unitName') updateUnitLabels(field.value); if (['industry', 'description', 'unitName', 'revenueModel'].includes(field.name)) updateIndustryModelVisibility(Object.fromEntries(new FormData($('company-form')))); $('suggested-note').hidden = suggestedFields.size === 0; });
$('close-setup').addEventListener('click', () => $('setup-dialog').close()); $('cancel-setup').addEventListener('click', () => $('setup-dialog').close());
renderShell();
