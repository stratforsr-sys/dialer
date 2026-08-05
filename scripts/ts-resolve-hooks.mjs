import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";

const SRC = resolvePath(process.cwd(), "src");

export async function resolve(specifier, context, next) {
  // @/-alias → src/
  if (specifier.startsWith("@/")) {
    const base = join(SRC, specifier.slice(2));
    const hit = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
    if (hit) return next(pathToFileURL(hit).href, context);
  }

  // Relativ import utan filändelse → prova .ts / .tsx / index.ts
  if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = resolvePath(dirname(parentPath), specifier);
    const hit = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync);
    if (hit) return next(pathToFileURL(hit).href, context);
  }

  return next(specifier, context);
}
