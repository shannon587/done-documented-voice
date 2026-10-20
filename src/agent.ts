// The Done + Documented Voice agent: an LLM (Bedrock Converse, or the mock) plans the steps,
// calls our MCP server's tools over Streamable HTTP as an MCP client, and keeps per-business memory.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { LLM, Message, ToolSpec, Block } from "./llm.js";
import { MemoryStore, type Profile } from "./memory.js";

const MAX_STEPS = 6;

export const SYSTEM = (p: Profile, today: string) => `You are Done + Documented Voice, a voice-first small business compliance assistant.
Your replies are spoken aloud to owners who may be blind or low-vision. Rules:
- Reply in one to three short sentences. Plain words, no lists, no markdown, no URLs read aloud.
- Every compliance answer must state when the item is due, using the due date from the tools.
- Assume the LLC already exists unless the owner says they are starting or forming one. For existing LLCs never mention formation fees; lead with recurring obligations like the annual report and registered agent.
- Give one item at a time. Offer "say next" when more remain.
- Only state fees, rules and deadlines that come back from tools. If a tool says unknown, say it's unknown. Never guess.
- Never ask what the business does. If the owner names a state (for example Idaho) or entity type (LLC), act right away: call save_business_profile with the state, then check_business_compliance with that state, then next_deadline, then answer concretely with the first required filing, its fee and due date from the tools.
- Questions like "what does my LLC need to file this year" or "what do I need" mean: build the checklist with tools. Only ask a question if no state is known at all.
- Do not output thinking, reasoning or tags. Output only the words to speak.
- For a goal like "get me compliant", save what you learn with save_business_profile, run check_business_compliance, then next_deadline, then answer with the first item.
- For "next" use next_checklist_item. For "repeat" use repeat_last. When the owner says an item is done, use mark_item_done.
- If asked who you are or what this is: you are the Done + Documented voice assistant, built by founder Shannon Watson. Never say you are Shannon.
- This is information, not legal advice.
Today is ${today}. Known business profile (from earlier sessions): ${JSON.stringify(strip(p))}`;
const strip = (p: Profile) => { const { checklist, lastSpeech, ...rest } = p; return { ...rest, checklistItems: checklist?.map((c) => c.item) }; };

const LOCAL_TOOLS: ToolSpec[] = [
  { name: "save_business_profile", description: "Remember facts about this business across sessions.", inputSchema: { type: "object", properties: {
    name: { type: "string" }, state: { type: "string" }, foreign: { type: "boolean", description: "Formed in another state" }, forming: { type: "boolean", description: "Only true if the owner has NOT formed the LLC yet" },
    anniversaryMonth: { type: "integer", minimum: 1, maximum: 12 }, hasEmployees: { type: "boolean" }, textsCustomers: { type: "boolean" }, website: { type: "string" } } } },
  { name: "next_checklist_item", description: "Speak the next item on the saved compliance checklist.", inputSchema: { type: "object", properties: {} } },
  { name: "repeat_last", description: "Repeat the last spoken answer.", inputSchema: { type: "object", properties: {} } },
  { name: "mark_item_done", description: "Mark the current checklist item as done.", inputSchema: { type: "object", properties: { item: { type: "string" } } } },
  { name: "forget_business", description: "Delete everything remembered about this business.", inputSchema: { type: "object", properties: {} } },
];

export const cleanSpeech = (t: string) => t.replace(/<thinking>[\s\S]*?(<\/thinking>|$)/gi, "").replace(/<\/?[a-z_]+>/gi, "").replace(/\s+/g, " ").trim();

// Safety net: a compliance answer must always carry a due date, and an existing LLC never hears formation fees.
export function ensureDue(speech: string, c?: { items: { item: string; due?: string; fee?: string }[]; dueSpeech?: string; speech?: string }) {
  if (!c?.items?.length) return speech;
  const hasFormation = c.items.some((i) => i.item === "Formation");
  if (!hasFormation && /formation|certificate of organization|\$100 online, \$120 paper|expedite/i.test(speech) && !/foreign/i.test(speech)) speech = c.speech ?? speech;
  if (/\bdue\b|deadline|no recurring|anniversary month|ongoing|at all times/i.test(speech)) return speech;
  return `${speech} ${c.items[0].due ?? c.dueSpeech ?? ""}`.trim();
}

