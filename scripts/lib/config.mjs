import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

export const paths = {
  rootDir,
  authFile: path.join(rootDir, ".auth", "user.json"),
  configFile: path.join(rootDir, "config", "monitor.json"),
  exampleConfigFile: path.join(rootDir, "config", "monitor.example.json"),
  dataDir: path.join(rootDir, "data"),
  postsFile: path.join(rootDir, "data", "posts.json"),
  reportsDir: path.join(rootDir, "data", "reports")
};

const defaults = {
  timezone: "Asia/Shanghai",
  lookbackHours: 36,
  digestHours: 24,
  maxScrolls: 10,
  minScrolls: 5,
  scrollPauseMs: 1500,
  settleDelayMs: 1200,
  maxNoNewPostScrolls: 3,
  headless: true,
  includeReplies: false,
  includeReposts: false,
  fetchHotComments: true,
  minCommentLikes: 5,
  minCommentTargetScore: 120,
  maxHotCommentsPerPost: 3,
  maxCommentPostsPerRun: 10,
  maxCommentScrolls: 3,
  commentScrollPauseMs: 1000,
  commentSettleDelayMs: 1200,
  includeAuthorRepliesInHotComments: false
};

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadConfig() {
  if (!(await fileExists(paths.configFile))) {
    throw new Error(
      `Missing config file at ${paths.configFile}. Copy ${paths.exampleConfigFile} first.`
    );
  }

  const raw = await readFile(paths.configFile, "utf8");
  const parsed = JSON.parse(raw);
  const config = { ...defaults, ...parsed };

  if (!config.listUrl || config.listUrl.includes("REPLACE_WITH_YOUR_LIST_ID")) {
    throw new Error("config/monitor.json is missing a real listUrl value.");
  }

  return config;
}

export async function readJson(filePath, fallbackValue) {
  if (!(await fileExists(filePath))) {
    return fallbackValue;
  }

  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatLocalDate(date = new Date(), timezone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatLocalDateTime(date, timezone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function isSameLocalDate(date, targetDate, timezone = "Asia/Shanghai") {
  return formatLocalDate(date, timezone) === formatLocalDate(targetDate, timezone);
}
