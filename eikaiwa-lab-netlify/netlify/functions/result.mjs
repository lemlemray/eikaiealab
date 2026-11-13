// バックグラウンド処理の結果を受け取る。まだなら {status:"pending"}。受け取ったら消す。
import { getStore } from "@netlify/blobs";
import { json } from "../lib/common.mjs";

export default async (req) => {
  const id = String(new URL(req.url).searchParams.get("id") || "").replace(/[^\w-]/g, "").slice(0, 60);
  if (!id) return json({ error: "id がありません" }, 400);
  const jobs = getStore("jobs");
  const r = await jobs.get(id, { type: "json" });
  if (!r) return json({ status: "pending" });
  await jobs.delete(id);
  return json(r);
};

export const config = { path: "/api/result" };
