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

// Primary source: prasenjit-27/Indian-Railway-Data (MIT) — 8,990+ stations, 5,208+ train records with ordered route schedules. This is an open-data snapshot, not a live official Indian Railways feed.
// Fallback: DataMeet railways dataset (CC0) for resilience.
const RAIL_STATIONS_URLS = [
  "https://raw.githubusercontent.com/prasenjit-27/Indian-Railway-Data/main/stations.json",
  "https://github.com/datameet/railways/raw/refs/heads/master/stations.json"
];
const RAIL_TRAINS_URLS = [
  "https://raw.githubusercontent.com/prasenjit-27/Indian-Railway-Data/main/trains.json",
  "https://github.com/datameet/railways/raw/refs/heads/master/trains.json"
];
const RAIL_SCHEDULES_URL = "https://github.com/datameet/railways/raw/refs/heads/master/schedules.json";
const RAIL_CACHE_KEY = "gorail_all_india_index_v3";

let ALL_STATIONS = [];      // [{code,name,state,zone,lat,lon}]
let ALL_TRAINS_INDEX = [];  // [{number,name,from,from_name,to,to_name,zone,distance,duration_h,duration_m,classes:[..]}]
let ALL_TRAINS_GEOJSON = null; // full FeatureCollection kept in-memory only (for route polylines)
let ALL_TRAIN_SCHEDULES = new Map(); // train number -> ordered station stops

function railDatasetLoaded(){ return ALL_TRAINS_INDEX.length > 0 && ALL_TRAIN_SCHEDULES.size > 0; }
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
  let sJson=null, sRes=null, stationSource=0;
  for(const url of RAIL_STATIONS_URLS){
    try{ const r=await fetch(url); if(r.ok){ sJson=await r.json(); sRes=r; break; } }catch(e){}
    stationSource++;
  }
  if(!sJson) throw new Error("STATIONS_FETCH_FAILED");
  const stationRows = Array.isArray(sJson) ? sJson : (sJson.features||[]);
  ALL_STATIONS = stationRows.map(f=>{
    const p=f.properties||f;
    const c=f.geometry?.coordinates||p.coordinates||[];
    return { code:p.code, name:p.name, state:p.state, zone:p.zone, address:p.address,
      lon:c[0] ?? p.longitude, lat:c[1] ?? p.latitude };
  }).filter(s=>s.code && s.lat!=null && s.lon!=null);

  onProgress?.("Downloading the Indian Railways train master & route schedules…");
  let tJson=null, trainSource=0;
  for(const url of RAIL_TRAINS_URLS){
    try{ const r=await fetch(url); if(r.ok){ tJson=await r.json(); break; } }catch(e){}
    trainSource++;
  }
  if(!tJson) throw new Error("TRAINS_FETCH_FAILED");

  onProgress?.("Indexing trains…");
  // New dataset: array of rich train objects with completeOrderedRoute.
  if(Array.isArray(tJson)){
    ALL_TRAINS_INDEX = tJson.map(t=>({
      number:String(t.trainNumber||t.number||""), name:t.trainName||t.name||"", type:t.type||"",
      from:t.source?.code||t.from_station_code||"", from_name:t.source?.name||t.from_station_name||"",
      to:t.destination?.code||t.to_station_code||"", to_name:t.destination?.name||t.to_station_name||"",
      zone:t.zone||"", distance:t.overallDistanceKm||t.distance||0,
      duration_h:t.duration?.hours ?? t.duration_h ?? 0, duration_m:t.duration?.minutes ?? t.duration_m ?? 0,
      departure:t.departure||t.source?.departureTime||"", arrival:t.arrival||t.destination?.arrivalTime||"",
      runningDays:t.runningDays||{}, classes:t.classes||[], __route:t.completeOrderedRoute||[]
    })).filter(t=>t.number&&t.name);
    ALL_TRAINS_GEOJSON = null;
  } else {
    ALL_TRAINS_GEOJSON=tJson;
    ALL_TRAINS_INDEX=(tJson.features||[]).map(f=>{const p=f.properties;return {number:p.number,name:p.name,from:p.from_station_code,from_name:p.from_station_name,to:p.to_station_code,to_name:p.to_station_name,zone:p.zone,distance:p.distance,duration_h:p.duration_h,duration_m:p.duration_m,departure:p.departure,arrival:p.arrival,classes:classListFromProps(p),type:p.type,__route:[]};}).filter(t=>t.number&&t.name);
  }

  onProgress?.("Indexing complete train-stop schedules…");
  let schedules=[];
  // The primary dataset embeds the complete ordered route inside every train.
  // This gives GoRail route details without another 96MB download.
  if(trainSource===0 && Array.isArray(tJson)){
    for(const t of tJson){
      const n=String(t.trainNumber||t.number||"").trim();
      if(!n) continue;
      const stops=(t.completeOrderedRoute||[]).map(s=>({
        day:s.journeyDay,
        station_code:s.stationCode,
        station_name:s.stationName,
        arrival:s.arrivalTime,
        departure:s.departureTime,
        id:s.sequence,
        distance:s.distance
      }));
      if(stops.length) schedules.push(...stops.map(s=>({...s,train_number:n})));
    }
  } else {
    // DataMeet fallback stores schedules separately.
    try{
      const schRes = await fetch(RAIL_SCHEDULES_URL);
      if(schRes.ok) schedules = await schRes.json();
    }catch(e){}
  }
  ALL_TRAIN_SCHEDULES = new Map();
  for(const stop of (Array.isArray(schedules) ? schedules : [])){
    const n = String(stop.train_number || "").trim();
    if(!n) continue;
    if(!ALL_TRAIN_SCHEDULES.has(n)) ALL_TRAIN_SCHEDULES.set(n, []);
    ALL_TRAIN_SCHEDULES.get(n).push({day:stop.day, station_code:stop.station_code, station_name:stop.station_name, arrival:stop.arrival, departure:stop.departure, id:stop.id});
  }
  for(const stops of ALL_TRAIN_SCHEDULES.values()) stops.sort((a,b)=>(Number(a.day)||0)-(Number(b.day)||0) || (Number(a.id)||0)-(Number(b.id)||0));
  try{
    localStorage.setItem(RAIL_CACHE_KEY, JSON.stringify({stations: ALL_STATIONS, trains: ALL_TRAINS_INDEX}));
  }catch(e){ /* quota exceeded — fine, stays in-memory for this session */ }

  onProgress?.("Done");
  return { stations: ALL_STATIONS.length, trains: ALL_TRAINS_INDEX.length, scheduleStops: [...ALL_TRAIN_SCHEDULES.values()].reduce((n,a)=>n+a.length,0) };
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
  const t=ALL_TRAINS_INDEX.find(x=>String(x.number)===String(trainNumber));
  if(t?.__route?.length){
    const byCode=new Map(ALL_STATIONS.map(s=>[String(s.code).toUpperCase(),s]));
    return t.__route.map(s=>{
      const directLat=s.latitude ?? s.coordinates?.latitude ?? s.lat;
      const directLon=s.longitude ?? s.coordinates?.longitude ?? s.lon;
      if(directLat!=null && directLon!=null) return [directLon,directLat];
      const st=byCode.get(String(s.stationCode||s.code||"").toUpperCase());
      return st && st.lat!=null && st.lon!=null ? [Number(st.lon),Number(st.lat)] : null;
    }).filter(Boolean);
  }
  if(!ALL_TRAINS_GEOJSON) return null;
  const feat=ALL_TRAINS_GEOJSON.features.find(f=>String(f.properties.number)===String(trainNumber));
  return feat?.geometry?.coordinates||null;
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


