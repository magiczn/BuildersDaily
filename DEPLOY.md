# 自动更新部署指南

## 架构

```
你的服务器/VPS          GitHub Pages
    ↓                       ↓
定时运行脚本 ──→ 更新 data.json ──→ 前端 fetch 数据
  (有 skill 访问权限)      (纯静态托管)
```

## 方案一：使用你自己的服务器/VPS（推荐）

### 1. 准备工作

在你的服务器上确保已安装：
- Node.js 18+
- Git
- follow-builders skill（已配置好）

### 2. 设置 GitHub Token

1. 访问 https://github.com/settings/tokens
2. 生成新的 Personal Access Token
3. 勾选 `repo` 权限
4. 复制 token

在你的服务器上设置环境变量：

```bash
# 临时设置（仅当前会话）
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# 永久设置（添加到 ~/.bashrc 或 ~/.zshrc）
echo 'export GITHUB_TOKEN=ghp_xxxxxxxxxxxx' >> ~/.bashrc
source ~/.bashrc
```

### 3. 测试运行

```bash
cd /path/to/nan-builders-digest
node scripts/deploy-server.js
```

如果成功，你会看到：
```
[2024-03-24T08:00:00.000Z] Starting daily digest update...
[2024-03-24T08:00:00.000Z] Fetching data from follow-builders skill...
[2024-03-24T08:00:05.000Z] Fetched 17 items from follow-builders
[2024-03-24T08:00:06.000Z] Cloning repository...
[2024-03-24T08:00:08.000Z] Committing changes...
[2024-03-24T08:00:09.000Z] Pushing to GitHub...
[2024-03-24T08:00:10.000Z] Update completed successfully!
```

### 4. 设置定时任务

```bash
crontab -e
```

添加以下行（每天早上8点运行）：

```cron
0 8 * * * cd /path/to/nan-builders-digest && node scripts/deploy-server.js >> /var/log/builders-digest.log 2>&1
```

查看日志：
```bash
tail -f /var/log/builders-digest.log
```

---

## 方案二：本地电脑手动/半自动更新

如果你不想用服务器，可以在本地电脑更新：

### 快速更新脚本

```bash
# 创建快捷命令
alias update-digest='cd ~/0-Projects/NDN-NanDailyNews && node -e "
const fs = require(\"fs\");
const path = require(\"path\");
const { execSync } = require(\"child_process\");

const skillPath = process.env.HOME + \"/.agents/skills/follow-builders\";
const prepareScript = path.join(skillPath, \"scripts/prepare-digest.js\");

console.log(\"Fetching data...\");
const result = execSync(\`cd \${path.dirname(prepareScript)} && node prepare-digest.js 2>/dev/null\`, { encoding: \"utf-8\" });
const data = JSON.parse(result);

const builders = [];
if (data.x) {
  for (const builder of data.x) {
    if (builder.tweets && builder.tweets.length > 0) {
      const tweet = builder.tweets[0];
      builders.push({
        name: builder.name,
        handle: builder.handle,
        role: builder.bio || \"AI Builder\",
        avatar: builder.name.split(\" \").map(n => n[0]).join(\"\").substring(0, 2).toUpperCase(),
        summary: tweet.text.substring(0, 150) + (tweet.text.length > 150 ? \"...\" : \"\"),
        summaryEn: tweet.text,
        url: tweet.url || \`https://x.com/\${builder.handle}\`,
        verified: builder.verified || false
      });
    }
  }
}

fs.writeFileSync(\"data.json\", JSON.stringify(builders, null, 2));
console.log(\`Updated with \${builders.length} items\`);
"

# 运行更新
update-digest

# 提交到 GitHub
git add data.json
git commit -m "Update: $(date +%Y-%m-%d)"
git push
```

---

## 方案三：使用 macOS 定时任务（launchd）

如果你是 Mac 用户，可以使用 launchd：

1. 创建 plist 文件 `~/Library/LaunchAgents/com.builders.digest.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.builders.digest</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USERNAME/0-Projects/NDN-NanDailyNews/scripts/deploy-server.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/builders-digest.out</string>
    <key>StandardErrorPath</key>
    <string>/tmp/builders-digest.err</string>
</dict>
</plist>
```

2. 加载定时任务：

```bash
launchctl load ~/Library/LaunchAgents/com.builders.digest.plist
```

---

## 前端数据加载

现在 `index.html` 会从 `data.json` 动态加载数据：

```javascript
async function loadData() {
    const response = await fetch('data.json');
    buildersData = await response.json();
    // ... render
}
```

这样每次更新 `data.json` 并推送到 GitHub 后，GitHub Pages 会自动重新部署，用户就能看到最新内容。

---

## 故障排查

### 1. GitHub Token 无效

错误：`fatal: Authentication failed`

解决：检查 token 是否有 `repo` 权限，且未过期

### 2. follow-builders skill 找不到

错误：`follow-builders skill not found`

解决：检查 `FOLLOW_BUILDERS_PATH` 环境变量，或确认 skill 已安装

### 3. 没有新数据

如果 `prepare-digest.js` 返回空数据，检查：
- skill 的 state-feed.json 是否有记录
- 是否需要更新 skill 本身

---

## 安全建议

1. **不要**把 `GITHUB_TOKEN` 提交到代码仓库
2. 使用 GitHub Token 时最小权限原则（仅 `repo` 权限）
3. 定期轮换 token（3-6个月）
4. 服务器上的 token 设置合适的文件权限：
   ```bash
   chmod 600 ~/.bashrc
   ```
