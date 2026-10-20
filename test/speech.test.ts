import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSpeech } from "../src/agent.ts";
test("strips Nova thinking blocks and tags from speech", () => {
  assert.equal(cleanSpeech("<thinking>plan</thinking> Hi there."), "Hi there.");
  assert.equal(cleanSpeech("<say> Next: report. </say>"), "Next: report.");
  assert.equal(cleanSpeech("Ok. <thinking>unclosed"), "Ok.");
});
