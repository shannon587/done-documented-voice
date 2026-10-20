# Done + Documented Voice

**A voice-first compliance assistant for small businesses, built as a self-hosted MCP server for Alexa+.**

## Why it exists
Shannon Watson is a legally blind founder who runs small businesses in Idaho and New Mexico. State compliance sites are walls of dense text and PDFs, and screen readers make them slower still. She works voice-first and needs one short answer at a time: what is due, what does it cost, and what does this word mean.

Done + Documented Voice gives those answers through the Model Context Protocol (MCP), the open standard behind Alexa+ integrations. Any MCP-capable assistant can ask it a question and speak the reply.

## Design rules
- Every reply has a `speech` field short enough to say out loud. Details come one at a time ("Say next for more").
- **No invented facts.** Every fee and rule in `src/data.ts` cites a statute or official source. Anything not verified is labeled *unknown*, and unsupported states say so.
- Data verified Oct 20, 2026. Laws change, so confirm with the state before filing. This is not legal advice.

## Tools
| Tool | What it does |
|---|---|
| `check_business_compliance` | Gives a checklist for an Idaho or New Mexico LLC covering formation or foreign registration, registered agent, annual report, and optionally EIN, SMS consent and website accessibility. |
| `next_deadline` | Gives the next state filing deadline in one sentence. For example, the Idaho annual report is due at the end of the anniversary month (Idaho Code 30-21-213), and New Mexico LLCs have none. |
| `explain_item` | Explains a term like "registered agent" or "A2P" in two plain sentences. |
| `accessibility_quick_check` | Fetches a URL and reports missing alt text, unlabeled form fields, heading problems and a missing page language. |

## Tech
- TypeScript on Node 20
- `@modelcontextprotocol/sdk` **1.32.1**, whose `LATEST_PROTOCOL_VERSION` is `2025-11-25`
- `StreamableHTTPServerTransport` in stateless mode at `POST /mcp`
- Express and zod
- Tests use `node:test` through tsx. They include an end-to-end MCP client test over Streamable HTTP.

## Run
```bash
npm install
npm start          # http://localhost:3000/mcp
npm test
npm run demo       # calls every tool and prints the spoken replies
npx @modelcontextprotocol/inspector   # optional: connect to http://localhost:3000/mcp (Streamable HTTP)
```

## Sources
- Idaho Code 30-21-213 (annual report): https://legislature.idaho.gov/statutesrules/idstat/title30/t30ch21/sect30-21-213/
- Idaho SOS FAQ (foreign registration): https://sos.idaho.gov/business-resources/business-faq/
- NMSA 53-19-63 (NM LLC fees): https://law.justia.com/codes/new-mexico/chapter-53/article-19/section-53-19-63/
- 12.3.4.11 NMAC (NM LLC filings): https://www.law.cornell.edu/regulations/new-mexico/N-M-Admin-Code-SS-12.3.4.11

## Hackathon
Built for the Amazon Developer Hackathon 2026, Alexa+ track (self-hosted MCP server). It was created during the submission window.

## License
MIT
