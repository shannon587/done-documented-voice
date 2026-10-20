// Compliance data for Idaho and New Mexico LLCs.
// RULE: every fact carries a source URL. If something is not verified, it is marked unknown.
// Verified Oct 20, 2026. Laws change; always confirm with the state before filing.

export type Fact = { text: string; fee: string; source: string };
export type StateData = {
  name: string;
  annualReport: Fact & { required: boolean; due: string };
  formation: Fact;
  foreignRegistration: Fact;
  registeredAgent: Fact;
  portal: string;
  unknowns: string[];
};

export const STATES: Record<string, StateData> = {
  ID: {
    name: "Idaho",
    annualReport: {
      required: true,
      due: "end of the anniversary month of formation or foreign registration",
      text: "Idaho LLCs, domestic and foreign, file an annual report every year by the last day of their anniversary month.",
      fee: "$0 online through SOSBiz (a payment-processor convenience fee may apply; amount unknown). Paper adds a $20 surcharge.",
      source: "https://legislature.idaho.gov/statutesrules/idstat/title30/t30ch21/sect30-21-213/",
    },
    formation: {
      text: "Form a domestic LLC with a Certificate of Organization.",
      fee: "$100 online, $120 paper. Expedite: +$40 8-hour, +$100 same-day.",
      source: "https://www.discern.com/resources/idaho-real-estate-business-compliance-entity-requirements",
    },
    foreignRegistration: {
      text: "An out-of-state LLC doing business in Idaho files a Foreign Registration Statement with a home-state Certificate of Existence dated within 90 days.",
      fee: "$100 online, $120 paper.",
      source: "https://sos.idaho.gov/business-resources/business-faq/",
    },
    registeredAgent: {
      text: "You must keep a registered agent with a physical Idaho street address. No P.O. boxes.",
      fee: "No state fee to keep one.",
      source: "https://www.discern.com/resources/idaho-real-estate-business-compliance-entity-requirements",
    },
    portal: "https://sos.idaho.gov/",
    unknowns: ["Exact SOSBiz convenience fee", "Sales tax permit specifics (see Idaho State Tax Commission)"],
  },
  NM: {
    name: "New Mexico",
    annualReport: {
      required: false,
      due: "none",
      text: "New Mexico LLCs have no annual or biennial report. The biennial report rule is for corporations.",
      fee: "$0, because there is no report.",
      source: "https://www.law.cornell.edu/regulations/new-mexico/N-M-Admin-Code-SS-12.3.4.11",
    },
    formation: {
      text: "Form a domestic LLC by filing Articles of Organization online.",
      fee: "$50 (NMSA 53-19-63 A).",
      source: "https://law.justia.com/codes/new-mexico/chapter-53/article-19/section-53-19-63/",
    },
    foreignRegistration: {
      text: "An out-of-state LLC registers as a foreign LLC.",
      fee: "$100 (NMSA 53-19-63 K). A certificate, such as good standing, is $25 (53-19-63 E).",
      source: "https://law.justia.com/codes/new-mexico/chapter-53/article-19/section-53-19-63/",
    },
    registeredAgent: {
      text: "You must keep a New Mexico registered agent and office on file at all times. Changing them costs $20.",
      fee: "$20 to file a change (NMSA 53-19-63 I).",
      source: "https://law.justia.com/codes/new-mexico/chapter-53/article-19/section-53-19-63/",
    },
    portal: "https://enterprise.sos.nm.gov/",
    unknowns: ["Gross receipts tax registration details (see NM Taxation and Revenue)"],
  },
};

// Federal / cross-state items, plainly marked where unverified here.
export const GENERAL = {
  ein: { text: "If you have employees, you need an EIN from the IRS. It is free.", source: "https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online" },
  boi: { text: "Federal BOI reporting: as of March 2025, FinCEN exempted U.S.-formed companies. Status may change.", source: "https://www.fincen.gov/boi" },
  sms: { text: "If you text customers, get written consent and register for A2P 10DLC through your SMS provider.", source: "https://www.ctia.org/the-wireless-industry/industry-commitments/messaging-interoperability-sms-mms" },
  ada: { text: "Your website should meet WCAG basics: alt text, form labels, clear headings.", source: "https://www.ada.gov/resources/web-guidance/" },
};

export const EXPLAIN: Record<string, string> = {
  "annual report": "A short yearly update to the state with your name, addresses and a manager. Miss it and the state can dissolve your company.",
  "registered agent": "The person or company that accepts legal papers for your business. They need a real street address in that state.",
  "foreign registration": "Permission for a company formed in one state to do business in another. Foreign just means out of state.",
  "good standing": "A state certificate saying your company is up to date. Other states often ask for one dated within 90 days.",
  "ein": "Your business's tax ID number from the IRS. It's free and takes minutes online.",
  "a2p": "A2P 10DLC is carrier registration for business texting. Without it, your texts can be blocked.",
  "boi": "Beneficial ownership information, a federal report of who owns a company. U.S. companies are currently exempt.",
  "wcag": "Web accessibility guidelines. They make sure blind and low-vision people can use your site.",
};
