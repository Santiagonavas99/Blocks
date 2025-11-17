import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === "GET") {
    const data = await kv.get("blocks_state");
    return res.status(200).json(data || {});
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    await kv.set("blocks_state", body);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}