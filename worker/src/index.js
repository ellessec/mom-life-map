// 妈妈的人生地图的小服务器：
//   1. 云端备份（加密的，存在 Cloudflare R2）
//   2. 日记本的 AI：认手写的字（transcribe）、写每周/每月的回顾（flashback）
// API key 只存在这里（Cloudflare secret），不会出现在网页里。
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

const TRANSCRIBE_SYSTEM = `你在帮一位五十岁左右的妈妈整理她手写的日记和祷告日记。她是基督徒，用中文写字。
把照片里手写的内容逐字转成文字：
- 按原来的顺序和分段，保留她的原话、经文和标点，不要改写、不要润色、不要总结。
- 认不清的字用［？］标出来，不要猜一个意思完整的词去补。
- 有几页就按顺序接起来，页与页之间空一行。
- 只输出转好的文字，不要加任何说明。`;

const FLASHBACK_SYSTEM = `你在为一位五十岁左右的妈妈写一段日记回顾。她是很虔诚的基督徒，每天写日记和祷告日记。这是女儿润润送给她的生日礼物里的一部分。润润叫她“小妈”。
读她这段时间写的内容，用温暖、简单的中文，直接对她说话（用“你”），写一段 150 到 250 字的回顾：
- 只根据她真的写了的内容，不编造任何事情、人物或感受；内容很少就写短一点。
- 说说这段时间里发生了什么、她的心情、她感恩的事；如果有蒙应允的祷告，温柔地提一下；如果有她记下的经文，可以引用一句。
- 可以用“小妈”称呼她。语气像一个懂她、爱她的人，平实，不说教，不夸张，不用“作为AI”之类的话，不用列表和标题。
- 最后用一句简短的祝福收尾，比如“愿主继续保守你”。`;

const originsOf = (env) => String(env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
function cors(origin, env) {
  const list = originsOf(env);
  return {
    "access-control-allow-origin": list.includes(origin) ? origin : list[0] || "",
    "access-control-allow-methods": "GET, PUT, POST, HEAD, OPTIONS",
    "access-control-allow-headers": "content-type, x-updated",
    "access-control-expose-headers": "x-updated",
    "vary": "origin",
  };
}

/* ---------- 云端备份：只存加密过的数据，服务器看不懂内容 ---------- */
// /v/<vault>/state           GET / PUT   整个日记本（加密），每次 PUT 同时留一份当天的快照
// /v/<vault>/snap/<date>     GET         某一天的快照
// /v/<vault>/snaps           GET         有哪些快照
// /v/<vault>/b/<key>         GET / PUT / HEAD   照片、手写的页（加密）
const MAX_BLOB = 20 * 1024 * 1024, MAX_STATE = 20 * 1024 * 1024;
async function backup(request, env, headers, parts) {
  const [, vault, kind, ...enc] = parts;
  let rest; try { rest = enc.map(decodeURIComponent); } catch { return new Response("bad path", { status: 400, headers }); }
  const vaults = String(env.VAULTS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!/^[0-9a-f]{32}$/.test(vault || "") || !vaults.includes(vault)) return new Response("unknown vault", { status: 403, headers });
  const base = `vaults/${vault}/`, m = request.method;
  const put = async (key, max, meta) => {
    const len = +(request.headers.get("content-length") || 0);
    if (len > max) return new Response("too big", { status: 413, headers });
    const body = await request.arrayBuffer();
    if (body.byteLength > max) return new Response("too big", { status: 413, headers });
    await env.BACKUP.put(key, body, { customMetadata: meta });
    return body;
  };
  const get = async (key) => {
    const o = await env.BACKUP.get(key);
    if (!o) return new Response("not found", { status: 404, headers });
    return new Response(o.body, { headers: { ...headers, "content-type": "application/octet-stream", "x-updated": o.customMetadata?.updated || "", "cache-control": "no-store" } });
  };

  if (kind === "state") {
    if (m === "GET") return get(base + "state");
    if (m === "PUT") {
      const updated = request.headers.get("x-updated") || String(Date.now());
      const body = await put(base + "state", MAX_STATE, { updated });
      if (body instanceof Response) return body;
      const day = new Date().toISOString().slice(0, 10);
      await env.BACKUP.put(`${base}snap/${day}`, body, { customMetadata: { updated } });   // one per day, kept forever
      return Response.json({ ok: true, updated }, { headers });
    }
  }
  if (kind === "snap" && m === "GET" && /^\d{4}-\d{2}-\d{2}$/.test(rest[0] || "")) return get(`${base}snap/${rest[0]}`);
  if (kind === "snaps" && m === "GET") {
    const list = await env.BACKUP.list({ prefix: base + "snap/" });
    return Response.json(list.objects.map((o) => o.key.split("/").pop()), { headers });
  }
  if (kind === "b" && /^[\w:.-]{1,120}$/.test(rest[0] || "")) {
    const key = `${base}b/${rest[0]}`;
    if (m === "HEAD") { const o = await env.BACKUP.head(key); return new Response(null, { status: o ? 200 : 404, headers }); }
    if (m === "GET") return get(key);
    if (m === "PUT") { const r = await put(key, MAX_BLOB, {}); return r instanceof Response ? r : Response.json({ ok: true }, { headers }); }
  }
  return new Response("not found", { status: 404, headers });
}

async function ask(client, system, content, effort) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort },
    // 被安全分类误拦时，自动换一个模型重试
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("refused");
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const headers = cors(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (!originsOf(env).includes(origin)) return new Response("forbidden", { status: 403, headers });
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    if (parts[0] === "v") return backup(request, env, headers, parts);
    if (request.method !== "POST") return new Response("not found", { status: 404, headers });
    if (!env.ANTHROPIC_API_KEY) return new Response("ai not set up", { status: 501, headers });

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    let body;
    try { body = await request.json(); } catch { return new Response("bad json", { status: 400, headers }); }

    try {
      if (body.task === "transcribe") {
        const images = (body.images || []).slice(0, 10);
        if (!images.length) return new Response("no images", { status: 400, headers });
        const content = [
          ...images.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
          { type: "text", text: `这是她 ${body.date || ""} 的${body.type === "prayer" ? "祷告日记" : "日记"}，一共 ${images.length} 页。请转成文字。` },
        ];
        const text = await ask(client, TRANSCRIBE_SYSTEM, content, "high");
        return Response.json({ text }, { headers });
      }

      if (body.task === "flashback") {
        const content = `回顾的时间：${body.period}\n\n她这段时间写的内容（JSON）：\n${JSON.stringify({
          entries: body.entries, answered_prayers: body.answered, new_places: body.places, new_wishes: body.wishes, wishes_come_true: body.wishes_done,
        }, null, 1)}`;
        const summary = await ask(client, FLASHBACK_SYSTEM, content, "medium");
        return Response.json({ summary }, { headers });
      }

      return new Response("unknown task", { status: 400, headers });
    } catch (err) {
      return new Response("ai error", { status: 502, headers });
    }
  },
};
