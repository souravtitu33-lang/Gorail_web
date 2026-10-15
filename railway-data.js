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
  "https://raw.githubusercontent.com/datameet/railways/master/stations.json",
  "https://raw.githubusercontent.com/vstflugel/indian-railway-dataset/main/list_of_stations.json"
];
const RAIL_TRAINS_URLS = [
  "https://raw.githubusercontent.com/prasenjit-27/Indian-Railway-Data/main/trains.json",
  "https://raw.githubusercontent.com/datameet/railways/master/trains.json"
];
const RAIL_SCHEDULES_URL = "https://raw.githubusercontent.com/datameet/railways/master/schedules.json";
const RAIL_CACHE_KEY = "gorail_all_india_index_v7";
const RAIL_IDB_NAME = "gorail_railway_data";
const RAIL_IDB_STORE = "datasets";
let railLoadPromise = null;

function openRailDB(){
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)) return resolve(null);
    const request=indexedDB.open(RAIL_IDB_NAME,1);
    request.onupgradeneeded=()=>{ if(!request.result.objectStoreNames.contains(RAIL_IDB_STORE)) request.result.createObjectStore(RAIL_IDB_STORE); };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function readRailDB(){
  const db=await openRailDB(); if(!db) return null;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(RAIL_IDB_STORE,"readonly");
    const req=tx.objectStore(RAIL_IDB_STORE).get("all-india-v4");
    req.onsuccess=()=>{db.close();resolve(req.result||null)};
    req.onerror=()=>{db.close();reject(req.error)};
  });
}
async function writeRailDB(value){
  const db=await openRailDB(); if(!db) return false;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(RAIL_IDB_STORE,"readwrite");
    tx.objectStore(RAIL_IDB_STORE).put(value,"all-india-v4");
    tx.oncomplete=()=>{db.close();resolve(true)};
    tx.onerror=()=>{db.close();reject(tx.error)};
    tx.onabort=()=>{db.close();reject(tx.error||new Error("IndexedDB write aborted"))};
  });
}

let ALL_STATIONS = [];      // [{code,name,state,zone,lat,lon}]
let ALL_TRAINS_INDEX = [];  // [{number,name,from,from_name,to,to_name,zone,distance,duration_h,duration_m,classes:[..]}]
let ALL_TRAINS_GEOJSON = null; // full FeatureCollection kept in-memory only (for route polylines)
let ALL_TRAIN_SCHEDULES = new Map(); // train number -> ordered station stops

function railDatasetLoaded(){ return ALL_TRAINS_INDEX.length > 0 && ALL_TRAIN_SCHEDULES.size > 0; }
function railStationsLoaded(){ return ALL_STATIONS.length > 0; }

const GORAIL_BHUBANESWAR_STATION={
  code:"BBS",name:"Bhubaneswar",state:"Odisha",
  zone:"East Coast Railway (ECoR)",address:"Bhubaneswar Railway Station, Bhubaneswar, Odisha, India",
  lat:20.2674,lon:85.8430,aliases:["BHUBANESWAR","BHUBANESWAR JUNCTION","BBS"]
};
function ensureBhubaneswarStation(){
  if(!Array.isArray(ALL_STATIONS)) ALL_STATIONS=[];
  const idx=ALL_STATIONS.findIndex(s=>String(s.code||"").toUpperCase()==="BBS"||/\\bbhubaneswar\\b/i.test(String(s.name||"")));
  if(idx>=0){
    const old=ALL_STATIONS[idx];
    ALL_STATIONS[idx]={...GORAIL_BHUBANESWAR_STATION,...old,
      code:old.code||"BBS",name:old.name||"Bhubaneswar",
      state:old.state||"Odisha",zone:old.zone||GORAIL_BHUBANESWAR_STATION.zone,
      lat:old.lat??GORAIL_BHUBANESWAR_STATION.lat,lon:old.lon??GORAIL_BHUBANESWAR_STATION.lon,
      aliases:[...new Set([...(old.aliases||[]),...GORAIL_BHUBANESWAR_STATION.aliases])]};
  }else ALL_STATIONS.push({...GORAIL_BHUBANESWAR_STATION});
  return ALL_STATIONS.find(s=>String(s.code||"").toUpperCase()==="BBS")||GORAIL_BHUBANESWAR_STATION;
}


