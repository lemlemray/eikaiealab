// 利用コードの状態を確かめる（回数には数えない）
import { guard, json } from "../lib/common.mjs";

export default async (req, context) => {
  const g = await guard(req, context, "check");
  if (g.err) return g.err;
  const r = g.who.rec;
  return json({
    ok: true,
    type: g.who.type,                       // "code" か "pass"（合言葉）
    code: g.who.code || null,
    label: r?.planName || null,
    days: r?.days || 0,
    activated: !!r?.activatedAt,
    expiresAt: r?.expiresAt || null,
    today: g.today,
  });
};

export const config = { path: "/api/me" };
