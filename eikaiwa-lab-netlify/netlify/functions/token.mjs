// リアルタイム会話用の「一時トークン」を発行する。本物のAPIキーはブラウザに渡さない。
import { guard, json } from "../lib/common.mjs";

export default async (req, context) => {
  const g = await guard(req, context, "session");
  if (g.err) return g.err;

  const model = process.env.LIVE_MODEL || "gemini-3.8-live";
  const now = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      uses: 1,                                                   // 1回の接続だけに使える
      expireTime: new Date(now + 30 * 60e3).toISOString(),       // 会話は最長30分
      newSessionExpireTime: new Date(now + 2 * 60e3).toISOString(), // 2分以内に接続しないと無効
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.name) {
    return json({ error: `会話の準備ができませんでした（${res.status}）：${data?.error?.message || "不明なエラー"}` }, 502);
  }
  return json({ token: data.name, model, left: g.left });
};

export const config = { path: "/api/token" };
