// Per-business memory that survives restarts: a small JSON file store.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export type ChecklistItem = { item: string; text: string; fee?: string; source: string; due?: string };
export type Profile = {
  businessId: string;
  name?: string;
  state?: string;
  foreign?: boolean;
  forming?: boolean;
  anniversaryMonth?: number;
  hasEmployees?: boolean;
  textsCustomers?: boolean;
  website?: string;
  checklist?: ChecklistItem[];
  cursor?: number; // index of the checklist item last spoken
  done?: string[]; // items the owner marked done
  lastSpeech?: string;
  updatedAt?: string;
};

export class MemoryStore {
  private data: Record<string, Profile> = {};
  constructor(private file: string) {
    if (existsSync(file)) this.data = JSON.parse(readFileSync(file, "utf8"));
  }
  get(id: string): Profile {
    return this.data[id] ?? { businessId: id };
  }
  update(id: string, patch: Partial<Profile>): Profile {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null));
    const p = { ...this.get(id), ...clean, businessId: id, updatedAt: new Date().toISOString() };
    this.data[id] = p;
    this.save();
    return p;
  }
  // Rebuild a profile the phone kept in localStorage (Lambda containers forget). Only known fields, bounded sizes.
  seed(id: string, raw: unknown) {
    const cur = this.data[id];
    if ((cur && (cur.state || cur.checklist?.length)) || !raw || typeof raw !== "object") return;
    const r = raw as any; const p: Profile = { businessId: id };
    const str = (v: any, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
    p.name = str(r.name, 80); p.state = str(r.state, 40); p.website = str(r.website, 200); p.lastSpeech = str(r.lastSpeech, 600);
    for (const k of ["foreign", "forming", "hasEmployees", "textsCustomers"] as const) if (typeof r[k] === "boolean") p[k] = r[k];
    if (Number.isInteger(r.anniversaryMonth) && r.anniversaryMonth >= 1 && r.anniversaryMonth <= 12) p.anniversaryMonth = r.anniversaryMonth;
    if (Array.isArray(r.checklist)) p.checklist = r.checklist.slice(0, 12).filter((c: any) => c && typeof c.item === "string" && typeof c.text === "string")
      .map((c: any) => ({ item: c.item.slice(0, 60), text: c.text.slice(0, 400), source: str(c.source, 300) ?? "", fee: str(c.fee, 200), due: str(c.due, 200) }));
    if (Number.isInteger(r.cursor) && r.cursor >= 0 && r.cursor < 12) p.cursor = r.cursor;
    if (Array.isArray(r.done)) p.done = r.done.filter((x: any) => typeof x === "string").slice(0, 12).map((x: string) => x.slice(0, 60));
    const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Profile;
    if (Object.keys(clean).length > 1) this.data[id] = { ...cur, ...clean };
  }
  forget(id: string) { delete this.data[id]; this.save(); }
  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }
}
