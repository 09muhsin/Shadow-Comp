type OrganizedBrief = {
  businessType: "subscription_api" | "subscription_saas";
  name: string | null;
  industry: string | null;
  developmentStage: string | null;
  description: string | null;
  decisionQuestion: string | null;
  customerProfile: string | null;
  revenueModel: "subscription" | "unit_sales";
  unitName: string | null;
  plans: Array<{ id: string; name: string; monthlyPrice: number; includedUnits: number | null; overagePrice: number; rateLimit: number | null }>;
  operatingModel: {
    startingCash: number | null;
    fixedMonthlyCosts: number | null;
    variableCostPerUnit: number | null;
    averageDailyUsage: number | null;
    highVolumeDailyUsage: number | null;
    dailyCustomerArrivals: number | null;
    supportHoursPerWeek: number | null;
  };
  simulation: { customerTarget: number | null; durationDays: number | null; seed: number | null };
  targetCustomers: string[];
  variableCostDrivers: string[];
  suggestedFields?: string[];
  industryModel?: {
    capacityLocations: number | null;
    capacityPerLocation: number | null;
    baselineUtilization: number | null;
    averageSellingPrice: number | null;
    averageTransactionLength: number | null;
    cancellationRate: number | null;
    directChannelShare: number | null;
    thirdPartyFeeRate: number | null;
    priceElasticity: number | null;
    startingPaidCustomers: number | null;
    monthlyChurnRate: number | null;
    paidConversionRate: number | null;
    paymentProcessingRate: number | null;
    refundRate: number | null;
    failedTaskRate: number | null;
    customerAcquisitionCost: number | null;
    targetGrossMargin: number | null;
  };
};

type IndustryPreset = {
  industry: string;
  customerProfile: string;
  revenueModel: "subscription" | "unit_sales";
  unitName: string;
  plans: OrganizedBrief["plans"];
  operatingModel: { startingCash: number; fixedMonthlyCosts: number; variableCostPerUnit: number; averageDailyUsage: number; highVolumeDailyUsage: number; dailyCustomerArrivals: number; supportHoursPerWeek: number };
  simulation: { customerTarget: number; durationDays: number; seed: number };
  variableCostDrivers: string[];
};

const small: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const tens: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function wordsToNumber(value: string): number | null {
  const moneyMatch = value.toLowerCase().match(/(.+?)\s+dollars?(?:\s+and)?(?:\s+dot)?(?:\s+(.+?)\s+cents?)?/);
  if (moneyMatch?.[1]) {
    const dollars = wordsToNumber(moneyMatch[1]) ?? 0;
    const cents = moneyMatch[2] ? (wordsToNumber(moneyMatch[2].replace(/\bdot\b/g, "")) ?? 0) : 0;
    return dollars + cents / 100;
  }
  const digit = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (digit) return Number(digit[0]);
  const tokens = value.toLowerCase().replace(/[-–—]/g, " ").replace(/\band\b/g, " ").split(/\s+/).filter(Boolean);
  const decimalIndex = tokens.findIndex((token) => token === "point" || token === "dot");
  const wholeTokens = decimalIndex >= 0 ? tokens.slice(0, decimalIndex) : tokens;
  let total = 0, current = 0, found = false;
  for (const token of wholeTokens) {
    if (small[token] !== undefined) { current += small[token]; found = true; }
    else if (tens[token] !== undefined) { current += tens[token]; found = true; }
    else if (token === "hundred") { current = Math.max(1, current) * 100; found = true; }
    else if (token === "thousand") { total += Math.max(1, current) * 1_000; current = 0; found = true; }
    else if (token === "million") { total += Math.max(1, current) * 1_000_000; current = 0; found = true; }
  }
  if (!found) return null;
  const whole = total + current;
  if (decimalIndex < 0) return whole;
  const decimalTokens = tokens.slice(decimalIndex + 1);
  if (!decimalTokens.length) return whole;
  const decimalPhrase = decimalTokens.map((token) => small[token] ?? tens[token]).filter((number) => number !== undefined).join("");
  return Number(`${whole}.${decimalPhrase || "0"}`);
}

