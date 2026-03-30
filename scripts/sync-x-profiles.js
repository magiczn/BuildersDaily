const fs = require('fs');
const path = require('path');

const LOCAL_X_MONITOR_DIR = process.env.X_LIST_MONITOR_DIR ||
  '/Users/zhaonan/0-Projects/x-list-monitor';
const PROFILES_PATH = path.join(__dirname, '..', 'profiles.json');
const AUTH_FILE = path.join(LOCAL_X_MONITOR_DIR, '.auth', 'user.json');
const PLAYWRIGHT_MODULE = path.join(LOCAL_X_MONITOR_DIR, 'node_modules', 'playwright');

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeBio(value) {
  return normalizeText(value)
    .replace(/https?:\/\/\s+/gi, (match) => match.trim())
    .replace(/@\s+/g, '@')
    .trim();
}

function buildAvatar(name, handle) {
  if (name && name.includes(' ')) {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  return String(handle || '?')
    .replace(/^@/, '')
    .slice(0, 2)
    .toUpperCase();
}

function loadProfiles() {
  if (!fs.existsSync(PROFILES_PATH)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
  } catch (error) {
    console.log(`Could not read profiles.json: ${error.message}`);
    return [];
  }
}

function saveProfiles(profiles) {
  fs.writeFileSync(PROFILES_PATH, `${JSON.stringify(profiles, null, 2)}\n`);
}

function resolveChromeExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || undefined;
}

async function scrapeProfile(page, handle) {
  await page.goto(`https://x.com/${handle}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  });
  await page.waitForSelector('[data-testid="UserName"]', { timeout: 15_000 });

  return page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const userName = document.querySelector('[data-testid="UserName"]');
    const spans = Array.from(userName?.querySelectorAll('span') || [])
      .map((node) => normalize(node.textContent))
      .filter(Boolean);

    const name = spans.find((value) => !value.startsWith('@')) || '';
    const bio = normalize(document.querySelector('[data-testid="UserDescription"]')?.innerText || '');
    const verified = Boolean(userName?.querySelector('svg'));

    return { name, bio, verified };
  });
}

async function syncProfilesFromX(handles = []) {
  const uniqueHandles = Array.from(
    new Set(
      handles
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  if (!uniqueHandles.length) {
    return loadProfiles();
  }

  if (!fs.existsSync(AUTH_FILE)) {
    console.log(`Skip X profile sync: missing auth file at ${AUTH_FILE}`);
    return loadProfiles();
  }

  if (!fs.existsSync(PLAYWRIGHT_MODULE)) {
    console.log(`Skip X profile sync: missing Playwright module at ${PLAYWRIGHT_MODULE}`);
    return loadProfiles();
  }

  const { chromium } = require(PLAYWRIGHT_MODULE);
  const chromeExecutable = resolveChromeExecutable();
  const profiles = loadProfiles();
  const profileMap = new Map(profiles.map((item) => [String(item.handle || '').toLowerCase(), item]));

  const browser = await chromium.launch({
    headless: true,
    ...(chromeExecutable ? { executablePath: chromeExecutable } : {})
  });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  for (const handle of uniqueHandles) {
    const key = handle.toLowerCase();

    try {
      const profile = await scrapeProfile(page, handle);
      const existing = profileMap.get(key) || {};
      const name = normalizeText(profile.name) || existing.name || handle;
      const bio = normalizeBio(profile.bio) || existing.bio || existing.role || '';

      profileMap.set(key, {
        ...existing,
        handle: existing.handle || handle,
        name,
        bio,
        role: bio || existing.role || '',
        avatar: existing.avatar || buildAvatar(name, handle),
        verified: typeof profile.verified === 'boolean' ? profile.verified : Boolean(existing.verified)
      });

      console.log(`Synced X profile: @${handle}`);
    } catch (error) {
      console.log(`Could not sync @${handle} from X: ${error.message}`);
    }
  }

  await browser.close();

  const nextProfiles = Array.from(profileMap.values()).sort((left, right) => {
    return String(left.handle || '').localeCompare(String(right.handle || ''));
  });
  saveProfiles(nextProfiles);

  return nextProfiles;
}

if (require.main === module) {
  syncProfilesFromX(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { syncProfilesFromX };
