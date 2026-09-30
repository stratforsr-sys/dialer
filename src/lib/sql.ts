/**
 * Platshållare i råa SQL-frågor, för två dialekter.
 *
 * SQLite binder på `?`. PostgreSQL binder på `$1, $2, …`, numrerade i samma
 * ordning som argumenten skickas. Under flytten till Neon (Postgres) måste
 * koden kunna köra mot båda: den nuvarande databasen är SQLite ända fram till
 * cutovern, och en översättning som bara går att prova EFTER flytten är en
 * översättning ingen hunnit prova.
 *
 * ## Varför numren räknas fram och inte skrivs
 *
 * Frågorna byggs villkorligt. `leaseNextLeads` lägger till villkor beroende på
 * om en mapp är vald och om användaren är admin, och `args` växer i takt med
 * `conds`. Ett handskrivet `$7` hade därför pekat på olika argument beroende på
 * vem som ringde — och fel på ett sätt som inte kraschar, utan bara delar ut
 * fel bolag.
 *
 * ## Varför det är säkert att byta ut varje `?`
 *
 * Kontrollerat 2026-09-29 över samtliga råa frågor i `actions/dialer.ts` och
 * `actions/lists.ts`: ingen av dem innehåller ett `?` inuti en stränglitteral.
 * Frågetecknen är alltså uteslutande bindningar. **Skrivs en ny fråga med ett
 * `?` i en textsträng måste den binda värdet i stället** — annars numrerar den
 * här funktionen om textens frågetecken till en parameter som inte finns.
 *
 * ## Booleaner
 *
 * De skrivs `= true` / `= false`, inte `= 1` / `= 0`. SQLite har förstått
 * nyckelorden sedan 3.23 och lagrar dem som 1/0, medan Postgres har en riktig
 * `boolean`-typ där `= 1` är ett typfel. Formen fungerar alltså i båda och
 * behöver ingen växel.
 */

/** Är målet Postgres? `DATABASE_URL` sätts först när Neon är inkopplad. */
export const arPostgres = Boolean(process.env.DATABASE_URL);

/**
 * Översätter `?` till `$1, $2, …` när målet är Postgres, annars oförändrat.
 *
 * Anropas runt SQL-strängen precis före `$queryRawUnsafe` — argumenten rörs
 * inte, bara platshållarna.
 */
export function bind(sql: string): string {
  if (!arPostgres) return sql;
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}
