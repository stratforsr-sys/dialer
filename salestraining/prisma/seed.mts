import Database from "better-sqlite3";
import { randomUUID } from "crypto";

const db = new Database("dev.db");

function cuid() {
  return randomUUID().replace(/-/g, "").slice(0, 25);
}

console.log("Seeding database...");

// DEFAULT USER
db.prepare(`INSERT OR IGNORE INTO User (id, name, pin, createdAt) VALUES (?, ?, ?, ?)`).run(
  "default-user", "Saljare", "1234", new Date().toISOString()
);

db.prepare(`INSERT OR IGNORE INTO UserSettings (id, userId, repetitionFrequency, dailyGoalMinutes, preferredTime) VALUES (?, ?, ?, ?, ?)`).run(
  cuid(), "default-user", "daily", 60, "18:00"
);

console.log("Created user: Saljare");

// DEFAULT PERSONAS
const personas = [
  {
    id: "anna-lindstrom",
    name: "Anna Lindstrom",
    title: "IT-chef",
    company: "TechNord AB",
    industry: "SaaS / Tech",
    companySize: "200 anstallda",
    personality: "Teknisk och detaljorienterad. Vill se bevis och data innan beslut. Staller manga fragor om integration och sakerhet.",
    currentSolution: "Intern losning byggd av eget team",
    painPoints: JSON.stringify(["Skalbarhet med intern losning", "Underhallskostnad vaxer", "Svart att rekrytera utvecklare"]),
    objections: JSON.stringify(["Vi har redan en intern losning", "Hur hanterar ni GDPR?", "Varfor skulle vi lita pa en extern leverantor?"]),
  },
  {
    id: "magnus-eriksson",
    name: "Magnus Eriksson",
    title: "VD",
    company: "Nordic Solutions AB",
    industry: "Konsultforetag",
    companySize: "50 anstallda",
    personality: "Direkt och tidspressad. Bryr sig framst om ROI och tillvaxt. Har lite talamod for detaljer.",
    currentSolution: "Excel + manuella processer",
    painPoints: JSON.stringify(["For mycket tid pa admin", "Ingen overblick over pipeline", "Missade uppfoljningar"]),
    objections: JSON.stringify(["Vi ar for sma", "Jag har inte tid att implementera", "Vad ar ROI?"]),
  },
  {
    id: "sara-johansson",
    name: "Sara Johansson",
    title: "CFO",
    company: "DataFlow AB",
    industry: "Fintech",
    companySize: "500 anstallda",
    personality: "Skeptisk och kostnadsmedveten. Fragar alltid om payback-tid och TCO. Analytisk.",
    currentSolution: "Salesforce",
    painPoints: JSON.stringify(["For hog licenskostnad", "Overkomplicerat", "Dalig adoption bland saljare"]),
    objections: JSON.stringify(["Hur ar ni billigare an Salesforce?", "Vi har redan investerat", "Vad ar payback-tiden?"]),
  },
  {
    id: "johan-berg",
    name: "Johan Berg",
    title: "Inkopschef",
    company: "Industrigruppen",
    industry: "Tillverkning",
    companySize: "1000 anstallda",
    personality: "Processorienterad och formell. Foljer inkopspolicyer strikt. Jamfor leverantorer formellt.",
    currentSolution: "Microsoft Dynamics",
    painPoints: JSON.stringify(["Lang implementation", "Anvandarna klagar pa UX", "Langsam support"]),
    objections: JSON.stringify(["Vi maste gora formell upphandling", "Har ni branschreferenser?", "Vi behover godkannande fran flera avdelningar"]),
  },
  {
    id: "lisa-nystrom",
    name: "Lisa Nystrom",
    title: "Saljchef (Champion)",
    company: "CloudTech AB",
    industry: "Cloud / SaaS",
    companySize: "150 anstallda",
    personality: "Entusiastisk och oppet intresserad. Ser potentialen snabbt. Men har inte budget eller mandat ensam.",
    currentSolution: "HubSpot Free",
    painPoints: JSON.stringify(["HubSpot Free racker inte", "Behover rapportering", "VD vill ha pipeline-overblick"]),
    objections: JSON.stringify(["Jag maste prata med min chef", "Kan du skicka material?", "Vi har inte budget forran Q3"]),
  },
  {
    id: "peter-holm",
    name: "Peter Holm",
    title: "Assistent till VD (Gatekeeper)",
    company: "StoreAB",
    industry: "Retail / E-handel",
    companySize: "300 anstallda",
    personality: "Blockerande och skyddande. Filtrerar bort saljare. Kort och avvisande.",
    currentSolution: null,
    painPoints: JSON.stringify([]),
    objections: JSON.stringify(["Skicka ett mejl", "Han ar i mote hela dagen", "Vi ar inte intresserade", "Ring tillbaka nasta vecka"]),
  },
];

const insertPersona = db.prepare(`
  INSERT OR IGNORE INTO Persona (id, name, title, company, industry, companySize, personality, currentSolution, painPoints, objections, avatarUrl, isDefault, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const p of personas) {
  insertPersona.run(
    p.id, p.name, p.title, p.company, p.industry, p.companySize,
    p.personality, p.currentSolution, p.painPoints, p.objections,
    null, 1, new Date().toISOString()
  );
}

console.log(`Seeded ${personas.length} personas`);
console.log("Seeding complete!");

db.close();
