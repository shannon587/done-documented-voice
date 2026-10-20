# Friction log (draft)

| Task | Steps | Expected | Actual | Severity | Workaround | Suggestion |
|---|---|---|---|---|---|---|
| Test the MCP server on Alexa+ | Read the hackathon overview and looked for a way to register a self-hosted MCP endpoint | A free developer sandbox or simulator | No self-serve path was found without Preview access | High | Demoed with an MCP client and Inspector | Offer an Alexa+ MCP test console |
| Confirm spec 2025-11-25 support | Checked the SDK docs | A clear statement of the supported spec | Had to read `LATEST_PROTOCOL_VERSION` in node_modules | Low | Read the constants in the source | List supported protocol versions in the README |
| Voice-friendly output | Designed reply lengths | Guidance on reply length and formatting for Alexa+ | None found | Medium | Kept a short custom `speech` field | Publish voice response guidelines for MCP tools |
| Wire Bedrock Converse tool use to MCP tools | Mapped MCP `listTools` JSON Schemas into Converse `toolSpec.inputSchema.json` | A documented helper or example for MCP to Converse | No official adapter; wrote about 20 lines by hand | Medium | Manual mapping in `src/llm.ts` | Ship an MCP-to-Converse tool adapter in the AWS SDK or Strands docs |
| Pick a cheap Bedrock model ID | Looked up Nova and Haiku model IDs | One ID that works in any region | Some models need a cross-region inference profile ID (`us.` prefix), and the plain model ID fails with a ValidationException | Medium | Default to `us.amazon.nova-lite-v1:0`, overridable by env var | Show in the console which ID form each model needs per region |
| Develop without AWS credits | Credits ran out on Oct 7 | Credits available for the full window | Had to plan around a personal card | Medium | A mock LLM mode that emits Converse-shaped tool calls, so development and tests need no AWS | Keep a sandbox quota for hackathon entrants |
| Voice in the browser | Web Speech API for push-to-talk | Works in all major browsers | Speech recognition is only in Chromium-based browsers and Safari, with different behaviors | Low | Typed fallback and a clear spoken message | Recommend a cross-browser voice path for simulated Alexa+ experiences |