let bundledRouteDataPromise=null;
async function loadBundledTrainRouteData(){
  if(bundledRouteDataPromise) return bundledRouteDataPromise;
  bundledRouteDataPromise=(async()=>{
    try{
      const response=await fetch("./train-data.json.gz",{cache:"force-cache"});
      if(!response.ok) return 0;
      if(typeof DecompressionStream==="undefined") throw new Error("This browser cannot decompress the bundled timetable");
      const stream=response.body.pipeThrough(new DecompressionStream("gzip"));
      const rows=JSON.parse(await new Response(stream).text());
      if(!Array.isArray(rows)) return 0;
      const trains=new Map(ALL_TRAINS_INDEX.map(t=>[String(t.number),t]));
      let added=0;
      for(const row of rows){
        const number=String(row.number||"").trim();
        if(!number||!Array.isArray(row.stops)||!row.stops.length) continue;
        const stops=row.stops.map(s=>({
          station_name:String(s.station_name||"").trim(),
          station_code:String(s.station_code||"").trim(),
          stationName:String(s.station_name||"").trim(),
          stationCode:String(s.station_code||"").trim(),
          arrival:s.arrival||"",
          departure:s.departure||"",
          arrives:s.arrival||"",
          departs:s.departure||"",
          day:s.day||"",
          distance:s.distance||""
        }));
        const old=trains.get(number);
        if(!old){
          trains.set(number,{number,name:String(row.name||"Train "+number),from:row.from||"",from_name:stops[0]?.station_name||row.from||"",to:row.to||"",to_name:stops[stops.length-1]?.station_name||row.to||"",type:"",classes:[],runningDays:row.runningDays||{},__route:[]});
          added++;
        }else{
          if(!old.name) old.name=String(row.name||"");
          if(!old.from) old.from=row.from||"";
          if(!old.to) old.to=row.to||"";
        }
        const existing=ALL_TRAIN_SCHEDULES.get(number);
        if(!existing||existing.length<stops.length) ALL_TRAIN_SCHEDULES.set(number,stops);
      }
      ALL_TRAINS_INDEX=[...trains.values()];
      return added;
    }catch(error){
      console.warn("Bundled train route dataset not loaded; using online sources.",error);
      return 0;
    }
  })();
  return bundledRouteDataPromise;
}

async function mergeRailRadarTrainDirectory(){
  let rows=[];
  try{
    const cacheKey="gorail_railradar_train_directory_v1";
    let cached=null;
    try{cached=JSON.parse(localStorage.getItem(cacheKey)||"null")}catch(e){}
    if(cached?.savedAt&&Date.now()-cached.savedAt<24*60*60*1000&&Array.isArray(cached.rows)) rows=cached.rows;
    else if(typeof GoRailAPI!=="undefined"&&typeof GoRailAPI.allTrains==="function"){
      const response=await GoRailAPI.allTrains();
      rows=parseRailRadarTrainDirectory(response);
      if(rows.length) try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),rows}))}catch(e){}
    }
  }catch(e){console.warn("RailRadar train directory unavailable; using static datasets.",e)}
  if(!rows.length) return 0;
  const byNumber=new Map(ALL_TRAINS_INDEX.map(t=>[String(t.number),t]));
  let added=0;
  for(const row of rows){
    const old=byNumber.get(row.number);
    if(old){
      if(!old.from&&row.from) old.from=row.from;
      if(!old.to&&row.to) old.to=row.to;
      if(!old.name&&row.name) old.name=row.name;
      continue;
    }
    byNumber.set(row.number,{number:row.number,name:row.name,type:"",from:row.from,from_name:row.from,to:row.to,to_name:row.to,zone:"",distance:0,duration_h:0,duration_m:0,departure:"",arrival:"",classes:[],runningDays:{},__route:[],__directoryOnly:true});
    added++;
  }
  ALL_TRAINS_INDEX=[...byNumber.values()];
  return added;
}

