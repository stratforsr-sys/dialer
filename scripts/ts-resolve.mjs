// Loader-hook för att köra projektets TypeScript direkt med node.
//
// Node kräver explicit filändelse i ESM-importer. Next.js gör inte det, så
// källkoden skriver `from "./types"` och `from "@/lib/..."`. Hooken fyller i
// det som saknas i stället för att koden ska behöva anpassas efter testerna.
//
//   node --import ./scripts/ts-resolve.mjs --experimental-strip-types <fil>

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolve-hooks.mjs", pathToFileURL("./scripts/"));
