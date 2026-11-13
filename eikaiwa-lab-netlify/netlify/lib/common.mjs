// 共通処理：利用コード（または合言葉）の確認と、1日の利用回数の制限
import { getStore } from "@netlify/blobs";

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// 日本時間の日付（回数は日本時間の0時にリセット）
export const jstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);
export const clientIp = (req, context) =>
  String(context?.ip || req.headers.get("x-nf-client-connection-ip") || "noip").replace(/[^\w.:-]/g, "");

/* ---------- 利用コード ---------- */
// 読み間違えやすい 0/O・1/I/L を除いた文字だけを使う
export const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function normCode(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const body = s.startsWith("EL") ? s.slice(2) : s;
  if (body.length !== 8 || [...body].some((c) => !CODE_CHARS.includes(c))) return "";
  return `EL-${body.slice(0, 4)}-${body.slice(4)}`;
}
export function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(8));
  const b = [...r].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
  return `EL-${b.slice(0, 4)}-${b.slice(4)}`;
}
export const codesStore = () => getStore("codes");
export const usageStore = () => getStore("usage");

/** 1日の上限（コードに個別の上限がなければ既定値） */
export function limitsFor(rec) {
  return {
    session: num(rec?.dailySessions, num(process.env.DAILY_SESSIONS, 20)),
    call: num(rec?.dailyCalls, num(process.env.DAILY_CALLS, 300)),
  };
}

/**
 * kind: "session"（会話の開始） / "call"（採点などの問い合わせ） / "check"（確認だけ・回数に数えない）
 * 戻り値: { err: Response } か { body, left, who }
 */
export async function guard(req, context, kind) {
  if (req.method !== "POST") return { err: json({ error: "POST で送ってください" }, 405) };
  if (!process.env.GEMINI_API_KEY) return { err: json({ error: "サーバーに GEMINI_API_KEY が設定されていません" }, 500) };

  let body;
  try { body = await req.json(); } catch { return { err: json({ error: "リクエストを読めませんでした" }, 400) }; }

  const usage = usageStore();
  const day = jstDay();
  const ip = clientIp(req, context);
  const failKey = `${day}/fail/${ip}`;
  const fails = (await usage.get(failKey, { type: "json" })) || 0;
  if (fails >= num(process.env.MAX_CODE_FAILS, 30)) return { err: json({ error: "入力の誤りが多すぎます。明日またお試しください。" }, 429) };
  const fail = async (msg, status = 401) => { await usage.setJSON(failKey, fails + 1); return { err: json({ error: msg }, status) }; };

  const raw = String(body.code || "").trim();
  const pass = String(process.env.PASSCODE || "").trim();
  let who;

  if (pass && raw === pass) {
    who = { type: "pass" };
  } else {
    const code = normCode(raw);
    if (!code) return fail(raw ? "利用コード（または合言葉）が違います" : "利用コードを入れてください");
    const codes = codesStore();
    const rec = await codes.get(code, { type: "json" });
    if (!rec) return fail("利用コードが見つかりません。入力をご確認ください");
    if (rec.status === "revoked") return { err: json({ error: "この利用コードは停止されています。お問い合わせください" }, 403) };
    const now = Date.now();
    if (!rec.activatedAt && kind !== "check") {
      rec.activatedAt = now;
      if (rec.days) rec.expiresAt = now + rec.days * 864e5;   // 最初に使った日から数える
      await codes.setJSON(code, rec);
    }
    if (rec.expiresAt && now > rec.expiresAt) return { err: json({ error: "利用期限が切れました。延長・購入はお問い合わせください", expired: true }, 403) };
    who = { type: "code", code, rec };
  }

  // 回数の確認と記録
  const limits = who.type === "code" ? limitsFor(who.rec) : limitsFor(null);
  const keyOf = (k) => who.type === "code" ? `${day}/${k}/code/${who.code}` : `${day}/${k}/dev/${String(body.device || "unknown").replace(/[^\w-]/g, "").slice(0, 40) || "unknown"}`;

  if (kind === "check") {
    const [s, c] = await Promise.all([usage.get(keyOf("session"), { type: "json" }), usage.get(keyOf("call"), { type: "json" })]);
    return { body, who, today: { sessionsLeft: Math.max(0, limits.session - (s || 0)), callsLeft: Math.max(0, limits.call - (c || 0)) } };
  }

  const per = kind === "session" ? limits.session : limits.call;
  const keys = [keyOf(kind), `${day}/all`];
  if (who.type === "pass") keys.push(`${day}/${kind}/ip/${ip}`);
  const [n1, nAll, nIp] = await Promise.all(keys.map((k) => usage.get(k, { type: "json" })));
  const a = n1 || 0, all = nAll || 0, ipn = nIp || 0;
  const msg = kind === "session" ? "今日の会話の回数が上限に達しました。明日また使えます。" : "今日の利用回数が上限に達しました。明日また使えます。";
  if (a >= per) return { err: json({ error: msg }, 429) };
  if (who.type === "pass" && ipn >= per * num(process.env.IP_MULTIPLIER, 5)) return { err: json({ error: msg }, 429) };
  if (all >= num(process.env.GLOBAL_DAILY_CALLS, 5000)) return { err: json({ error: "今日はアプリ全体の利用上限に達しました。明日また使えます。" }, 429) };

  const writes = [usage.setJSON(keys[0], a + 1), usage.setJSON(keys[1], all + 1)];
  if (who.type === "pass") writes.push(usage.setJSON(keys[2], ipn + 1));
  await Promise.all(writes);
  return { body, who, left: per - a - 1 };
}
