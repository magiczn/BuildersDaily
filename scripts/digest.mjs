import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  formatLocalDate,
  formatLocalDateTime,
  loadConfig,
  paths,
  readJson
} from "./lib/config.mjs";

function compactText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function truncate(text, maxLength = 220) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

async function main() {
  const config = await loadConfig();
  const posts = await readJson(paths.postsFile, []);
  const now = new Date();
  const reportDate = formatLocalDate(now, config.timezone);
  const thresholdMs = now.getTime() - config.digestHours * 60 * 60 * 1000;

  const selected = posts
    .filter((post) => post.timestamp && Date.parse(post.timestamp) >= thresholdMs)
    .filter((post) => config.includeReplies || !post.isReply)
    .filter((post) => config.includeReposts || !post.isRepost)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const groups = new Map();
  for (const post of selected) {
    const key = post.author ?? "unknown";
    const bucket = groups.get(key) ?? [];
    bucket.push(post);
    groups.set(key, bucket);
  }

  const reportPath = path.join(paths.reportsDir, `${reportDate}.md`);

  const lines = [
    `# X Daily Digest - ${reportDate}`,
    "",
    `- Timezone: ${config.timezone}`,
    `- Window: last ${config.digestHours} hours`,
    `- Total posts: ${selected.length}`,
    `- Accounts: ${groups.size}`,
    ""
  ];

  if (selected.length === 0) {
    lines.push("No matching posts found in the current digest window.");
  } else {
    for (const [author, authorPosts] of groups.entries()) {
      lines.push(`## @${author} (${authorPosts.length})`);
      lines.push("");

      for (const post of authorPosts) {
        const localTime = formatLocalDateTime(new Date(post.timestamp), config.timezone);
        const summary = truncate(compactText(post.text || "(No text captured)"));
        lines.push(`- ${localTime} [link](${post.statusUrl})`);
        lines.push(`  ${summary}`);
      }

      lines.push("");
    }
  }

  await mkdir(paths.reportsDir, { recursive: true });
  await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");

  console.log(`Wrote digest to ${reportPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
