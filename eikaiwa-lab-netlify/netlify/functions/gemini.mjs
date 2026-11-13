// 採点・リピート判定（音声つき・すぐ返す必要がある問い合わせ）を、サーバーのAPIキーで Gemini に中継する。
// Netlify の通常の関数は約10秒で打ち切られるので、その手前で必ず返事をする。
import { guard, json } from "../lib/common.mjs";
import { callGemini } from "../lib/call-gemini.mjs";

export default async (req, context) => {
  const g = await guard(req, context, "call");
  if (g.err) return g.err;

  const { contents, system, fast, lite } = g.body;
  if (!Array.isArray(contents) || typeof system !== "string") return json({ error: "送られてきた形式が違います" }, 400);
  if (JSON.stringify(contents).length > 4_000_000) return json({ error: "音声が長すぎます。短く区切って話してください" }, 413);
  if (system.length > 8000) return json({ error: "指示文が長すぎます" }, 400);

  const r = await callGemini({ contents, system, fast, lite: !!lite, budgetMs: 8500 });
  if (r.error) return json({ error: r.error, busy: !!r.busy }, r.status);
  return json({ text: r.text, left: g.left, model: r.model });
};

export const config = { path: "/api/gemini" };
