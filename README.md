# Builders Daily

把 AI Builder 圈的公开动态整理成一份可追踪、可长期积累的每日情报。

在线站点：[buildersdaily.today](https://www.buildersdaily.today/)

## 现在包含什么

- 每日首页：以桌面双列、移动单列的简洁卡片呈现当天全部动态，点击任一卡片展开阅读
- 深度阅读：在居中蒙层中围绕原始动态、一句话结论、为什么重要和原文入口展开
- 历史归档：每一期都有稳定链接；首页保留近期入口，“查看更多期刊”在弹窗内展示全部期刊
- Builder 时间线：按人查看长期动态并可在本地关注，“查看完整名单”在弹窗内展示全部 Builder
- 主题时间线：Agents、产品、模型、设计、商业等 9 个主题
- 编辑插画：三张带透明通道的低对比度黑白石墨图用于当天、归档和 Builder 分区，素材位于 `assets/illustrations/`
- Sitemap、结构化数据和社交预览元信息
- 产品事件：阅读、关注和原文跳转均已埋点

网站保持纯 HTML、CSS 和 JavaScript，不依赖前端框架。构建脚本会把 `data/reports/` 中的历史日报编译成静态页面与索引。

## 本地预览

```bash
cd /Users/zhaonan/0-Projects/BuildersDaily
npm install
npm run build
npm run serve
```

然后访问 `http://localhost:8000`。页面通过 HTTP 加载 JSON，因此不要直接双击 `index.html` 预览。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run build` | 从历史报告生成归档、人物页、主题页和 Sitemap |
| `npm test` | 运行归档解析与主题分类测试 |
| `npm run serve` | 在 8000 端口启动本地预览 |
| `npm run site:refresh` | 重新生成首页数据，并编译完整站点 |
| `npm run daily` | 执行日常采集与摘要流程 |
| `bash scripts/daily-update.sh` | 完成采集、站点构建、提交与推送的自动流水线 |

构建后会生成：

```text
archive/            # 每期 JSON 与归档目录
daily/<date>/       # 每期可索引的独立页面
builders/<handle>/  # Builder 时间线页面与数据
topics/<topic>/     # 主题时间线页面与数据
sitemap.xml         # 搜索引擎站点地图
```

## 采集配置

首次配置：

```bash
cp config/monitor.example.json config/monitor.json
npm run login
```

- 在 `config/monitor.json` 填写 X List 地址
- 如果自动登录受限，可导出 `x.com` cookies 到 `config/x.cookies.json`，再运行 `npm run import:cookies`
- 人物资料维护在 `profiles.json`
- 原始历史日报位于 `data/reports/`

可选环境变量：

- `X_LIST_MONITOR_DIR`：采集脚本工作目录
- `ZHIPU_API_KEY`：启用智谱模型生成更深的 AI 解读
- `AI_ANALYSIS_PROVIDER`：默认 `zhipu`
- `AI_ANALYSIS_MODEL`：默认 `glm-4.7`
- `AI_ANALYSIS_BATCH_SIZE`：默认每批 6 条

没有模型 API Key 时会自动回退到本地规则版，不影响每日更新。

## 分析配置

在 `assets/config.js` 中配置可选集成：

```js
window.BUILDERS_DAILY_CONFIG = {
  siteUrl: 'https://www.buildersdaily.today',
  analyticsEndpoint: ''
};
```

- 页面会自动调用已存在的 Plausible 或 PostHog；也可以把 `analyticsEndpoint` 指向自己的事件接收接口
- 没有外部分析服务时，最近 100 个事件仅保存在本地浏览器，方便调试

## 自动更新

`scripts/daily-update.sh` 已接入站点构建：采集和 `data.json` 生成成功后，会同步更新归档、人物页、主题页与 Sitemap，再进入原有 Git 提交/推送步骤。

macOS 定时任务默认每天 `07:00`、`12:00`、`16:00` 运行。启动方式见 `launchd/com.ndn.daily-update.plist`。

## License

MIT
