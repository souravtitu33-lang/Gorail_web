/* GoRail live-data layer.
   RailRadar requests use the secure Vercel serverless proxy.
   Weather is provided by the public Open-Meteo API and requires no key.
*/

// RailRadar API calls go through the Vercel serverless proxy so the API key
// remains server-side in RAILRADAR_API_KEY and is never exposed in browser storage.
function hasLiveData(){ return true; }

async function railRadarGet(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== "") query.set(k, String(v).trim());
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch("/api/railradar?" + query.toString(), {
      headers: { "Accept": "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("RailRadar timed out after 15 seconds. Showing the schedule-based position instead.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const message = body?.error?.message || body?.error || "RailRadar request failed (" + response.status + ")";
    const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
    error.code = body?.error?.code || "RAILRADAR_ERROR";
    error.status = response.status;
    throw error;
  }
  return body;
}

const liveStatusCache = new Map();
const LIVE_STATUS_TTL_MS = 75000;

const GoRailAPI = {
  hasLiveData,
  async liveStatus(trainNo, _startDay = "1", date) {
    const key = String(trainNo || "") + "|" + String(date || "");
    const hit = liveStatusCache.get(key);
    if (hit && Date.now() - hit.at < LIVE_STATUS_TTL_MS) return hit.body;
    const body = await railRadarGet({ action: "live", number: trainNo, date });
    liveStatusCache.set(key, { at: Date.now(), body });
    return body;
  },
  trainRoute(trainNo) {
    return railRadarGet({ action: "route", number: trainNo });
  },
  pnrStatus(pnrNumber) {
    return railRadarGet({ action: "pnr", pnr: pnrNumber });
  },
  seatAvailability({ trainNo, fromStationCode, toStationCode, classType, quota = "GN", date }) {
    return railRadarGet({
      action: "seats", number: trainNo, source: fromStationCode,
      destination: toStationCode, journeyDate: date, classCode: classType, quotaCode: quota
    });
  },
  seatVacancy(args) {
    return this.seatAvailability(args);
  },
  fare({ trainNo, fromStationCode, toStationCode }) {
    return railRadarGet({ action: "fare", number: trainNo, source: fromStationCode, destination: toStationCode });
  },
  trainsBetween({ fromStationCode, toStationCode, dateOfJourney }) {
    return railRadarGet({ action: "between", from: fromStationCode, to: toStationCode, date: dateOfJourney });
  },
  searchStation(query) {
    return railRadarGet({ action: "station-search", query });
  }
};

/* ---------- FREE live weather (no key, works immediately) ---------- */
// A small set of major-station coordinates for weather + map context.
const STATIONS_DB = [
  { code: "MMCT", name: "Mumbai Central", lat: 18.9698, lon: 72.8194 },
  { code: "NDLS", name: "New Delhi", lat: 28.6435, lon: 77.2197 },
  { code: "SBC", name: "Bengaluru", lat: 12.9767, lon: 77.5993 },
  { code: "HWH", name: "Howrah", lat: 22.5839, lon: 88.3425 },
  { code: "HYB", name: "Hyderabad", lat: 17.3937, lon: 78.4691 },
  { code: "BBS", name: "Bhubaneswar", lat: 20.2705, lon: 85.8341 },
  { code: "KUR", name: "Khurda Road", lat: 20.1809, lon: 85.6153 },
  { code: "CTC", name: "Cuttack", lat: 20.4625, lon: 85.8828 },
  { code: "MAS", name: "Chennai Central", lat: 13.0827, lon: 80.2707 },
  { code: "PUNE", name: "Pune", lat: 18.5286, lon: 73.8744 },
  { code: "ADI", name: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
  { code: "JP", name: "Jaipur", lat: 26.9196, lon: 75.7878 },
  { code: "LKO", name: "Lucknow", lat: 26.8305, lon: 80.9199 },
  { code: "PNBE", name: "Patna", lat: 25.6093, lon: 85.1376 }
];
function findStation(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  return STATIONS_DB.find(s => s.name.toLowerCase() === n)
      || STATIONS_DB.find(s => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase()))
      || null;
}
const WMO = { 0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",51:"Light drizzle",
  61:"Light rain",63:"Rain",65:"Heavy rain",71:"Snow",80:"Rain showers",95:"Thunderstorm" };
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FKolkata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("WEATHER_ERROR");
  const j = await res.json();
  const c = j.current || {};
  return { temp: c.temperature_2m, wind: c.wind_speed_10m, desc: WMO[c.weather_code] || "—" };
}
async function stationWeather(stationName) {
  const st = findStation(stationName);
  if (!st) return null;
  try { return { ...(await fetchWeather(st.lat, st.lon)), station: st }; }
  catch (e) { return null; }
}

/* ---------- Tatkal countdown (genuinely live — real IST clock) ---------- */
// AC classes open 10:00 IST, non-AC 11:00 IST, next day's journey.
function tatkalCountdown() {
  const now = new Date();
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  function next(hour) {
    const t = new Date(istNow); t.setHours(hour, 0, 0, 0);
    if (t <= istNow) t.setDate(t.getDate() + 1);
    return t - istNow;
  }
  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  }
  return { ac: fmt(next(10)), nonAc: fmt(next(11)), istNow };
}
