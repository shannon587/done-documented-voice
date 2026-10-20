// Cost guards for the public demo: per-IP rate limit and a global daily request cap.
export type GuardOpts = { perIpPerMinute: number; perIpPerDay: number; globalPerDay: number };
export const DEFAULT_GUARD: GuardOpts = {
  perIpPerMinute: Number(process.env.RATE_PER_MIN ?? 8),
  perIpPerDay: Number(process.env.RATE_PER_IP_DAY ?? 120),
  globalPerDay: Number(process.env.DAILY_CAP ?? 1500),
};
export class Guard {
  private day = ""; private total = 0; private perDay = new Map<string, number>(); private recent = new Map<string, number[]>();
  constructor(private o: GuardOpts = DEFAULT_GUARD, private now = () => Date.now()) {}
  check(ip: string): { ok: true } | { ok: false; speech: string } {
    const t = this.now(); const d = new Date(t).toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.total = 0; this.perDay.clear(); }
    if (this.total >= this.o.globalPerDay) return { ok: false, speech: "The demo has reached its limit for today. Please try again tomorrow." };
    if ((this.perDay.get(ip) ?? 0) >= this.o.perIpPerDay) return { ok: false, speech: "You've reached today's limit for this demo. Thank you for testing. Please come back tomorrow." };
    const r = (this.recent.get(ip) ?? []).filter((x) => t - x < 60_000);
    if (r.length >= this.o.perIpPerMinute) { this.recent.set(ip, r); return { ok: false, speech: "That was a lot of questions quickly. Please wait a minute and try again." }; }
    r.push(t); this.recent.set(ip, r); this.perDay.set(ip, (this.perDay.get(ip) ?? 0) + 1); this.total++;
    return { ok: true };
  }
  stats() { return { day: this.day, total: this.total, cap: this.o.globalPerDay }; }
}
