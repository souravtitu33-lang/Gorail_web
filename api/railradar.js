// Server-side RailRadar proxy. Set RAILRADAR_API_KEY in Vercel Environment Variables.
// Never put the key in frontend JavaScript, query strings, or GitHub.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const action = String(req.query?.action || "live").trim().toLowerCase();
  const key = process.env.RAILRADAR_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "RailRadar is not configured. Add RAILRADAR_API_KEY in Vercel Environment Variables." });
  }

  let path = "";
  const number = String(req.query?.number || "").trim();
  const pnr = String(req.query?.pnr || "").trim();
  const stationCode = value => /^[A-Za-z0-9]{2,10}$/.test(String(value || ""));
  const trainNumber = value => /^\d{5}$/.test(String(value || ""));

  if (action === "live") {
    if (!trainNumber(number)) return res.status(400).json({ error: "Enter a valid 5-digit train number." });
    path = `/v1/trains/${encodeURIComponent(number)}/live`;
    if (req.query?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
      path += `?date=${encodeURIComponent(req.query.date)}`;
    }
  } else if (action === "pnr") {
    if (!/^\d{10}$/.test(pnr)) return res.status(400).json({ error: "Enter a valid 10-digit PNR number." });
    path = `/v1/pnr/${encodeURIComponent(pnr)}`;
  } else if (action === "seats" || action === "vacancy") {
    const source = String(req.query?.source || "").trim().toUpperCase();
    const destination = String(req.query?.destination || "").trim().toUpperCase();
    const journeyDate = String(req.query?.journeyDate || "").trim();
    const classCode = String(req.query?.classCode || "").trim().toUpperCase();
    const quotaCode = String(req.query?.quotaCode || "GN").trim().toUpperCase();
    const classes = ["1A","2A","3A","3E","CC","EC","EA","FC","SL","2S","VS","CH","SH","VC","EV"];
    const quotas = ["GN","TQ","PT","LD","DF","FT","SS","YU","DP","HP","PH"];
    if (!trainNumber(number)) return res.status(400).json({ error: "Enter a valid 5-digit train number." });
    if (!stationCode(source) || !stationCode(destination) || source === destination) return res.status(400).json({ error: "Enter valid, different source and destination station codes." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(journeyDate) || Number.isNaN(Date.parse(journeyDate))) return res.status(400).json({ error: "Journey date must be YYYY-MM-DD." });
    if (!classes.includes(classCode)) return res.status(400).json({ error: "Unsupported coach class." });
    if (!quotas.includes(quotaCode)) return res.status(400).json({ error: "Unsupported quota code." });
    const query = new URLSearchParams({ source, destination, journeyDate, classCode, quotaCode });
    path = `/v1/trains/${encodeURIComponent(number)}/seats?${query.toString()}`;
  } else if (action === "fare") {
    if (!trainNumber(number)) return res.status(400).json({ error: "Enter a valid 5-digit train number." });
    const source = String(req.query?.source || "").trim().toUpperCase();
    const destination = String(req.query?.destination || "").trim().toUpperCase();
    if (!stationCode(source) || !stationCode(destination) || source === destination) return res.status(400).json({ error: "Enter valid, different station codes." });
    path = `/v1/trains/${encodeURIComponent(number)}/fare?${new URLSearchParams({source,destination}).toString()}`;
  } else if (action === "between") {
    const from = String(req.query?.from || "").trim().toUpperCase();
    const to = String(req.query?.to || "").trim().toUpperCase();
    if (!stationCode(from) || !stationCode(to) || from === to) return res.status(400).json({ error: "Enter valid, different station codes." });
    const query = new URLSearchParams();
    if (req.query?.date) query.set("date", String(req.query.date));
    path = `/v1/trains/between/${encodeURIComponent(from)}/${encodeURIComponent(to)}${query.size ? "?" + query.toString() : ""}`;
  } else if (action === "station-search") {
    const query = String(req.query?.query || "").trim();
    if (!query || query.length > 80) return res.status(400).json({ error: "Enter a station search term (up to 80 characters)." });
    path = `/v1/lookup/search/stations?${new URLSearchParams({q:query}).toString()}`;
  } else {
    return res.status(400).json({ error: "Unsupported RailRadar action." });
  }

  try {
    const upstream = await fetch("https://api.railradar.in" + path, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
    });
    const body = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(body);
  } catch (_error) {
    return res.status(502).json({ error: "Could not reach RailRadar. Please try again later." });
  }
}
