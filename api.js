/* ============================================================
   GoRail live-data layer
   ------------------------------------------------------------
   Two tiers of "live":
   1) FREE, NO KEY — real-time weather at any station via the
      public Open-Meteo API. No signup needed, works out of the box.
   2) OPTIONAL, KEY REQUIRED — real Indian Railways data (live
      running status, PNR status, seat availability, fare) via the
      "irctc1" API on RapidAPI, the same provider used by most
      open-source Indian-Railways tools. Paste a personal RapidAPI
      key in Settings (gear icon, top bar) to switch this on.
      Without a key, GoRail falls back to clearly-labelled demo data
      so the app still works end to end.
   NOTE: third-party API paths occasionally change on the provider's
   side — if a call fails, GoRail surfaces the error and falls back
   to demo data rather than breaking the page.
   ============================================================ */

const RAPIDAPI_HOST = "irctc1.p.rapidapi.com";
const RAPIDAPI_KEY_STORAGE = "gorail_rapidapi_key";

function getApiKey(){ return (localStorage.getItem(RAPIDAPI_KEY_STORAGE) || "").trim(); }
function setApiKey(k){ localStorage.setItem(RAPIDAPI_KEY_STORAGE, (k||"").trim()); }
function hasLiveData(){ return getApiKey().length > 0; }

async function rapidGet(path, params = {}) {
  const key = getApiKey();
  if (!key) { const e = new Error("NO_KEY"); e.code = "NO_KEY"; throw e; }
  const url = new URL(`https://${RAPIDAPI_HOST}${path}`);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v); });
  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": RAPIDAPI_HOST }
    });
  } catch (err) {
    const e = new Error("NETWORK_ERROR"); e.code = "NETWORK_ERROR"; throw e;
  }
  if (!res.ok) { const e = new Error("API_ERROR_" + res.status); e.code = "API_ERROR"; e.status = res.status; throw e; }
  return res.json();
}

const GoRailAPI = {
  hasLiveData,
  getApiKey,
  setApiKey,

  // RailRadar live running status. The key is kept server-side in RAILRADAR_API_KEY.
  liveStatus(trainNo, startDay = "1") {
    const number = String(trainNo || "").trim();
    if (!/^\d{5}$/.test(number)) {
      const e = new Error("INVALID_TRAIN_NUMBER"); e.code = "INVALID_TRAIN_NUMBER"; throw e;
    }
    return fetch("/api/railradar?number=" + encodeURIComponent(number), {
      headers: { "Accept": "application/json" }
    }).then(async res => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error(body?.error || "RAILRADAR_ERROR_" + res.status);
        e.code = "RAILRADAR_ERROR"; e.status = res.status; throw e;
      }
      return body;
    });
  },
  // PNR status (real data, needs key)
  pnrStatus(pnrNumber) {
    return rapidGet("/api/v3/getPNRStatus", { pnrNumber });
  },
  // Class-wise seat availability (real data, needs key)
  seatAvailability({ trainNo, fromStationCode, toStationCode, classType, quota = "GN", date }) {
    return rapidGet("/api/v1/checkSeatAvailability", { trainNo, fromStationCode, toStationCode, classType, quota, date });
  },
  // Fare enquiry (real data, needs key)
  fare({ trainNo, fromStationCode, toStationCode }) {
    return rapidGet("/api/v1/getFare", { trainNo, fromStationCode, toStationCode });
  },
  // Trains running between two stations on a date (real data, needs key)
  trainsBetween({ fromStationCode, toStationCode, dateOfJourney }) {
    return rapidGet("/api/v3/trainBetweenStations", { fromStationCode, toStationCode, dateOfJourney });
  },
  // Station name/code search (real data, needs key)
  searchStation(query) {
    return rapidGet("/api/v1/searchStation", { query });
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
