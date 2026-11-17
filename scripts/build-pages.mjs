import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const basePath = process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? "/amirnet-studio";
if (!/^([/]([\w.-]+))*$/.test(basePath)) throw new Error("Invalid GitHub Pages base path");
const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_GITHUB_PAGES: "1", NEXT_PUBLIC_PAGES_BASE_PATH: basePath },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const root = new URL("../", import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), "utf8"));
for (const edition of ["current", "v1"]) {
  const dir = new URL("out/test-data/" + edition + "/", root);
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 20; i++) {
    const file = "test-" + String(i).padStart(2, "0") + ".json";
    if (edition === "v1") {
      copyFileSync(new URL("data/archive/v1/" + file, root), new URL(file, dir));
    } else {
      const payload = { ...read("data/tests/" + file), adaptive: read("data/adaptive/" + file) };
      writeFileSync(new URL(file, dir), JSON.stringify(payload));
    }
  }
}
writeFileSync(new URL("out/.nojekyll", root), "");
console.log("GitHub Pages site exported with 40 test JSON files.");
