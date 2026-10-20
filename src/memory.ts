// Per-business memory that survives restarts: a small JSON file store.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export type ChecklistItem = { item: string; text: string; fee?: string; source: string };
export type Profile = {
  businessId: string;
  name?: string;
  state?: string;
  foreign?: boolean;
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
  forget(id: string) { delete this.data[id]; this.save(); }
  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }
}
