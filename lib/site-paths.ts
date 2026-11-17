const staticPages = process.env.NEXT_PUBLIC_GITHUB_PAGES === "1";
const basePath = process.env.NEXT_PUBLIC_PAGES_BASE_PATH ?? "";

export function testUrl(id: string, archived: boolean) {
  if (staticPages) return basePath + "/test-data/" + (archived ? "v1/" : "current/") + id + ".json";
  return "/api/tests/" + id + (archived ? "/v1" : "");
}

export function assetUrl(path: string) {
  return basePath + path;
}
