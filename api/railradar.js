// Vercel serverless proxy for RailRadar live train status.
// Configure RAILRADAR_API_KEY in Vercel Environment Variables.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const number = String(req.query?.number || "").trim();
  if (!/^\d{5}$/.test(number)) {
    return res.status(400).json({ error: "Enter a valid 5-digit train number." });
  }
  const key = process.env.RAILRADAR_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "RailRadar is not configured. Add RAILRADAR_API_KEY in Vercel." });
  }
  try {
    const upstream = await fetch(`https://api.railradar.in/v1/trains/${encodeURIComponent(number)}/live`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    const body = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(body);
  } catch (_error) {
    return res.status(502).json({ error: "Could not reach RailRadar." });
  }
}
