// LLM layer. Speaks the Amazon Bedrock Converse API shape (messages with text / toolUse / toolResult blocks).
// BedrockLLM calls Converse with tool use. MockLLM is a deterministic rule-based stand-in so the
// whole agent runs and tests pass without AWS credentials.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export type Block =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: any } }
  | { toolResult: { toolUseId: string; content: { json?: any; text?: string }[]; status?: "success" | "error" } };
export type Message = { role: "user" | "assistant"; content: Block[] };
export type ToolSpec = { name: string; description: string; inputSchema: any };
export type Turn = { stopReason: string; message: Message; usage?: { inputTokens?: number; outputTokens?: number } };
export interface LLM { readonly name: string; converse(system: string, messages: Message[], tools: ToolSpec[]): Promise<Turn>; }

export const DEFAULT_MODEL = "us.amazon.nova-lite-v1:0";

export class BedrockLLM implements LLM {
  readonly name: string;
  constructor(private client: { send(c: any): Promise<any> } = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" }),
              private modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL) { this.name = `bedrock:${modelId}`; }
  async converse(system: string, messages: Message[], tools: ToolSpec[]): Promise<Turn> {
    const r = await this.client.send(new ConverseCommand({
      modelId: this.modelId,
      system: [{ text: system }],
      messages: messages as any,
      toolConfig: { tools: tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.inputSchema } } })) },
      inferenceConfig: { maxTokens: 400, temperature: 0.3 },
    }));
    return { stopReason: r.stopReason, message: r.output.message, usage: r.usage };
  }
}

// ---------- Mock ----------
const STATE_NAMES: Record<string, string> = { idaho: "Idaho", "new mexico": "New Mexico", texas: "Texas", utah: "Utah", wyoming: "Wyoming", montana: "Montana", colorado: "Colorado", nevada: "Nevada", california: "California", arizona: "Arizona", washington: "Washington", oregon: "Oregon" };
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
let n = 0; const id = () => `mock-${++n}`;
const use = (name: string, input: any): Block => ({ toolUse: { toolUseId: id(), name, input } });

export class MockLLM implements LLM {
  readonly name = "mock";
  async converse(_s: string, messages: Message[]): Promise<Turn> {
    const last = messages[messages.length - 1];
    const results = last.content.filter((b): b is Extract<Block, { toolResult: any }> => "toolResult" in b);
    if (results.length) {
      // Collect what tools already ran in this request, then either chain one more step or answer.
      const ran = new Set<string>(); const speeches: string[] = []; let profile: any = {};
      for (const m of messages) for (const b of m.content) if ("toolUse" in b) ran.add(b.toolUse.name);
      const all = messages.flatMap((m) => m.content).filter((b): b is Extract<Block, { toolResult: any }> => "toolResult" in b);
      for (const r of all) {
        const j = r.toolResult.content[0]?.json ?? safe(r.toolResult.content[0]?.text);
        if (j?.speech) speeches.push(j.speech);
        if (j?.profile) profile = j.profile;
      }
      const goal = firstUserText(messages).toLowerCase();
      if (/complian|what do i need|get me/.test(goal) && ran.has("check_business_compliance") && !ran.has("next_deadline") && profile.state)
        return tool(use("next_deadline", { state: profile.state, ...(profile.anniversaryMonth ? { anniversaryMonth: profile.anniversaryMonth } : {}) }));
      const say = speeches.filter((s) => !/^Saved\.?$/.test(s)).join(" ") || speeches.join(" ") || "Done.";
      return { stopReason: "end_turn", message: { role: "assistant", content: [{ text: say }] } };
    }
    const t = (last.content.find((b) => "text" in b) as any)?.text?.toLowerCase().trim() ?? "";
    const state = Object.keys(STATE_NAMES).find((k) => t.includes(k)); const S = state && STATE_NAMES[state];
    const mi = MONTHS.findIndex((m) => t.includes(m));
    const url = t.match(/https?:\/\/\S+|\b[\w-]+\.(com|org|net|io|biz|us)\b\S*/)?.[0];
    const patch: any = {};
    if (S) patch.state = S;
    if (/out[- ]of[- ]state|foreign|another state/.test(t)) patch.foreign = true;
    if (mi >= 0) patch.anniversaryMonth = mi + 1;
    if (/text|sms/.test(t) && !/what is|what's|explain/.test(t)) patch.textsCustomers = true;
    if (/employee|hire|hiring/.test(t)) patch.hasEmployees = true;
    if (url) patch.website = url.startsWith("http") ? url : `https://${url}`;
    const calls: Block[] = [];
    if (/^(next|go on|continue|what else|and then)\b/.test(t)) calls.push(use("next_checklist_item", {}));
    else if (/^(repeat|say (that|it) again|again)\b/.test(t)) calls.push(use("repeat_last", {}));
    else if (/\b(done|finished|filed|did that)\b/.test(t) && !/get me|what/.test(t)) calls.push(use("mark_item_done", {}));
    else if (/forget|start over|reset/.test(t)) calls.push(use("forget_business", {}));
    else if (/what is|what's a|whats a|explain|mean/.test(t)) calls.push(use("explain_item", { item: t.replace(/.*(what is|what's a|whats a|explain|mean)\s*(an?\s)?/, "").replace(/[?.!]/g, "").trim() || t }));
    else if (/accessib|website|check my site|check (the )?site/.test(t) && (url || /my site|my website/.test(t))) {
      if (Object.keys(patch).length) calls.push(use("save_business_profile", patch));
      calls.push(use("accessibility_quick_check", { url: patch.website ?? "__profile__" }));
    } else if (/deadline|due|when/.test(t)) {
      if (Object.keys(patch).length) calls.push(use("save_business_profile", patch));
      calls.push(use("next_deadline", { state: S ?? "__profile__", ...(patch.anniversaryMonth ? { anniversaryMonth: patch.anniversaryMonth } : {}) }));
    } else if (/complian|what do i need|get me|checklist|llc|business/.test(t) || S) {
      if (Object.keys(patch).length) calls.push(use("save_business_profile", patch));
      calls.push(use("check_business_compliance", { state: S ?? "__profile__", ...(patch.foreign ? { foreign: true } : {}) }));
    } else if (Object.keys(patch).length) calls.push(use("save_business_profile", patch));
    if (!calls.length) return { stopReason: "end_turn", message: { role: "assistant", content: [{ text: "You can ask what your business needs, your next deadline, or what a term means." }] } };
    return tool(...calls);
  }
}
const tool = (...c: Block[]): Turn => ({ stopReason: "tool_use", message: { role: "assistant", content: c } });
const safe = (s?: string) => { try { return s ? JSON.parse(s) : undefined; } catch { return undefined; } };
const firstUserText = (m: Message[]) => { for (let i = m.length - 1; i >= 0; i--) { const t = m[i].content.find((b) => "text" in b) as any; if (m[i].role === "user" && t) return t.text; } return ""; };

export function pickLLM(): LLM {
  const mode = (process.env.LLM_MODE ?? "auto").toLowerCase();
  const hasCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || !!process.env.AWS_PROFILE;
  if (mode === "mock" || (mode === "auto" && !hasCreds)) return new MockLLM();
  return new BedrockLLM();
}
