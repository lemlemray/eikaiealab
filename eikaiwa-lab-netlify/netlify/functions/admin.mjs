// 管理画面のための処理：利用コードの発行・一覧・停止・再開・延長・削除
// ADMIN_PASSWORD（環境変数）を知っている人だけが使える
import { json, jstDay, clientIp, codesStore, usageStore, newCode, normCode, limitsFor, num } from "../lib/common.mjs";

const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(num(v, d))));
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "POST で送ってください" }, 405);
  const adminPass = String(process.env.ADMIN_PASSWORD || "").trim();
  if (adminPass.length < 8) return json({ error: "サーバーに ADMIN_PASSWORD（8文字以上）が設定されていません" }, 500);

  let b;
  try { b = await req.json(); } catch { return json({ error: "リクエストを読めませんでした" }, 400); }

  // パスワードの総当たり対策（1回線あたり1日10回まで間違えられる）
  const usage = usageStore();
  const failKey = `${jstDay()}/adminfail/${clientIp(req, context)}`;
  const fails = (await usage.get(failKey, { type: "json" })) || 0;
  if (fails >= 10) return json({ error: "パスワードの誤りが多すぎます。明日またお試しください。" }, 429);
  if (String(b.password || "") !== adminPass) {
    await usage.setJSON(failKey, fails + 1);
    return json({ error: "管理パスワードが違います" }, 401);
  }

  const codes = codesStore();
  const day = jstDay();
  const now = Date.now();

  if (b.action === "login") return json({ ok: true });

  if (b.action === "list") {
    const { blobs } = await codes.list();
    const recs = (await Promise.all(blobs.map((x) => codes.get(x.key, { type: "json" })))).filter(Boolean);
    const withUse = await Promise.all(recs.map(async (r) => {
      const [s, c] = await Promise.all([
        usage.get(`${day}/session/code/${r.code}`, { type: "json" }),
        usage.get(`${day}/call/code/${r.code}`, { type: "json" }),
      ]);
      const lim = limitsFor(r);
      return { ...r, today: { sessions: s || 0, calls: c || 0, sessionLimit: lim.session, callLimit: lim.call } };
    }));
    withUse.sort((a, z) => (z.createdAt || 0) - (a.createdAt || 0));
    return json({ ok: true, codes: withUse, now });
  }

  if (b.action === "create") {
    const count = clamp(b.count, 1, 200, 1);
    const rec0 = {
      label: clean(b.label, 80),
      planName: clean(b.planName, 40),
      group: clean(b.group, 40),                            // ひろば（事業所）。同じ group のコードどうしが会える
      note: clean(b.note, 200),
      days: clamp(b.days, 0, 3650, 30),                    // 0 = 期限なし
      dailySessions: clamp(b.dailySessions, 1, 500, 10),
      dailyCalls: clamp(b.dailyCalls, 1, 5000, 150),
      status: "active",
      createdAt: now,
      activatedAt: null,
      expiresAt: null,
    };
    const made = [];
    while (made.length < count) {
      const code = newCode();
      if (await codes.get(code)) continue;                 // 万一の重複を避ける
      const rec = { ...rec0, code };
      await codes.setJSON(code, rec);
      made.push(rec);
    }
    return json({ ok: true, created: made });
  }

  const list = (Array.isArray(b.codes) ? b.codes : [b.code]).map(normCode).filter(Boolean).slice(0, 500);
  if (!list.length) return json({ error: "コードが指定されていません" }, 400);

  const updated = [];
  for (const code of list) {
    const rec = await codes.get(code, { type: "json" });
    if (!rec) continue;
    if (b.action === "revoke") rec.status = "revoked";
    else if (b.action === "restore") rec.status = "active";
    else if (b.action === "extend") {
      const d = clamp(b.days, 1, 3650, 30);
      if (rec.activatedAt) rec.expiresAt = Math.max(now, rec.expiresAt || now) + d * 864e5;
      else rec.days = (rec.days || 0) + d;                  // まだ使われていなければ日数を足す
    } else if (b.action === "delete") {
      await codes.delete(code);
      updated.push({ code, deleted: true });
      continue;
    } else if (b.action === "update") {
      if (b.label !== undefined) rec.label = clean(b.label, 80);
      if (b.note !== undefined) rec.note = clean(b.note, 200);
      if (b.group !== undefined) rec.group = clean(b.group, 40);
    } else {
      return json({ error: "知らない操作です" }, 400);
    }
    await codes.setJSON(code, rec);
    updated.push(rec);
  }
  return json({ ok: true, updated });
};

export const config = { path: "/api/admin" };
