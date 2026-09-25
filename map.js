/* ============================================================
   GoRail — map layer
   Google Maps is used when the user supplies a Google Maps
   JavaScript API key (Settings). Without one, GoRail falls back
   automatically to Leaflet + OpenStreetMap tiles, which need no
   key at all, so "exact location on a map" always works.
   ============================================================ */
const GMAPS_KEY_STORAGE = "gorail_gmaps_key";
function getGMapsKey(){ return (localStorage.getItem(GMAPS_KEY_STORAGE)||"").trim(); }
function setGMapsKey(k){ localStorage.setItem(GMAPS_KEY_STORAGE, (k||"").trim()); }
function hasGoogleMaps(){ return getGMapsKey().length>0; }

let _gmapsLoading=null;
function loadGoogleMapsScript(){
  if(window.google?.maps) return Promise.resolve();
  if(_gmapsLoading) return _gmapsLoading;
  _gmapsLoading = new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(getGMapsKey())}`;
    s.onload=()=>resolve(); s.onerror=()=>reject(new Error("GMAPS_LOAD_FAILED"));
    document.head.appendChild(s);
  });
  return _gmapsLoading;
}

let _leafletLoading=null;
function loadLeaflet(){
  if(window.L) return Promise.resolve();
  if(_leafletLoading) return _leafletLoading;
  _leafletLoading = new Promise((resolve,reject)=>{
    const css=document.createElement("link");
    css.rel="stylesheet"; css.href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js";
    s.onload=()=>resolve(); s.onerror=()=>reject(new Error("LEAFLET_LOAD_FAILED"));
    document.head.appendChild(s);
  });
  return _leafletLoading;
}

/**
 * Renders a train-tracking map into the DOM element with id `elId`.
 * routeCoords: [[lon,lat], ...] real route path.
 * trainPoint: {lat,lon} current (estimated or live) position.
 * stationStops: [{lat,lon,name}] a few stops to mark along the route.
 */
async function renderTrainMap(elId, { routeCoords, trainPoint, stationStops = [], trainLabel = "Train" }) {
  const useGoogle = hasGoogleMaps();
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `<div class="empty">Loading map…</div>`;

  if (useGoogle) {
    try {
      await loadGoogleMapsScript();
      el.innerHTML = "";
      const center = trainPoint || (routeCoords && { lat: routeCoords[0][1], lon: routeCoords[0][0] }) || { lat: 22.9, lon: 79 };
      const map = new google.maps.Map(el, { center: { lat: center.lat, lng: center.lon }, zoom: 6 });
      if (routeCoords?.length) {
        new google.maps.Polyline({
          path: routeCoords.map(c => ({ lat: c[1], lng: c[0] })),
          geodesic: true, strokeColor: "#b71c1c", strokeOpacity: 0.9, strokeWeight: 3, map
        });
      }
      stationStops.forEach(s => new google.maps.Marker({ position: { lat: s.lat, lng: s.lon }, map, title: s.name, opacity: 0.7 }));
      if (trainPoint) {
        new google.maps.Marker({
          position: { lat: trainPoint.lat, lng: trainPoint.lon }, map, title: trainLabel,
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#e53935", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }
        });
      }
      return;
    } catch (e) {
      // fall through to Leaflet if Google Maps fails to load (bad key, network, etc.)
    }
  }

  await loadLeaflet();
  el.innerHTML = "";
  const center = trainPoint || (routeCoords && { lat: routeCoords[0][1], lon: routeCoords[0][0] }) || { lat: 22.9, lon: 79 };
  const map = L.map(el).setView([center.lat, center.lon], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors", maxZoom: 18
  }).addTo(map);
  if (routeCoords?.length) {
    L.polyline(routeCoords.map(c => [c[1], c[0]]), { color: "#b71c1c", weight: 3 }).addTo(map);
  }
  stationStops.forEach(s => L.circleMarker([s.lat, s.lon], { radius: 4, color: "#687585" }).addTo(map).bindTooltip(s.name));
  if (trainPoint) {
    L.circleMarker([trainPoint.lat, trainPoint.lon], {
      radius: 9, color: "#fff", weight: 2, fillColor: "#e53935", fillOpacity: 1
    }).addTo(map).bindPopup(trainLabel).openPopup();
  }
}
