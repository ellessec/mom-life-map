# 小服务器：云端备份 + 日记本的 AI

部署在 Cloudflare 上。网页不配它也能用，但**没有它，妈妈写的东西只存在她那一台手机里**。

- **云端备份**：日记、祷告日记、回忆、心愿、照片、手写的页，都在妈妈的手机上加密以后存到 Cloudflare R2。服务器只看到乱码。每天自动留一份当天的快照，可以恢复到任何一天。
- **AI（可选）**：认手写的字、写每周/每月的回顾。

## 一次性设置（大概 15 分钟）

```bash
cd worker
npm install
npx wrangler login                                  # 登录 Cloudflare（要绑卡才能用 R2；10GB 以内免费）
npx wrangler r2 bucket create mom-life-map-backup   # 建一个存备份的地方
npx wrangler deploy                                 # 部署，记下给你的网址
```

1. 把部署的网址填到 `js/data.js` 的 `server.url`，推送到 GitHub。
2. 打开 `https://ellessec.github.io/mom-life-map/#setup-backup`，会生成：
   - 一个**保险箱编号** → 填到 `wrangler.toml` 的 `VAULTS`，再 `npx wrangler deploy` 一次
   - 一个**家庭链接** → 发给妈妈，让她用自己的手机打开一次
3. **把家庭链接存在一个安全的地方**（比如你自己的备忘录、密码管理器）。它就是钥匙：换手机时打开它就能恢复；丢了的话，备份就打不开了（因为是加密的，谁都打不开，包括 Cloudflare）。

## 要打开 AI 的话

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # 粘贴 Anthropic API key
```
然后把 `js/data.js` 里的 `server.ai` 改成 `true`。

- 用的模型是 Claude Opus 5.5。日记内容会发给 Anthropic 的 API 处理（API 数据默认不用于训练）。
- 费用按用量算：认一页手写字、写一次回顾，大约都是一两毛人民币。

## 恢复
- 换手机：用新手机打开家庭链接，所有东西会自动下载回来。
- 恢复到之前某一天：点地图左上角的「已备份」→「给女儿看的」→「恢复到之前的某一天」。恢复前现在的样子会先存一份在这台设备上。

## 安全
- `ALLOWED_ORIGIN` 只接受从妈妈的网站来的请求；`VAULTS` 里没有的保险箱编号一律拒绝。
- 数据在手机上用 AES-256-GCM 加密，钥匙只在家庭链接里，从不发给服务器。
