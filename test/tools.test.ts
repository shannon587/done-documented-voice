import { ensureDue } from "../src/agent.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "../src/tools.js";
import { STATES } from "../src/data.js";

test("every state fact has a source URL", () => {
  for (const s of Object.values(STATES)) for (const f of [s.annualReport, s.formation, s.foreignRegistration, s.registeredAgent]) assert.match(f.source, /^https:\/\//);
});
test("Idaho checklist is short and sourced", () => {
  const r = T.checkCompliance({ state: "idaho", foreign: true, textsCustomers: true });
  assert.equal(r.items.length, 4);
  assert.ok(r.speech.length < 200);
  assert.match(r.speech, /\$100/);
});
test("NM has no annual report", () => assert.match(T.nextDeadline({ state: "NM" }).speech, /no annual report/i));
test("Idaho deadline rolls to end of anniversary month", () => {
  assert.equal(T.nextDeadline({ state: "ID", anniversaryMonth: 10, today: "2026-10-20" }).due, "2026-10-31");
  assert.equal(T.nextDeadline({ state: "ID", anniversaryMonth: 3, today: "2026-10-20" }).due, "2027-03-31");
  assert.equal(T.nextDeadline({ state: "ID", anniversaryMonth: 2, today: "2027-01-05" }).due, "2027-02-28");
});
test("unknown state is marked unknown", () => assert.match(T.checkCompliance({ state: "TX" }).speech, /unknown/));
test("explain is short", () => {
  assert.match(T.explainItem({ item: "registered agent" }).speech, /legal papers/);
  assert.match(T.explainItem({ item: "zzz" }).speech, /don't have/);
});
test("a11y finds issues", () => {
  const r = T.a11yFromHtml('<html><body><img src=a><input id=x><h1>a</h1></body></html>');
  assert.deepEqual(r.issues, ["1 image missing alt text", "1 form field without a label", "page language not set"]);
  assert.equal(T.a11yFromHtml('<html lang=en><h1>x</h1><img alt=""><label for=e>E</label><input id=e></html>').issues.length, 0);
});
test("bad URL handled", async () => assert.match((await T.accessibilityQuickCheck({ url: "ftp://x" })).speech, /web address/));

test("existing Idaho LLC: no formation, leads with annual report and its due date", () => {
  const r = T.checkCompliance({ state: "Idaho", anniversaryMonth: 3, today: "2026-10-20" });
  assert.ok(!r.items.some((i: any) => i.item === "Formation"));
  assert.equal(r.items[0].item, "Annual report");
  assert.match(r.speech, /Due March 31, 2027/);
  assert.doesNotMatch(r.speech, /\$100 online|Expedite/);
  for (const i of r.items) assert.ok((i as any).due, `${i.item} has a due`);
});

test("existing LLC without a known month still says when it's due", () => {
  const r = T.checkCompliance({ state: "Idaho" });
  assert.match(r.speech, /Due by the end of your anniversary month/);
});

test("forming an LLC lists formation first", () => {
  const r = T.checkCompliance({ state: "Idaho", forming: true });
  assert.equal(r.items[0].item, "Formation");
});

test("ensureDue adds a due date and strips formation fees for an existing LLC", () => {
  const c = T.checkCompliance({ state: "Idaho", anniversaryMonth: 3, today: "2026-10-20" });
  assert.match(ensureDue("First you need your annual report.", c), /Due March 31, 2027/);
  assert.equal(ensureDue("First: Formation. Fee: $100 online, $120 paper.", c), c.speech);
});