function field(text: string, label: RegExp): string | null {
  const match = text.match(new RegExp(`${label.source}\\s*:\\s*([^\\n.]+)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function numberField(text: string, label: RegExp): number | null {
  const value = field(text, label);
  return value ? wordsToNumber(value) : null;
}

function phraseBefore(text: string, suffix: RegExp): number | null {
  const match = text.match(new RegExp(`([a-z0-9,. -]+?)\\s+${suffix.source}`, "i"));
  return match?.[1] ? wordsToNumber(match[1].split(/[.:]/).at(-1) ?? match[1]) : null;
}

function plan(id: string, name: string, unitPrice: number, includedUnits: number | null = null) {
  return { id, name, monthlyPrice: Math.round(unitPrice * 10000) / 10000, includedUnits, overagePrice: 0, rateLimit: null };
}

function industryPreset(text: string): IndustryPreset {
  if (/hotel|hospitality|lodg(?:e|ing)|resort|guest room|room night|concierge/i.test(text)) return {
    industry: "Hospitality · boutique hotels",
    customerProfile: "Leisure and business travelers seeking distinctive, reliable, mid-priced stays",
    revenueModel: "unit_sales",
    unitName: "room nights",
    plans: [plan("essential-room", "Essential room", 145), plan("signature-room", "Signature room", 195), plan("suite", "Suite", 295)],
    operatingModel: { startingCash: 1_200_000, fixedMonthlyCosts: 90_000, variableCostPerUnit: 45, averageDailyUsage: 0.04, highVolumeDailyUsage: 0.15, dailyCustomerArrivals: 12, supportHoursPerWeek: 150 },
    simulation: { customerTarget: 2_000, durationDays: 180, seed: 7 },
    variableCostDrivers: ["housekeeping and laundry", "guest amenities", "booking and payment fees", "food and beverage service"]
  };
  if (/restaurant|food|beverage|snack|bar\b|packaged|grocery|bakery|cafe/i.test(text)) return {
    industry: "Food and beverage",
    customerProfile: "Consumers seeking a convenient product with clear quality and value",
    revenueModel: "unit_sales",
    unitName: /bar\b/i.test(text) ? "bars" : "items",
    plans: [plan("single", "Single item", 4), plan("bundle", "12-item bundle", 3.25, 12), plan("premium", "Premium bundle", 4.75, 12)],
    operatingModel: { startingCash: 75_000, fixedMonthlyCosts: 12_000, variableCostPerUnit: 1.1, averageDailyUsage: 0.4, highVolumeDailyUsage: 2, dailyCustomerArrivals: 15, supportHoursPerWeek: 40 },
    simulation: { customerTarget: 1_000, durationDays: 120, seed: 42 },
    variableCostDrivers: ["ingredients", "packaging", "fulfillment", "payment fees"]
  };
  if (/saas|software|platform|app\b|api\b|developer|automation|cloud/i.test(text)) return {
    industry: "Software and technology",
    customerProfile: "Teams seeking a reliable workflow improvement with measurable time savings",
    revenueModel: "subscription",
    unitName: /page/i.test(text) ? "pages" : /api/i.test(text) ? "API calls" : "usage units",
    plans: [plan("starter", "Starter", 29, 1_000), plan("growth", "Growth", 99, 10_000), plan("business", "Business", 299, 50_000)],
    operatingModel: { startingCash: 150_000, fixedMonthlyCosts: 25_000, variableCostPerUnit: 0.006, averageDailyUsage: 300, highVolumeDailyUsage: 3_000, dailyCustomerArrivals: 4, supportHoursPerWeek: 30 },
    simulation: { customerTarget: 1_000, durationDays: 180, seed: 7 },
    variableCostDrivers: ["infrastructure", "third-party APIs", "support", "payment fees"]
  };
  if (/agency|consult|professional service|studio|advisory|service business/i.test(text)) return {
    industry: "Professional services",
    customerProfile: "Small and mid-sized organizations seeking specialist expertise",
    revenueModel: "unit_sales",
    unitName: "engagements",
    plans: [plan("project", "Standard engagement", 2_500), plan("retainer", "Monthly retainer", 5_000), plan("strategic", "Strategic engagement", 10_000)],
    operatingModel: { startingCash: 100_000, fixedMonthlyCosts: 35_000, variableCostPerUnit: 800, averageDailyUsage: 0.015, highVolumeDailyUsage: 0.06, dailyCustomerArrivals: 0.35, supportHoursPerWeek: 20 },
    simulation: { customerTarget: 250, durationDays: 180, seed: 7 },
    variableCostDrivers: ["delivery labor", "contractors", "travel", "software"]
  };
  return {
    industry: "General business",
    customerProfile: "Customers described in the business brief",
    revenueModel: "unit_sales",
    unitName: "units",
    plans: [plan("standard", "Standard", 50), plan("premium", "Premium", 90)],
    operatingModel: { startingCash: 100_000, fixedMonthlyCosts: 20_000, variableCostPerUnit: 15, averageDailyUsage: 0.1, highVolumeDailyUsage: 0.5, dailyCustomerArrivals: 3, supportHoursPerWeek: 25 },
    simulation: { customerTarget: 1_000, durationDays: 180, seed: 7 },
    variableCostDrivers: ["delivery", "support", "payment fees"]
  };
}

function inferredName(text: string) {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine || firstLine.length > 100) return null;
  return firstLine.replace(/\s+(?:business\s+)?report\s*$/i, "").trim() || null;
}

function inferredDescription(text: string, name: string | null) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line, index) => index > 0 && line.length >= 30 && !/^\w[\w ]+\s*:/i.test(line)) ?? (name ? `${name} business described by the supplied brief.` : null);
}

export function completeBusinessBrief(model: OrganizedBrief, text: string): OrganizedBrief {
  const preset = industryPreset(`${text}\n${model.industry ?? ""}\n${model.description ?? ""}`);
  const suggested = new Set<string>();
  const explicitOperating: Record<keyof OrganizedBrief["operatingModel"], number | null> = {
    startingCash: numberField(text, /(?:available )?startup capital/),
    fixedMonthlyCosts: numberField(text, /fixed costs per month/),
    variableCostPerUnit: numberField(text, /variable cost per unit/),
    averageDailyUsage: numberField(text, /average usage per customer per day/),
    highVolumeDailyUsage: numberField(text, /high volume usage per day/),
    dailyCustomerArrivals: numberField(text, /new customers per day/),
    supportHoursPerWeek: numberField(text, /support capacity per week/)
  };
  Object.entries(explicitOperating).forEach(([name, value]) => { if (value === null) suggested.add(name); });
  const chooseText = (fieldName: string, value: string | null, fallback: string) => {
    if (value?.trim()) return value.trim();
    suggested.add(fieldName);
    return fallback;
  };
  const chooseNumber = (fieldName: keyof OrganizedBrief["operatingModel"], value: number | null, fallback: number) => {
    if (value !== null && Number.isFinite(value) && value > 0.0001) return value;
    suggested.add(fieldName);
    return fallback;
  };
  const sourceName = model.name?.trim() || inferredName(text) || "Untitled business";
  if (!model.name?.trim()) suggested.add("name");
  const sourceDescription = model.description?.trim() || inferredDescription(text, sourceName) || `${sourceName} business described by the supplied brief.`;
  if (!model.description?.trim()) suggested.add("description");
  const unusablePlans = !model.plans?.length || model.plans.every((item) => !Number.isFinite(item.monthlyPrice) || item.monthlyPrice <= 0) || (/hotel|hospitality/i.test(text) && model.plans.every((item) => item.monthlyPrice < 60));
  if (unusablePlans || !field(text, /pricing/)) suggested.add("plans");
  const modelUnit = model.unitName?.trim();
  const invalidUnit = !modelUnit || modelUnit === "units" || (/hotel|hospitality/i.test(text) && !/room/i.test(modelUnit));
  if (invalidUnit) suggested.add("unitName");
  const explicitRevenueModel = field(text, /revenue model/);
  if (!explicitRevenueModel && model.revenueModel !== preset.revenueModel) suggested.add("revenueModel");
  if (!field(text, /industry/)) suggested.add("industry");
  if (!field(text, /development stage/)) suggested.add("developmentStage");
  if (!field(text, /customer profile/)) suggested.add("customerProfile");
  const hospitality = /hotel|hospitality|lodg(?:e|ing)|resort|guest room|room night|concierge/i.test(`${text} ${model.industry ?? ""}`);
  const suppliedIndustryModel = model.industryModel ?? { capacityLocations: null, capacityPerLocation: null, baselineUtilization: null, averageSellingPrice: null, averageTransactionLength: null, cancellationRate: null, directChannelShare: null, thirdPartyFeeRate: null, priceElasticity: null, startingPaidCustomers: null, monthlyChurnRate: null, paidConversionRate: null, paymentProcessingRate: null, refundRate: null, failedTaskRate: null, customerAcquisitionCost: null, targetGrossMargin: null };
  const subscription = !hospitality && /ai|saas|software|platform|api|subscription|automation|cloud/i.test(`${text} ${model.industry ?? ""}`);
  const industryDefaults = hospitality
    ? { capacityLocations: 3, capacityPerLocation: 60, baselineUtilization: 0.7, averageSellingPrice: 195, averageTransactionLength: 2.2, cancellationRate: 0.12, directChannelShare: 0.45, thirdPartyFeeRate: 0.17, priceElasticity: 1, startingPaidCustomers: 0, monthlyChurnRate: 0, paidConversionRate: 0, paymentProcessingRate: 0, refundRate: 0, failedTaskRate: 0, customerAcquisitionCost: 0, targetGrossMargin: 0.7 }
    : { capacityLocations: 1, capacityPerLocation: 100, baselineUtilization: 0.65, averageSellingPrice: preset.plans[0]?.monthlyPrice ?? 50, averageTransactionLength: 1, cancellationRate: 0.05, directChannelShare: 0.7, thirdPartyFeeRate: 0.03, priceElasticity: 1, startingPaidCustomers: subscription ? 100 : 0, monthlyChurnRate: subscription ? 0.05 : 0, paidConversionRate: subscription ? 0.08 : 0, paymentProcessingRate: subscription ? 0.029 : 0.03, refundRate: subscription ? 0.02 : 0, failedTaskRate: subscription ? 0.03 : 0, customerAcquisitionCost: subscription ? 150 : 0, targetGrossMargin: subscription ? 0.7 : 0.4 };
  const completedIndustryModel = Object.fromEntries(Object.entries(industryDefaults).map(([name, fallback]) => {
    const raw = suppliedIndustryModel[name as keyof typeof suppliedIndustryModel];
    const supplied = Number(raw);
    if (raw !== null && raw !== undefined && Number.isFinite(supplied) && supplied >= 0) return [name, supplied];
    suggested.add(name);
    return [name, fallback];
  })) as OrganizedBrief["industryModel"];
  return {
    ...model,
    name: sourceName,
    industry: chooseText("industry", model.industry, preset.industry),
    developmentStage: chooseText("developmentStage", model.developmentStage, "Early revenue"),
    description: sourceDescription,
    decisionQuestion: chooseText("decisionQuestion", model.decisionQuestion, `Which pricing and cost structure gives ${sourceName} the strongest path to sustainable growth?`),
    customerProfile: chooseText("customerProfile", model.customerProfile, preset.customerProfile),
    revenueModel: explicitRevenueModel ? model.revenueModel : preset.revenueModel,
    unitName: invalidUnit ? preset.unitName : modelUnit,
    plans: unusablePlans ? preset.plans : model.plans,
    operatingModel: {
      startingCash: chooseNumber("startingCash", model.operatingModel.startingCash, preset.operatingModel.startingCash),
      fixedMonthlyCosts: chooseNumber("fixedMonthlyCosts", model.operatingModel.fixedMonthlyCosts, preset.operatingModel.fixedMonthlyCosts),
      variableCostPerUnit: chooseNumber("variableCostPerUnit", model.operatingModel.variableCostPerUnit, preset.operatingModel.variableCostPerUnit),
      averageDailyUsage: chooseNumber("averageDailyUsage", model.operatingModel.averageDailyUsage, preset.operatingModel.averageDailyUsage),
      highVolumeDailyUsage: chooseNumber("highVolumeDailyUsage", model.operatingModel.highVolumeDailyUsage, preset.operatingModel.highVolumeDailyUsage),
      dailyCustomerArrivals: chooseNumber("dailyCustomerArrivals", model.operatingModel.dailyCustomerArrivals, preset.operatingModel.dailyCustomerArrivals),
      supportHoursPerWeek: chooseNumber("supportHoursPerWeek", model.operatingModel.supportHoursPerWeek, preset.operatingModel.supportHoursPerWeek)
    },
    simulation: {
      customerTarget: model.simulation.customerTarget && model.simulation.customerTarget >= 10 ? model.simulation.customerTarget : (suggested.add("customerTarget"), preset.simulation.customerTarget),
      durationDays: model.simulation.durationDays && model.simulation.durationDays >= 30 ? model.simulation.durationDays : (suggested.add("durationDays"), preset.simulation.durationDays),
      seed: model.simulation.seed && model.simulation.seed >= 1 ? model.simulation.seed : (suggested.add("seed"), preset.simulation.seed)
    },
    targetCustomers: model.targetCustomers?.length ? model.targetCustomers : [model.customerProfile || preset.customerProfile],
    variableCostDrivers: model.variableCostDrivers?.length ? model.variableCostDrivers : preset.variableCostDrivers,
    suggestedFields: [...new Set([...(model.suggestedFields ?? []), ...suggested])],
    industryModel: completedIndustryModel
  };
}

function inferPurchasePlans(text: string, fallbackPrice: number | null) {
  const plans: ReturnType<typeof plan>[] = [];
  const single = text.match(/single pack\s+at\s+([^.]+?)(?:\s+per\s+(?:bar|unit|item)|\.)/i);
  if (single?.[1]) plans.push(plan("single", "Single", wordsToNumber(single[1]) ?? fallbackPrice ?? 1));
  const pack = text.match(/([a-z-]+)\s+pack\s+subscription box\s+at\s+([^.]+?)(?:\s+per month|\s+with|\.)/i);
  if (pack?.[1] && pack[2]) {
    const count = wordsToNumber(pack[1]) ?? 1;
    const total = wordsToNumber(pack[2]) ?? 0;
    plans.push(plan("subscription-pack", `${count}-pack`, total / Math.max(1, count), count));
  }
  const bundle = text.match(/variety bundle\s+at\s+([^.]+?)\s+for\s+([^.]+?)\s+(?:packs|units|bars)/i);
  if (bundle?.[1] && bundle[2]) {
    const total = wordsToNumber(bundle[1]) ?? 0;
    const quantityWords = bundle[2].trim().split(/\s+/);
    const multipliedUnits = quantityWords.length >= 2 ? (wordsToNumber(quantityWords[0]!) ?? 1) * (wordsToNumber(quantityWords.slice(1).join(" ")) ?? 1) : null;
    const unitCount = multipliedUnits ?? wordsToNumber(bundle[2]) ?? 24;
    plans.push(plan("variety-bundle", "Variety bundle", total / Math.max(1, unitCount), unitCount));
  }
  if (!plans.length && fallbackPrice !== null) plans.push(plan("standard", "Standard", fallbackPrice));
  return plans;
}

export function organizeBusinessBrief(text: string): OrganizedBrief {
  const name = field(text, /(?:startup|company) name/);
  const industry = field(text, /industry/);
  const description = field(text, /(?:one sentence description|company description|description)/);
  const customerProfile = field(text, /customer profile/);
  const developmentStage = field(text, /development stage/);
  const revenueText = field(text, /revenue model/) ?? "";
  const physical = /one.?time|food|beverage|retail|physical|packaged|per bar|per unit/i.test(`${revenueText} ${industry} ${description} ${text}`);
  const revenueModel = physical ? "unit_sales" as const : "subscription" as const;
  const pricing = field(text, /pricing/);
  const fallbackPrice = pricing ? wordsToNumber(pricing) : null;
  const unitName = /\bbars?\b/i.test(text) ? "bars" : /\borders?\b/i.test(text) ? "orders" : /\bpages?\b/i.test(text) ? "pages" : /\bsessions?\b/i.test(text) ? "sessions" : "units";
  const plans = revenueModel === "unit_sales" ? inferPurchasePlans(text, fallbackPrice) : [plan("starter", "Starter", fallbackPrice ?? 19)];
  const targetMatch = text.match(/([^\n.]+?)\s+(?:synthetic|simulated) customers/i);
  const customerTarget = targetMatch?.[1] ? wordsToNumber(targetMatch[1].split(/\bis\b/i).at(-1) ?? targetMatch[1]) : null;
  const durationMatch = text.match(/(?:duration|simulation window)(?:\s+of|\s+is)?\s+([a-z0-9 -]+?)\s+days/i);
  const durationDays = durationMatch?.[1] ? wordsToNumber(durationMatch[1]) : null;
  const seed = (() => {
    const match = text.match(/seed (?:value )?(?:of |is )?([a-z0-9 -]+?)(?:\.|,|\s+the seed|$)/i);
    return match?.[1] ? wordsToNumber(match[1]) : null;
  })();
  const organized: OrganizedBrief = {
    businessType: /api|developer|endpoint/i.test(`${description} ${industry}`) ? "subscription_api" : "subscription_saas",
    name,
    industry,
    developmentStage,
    description,
    decisionQuestion: name ? `Which pricing and cost structure gives ${name} the strongest path to sustainable growth?` : null,
    customerProfile,
    revenueModel,
    unitName,
    plans,
    operatingModel: {
      startingCash: numberField(text, /(?:available )?startup capital/),
      fixedMonthlyCosts: numberField(text, /fixed costs per month/),
      variableCostPerUnit: numberField(text, /variable cost per unit/),
      averageDailyUsage: numberField(text, /average usage per customer per day/),
      highVolumeDailyUsage: numberField(text, /high volume usage per day/),
      dailyCustomerArrivals: numberField(text, /new customers per day/),
      supportHoursPerWeek: numberField(text, /support capacity per week/)
    },
    simulation: { customerTarget, durationDays, seed },
    targetCustomers: customerProfile ? [customerProfile] : [],
    variableCostDrivers: physical ? ["ingredients", "packaging", "fulfillment"] : ["usage", "infrastructure", "support"]
  };
  return completeBusinessBrief(organized, text);
}
