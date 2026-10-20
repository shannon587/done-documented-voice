import { STATES, GENERAL, EXPLAIN } from "./data.js";

const norm = (s: string) => {
  const k = s.trim().toUpperCase();
  if (k === "IDAHO") return "ID";
  if (k === "NEW MEXICO") return "NM";
  return k;
};
const unsupported = (s: string) => `I only have verified data for Idaho and New Mexico right now. ${s} is unknown.`;

type Item = { item: string; text: string; source: string; fee?: string; due?: string };
const feeOf = (f?: string) => (f ?? "none").replace(/\.$/, "");

// Existing businesses (the default) hear recurring obligations first, each with its next due date.
// Formation is only listed when the owner says they are still forming the LLC.
export function checkCompliance(a: { state: string; foreign?: boolean; forming?: boolean; hasEmployees?: boolean; textsCustomers?: boolean; hasWebsite?: boolean; anniversaryMonth?: number; today?: string }) {
  const st = STATES[norm(a.state)];
  if (!st) return { speech: unsupported(a.state), items: [] };
  const dl = nextDeadline({ state: a.state, anniversaryMonth: a.anniversaryMonth, today: a.today });
  const annualDue = !st.annualReport.required ? "No annual report, so no recurring state deadline."
    : (dl as any).due ? `Due ${dl.speech.match(/due ([^.]+)\./)?.[1]}.` : "Due by the end of your anniversary month. Tell me your formation month for the exact date.";
  const items: Item[] = [];
  if (a.forming) items.push({ item: "Formation", ...st.formation, due: "Due before you start doing business." });
  if (a.foreign) items.push({ item: "Foreign registration", ...st.foreignRegistration, due: "Due before you do business in " + st.name + ". If you've already registered, say done." });
  if (st.annualReport.required) items.push({ item: "Annual report", text: st.annualReport.text, fee: st.annualReport.fee, source: st.annualReport.source, due: annualDue });
  items.push({ item: "Registered agent", ...st.registeredAgent, due: "Ongoing. Keep one on file at all times." });
  if (a.hasEmployees) items.push({ item: "EIN", ...GENERAL.ein, due: "Before your first payroll." });
  if (a.textsCustomers) items.push({ item: "SMS consent", ...GENERAL.sms, due: "Before you send marketing texts." });
  if (a.hasWebsite) items.push({ item: "Website accessibility", ...GENERAL.ada, due: "Ongoing." });
  if (!st.annualReport.required && !a.forming) items.push({ item: "No annual report", text: st.annualReport.text, fee: st.annualReport.fee, source: st.annualReport.source, due: annualDue });
  const first = items[0];
  const speech = `${st.name}: ${items.length} items. First: ${first.item}. ${first.due} Fee: ${feeOf(first.fee).replace(/\s*\([^)]*\)/g, "")}.${items.length > 1 ? ' Say "next" for more.' : ""}`;
  return { speech, items, dueSpeech: dl.speech, ...((dl as any).due ? { nextDue: (dl as any).due } : {}), unknowns: st.unknowns };
}

export function nextDeadline(a: { state: string; anniversaryMonth?: number; today?: string }) {
  const st = STATES[norm(a.state)];
  if (!st) return { speech: unsupported(a.state) };
  if (!st.annualReport.required) return { speech: `${st.name} LLCs have no annual report. No recurring state deadline.`, source: st.annualReport.source };
  if (!a.anniversaryMonth) return { speech: `${st.name} annual report is due by the end of your anniversary month. Tell me your formation month.`, source: st.annualReport.source };
  const t = a.today ? new Date(a.today + "T12:00:00") : new Date();
  let y = t.getFullYear();
  const end = (yr: number) => new Date(yr, a.anniversaryMonth!, 0);
  if (end(y) < new Date(t.getFullYear(), t.getMonth(), t.getDate())) y++;
  const d = end(y);
  const label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return { speech: `Next: ${st.name} annual report, due ${label}. Free online.`, due: d.toISOString().slice(0, 10), source: st.annualReport.source };
}

export function explainItem(a: { item: string }) {
  const k = a.item.trim().toLowerCase();
  const hit = Object.keys(EXPLAIN).find((x) => k.includes(x) || x.includes(k));
  return { speech: hit ? EXPLAIN[hit] : `I don't have a verified explanation for "${a.item}" yet.` };
}

export function a11yFromHtml(html: string) {
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = imgs.filter((t) => !/\balt\s*=/i.test(t)).length;
  const inputs = (html.match(/<input\b[^>]*>/gi) ?? []).filter((t) => !/type\s*=\s*["']?(hidden|submit|button)/i.test(t));
  const ids = new Set([...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1]));
  const unlabeled = inputs.filter((t) => {
    if (/aria-label(ledby)?\s*=/i.test(t)) return false;
    const id = t.match(/\bid\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    return !(id && ids.has(id));
  }).length;
  const h1 = (html.match(/<h1\b/gi) ?? []).length;
  const lang = /<html\b[^>]*\blang\s*=/i.test(html);
  const issues: string[] = [];
  if (noAlt) issues.push(`${noAlt} image${noAlt > 1 ? "s" : ""} missing alt text`);
  if (unlabeled) issues.push(`${unlabeled} form field${unlabeled > 1 ? "s" : ""} without a label`);
  if (h1 !== 1) issues.push(h1 === 0 ? "no main heading" : `${h1} main headings, should be one`);
  if (!lang) issues.push("page language not set");
  return { speech: issues.length ? `${issues.length} issues. First: ${issues[0]}.` : "No basic issues found.", issues };
}

export async function accessibilityQuickCheck(a: { url: string }) {
  let u: URL;
  try { u = new URL(a.url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { return { speech: "That doesn't look like a web address." , issues: [] }; }
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
    return a11yFromHtml((await r.text()).slice(0, 2_000_000));
  } catch { return { speech: "I couldn't reach that page.", issues: [] }; }
}