// The model sometimes reads "we formed it in March" as forming. Only trust forming when the owner clearly says so.
export const saysForming = (t: string) => /\b(start|starting|form|forming|open|opening|create|creating|set up|setting up|register|registering) (a |an |my |our )?(new )?(llc|business|company)\b|haven'?t formed|not formed yet|before (i|we) form/i.test(t);

export type AgentReply = { speech: string; steps: { tool: string; input: any }[]; model: string };

export class Agent {
  constructor(private llm: LLM, private mcpUrl: URL, private memory: MemoryStore, private today = () => new Date().toISOString().slice(0, 10)) {}

  private lastText = "";
  async chat(businessId: string, userText: string): Promise<AgentReply> {
    this.lastText = userText;
    // "next" and "repeat" are navigation, not questions: handle them directly so the model can't restart the list.
    const nav = userText.trim().toLowerCase().replace(/[.!?]/g, "");
    const navTool = /^(next|next one|go on|continue|what else)$/.test(nav) ? "next_checklist_item" : /^(repeat|say that again|say it again|again)$/.test(nav) ? "repeat_last" : undefined;
    if (navTool) {
      const speech = this.local(businessId, navTool, {}).speech;
      if (navTool !== "repeat_last") this.memory.update(businessId, { lastSpeech: speech });
      return { speech, steps: [{ tool: navTool, input: {} }], model: this.llm.name };
    }
    const client = new Client({ name: "dd-voice-agent", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(this.mcpUrl));
    try {
      const mcpTools: ToolSpec[] = (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema }));
      const tools = [...mcpTools, ...LOCAL_TOOLS];
      const mcpNames = new Set(mcpTools.map((t) => t.name));
      const messages: Message[] = [{ role: "user", content: [{ text: userText }] }];
      const steps: AgentReply["steps"] = [];
      let compliance: any;
      for (let i = 0; i < MAX_STEPS; i++) {
        const turn = await this.llm.converse(SYSTEM(this.memory.get(businessId), this.today()), messages, tools);
        messages.push(turn.message);
        const uses = turn.message.content.filter((b): b is Extract<Block, { toolUse: any }> => "toolUse" in b);
        if (turn.stopReason !== "tool_use" || !uses.length) {
          // Fallback: if the model asked a question instead of acting on a named state, act deterministically.
          if (!steps.length && i === 0) {
            const st = /\bidaho\b/i.test(userText) ? "Idaho" : /new mexico/i.test(userText) ? "New Mexico" : undefined;
            if (st && /llc|business|file|need|complian|due|deadline/i.test(userText)) {
              const input = this.fill(businessId, "check_business_compliance", { state: st });
              this.memory.update(businessId, { state: st });
              steps.push({ tool: "save_business_profile", input: { state: st } }, { tool: "check_business_compliance", input });
              const json = await this.callMcp(client, "check_business_compliance", input);
              if (json.items?.length) this.memory.update(businessId, { checklist: json.items, cursor: 0 });
              const speech = json.speech;
              this.memory.update(businessId, { lastSpeech: speech });
              return { speech, steps, model: this.llm.name };
            }
          }
          let speech = cleanSpeech(turn.message.content.filter((b): b is { text: string } => "text" in b).map((b) => b.text).join(" ")) || "Sorry, I didn't catch that.";
          speech = ensureDue(speech, compliance);
          this.memory.update(businessId, { lastSpeech: speech });
          return { speech, steps, model: this.llm.name };
        }
        const results: Block[] = [];
        for (const u of uses) {
          const { name, toolUseId } = u.toolUse; const input = name === "save_business_profile" ? this.sanitize(businessId, u.toolUse.input ?? {}) : this.fill(businessId, name, u.toolUse.input ?? {});
          steps.push({ tool: name, input });
          let json: any;
          try {
            json = mcpNames.has(name) ? await this.callMcp(client, name, input) : this.local(businessId, name, input);
            if (name === "check_business_compliance" && json.items?.length) { compliance = json; this.memory.update(businessId, { checklist: json.items, cursor: 0 }); }
            results.push({ toolResult: { toolUseId, content: [{ json }] } });
          } catch (e: any) {
            results.push({ toolResult: { toolUseId, content: [{ text: `Error: ${e?.message ?? e}` }], status: "error" } });
          }
        }
        messages.push({ role: "user", content: results });
      }
      return { speech: "That took too many steps. Try a shorter question.", steps, model: this.llm.name };
    } finally { await client.close(); }
  }

  // Fill missing arguments from memory so a returning owner doesn't have to repeat themselves.
  private fill(id: string, name: string, input: any) {
    const p = this.memory.get(id); const x = { ...input };
    if (x.forming && !saysForming(this.lastText)) delete x.forming;
    if (["check_business_compliance", "next_deadline"].includes(name)) {
      if (!x.state || x.state === "__profile__") x.state = p.state ?? "unknown";
      if (name === "check_business_compliance") {
        for (const k of ["foreign", "forming", "hasEmployees", "textsCustomers", "anniversaryMonth"] as const) if (x[k] === undefined && p[k] !== undefined) x[k] = p[k];
        if (x.hasWebsite === undefined && p.website) x.hasWebsite = true;
        x.today ??= this.today();
      }
      if (name === "next_deadline") { if (!x.anniversaryMonth && p.anniversaryMonth) x.anniversaryMonth = p.anniversaryMonth; x.today ??= this.today(); }
    }
    if (name === "accessibility_quick_check" && (!x.url || x.url === "__profile__")) x.url = p.website ?? "";
    return x;
  }

  private sanitize(id: string, input: any) {
    const x = { ...input };
    if (x.forming && !saysForming(this.lastText)) delete x.forming;
    if (/\b(formed|was formed|we formed|i formed|registered (it|in))\b/i.test(this.lastText) && !saysForming(this.lastText)) x.forming = false;
    return x;
  }

  private async callMcp(client: Client, name: string, args: any) {
    const r: any = await client.callTool({ name, arguments: args });
    const t = r.content?.find((c: any) => c.type === "text")?.text ?? "{}";
    return JSON.parse(t);
  }

  private local(id: string, name: string, input: any): any {
    const m = this.memory; const p = m.get(id);
    switch (name) {
      case "save_business_profile": return { speech: "Saved.", profile: strip(m.update(id, input)) };
      case "repeat_last": return { speech: p.lastSpeech ?? "Nothing to repeat yet." };
      case "forget_business": m.forget(id); return { speech: "Okay, I've forgotten this business." };
      case "next_checklist_item": {
        const list = p.checklist ?? [];
        if (!list.length) return { speech: "There's no checklist yet. Ask what your business needs first." };
        const i = (p.cursor ?? 0) + 1;
        if (i >= list.length) return { speech: "That's the whole checklist. Nice work." };
        m.update(id, { cursor: i }); const it = list[i];
        return { speech: `Item ${i + 1} of ${list.length}: ${it.item}. ${it.text}${(it as any).due ? " " + (it as any).due : ""}${it.fee ? " Fee: " + it.fee : ""}${i + 1 < list.length ? " Say next for more." : ""}`, source: it.source };
      }
      case "mark_item_done": {
        const list = p.checklist ?? []; const it = input.item ?? list[p.cursor ?? 0]?.item;
        if (!it) return { speech: "Nothing to mark done yet." };
        m.update(id, { done: [...new Set([...(p.done ?? []), it])] });
        return { speech: `Marked ${it} done.` };
      }
    }
    throw new Error(`Unknown tool ${name}`);
  }
}