// Actual timetable stops from the primary train records. Each train contains
// completeOrderedRoute, so route details do not depend on a separate schedule file.
function getTrainRouteStops(trainNumber){ return ALL_TRAIN_SCHEDULES.get(String(trainNumber)) || []; }

// Search the full train index using actual source/destination stops when schedules are loaded.
function searchRealTrains(fromQuery="", toQuery="", classQuery="", limit=50){
  const f=(fromQuery||"").trim().toLowerCase(), t=(toQuery||"").trim().toLowerCase(), cl=(classQuery||"").trim().toUpperCase();
  const out=[];
  for(const train of ALL_TRAINS_INDEX){
    if(cl && !(train.classes||[]).includes(cl)) continue;
    const stops=getTrainRouteStops(train.number);
    const fromEndpoint=((train.from_name||"")+" "+(train.from||"")).toLowerCase();
    const toEndpoint=((train.to_name||"")+" "+(train.to||"")).toLowerCase();
    let fi=f ? (fromEndpoint.includes(f)?0:-1) : 0;
    let ti=t ? (toEndpoint.includes(t)?Math.max(1,stops.length-1):-1) : Math.max(1,stops.length-1);
    if(stops.length){
      if(f) fi=stops.findIndex(s=>(s.station_name||"").toLowerCase().includes(f)||(s.station_code||"").toLowerCase()===f);
      if(t) ti=stops.findIndex(s=>(s.station_name||"").toLowerCase().includes(t)||(s.station_code||"").toLowerCase()===t);
      if(f && fi<0) continue; if(t && ti<0) continue; if(f && t && fi>=ti) continue;
    } else if((f && !fromEndpoint.includes(f)) || (t && !toEndpoint.includes(t))) continue;
    out.push(train); if(out.length>=limit) break;
  }
  return out;
}