function classListFromProps(p){
  const out=[];
  if(p.first_ac) out.push("1A"); if(p.second_ac) out.push("2A"); if(p.third_ac) out.push("3A");
  if(p.sleeper) out.push("SL"); if(p.chair_car) out.push("CC"); if(p.first_class) out.push("FC");
  return out.length?out:["SL"];
}

// Loads and merges public Indian railway datasets. Reports progress via onProgress(stage, pct?).
async function loadAllIndiaRailData(onProgress){
  if(railLoadPromise) return railLoadPromise;
  railLoadPromise=(async()=>{
  try{
    const cached=await readRailDB().catch(()=>null);
    if(cached?.stations?.length && cached?.trains?.length && Array.isArray(cached?.schedules)){
      ALL_STATIONS=cached.stations; ensureBhubaneswarStation(); ALL_TRAINS_INDEX=cached.trains; ALL_TRAINS_GEOJSON=null;
      ALL_TRAIN_SCHEDULES=new Map(cached.schedules);
      const bundledAdded=await loadBundledTrainRouteData();
      const directoryAdded=await mergeRailRadarTrainDirectory();
      if(directoryAdded){
        try{await writeRailDB({stations:ALL_STATIONS,trains:ALL_TRAINS_INDEX,schedules:[...ALL_TRAIN_SCHEDULES.entries()],savedAt:Date.now()})}catch(e){}
        try{localStorage.setItem(RAIL_CACHE_KEY,JSON.stringify({stations:ALL_STATIONS,trains:ALL_TRAINS_INDEX}))}catch(e){}
      }
      onProgress?.(directoryAdded?("Loaded saved timetable plus "+directoryAdded+" extra RailRadar train records."):"Loaded the saved all-India timetable.");
      return {stations:ALL_STATIONS.length,trains:ALL_TRAINS_INDEX.length,scheduleStops:[...ALL_TRAIN_SCHEDULES.values()].reduce((n,a)=>n+a.length,0),cached:true,extraDirectoryTrains:directoryAdded,bundledRouteTrains:bundledAdded};
    }
  }catch(e){}
  onProgress?.("Downloading station directories from multiple sources…");
  const stationPayloads=[];
  for(const url of RAIL_STATIONS_URLS){
    try{
      const r=await fetch(url);
      if(r.ok){const payload=await r.json();if(payload)stationPayloads.push(payload);}
    }catch(e){console.warn("Station dataset source unavailable:",url,e);}
  }
  if(!stationPayloads.length) throw new Error("STATIONS_FETCH_FAILED");
  const stationByCode=new Map();
  for(const sJson of stationPayloads){
    const stationRows=Array.isArray(sJson)?sJson:(sJson.features||[]);
    for(const f of stationRows){
      const p=f.properties||f,c=f.geometry?.coordinates||p.coordinates||[];
      const station={
        code:p.code||p.station_code||p.stationCode,
        name:p.name||p.station_name||p.stationName,
        state:p.state,zone:p.zone||p.region_code||p.regionCode,address:p.address,
        lon:c[0]??p.longitude??p.lon??p.coordinates?.longitude,lat:c[1]??p.latitude??p.lat??p.coordinates?.latitude
      };
      if(!station.code||!station.name)continue;
      const key=String(station.code).trim().toUpperCase();
      const previous=stationByCode.get(key);
      if(!previous||(previous.lat==null&&station.lat!=null))stationByCode.set(key,station);
    }
  }
  ALL_STATIONS=[...stationByCode.values()];
  ensureBhubaneswarStation();
  onProgress?.("Downloading train master datasets from multiple sources…");
  const trainPayloads=[];
  for(const url of RAIL_TRAINS_URLS){
    try{
      const r=await fetch(url);
      if(r.ok){
        const payload=await r.json();
        if(payload) trainPayloads.push({url,payload});
      }
    }catch(e){ console.warn("Rail dataset source unavailable:",url,e); }
  }
  if(!trainPayloads.length) throw new Error("TRAINS_FETCH_FAILED");

  onProgress?.("Combining train records across datasets…");
  const trainByNumber=new Map();
  const embeddedSchedules=[];
  let geoFallback=null;
  for(const {payload} of trainPayloads){
    if(Array.isArray(payload)){
      for(const t of payload){
        const number=String(t.trainNumber||t.train_number||t.number||"").trim();
        const name=t.trainName||t.train_name||t.name||"";
        if(!number||!name) continue;
        const route=t.completeOrderedRoute||t.trainRoute||[];
        const item={
          number,name,type:t.type||"",
          from:t.source?.code||t.from_station_code||t.source_code||"",
          from_name:t.source?.name||t.from_station_name||t.source||"",
          to:t.destination?.code||t.to_station_code||t.destination_code||"",
          to_name:t.destination?.name||t.to_station_name||t.destination||"",
          zone:t.zone||"",distance:t.overallDistanceKm||t.distance||0,
          duration_h:t.duration?.hours??t.duration_h??0,
          duration_m:t.duration?.minutes??t.duration_m??0,
          departure:t.departure||t.source?.departureTime||"",
          arrival:t.arrival||t.destination?.arrivalTime||"",
          runningDays:t.runningDays||t.running_days||{},classes:t.classes||[],__route:route
        };
        if(!trainByNumber.has(number)||route.length>(trainByNumber.get(number).__route||[]).length) trainByNumber.set(number,item);
        for(const st of route){
          const rawName=String(st.stationName||st.station_name||st.name||"");
          const code=String(st.stationCode||st.station_code||st.code||((rawName.match(/\s-\s([A-Z0-9]{2,8})$/)||[])[1]||""));
          embeddedSchedules.push({
            train_number:number,day:st.journeyDay||st.day,station_code:code,
            station_name:rawName.replace(/\s-\s[A-Z0-9]{2,8}$/,"")||code,
            arrival:st.arrivalTime||st.arrives||st.arrival||"",
            departure:st.departureTime||st.departs||st.departure||"",
            id:st.sequence||st.sno||st.id,distance:st.distance
          });
        }
      }
    }else{
      if(!geoFallback) geoFallback=payload;
      for(const feature of (payload.features||[])){
        const p=feature.properties||{};
        const number=String(p.number||p.train_number||"").trim(),name=p.name||p.train_name||"";
        if(!number||!name) continue;
        const existing=trainByNumber.get(number);
        const item={
          number,name,type:p.type||"",from:p.from_station_code||p.from||"",
          from_name:p.from_station_name||p.source||"",to:p.to_station_code||p.to||"",
          to_name:p.to_station_name||p.destination||"",zone:p.zone||"",distance:p.distance||0,
          duration_h:p.duration_h||0,duration_m:p.duration_m||0,departure:p.departure||"",
          arrival:p.arrival||"",classes:classListFromProps(p),runningDays:p.runningDays||{},
          __route:existing?.__route||[],__geoRoute:feature.geometry?.coordinates||[]
        };
        if(!existing) trainByNumber.set(number,item);
        else if(!existing.__geoRoute?.length) existing.__geoRoute=feature.geometry?.coordinates||[];
      }
    }
  }
  ALL_TRAINS_INDEX=[...trainByNumber.values()];
  ALL_TRAINS_GEOJSON=geoFallback;
  onProgress?.("Adding the current RailRadar train directory…");
  const directoryAdded=await mergeRailRadarTrainDirectory();

  onProgress?.("Loading station-by-station timetables…");
  let schedules=embeddedSchedules;
  try{
    const schRes=await fetch(RAIL_SCHEDULES_URL);
    if(schRes.ok){
      const extra=await schRes.json();
      if(Array.isArray(extra)) schedules=schedules.concat(extra);
    }
  }catch(e){ console.warn("Supplementary station schedules unavailable:",e); }
  ALL_TRAIN_SCHEDULES=new Map();
  const embeddedTrainNumbers=new Set(embeddedSchedules.map(st=>String(st.train_number)));
  const scheduleSeen=new Set();
  for(const stop of (Array.isArray(schedules)?schedules:[])){
    const n=String(stop.train_number||stop.trainNumber||"").trim();
    if(!n||embeddedTrainNumbers.has(n)) continue;
    const normalized={
      day:stop.day||stop.journeyDay,
      station_code:stop.station_code||stop.stationCode||stop.code||"",
      station_name:stop.station_name||stop.stationName||stop.name||"",
      arrival:stop.arrival||stop.arrivalTime||stop.arrives||"",
      departure:stop.departure||stop.departureTime||stop.departs||"",
      id:stop.id||stop.sequence||stop.sno,
      distance:stop.distance
    };
    const dedupeKey=[n,normalized.station_code,normalized.station_name,normalized.day,normalized.arrival,normalized.departure].join("|");
    if(scheduleSeen.has(dedupeKey)) continue;
    scheduleSeen.add(dedupeKey);
    if(!ALL_TRAIN_SCHEDULES.has(n)) ALL_TRAIN_SCHEDULES.set(n,[]);
    ALL_TRAIN_SCHEDULES.get(n).push(normalized);
  }
  for(const stops of ALL_TRAIN_SCHEDULES.values()) stops.sort((a,b)=>(Number(a.day)||0)-(Number(b.day)||0)||(Number(a.id)||0)-(Number(b.id)||0));
  const result={stations:ALL_STATIONS.length,trains:ALL_TRAINS_INDEX.length,scheduleStops:[...ALL_TRAIN_SCHEDULES.values()].reduce((n,a)=>n+a.length,0),cached:false,extraDirectoryTrains:directoryAdded,bundledRouteTrains:bundledAdded};
  try{ await writeRailDB({stations:ALL_STATIONS,trains:ALL_TRAINS_INDEX,schedules:[...ALL_TRAIN_SCHEDULES.entries()],savedAt:Date.now()}); }
  catch(e){ console.warn("Could not cache railway dataset in IndexedDB:",e); }
  try{ localStorage.setItem(RAIL_CACHE_KEY, JSON.stringify({stations: ALL_STATIONS, trains: ALL_TRAINS_INDEX})); }catch(e){}
  onProgress?.("Done");
  return result;
  })();
  try{return await railLoadPromise;}finally{railLoadPromise=null;}
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
  ensureBhubaneswarStation();
  if(["bbs","bhubaneswar","bhubaneswar junction"].includes(q)) return ALL_STATIONS.find(s=>String(s.code).toUpperCase()==="BBS")||GORAIL_BHUBANESWAR_STATION;
  return ALL_STATIONS.find(s=>String(s.code||"").toLowerCase()===q) ||
         ALL_STATIONS.find(s=>String(s.name||"").toLowerCase()===q) ||
         ALL_STATIONS.find(s=>String(s.name||"").toLowerCase().includes(q)) || null;
}

// Returns the real route geometry (array of [lon,lat]) for a train number, if loaded.
function getTrainRoute(trainNumber){
  const t=ALL_TRAINS_INDEX.find(x=>String(x.number)===String(trainNumber));
  if(t?.__geoRoute?.length) return t.__geoRoute;
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
