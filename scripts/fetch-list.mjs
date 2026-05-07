import { existsSync } from "node:fs";

import { chromium } from "playwright";

import {
  ensureDir,
  fileExists,
  loadConfig,
  paths,
  readJson,
  sleep,
  writeJson
} from "./lib/config.mjs";

function normalizePost(rawPost) {
  const idMatch = rawPost.statusUrl?.match(/status\/(\d+)/);
  const authorMatch = rawPost.statusUrl?.match(/x\.com\/([^/]+)\/status\//);
  const text = (rawPost.text ?? "").replace(/\s+\n/g, "\n").trim();
  const socialContext = rawPost.socialContext ?? "";
  const isRepost =
    /reposted/i.test(socialContext) ||
    /^RT\s@/i.test(text) ||
    /^转发[:：]?\s*/i.test(text);

  return {
    id: idMatch?.[1] ?? rawPost.id ?? null,
    author: authorMatch?.[1] ?? rawPost.author ?? null,
    statusUrl: rawPost.statusUrl ?? null,
    timestamp: rawPost.timestamp ?? null,
    text,
    socialContext,
    isReply: Boolean(rawPost.replyLabel),
    isRepost,
    replies: Number(rawPost.replies) || 0,
    reposts: Number(rawPost.reposts) || 0,
    likes: Number(rawPost.likes) || 0,
    views: Number(rawPost.views) || 0,
    hotComments: Array.isArray(rawPost.hotComments) ? rawPost.hotComments : [],
    fetchedAt: new Date().toISOString()
  };
}

function calculateCommentTargetScore(post) {
  const likes = Number(post.likes) || 0;
  const replies = Number(post.replies) || 0;
  const reposts = Number(post.reposts) || 0;
  const views = Number(post.views) || 0;
  const viewBoost = views > 0 ? Math.min(18, Math.round(Math.log10(views + 1) * 6)) : 0;

  return likes + (replies * 3) + (reposts * 2) + viewBoost;
}

function shouldKeepPost(post, config) {
  if (!post?.timestamp) {
    return false;
  }

  if (!config.includeReplies && post.isReply) {
    return false;
  }

  if (!config.includeReposts && post.isRepost) {
    return false;
  }

  return true;
}

async function collectVisiblePosts(page) {
  return page.evaluate(() => {
    const parseMetric = (value) => {
      if (!value) return 0;
      const normalized = String(value).trim().toUpperCase().replace(/,/g, "");
      const match = normalized.match(/(\d+(?:\.\d+)?)([KM])?/);
      if (!match) return 0;
      const number = Number.parseFloat(match[1]);
      if (!Number.isFinite(number)) return 0;
      const suffix = match[2];
      if (suffix === "K") return Math.round(number * 1000);
      if (suffix === "M") return Math.round(number * 1000000);
      return Math.round(number);
    };

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

    return articles.map((article) => {
      const timeElement = article.querySelector("time");
      const statusUrl = timeElement?.closest("a")?.href ?? null;
      const text = Array.from(article.querySelectorAll('[data-testid="tweetText"]'))
        .map((node) => node.innerText.trim())
        .filter(Boolean)
        .join("\n");
      const socialContext = article.querySelector('[data-testid="socialContext"]')?.innerText?.trim() ?? "";
      const replyLabel = Array.from(article.querySelectorAll("span"))
        .map((node) => node.textContent?.trim() ?? "")
        .find((value) => value.startsWith("Replying to")) ?? "";
      const replyButton = article.querySelector('[data-testid="reply"]');
      const retweetButton = article.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
      const likeButton = article.querySelector('[data-testid="like"], [data-testid="unlike"]');
      const viewsLink = article.querySelector('a[href*="/analytics"]');
      const replies = parseMetric(replyButton?.getAttribute("aria-label") || replyButton?.innerText || "");
      const reposts = parseMetric(retweetButton?.getAttribute("aria-label") || retweetButton?.innerText || "");
      const likes = parseMetric(likeButton?.getAttribute("aria-label") || likeButton?.innerText || "");
      const views = parseMetric(viewsLink?.getAttribute("aria-label") || viewsLink?.innerText || "");

      return {
        statusUrl,
        timestamp: timeElement?.dateTime ?? null,
        text,
        socialContext,
        replyLabel,
        replies,
        reposts,
        likes,
        views
      };
    });
  });
}

async function collectVisibleComments(page, rootPostId) {
  return page.evaluate((originalPostId) => {
    const parseMetric = (value) => {
      if (!value) return 0;
      const normalized = String(value).trim().toUpperCase().replace(/,/g, "");
      const match = normalized.match(/(\d+(?:\.\d+)?)([KM])?/);
      if (!match) return 0;
      const number = Number.parseFloat(match[1]);
      if (!Number.isFinite(number)) return 0;
      const suffix = match[2];
      if (suffix === "K") return Math.round(number * 1000);
      if (suffix === "M") return Math.round(number * 1000000);
      return Math.round(number);
    };

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

    return articles.map((article) => {
      const timeElement = article.querySelector("time");
      const statusUrl = timeElement?.closest("a")?.href ?? null;
      const statusId = statusUrl?.match(/status\/(\d+)/)?.[1] ?? null;
      const author = statusUrl?.match(/x\.com\/([^/]+)\/status\//)?.[1] ?? null;
      const text = Array.from(article.querySelectorAll('[data-testid="tweetText"]'))
        .map((node) => node.innerText.trim())
        .filter(Boolean)
        .join("\n");

      const likeButton = article.querySelector('[data-testid="like"], [data-testid="unlike"]');
      const likeLabel = likeButton?.getAttribute("aria-label") || likeButton?.innerText || "";
      const likes = parseMetric(likeLabel);

      return {
        id: statusId,
        author,
        statusUrl,
        timestamp: timeElement?.dateTime ?? null,
        text,
        likes
      };
    }).filter((item) => item.id && item.id !== originalPostId);
  }, rootPostId);
}

function normalizeComment(rawComment) {
  return {
    id: rawComment.id ?? null,
    author: rawComment.author ?? null,
    statusUrl: rawComment.statusUrl ?? null,
    timestamp: rawComment.timestamp ?? null,
    text: (rawComment.text ?? "").replace(/\s+\n/g, "\n").trim(),
    likes: Number(rawComment.likes) || 0
  };
}

async function collectFullPostText(detailPage, post, config) {
  if (!config.fetchFullText || !post?.statusUrl || !post?.id) {
    return post;
  }

  try {
    await detailPage.goto(post.statusUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await detailPage.waitForTimeout(config.commentSettleDelayMs);

    const fullText = await detailPage.evaluate((postId) => {
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      const original = articles.find((article) => {
        const href = article.querySelector("time")?.closest("a")?.href || "";
        return href.includes(`/status/${postId}`);
      }) || articles[0];

      return Array.from(original?.querySelectorAll('[data-testid="tweetText"]') || [])
        .map((node) => node.innerText.trim())
        .filter(Boolean)
        .join("\n");
    }, post.id);

    if (fullText && fullText.length > (post.text || "").length) {
      return {
        ...post,
        text: fullText.replace(/\s+\n/g, "\n").trim()
      };
    }
  } catch (error) {
    console.warn(`Could not collect full text for ${post.statusUrl}: ${error.message}`);
  }

  return post;
}

function shouldKeepComment(comment, post, config) {
  if (!comment?.id || !comment?.author || !comment?.text) {
    return false;
  }

  if ((comment.text || "").length < 8) {
    return false;
  }

  if (/^https?:\/\//i.test(comment.text.trim())) {
    return false;
  }

  if ((comment.likes || 0) < config.minCommentLikes) {
    return false;
  }

  if (comment.author === post.author && !config.includeAuthorRepliesInHotComments) {
    return false;
  }

  return true;
}

async function collectHotCommentsForPost(detailPage, post, config) {
  if (!config.fetchHotComments || !post?.statusUrl || !post?.id) {
    return [];
  }

  try {
    await detailPage.goto(post.statusUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await detailPage.waitForTimeout(config.commentSettleDelayMs);

    const collected = new Map();
    let staleRounds = 0;

    for (let index = 0; index < config.maxCommentScrolls; index += 1) {
      const batch = await collectVisibleComments(detailPage, post.id);
      const beforeCount = collected.size;

      for (const rawComment of batch.map(normalizeComment)) {
        if (!shouldKeepComment(rawComment, post, config)) {
          continue;
        }
        const existing = collected.get(rawComment.id);
        if (!existing || rawComment.likes > existing.likes) {
          collected.set(rawComment.id, rawComment);
        }
      }

      const addedThisRound = collected.size - beforeCount;
      staleRounds = addedThisRound === 0 ? staleRounds + 1 : 0;

      if (collected.size >= config.maxHotCommentsPerPost && staleRounds >= 1) {
        break;
      }

      if (staleRounds >= 2) {
        break;
      }

      await detailPage.mouse.wheel(0, 1800);
      await sleep(config.commentScrollPauseMs);
      await sleep(config.commentSettleDelayMs);
    }

    return Array.from(collected.values())
      .sort((a, b) => (b.likes - a.likes) || (Date.parse(b.timestamp) - Date.parse(a.timestamp)))
      .slice(0, config.maxHotCommentsPerPost);
  } catch (error) {
    console.warn(`Could not collect hot comments for ${post.statusUrl}: ${error.message}`);
    return [];
  }
}

function resolveLaunchOptions(config) {
  const launchOptions = { headless: config.headless };
  const bundledExecutable = chromium.executablePath();

  if (!bundledExecutable || existsSync(bundledExecutable)) {
    return launchOptions;
  }

  const fallbackExecutables = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ];
  const fallbackExecutable = fallbackExecutables.find((candidate) => existsSync(candidate));

  if (fallbackExecutable) {
    console.warn(
      `Playwright browser not found at ${bundledExecutable}. Falling back to ${fallbackExecutable}.`
    );
    return {
      ...launchOptions,
      executablePath: fallbackExecutable
    };
  }

  return launchOptions;
}

async function main() {
  const config = await loadConfig();

  if (!(await fileExists(paths.authFile))) {
    throw new Error(`Missing login state at ${paths.authFile}. Run npm run login first.`);
  }

  const browser = await chromium.launch(resolveLaunchOptions(config));
  const context = await browser.newContext({ storageState: paths.authFile });
  const page = await context.newPage();

  console.log(`Opening list: ${config.listUrl}`);
  await page.goto(config.listUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3_000);

  const thresholdMs = Date.now() - config.lookbackHours * 60 * 60 * 1000;
  const collected = new Map();
  let noNewPostScrolls = 0;

  for (let index = 0; index < config.maxScrolls; index += 1) {
    await sleep(config.settleDelayMs);
    const batch = await collectVisiblePosts(page);
    const beforeCount = collected.size;

    for (const item of batch.map(normalizePost)) {
      if (!item.id || !item.timestamp || !item.statusUrl) {
        continue;
      }
      collected.set(item.id, item);
    }

    const addedThisRound = collected.size - beforeCount;
    noNewPostScrolls = addedThisRound === 0 ? noNewPostScrolls + 1 : 0;

    const timestamps = Array.from(collected.values())
      .map((post) => Date.parse(post.timestamp))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const oldestLoaded = timestamps[0] ?? Date.now();
    console.log(
      `Scroll ${index + 1}/${config.maxScrolls}: +${addedThisRound} new, ${collected.size} total, oldest ${new Date(
        oldestLoaded
      ).toISOString()}, stale rounds ${noNewPostScrolls}`
    );

    const collectedInWindow = Array.from(collected.values()).filter(
      (post) => Date.parse(post.timestamp) >= thresholdMs
    ).length;

    if (
      index + 1 >= config.minScrolls &&
      oldestLoaded < thresholdMs &&
      noNewPostScrolls >= config.maxNoNewPostScrolls
    ) {
      console.log(
        `Stopping after ${index + 1} scrolls: reached old posts and saw no new posts for ${noNewPostScrolls} rounds. In-window posts: ${collectedInWindow}.`
      );
      break;
    }

    await page.mouse.wheel(0, 2200);
    await sleep(config.scrollPauseMs);
  }

  const existingPosts = await readJson(paths.postsFile, []);
  const merged = new Map(existingPosts.map((post) => [post.id, post]));

  const rankedCommentTargets = Array.from(collected.values())
    .filter((post) => shouldKeepPost(post, config))
    .filter((post) => Date.parse(post.timestamp) >= thresholdMs)
    .map((post) => ({
      ...post,
      commentTargetScore: calculateCommentTargetScore(post)
    }))
    .sort((a, b) => b.commentTargetScore - a.commentTargetScore || Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const selectedCommentTargets = rankedCommentTargets
    .filter((post) => post.commentTargetScore >= config.minCommentTargetScore)
    .slice(0, config.maxCommentPostsPerRun)
    .map(({ commentTargetScore, ...post }) => post);

  const fullTextTargets = Array.from(collected.values())
    .filter((post) => shouldKeepPost(post, config))
    .filter((post) => Date.parse(post.timestamp) >= thresholdMs)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, config.maxFullTextPostsPerRun);

  if (config.fetchFullText && fullTextTargets.length > 0) {
    console.log(`Collecting full text for ${fullTextTargets.length} posts...`);
    const detailPage = await context.newPage();

    try {
      for (let index = 0; index < fullTextTargets.length; index += 1) {
        const target = fullTextTargets[index];
        const enriched = await collectFullPostText(detailPage, target, config);
        collected.set(target.id, enriched);
        if ((enriched.text || "").length > (target.text || "").length) {
          console.log(
            `Full text ${index + 1}/${fullTextTargets.length}: ${target.author} ${target.id} ${target.text.length} -> ${enriched.text.length}`
          );
        }
      }
    } finally {
      await detailPage.close().catch(() => {});
    }
  }

  if (config.fetchHotComments && selectedCommentTargets.length > 0) {
    console.log(`Collecting hot comments for ${selectedCommentTargets.length} posts...`);
    console.log(
      `Hot comment targets: ${selectedCommentTargets
        .map((post) => `${post.author}:${calculateCommentTargetScore(post)}`)
        .join(", ")}`
    );
    const detailPage = await context.newPage();

    try {
      for (let index = 0; index < selectedCommentTargets.length; index += 1) {
        const target = selectedCommentTargets[index];
        const existing = merged.get(target.id);
        const hotComments = await collectHotCommentsForPost(detailPage, target, config);
        const commentCount = hotComments.length;
        console.log(
          `Comments ${index + 1}/${selectedCommentTargets.length}: ${target.author} ${target.id} -> ${commentCount} hot comments`
        );

        collected.set(target.id, {
          ...(existing || {}),
          ...target,
          hotComments
        });
      }
    } finally {
      await detailPage.close().catch(() => {});
    }
  } else if (config.fetchHotComments) {
    console.log(
      `No posts reached the hot comment threshold (${config.minCommentTargetScore}). Skipping comment collection.`
    );
  }

  await browser.close();

  for (const post of collected.values()) {
    merged.set(post.id, post);
  }

  const sortedPosts = Array.from(merged.values())
    .filter((post) => shouldKeepPost(post, config))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, 3000);

  await ensureDir(paths.dataDir);
  await writeJson(paths.postsFile, sortedPosts);

  const freshPosts = sortedPosts.filter((post) => Date.parse(post.timestamp) >= thresholdMs);
  console.log(`Saved ${sortedPosts.length} posts total, ${freshPosts.length} in the current lookback window.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
