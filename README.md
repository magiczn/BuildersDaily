# AI Builders Digest

一个类似抖音/TikTok 风格的 AI 行业动态浏览器，以卡片滑动方式浏览顶级 AI Builder 的最新动态。

## 在线体验

访问: https://buildersdaily.today

## 功能特点

- **抖音式滑动体验**: 上下滑动浏览不同 Builder 的动态摘要
- **双语展示**: 中文摘要 + 英文原文对照
- **多平台支持**: 支持触摸（移动端）、鼠标和键盘（桌面端）操作
- **一键阅读原文**: 点击按钮直接跳转到原始推文
- **进度指示**: 顶部进度条和页码显示当前浏览进度

## 操作方式

| 操作 | 功能 |
|------|------|
| 上滑 / 下滑 | 切换到下一条 / 上一条 |
| 鼠标滚轮 | 上下滚动切换 |
| 键盘 ↑ / ↓ | 切换到上一条 / 下一条 |
| 空格键 | 切换到下一条 |

## 数据来源

内容默认优先来自当前项目本地采集结果；如果本地数据不可用，则回退到 [follow-builders](https://github.com/zarazhangrui/follow-builders) Skill。

跟踪以下领域的顶级 AI Builder:
- AI 研究员和工程师
- 创业公司创始人和 CEO
- 产品经理和技术领导者

## 技术栈

- 纯 HTML + CSS + JavaScript
- 无需构建工具，单文件部署
- 响应式设计，适配移动端和桌面端

## 首次配置

```bash
cd /Users/zhaonan/0-Projects/BuildersDaily
npm install
npx playwright install chromium
cp config/monitor.example.json config/monitor.json
```

然后：

- 在 `config/monitor.json` 里填好你的 `listUrl`
- 运行 `npm run login` 保存 X 登录态
- 如果自动登录受限，可以导出 `x.com` cookies 到 `config/x.cookies.json` 后执行 `npm run import:cookies`

## 本地运行

```bash
git clone https://github.com/magiczn/nan-builders-digest.git
cd nan-builders-digest
open index.html
```

或者直接双击 `index.html` 文件在浏览器中打开。

## 数据更新

```bash
cd /Users/zhaonan/0-Projects/BuildersDaily
node scripts/fetch-data.js
```

如果要跑完整每日流水线（先更新本地采集数据，再更新站点并提交 Git）：

```bash
cd /Users/zhaonan/0-Projects/BuildersDaily
bash scripts/daily-update.sh
```

如果要启用 macOS 定时任务：

```bash
mkdir -p ~/Library/LaunchAgents
cp /Users/zhaonan/0-Projects/BuildersDaily/launchd/com.ndn.daily-update.plist ~/Library/LaunchAgents/com.ndn.daily-update.plist
launchctl unload ~/Library/LaunchAgents/com.ndn.daily-update.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.ndn.daily-update.plist
```

默认每天 `07:00`、`12:00`、`16:00` 运行一次。

可选环境变量：

- `X_LIST_MONITOR_DIR`：采集脚本工作目录，默认 `/Users/zhaonan/0-Projects/BuildersDaily`
- `ZHIPU_API_KEY`：如果提供，会用智谱模型生成更深的 `AI 解读`
- `AI_ANALYSIS_PROVIDER`：默认 `zhipu`
- `AI_ANALYSIS_MODEL`：默认 `glm-4.7`
- `AI_ANALYSIS_BATCH_SIZE`：每批送进模型的推文数，默认 `6`

说明：

- 如果没有配置模型 API Key，`AI 解读` 会自动回退到本地规则版，不会影响每日更新链路
- 采集脚本现在会在源头过滤纯回复和纯转发，`posts.json` 会更干净

人物资料维护：

- 在 [profiles.json](/Users/zhaonan/0-Projects/BuildersDaily/profiles.json) 里维护 `handle -> name / role / avatar / verified`
- 每次更新完资料后重新运行 `node scripts/fetch-data.js`

## License

MIT
