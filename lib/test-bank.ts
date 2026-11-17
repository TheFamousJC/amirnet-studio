import { readFile } from "node:fs/promises";
import path from "node:path";
import { testCatalog } from "./catalog";
import type { AdaptiveBank, Test } from "./types";

export function testParams() {
  return testCatalog.map(({ id }) => ({ id }));
}

export async function serveTest(id: string, edition: "current" | "v1") {
  if (!testCatalog.some(test => test.id === id)) {
    return Response.json({ error: "Unknown test" }, { status: 404 });
  }

  const directory = edition === "v1" ? ["data", "archive", "v1"] : ["data", "tests"];
  const filename = path.join(process.cwd(), ...directory, id + ".json");
  const test: Test = JSON.parse(await readFile(filename, "utf8"));
  if (edition === "current") {
    const supplemental = path.join(process.cwd(), "data", "adaptive", id + ".json");
    const adaptive: AdaptiveBank = JSON.parse(await readFile(supplemental, "utf8"));
    return Response.json({ ...test, adaptive });
  }
  return Response.json(test);
}