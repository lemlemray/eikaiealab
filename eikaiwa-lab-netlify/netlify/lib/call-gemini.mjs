// Gemini の呼び出し（混雑時のやり直し・予備モデルへの切り替え・時間の上限つき）

// 速さ優先のときは「考える時間」を最小に。モデルが対応していない指定は順に外す。
const THINK = [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }, { thinkingBudget: 0 }, null];
const busyStatus = (st) => st === 429 || st === 500 || st === 503 || st === 504;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * budgetMs: この時間を過ぎたら打ち切る（Netlify の通常の関数は約10秒で強制終了されるため）
 * 戻り値: { text, model } または { error, status, busy }
 */
const list = (s) => String(s || "").split(",").map((m) => m.trim()).filter(Boolean);

/**
 * lite: true のときは安いモデルを先に使う（レッスン・チャレンジの採点用）。
 *   LITE_MODEL（既定 gemini-3.5-flash-lite）→ LITE_FALLBACK_MODELS（既定 gemini-3.1-flash-lite）
 *   → どれも使えないときだけ通常のモデルへ。
 */
export async function callGemini({ contents, system, fast = false, lite = false, budgetMs = 8500, attempts = 2, waitMs = 1200 }) {
  const normal = [
    process.env.MODEL || "gemini-3.8-flash",
    ...list(process.env.FALLBACK_MODELS || "gemini-3.6-flash,gemini-3.5-flash-lite"),
  ];
  const cheap = [
    process.env.LITE_MODEL || "gemini-3.5-flash-lite",
    ...list(process.env.LITE_FALLBACK_MODELS || "gemini-3.1-flash-lite"),
  ];
  const models = [...new Set(lite ? [...cheap, ...normal] : normal)];
  const deadline = Date.now() + budgetMs;
  let lastMsg = "", lastStatus = 502, sawBusy = false;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let i = fast ? 0 : THINK.length - 1;
    for (let attempt = 0; attempt < attempts; ) {
      const left = deadline - Date.now();
      if (left < 1500) return { error: "AIが混み合っています。少し待ってからもう一度どうぞ。", status: 503, busy: true };
      const generationConfig = { temperature: 0.4, responseMimeType: "application/json" };
      if (THINK[i]) generationConfig.thinkingConfig = THINK[i];
      let res, data;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents, generationConfig }),
          signal: AbortSignal.timeout(left - 500),
        });
        data = await res.json().catch(() => ({}));
      } catch {
        // 時間切れ（返事が遅すぎる）＝混雑とみなす
        return { error: "AIの返事が遅れています。少し待ってからもう一度どうぞ。", status: 503, busy: true };
      }
      if (res.ok) {
        const text = (data?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
        return { text, model };
      }
      lastMsg = data?.error?.message || ""; lastStatus = res.status;
      if (res.status === 400 && THINK[i] && /think/i.test(lastMsg) && i < THINK.length - 1) { i++; continue; }
      if (busyStatus(res.status)) { sawBusy = true; attempt++; if (attempt < attempts) await sleep(waitMs * attempt); continue; }
      if (res.status === 404 || (res.status === 400 && /model/i.test(lastMsg))) break; // このモデルは使えない → 次へ
      return { error: `AIの呼び出しに失敗しました（${res.status}）：${lastMsg || "不明なエラー"}`, status: 502 };
    }
  }
  if (sawBusy) return { error: "AIが混み合っています。少し待ってからもう一度どうぞ。", status: 503, busy: true };
  return { error: `AIの呼び出しに失敗しました（${lastStatus}）：${lastMsg || "不明なエラー"}`, status: 502 };
}
