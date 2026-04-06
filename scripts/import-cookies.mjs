import path from "node:path";

import { ensureDir, paths, readJson, writeJson } from "./lib/config.mjs";

const inputPath = path.join(paths.rootDir, "config", "x.cookies.json");

function normalizeSameSite(value) {
  const raw = String(value ?? "").toLowerCase();

  if (raw === "strict") {
    return "Strict";
  }
  if (raw === "lax") {
    return "Lax";
  }
  if (raw === "none" || raw === "no_restriction" || raw === "unspecified") {
    return "None";
  }

  return "Lax";
}

function normalizeCookie(cookie) {
  const expires =
    typeof cookie.expirationDate === "number"
      ? cookie.expirationDate
      : typeof cookie.expires === "number"
        ? cookie.expires
        : -1;

  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain ?? ".x.com",
    path: cookie.path ?? "/",
    expires,
    httpOnly: Boolean(cookie.httpOnly),
    secure: cookie.secure !== false,
    sameSite: normalizeSameSite(cookie.sameSite)
  };
}

async function main() {
  const raw = await readJson(inputPath, null);

  if (!raw) {
    throw new Error(
      `Missing ${inputPath}. Copy config/x.cookies.example.json or export x.com cookies from Chrome into that file.`
    );
  }

  const sourceCookies = Array.isArray(raw) ? raw : Array.isArray(raw.cookies) ? raw.cookies : null;
  if (!sourceCookies || sourceCookies.length === 0) {
    throw new Error("No cookies found in config/x.cookies.json.");
  }

  const cookies = sourceCookies
    .filter((cookie) => {
      const domain = String(cookie.domain ?? cookie.url ?? "");
      return /(^|\.)x\.com/i.test(domain) || /(^|\.)twitter\.com/i.test(domain);
    })
    .map(normalizeCookie)
    .filter((cookie) => cookie.name && cookie.value && cookie.domain);

  const hasAuthToken = cookies.some((cookie) => cookie.name === "auth_token");
  const hasCt0 = cookies.some((cookie) => cookie.name === "ct0");

  if (!hasAuthToken || !hasCt0) {
    throw new Error("Expected at least auth_token and ct0 cookies for x.com.");
  }

  await ensureDir(path.dirname(paths.authFile));
  await writeJson(paths.authFile, { cookies, origins: [] });

  console.log(`Imported ${cookies.length} cookies into ${paths.authFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
