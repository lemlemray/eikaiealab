// レッスンの進み具合を「つづきの合言葉」で保存・復元する
// save: 進み具合を保存して合言葉（例 K7MP-Q3XA）を返す。同じ合言葉を渡すと上書き
// load: 合言葉から進み具合を返す
import { getStore } from "@netlify/blobs";
import { guard, json, jstDay, clientIp, usageStore, CODE_CHARS } from "../lib/common.mjs";

const progressStore = () => getStore("progress");
const MAX_BYTES = 60000;

export function normSave(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length !== 8 || [...s].some((c) => !CODE_CHARS.includes(c))) return "";
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
function newSave() {
  const r = crypto.getRandomValues(new Uint32Array(8));
  const b = [...r].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
  return `${b.slice(0, 4)}-${b.slice(4)}`;
}

export default async (req, context) => {
  const g = await guard(req, context, "check");   // 利用コード（合言葉）が正しい人だけ。回数には数えない
  if (g.err) return g.err;
  const b = g.body, usage = usageStore(), day = jstDay(), ip = clientIp(req, context);
  const store = progressStore();

  if (b.action === "save") {
    const text = JSON.stringify(b.data ?? null);
    if (!b.data || typeof b.data !== "object") return json({ error: "保存する内容がありません" }, 400);
    if (text.length > MAX_BYTES) return json({ error: "保存する内容が大きすぎます" }, 413);
    const k = `${day}/psave/${ip}`, n = (await usage.get(k, { type: "json" })) || 0;
    if (n >= 300) return json({ error: "今日の保存の回数が上限に達しました。明日また保存できます。" }, 429);
    await usage.setJSON(k, n + 1);
    let code = normSave(b.saveCode);
    if (!code || !(await store.get(code))) {
      do { code = newSave(); } while (await store.get(code));   // 新しい合言葉
    }
    await store.setJSON(code, { data: b.data, savedAt: Date.now() });
    return json({ ok: true, saveCode: code });
  }

  if (b.action === "load") {
    const fk = `${day}/pfail/${ip}`, fails = (await usage.get(fk, { type: "json" })) || 0;
    if (fails >= 30) return json({ error: "合言葉の誤りが多すぎます。明日またお試しください。" }, 429);
    const code = normSave(b.saveCode);
    const rec = code ? await store.get(code, { type: "json" }) : null;
    if (!rec) {
      await usage.setJSON(fk, fails + 1);
      return json({ error: "つづきの合言葉が見つかりません。8文字（例：K7MP-Q3XA）を確かめてください" }, 404);
    }
    return json({ ok: true, saveCode: code, data: rec.data, savedAt: rec.savedAt });
  }

  return json({ error: "知らない操作です" }, 400);
};

export const config = { path: "/api/progress" };
