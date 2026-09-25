/* ============================================================
   GoRail — Real Indian Railways dataset (ALL stations, ALL trains)
   ------------------------------------------------------------
   Source: DataMeet's "railways" dataset (CC0 / public domain),
   https://github.com/datameet/railways — gathered from Indian
   Railways open data. This is the same real-world dataset most
   independent Indian-rail visualisation tools are built on.
     - stations.json ~ every railway station in India (code, name,
       state, zone, lat/lon)
     - trains.json   ~ every train in India (number, name, from/to,
       classes, distance, duration) PLUS its real route as a
       GeoJSON LineString (the actual path of stations it runs
       through, in order)
   Nothing is hardcoded/truncated by GoRail — the full live dataset
   is fetched directly from the source on demand (it's large, ~16MB
   total, so it's an explicit "Load" action, not automatic), then a
   lightweight search index is cached in localStorage so future
   visits are instant.
   ============================================================ */

const RAIL_STATIONS_URL = "https://github.com/datameet/railways/raw/refs/heads/master/stations.json";
const RAIL_TRAINS_URL = "https://github.com/datameet/railways/raw/refs/heads/master/trains.json";
const RAIL_CACHE_KEY = "gorail_all_india_index_v1";

let ALL_STATIONS = [];      // [{code,name,state,zone,lat,lon}]
let ALL_TRAINS_INDEX = [];  // [{number,name,from,from_name,to,to_name,zone,distance,duration_h,duration_m,classes:[..]}]
let ALL_TRAINS_GEOJSON = null; // full FeatureCollection kept in-memory only (for route polylines)

function railDatasetLoaded(){ return ALL_TRAINS_INDEX.length > 0; }
function railStationsLoaded(){ return ALL_STATIONS.length > 0; }

function loadCachedIndex(){
  try{
    const raw = localStorage.getItem(RAIL_CACHE_KEY);
    if(!raw) return false;
    const j = JSON.parse(raw);
    ALL_STATIONS = j.stations || [];
    ALL_TRAINS_INDEX = j.trains || [];
    return ALL_TRAINS_INDEX.length > 0;
  }catch(e){ return false; }
}

function classListFromProps(p){
  const out=[];
  if(p.first_ac) out.push("1A"); if(p.second_ac) out.push("2A"); if(p.third_ac) out.push("3A");
  if(p.sleeper) out.push("SL"); if(p.chair_car) out.push("CC"); if(p.first_class) out.push("FC");
  return out.length?out:["SL"];
}

// Loads the full real dataset. Reports progress via onProgress(stage, pct?).
async function loadAllIndiaRailData(onProgress){
  onProgress?.("Downloading all Indian railway stations…");
  const sRes = await fetch(RAIL_STATIONS_URL);
  if(!sRes.ok) throw new Error("STATIONS_FETCH_FAILED_" + sRes.status);
  const sJson = await sRes.json();
  ALL_STATIONS = (sJson.features||[]).map(f=>({
    code: f.properties.code, name: f.properties.name, state: f.properties.state,
    zone: f.properties.zone, lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1]
  })).filter(s=>s.code && s.lat && s.lon);

  onProgress?.(`Downloading all ${13000}+ Indian trains (~14MB, one-time)…`);
  const tRes = await fetch(RAIL_TRAINS_URL);
  if(!tRes.ok) throw new Error("TRAINS_FETCH_FAILED_" + tRes.status);
  const tJson = await tRes.json();
  ALL_TRAINS_GEOJSON = tJson;

  onProgress?.("Indexing trains…");
  ALL_TRAINS_INDEX = (tJson.features||[]).map(f=>{
    const p = f.properties;
    return {
      number: p.number, name: p.name, from: p.from_station_code, from_name: p.from_station_name,
      to: p.to_station_code, to_name: p.to_station_name, zone: p.zone, distance: p.distance,
      duration_h: p.duration_h, duration_m: p.duration_m, departure: p.departure, arrival: p.arrival,
      classes: classListFromProps(p), type: p.type
    };
  }).filter(t=>t.number && t.name);

  try{
    localStorage.setItem(RAIL_CACHE_KEY, JSON.stringify({stations: ALL_STATIONS, trains: ALL_TRAINS_INDEX}));
  }catch(e){ /* quota exceeded — fine, stays in-memory for this session */ }

  onProgress?.("Done");
  return { stations: ALL_STATIONS.length, trains: ALL_TRAINS_INDEX.length };
}

function searchAllTrains(query, limit=25){
  if(!query) return [];
  const q = query.trim().toLowerCase();
  return ALL_TRAINS_INDEX.filter(t =>
    t.number.includes(q) || t.name.toLowerCase().includes(q) ||
    (t.from_name||"").toLowerCase().includes(q) || (t.to_name||"").toLowerCase().includes(q)
  ).slice(0, limit);
}

function findRealStation(codeOrName){
  if(!codeOrName) return null;
  const q = codeOrName.trim().toLowerCase();
  return ALL_STATIONS.find(s=>s.code.toLowerCase()===q) ||
         ALL_STATIONS.find(s=>s.name.toLowerCase()===q) ||
         ALL_STATIONS.find(s=>s.name.toLowerCase().includes(q)) || null;
}

// Returns the real route geometry (array of [lon,lat]) for a train number, if loaded.
function getTrainRoute(trainNumber){
  if(!ALL_TRAINS_GEOJSON) return null;
  const feat = ALL_TRAINS_GEOJSON.features.find(f=>f.properties.number===trainNumber);
  return feat ? feat.geometry.coordinates : null;
}

/* ---------- geometry helpers for "exact position" estimation ---------- */
function haversine(lat1,lon1,lat2,lon2){
  const R=6371, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
// Given a route [[lon,lat],...] and fraction 0..1 of the journey completed,
// returns the interpolated {lat,lon} — this is the real route path, walked
// proportionally by real distance (not just by point index).
function pointAtFraction(route, frac){
  if(!route || route.length<2) return null;
  frac = Math.max(0, Math.min(1, frac));
  const segLens = [];
  let total = 0;
  for(let i=0;i<route.length-1;i++){
    const d = haversine(route[i][1],route[i][0],route[i+1][1],route[i+1][0]);
    segLens.push(d); total += d;
  }
  let target = total * frac, acc = 0;
  for(let i=0;i<segLens.length;i++){
    if(acc + segLens[i] >= target || i===segLens.length-1){
      const segFrac = segLens[i] ? (target-acc)/segLens[i] : 0;
      const [lon1,lat1] = route[i], [lon2,lat2] = route[i+1];
      return { lat: lat1 + (lat2-lat1)*segFrac, lon: lon1 + (lon2-lon1)*segFrac };
    }
    acc += segLens[i];
  }
  const last = route[route.length-1];
  return { lat: last[1], lon: last[0] };
}
// Estimate journey completion fraction from a scheduled departure (today or
// given date) and total duration — used when no live-API position is available.
function scheduleFraction(departureHHMM, durationH, durationM, dateStr){
  try{
    const [dh,dm] = (departureHHMM||"00:00").split(":").map(Number);
    const dep = dateStr ? new Date(dateStr+"T00:00:00") : new Date();
    dep.setHours(dh||0, dm||0, 0, 0);
    const totalMs = ((+durationH||0)*60 + (+durationM||0)) * 60000;
    if(totalMs<=0) return 0;
    const now = new Date();
    let elapsed = now - dep;
    if(elapsed < 0) elapsed = 0; // hasn't departed yet on chosen date
    return Math.max(0, Math.min(1, elapsed/totalMs));
  }catch(e){ return 0; }
}
