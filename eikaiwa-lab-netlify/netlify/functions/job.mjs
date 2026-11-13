// 時間のかかる問い合わせ（おさらい作り）を裏で進める「バックグラウンド処理」。最長15分。
// 呼んだ側にはすぐ 202 が返り、結果は "jobs" に保存される。画面は /api/result で受け取りに来る。
import { getStore } from "@netlify/blobs";
import { guard } from "../lib/common.mjs";
import { callGemini } from "../lib/call-gemini.mjs";

export default async (req, context) => {
  const jobs = getStore("jobs");
  let jobId = "";
  const save = (obj) => (jobId ? jobs.setJSON(jobId, { ...obj, at: Date.now() }) : null);

  try {
    // 合言葉と回数の確認（本文はここで読まれる）
    const g = await guard(req.clone(), context, "call");
    try { jobId = String((await req.json()).jobId || "").replace(/[^\w-]/g, "").slice(0, 60); } catch {}
    if (!jobId) return;
    if (g.err) {
      const e = await g.err.json().catch(() => ({}));
      await save({ status: "error", error: e.error || "受け付けられませんでした", code: g.err.status });
      return;
    }
    const { contents, system } = g.body;
    if (!Array.isArray(contents) || typeof system !== "string" || system.length > 8000 || JSON.stringify(contents).length > 200_000) {
      await save({ status: "error", error: "送られてきた形式が違います", code: 400 });
      return;
    }
    // 時間に余裕があるので、混んでいても何度かやり直す
    const r = await callGemini({ contents, system, fast: true, budgetMs: 120_000, attempts: 4, waitMs: 3000 });
    await save(r.error ? { status: "error", error: r.error, code: r.status, busy: !!r.busy } : { status: "done", text: r.text, model: r.model });
  } catch (e) {
    await save({ status: "error", error: "サーバーで問題が起きました。もう一度どうぞ。", code: 500 });
  }
};

export const config = { path: "/api/job", background: true };
