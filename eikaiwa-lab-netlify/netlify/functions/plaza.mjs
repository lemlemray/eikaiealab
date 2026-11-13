// ひろば（同じ事業所の人だけが集まる小さなSNS）
// やりとりは「英語の定型文」と「スタンプ」だけ。自由な文字は受け付けない（名前も選ぶだけ）。
//
// 保存のしかた（Netlify Blobs の "plaza"）：同時に書きこんでもぶつからないよう、
// 1人1つの書き場所に分けている。
//   p/<ひろば>/<人>        いまどこにいるか・吹き出し・いっしょにレッスンの状態（本人だけが書く）
//   a/<ひろば>/<人>        アバター（きせかえ）
//   r/<ひろば>/<人>        マイルームの家具
//   c/<ひろば>/<人>/<時刻>  とどいた「おうえん」（送った人が書き、受け取った人が消す）
import { getStore } from "@netlify/blobs";
import { guard, json, jstDay, usageStore } from "../lib/common.mjs";

const plaza = () => getStore("plaza");
const ALIVE_MS = 25_000;          // これより前から音沙汰のない人は「いない」扱い
const MAX_PEOPLE = 80;

const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const frac = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 1000) / 1000)) : 0.5; };
const word = (v, n = 40) => String(v ?? "").replace(/[^\w#|.-]/g, "").slice(0, n);
const uidOk = (v) => /^[cd][\w-]{4,44}$/.test(String(v || ""));

async function hashKey(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 利用コード → どのひろばの、だれか */
async function whoAmI(g) {
  if (g.who.type === "code") {
    const group = String(g.who.rec.group || "").trim();
    if (!group) return null;
    return { gid: await hashKey("g:" + group), groupName: group, uid: "c" + g.who.code.replace(/[^A-Z0-9]/g, "") };
  }
  // 合言葉（モニター）の人は、みんな「モニター」のひろばへ
  const dev = String(g.body.device || "").replace(/[^\w-]/g, "").slice(0, 40);
  if (dev.length < 4) return null;
  return { gid: await hashKey("g:__monitor__"), groupName: "モニター", uid: "d" + dev };
}

/** アバター：知っている項目だけを残す */
function cleanAvatar(av) {
  if (!av || typeof av !== "object") return null;
  const out = {};
  for (const k of ["face", "skin", "iris", "style", "hair"]) if (av[k] != null) out[k] = word(av[k]);
  for (const k of ["top", "bag", "hat", "neck", "glasses", "earrings"]) {
    const v = av[k];
    out[k] = v && typeof v === "object" ? { t: word(v.t, 20), b: word(v.b, 20) } : null;
  }
  return out;
}
/** いっしょにレッスンの状態 */
function cleanDuo(d) {
  if (!d || typeof d !== "object") return null;
  const out = { id: word(d.id, 24), with: uidOk(d.with) ? d.with : "", host: !!d.host, n: int(d.n, 0, 40) };
  if (!out.id || !out.with) return null;
  if (d.no) out.no = true;
  if (Array.isArray(d.items)) out.items = d.items.slice(0, 8).map((x) => word(x, 12));
  return out;
}
function cleanRoom(r) {
  const items = (Array.isArray(r?.items) ? r.items : []).slice(0, 40)
    .map((x) => ({ k: word(x?.k, 20), x: frac(x?.x), y: frac(x?.y), f: x?.f ? 1 : 0 })).filter((x) => x.k);
  return { items, wall: int(r?.wall, 0, 20), floor: int(r?.floor, 0, 20), at: Date.now() };
}

export default async (req, context) => {
  const g = await guard(req, context, "check");     // 利用コードが正しい人だけ。回数には数えない
  if (g.err) return g.err;
  const me = await whoAmI(g);
  if (!me) return json({ error: "ひろばはまだ使えません。事業所の方に「ひろば」の設定をお願いしてください。", noGroup: true }, 403);

  const b = g.body, st = plaza(), now = Date.now();
  const P = (u) => `p/${me.gid}/${u}`, A = (u) => `a/${me.gid}/${u}`, R = (u) => `r/${me.gid}/${u}`;

  /* ---------- いる場所の報告と、まわりの様子 ---------- */
  if (b.action === "poll") {
    const room = b.room === "plaza" ? "plaza" : (/^home:[cd][\w-]{4,44}$/.test(String(b.room)) ? b.room : "plaza");
    if (b.av) {
      const av = cleanAvatar(b.av);
      if (av) await st.setJSON(A(me.uid), { v: word(b.avv, 16), av });
    }
    if (!b.stay) {
      const mine = {
        uid: me.uid, room, t: now,
        name: [int(b.name?.[0], 0, 99), int(b.name?.[1], 0, 99)],
        x: frac(b.x), y: frac(b.y), dir: b.dir < 0 ? -1 : 1, avv: word(b.avv, 16),
        say: b.say && typeof b.say === "object" ? { k: word(b.say.k, 12), id: int(b.say.id, 0, 1e9) } : null,
        duo: cleanDuo(b.duo),
      };
      await st.setJSON(P(me.uid), mine);
    }

    const { blobs } = await st.list({ prefix: `p/${me.gid}/` });
    const recs = (await Promise.all(blobs.slice(0, MAX_PEOPLE * 2).map((x) => st.get(x.key, { type: "json" })))).filter(Boolean);
    const alive = recs.filter((r) => now - (r.t || 0) < ALIVE_MS);
    const known = b.known && typeof b.known === "object" ? b.known : {};
    const people = [];
    for (const r of alive) {
      if (r.uid === me.uid) continue;
      const here = r.room === room;
      const p = { uid: r.uid, name: r.name, room: r.room, here, avv: r.avv,
        duo: r.duo && (r.duo.with === me.uid) ? r.duo : (r.duo ? { busy: true } : null) };
      if (here) Object.assign(p, { x: r.x, y: r.y, dir: r.dir, say: r.say });
      if (r.avv && known[r.uid] !== r.avv) p.av = (await st.get(A(r.uid), { type: "json" }))?.av || null;
      people.push(p);
    }

    // とどいた「おうえん」を受け取る
    const { blobs: cb } = await st.list({ prefix: `c/${me.gid}/${me.uid}/` });
    const cheers = [];
    for (const x of cb.slice(0, 30)) {
      const c = await st.get(x.key, { type: "json" });
      if (c) cheers.push({ from: c.from, name: c.name, k: c.k });
      await st.delete(x.key);
    }

    // 古くなった書き場所のおそうじ（ときどき）
    if (Math.random() < 0.03) {
      for (const r of recs) if (now - (r.t || 0) > 864e5) await st.delete(P(r.uid));
    }
    return json({ ok: true, me: me.uid, groupName: me.groupName, people, cheers, at: now });
  }

  /* ---------- おうえんを送る ---------- */
  if (b.action === "cheer") {
    if (!uidOk(b.to) || b.to === me.uid) return json({ error: "相手が見つかりません" }, 400);
    const k = `${jstDay()}/cheer/${me.uid}`, usage = usageStore();
    const n = (await usage.get(k, { type: "json" })) || 0;
    if (n >= 60) return json({ error: "今日のおうえんは、もうたくさん送りました。また明日！" }, 429);
    const to = await st.get(P(b.to), { type: "json" });
    if (!to) return json({ error: "相手が見つかりません" }, 404);
    await usage.setJSON(k, n + 1);
    await st.setJSON(`c/${me.gid}/${b.to}/${now}-${me.uid}`, {
      from: me.uid, name: [int(b.name?.[0], 0, 99), int(b.name?.[1], 0, 99)], k: word(b.k, 12), t: now,
    });
    return json({ ok: true });
  }

  /* ---------- マイルーム ---------- */
  if (b.action === "room-get") {
    const owner = uidOk(b.owner) ? b.owner : me.uid;
    const r = await st.get(R(owner), { type: "json" });
    return json({ ok: true, owner, room: r || { items: [], wall: 0, floor: 0 } });
  }
  if (b.action === "room-save") {
    const r = cleanRoom(b.room);
    await st.setJSON(R(me.uid), r);
    return json({ ok: true, room: r });
  }

  /* ---------- ひろばを出る ---------- */
  if (b.action === "leave") {
    await st.delete(P(me.uid));
    return json({ ok: true });
  }

  return json({ error: "知らない操作です" }, 400);
};

export const config = { path: "/api/plaza" };
