import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = path.join(PROJECT_ROOT, "data.json");
const POSTS_FILE = path.join(PROJECT_ROOT, "data", "posts.json");
const TIMEZONE = "Asia/Shanghai";

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];

  return fallback;
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function compact(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function truncate(text, maxLength) {
  const value = compact(text);
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function firstSentence(text) {
  const value = compact(text);
  const match = value.match(/^(.+?[。！？!?])\s*/);
  return match ? match[1] : value;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function isTodayPost(post, today) {
  if (!post?.timestamp) return false;
  return localDateKey(new Date(post.timestamp)) === today;
}

function uniqueTopCards(cards, limit) {
  const seen = new Set();
  const result = [];

  for (const card of cards) {
    if (card.isSummary) continue;
    if (!card.url || !card.summary || !card.analysis) continue;

    const key = card.url;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);

    if (result.length >= limit) break;
  }

  return result;
}

function fitLines(lines, maxChars) {
  const fitted = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + 1;
    if (nextLength > maxChars) {
      fitted.push("");
      fitted.push("篇幅先收住，更多内容看 BuildersDaily 网页版。");
      return fitted;
    }

    fitted.push(line);
    length = nextLength;
  }

  return fitted;
}

async function main() {
  const mode = getArg("mode", "morning");
  const limit = Number.parseInt(getArg("limit", "8"), 10);
  const maxChars = Number.parseInt(getArg("max-chars", "3600"), 10);
  const today = localDateKey();

  const cards = await readJson(DATA_FILE, []);
  const posts = await readJson(POSTS_FILE, []);
  const todayPostCount = Array.isArray(posts)
    ? posts.filter((post) => isTodayPost(post, today)).length
    : 0;

  if (!Array.isArray(cards) || cards.length === 0) {
    console.log(`BuildersDaily ${today} 暂时没有可发送内容。`);
    process.exitCode = 1;
    return;
  }

  if (todayPostCount === 0) {
    console.log(
      [
        `BuildersDaily ${today} 暂停推送`,
        "",
        "今天的 source data 还没拉到本地，避免把旧内容当成今天新闻发出去。",
        "我会等数据更新后再推送。"
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  const summary = cards.find((card) => card.isSummary);
  const topCards = uniqueTopCards(cards, Number.isFinite(limit) ? limit : 8);
  const label = mode === "afternoon" ? "午报" : "早报";

  const lines = [
    `BuildersDaily ${label}｜${today}`,
    "",
    `今日信号：${truncate(summary?.summary || "今天的 AI builder 圈继续有不少值得盯的动向。", 260)}`,
    "",
    "值得看："
  ];

  topCards.forEach((card, index) => {
    const author = card.handle ? `@${card.handle}` : card.name || "source";
    lines.push("");
    lines.push(`${index + 1}. ${author}：${truncate(card.summary, 96)}`);
    lines.push(`解读：${truncate(firstSentence(card.analysis), 150)}`);
    lines.push(card.url);
  });

  lines.push("");
  lines.push(`今日源数据：${todayPostCount} 条新帖`);
  lines.push("——来自：赵楠的红心小龙虾");

  console.log(fitLines(lines, maxChars).join("\n"));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
