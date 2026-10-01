const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
// Full Indian Railways open timetable is loaded on demand by railway-data.js.
// This seed list is only used by the booking/admin demo flows until a real train is selected.
const KEY="gorail_web_state_v1";
const seed={
  users:[],
  trains:[
    {id:"12951",number:"12951",name:"Mumbai Rajdhani",from:"Mumbai Central",to:"New Delhi",dep:"17:00",arr:"08:35",duration:"15h 35m",fare:1850,classes:["1A","2A","3A"],seats:42,platform:"4",status:"On Time"},
    {id:"12864",number:"12864",name:"Bengaluru Express",from:"Bengaluru",to:"Howrah",dep:"10:30",arr:"13:10",duration:"26h 40m",fare:1250,classes:["2A","3A","SL"],seats:67,platform:"2",status:"On Time"},
    {id:"12246",number:"12246",name:"Duronto Express",from:"New Delhi",to:"Howrah",dep:"20:20",arr:"13:05",duration:"16h 45m",fare:1450,classes:["1A","2A","3A"],seats:19,platform:"7",status:"Delayed 15m"},
    {id:"18046",number:"18046",name:"East Coast Express",from:"Hyderabad",to:"Howrah",dep:"08:10",arr:"06:00",duration:"21h 50m",fare:980,classes:["2A","3A","SL"],seats:84,platform:"1",status:"On Time"}
  ],
  bookings:[],
  complaints:[],
  food:[
    {id:"f1",name:"Veg Thali",price:120,cat:"Meal"},{id:"f2",name:"Paneer Roll",price:90,cat:"Snacks"},
    {id:"f3",name:"Masala Tea",price:25,cat:"Beverage"},{id:"f4",name:"Water Bottle",price:20,cat:"Beverage"}
  ]
};
let state=seed;
try{ const saved=localStorage.getItem(KEY); if(saved) state=JSON.parse(saved)||seed; }catch(e){ state=seed; try{localStorage.removeItem(KEY)}catch(_e){} }
let session=null; // Firebase Auth is the source of truth; never restore a local-only login.
let page="dashboard", modal=null, searchResults=[];
let mapRefreshTimer=null;
loadCachedIndex();
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem("gorail_session",JSON.stringify(session));return true}catch(e){toast("Could not save locally. Browser storage may be full.","warn");return false}}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function icon(x){return `<span>${x}</span>`}
function toast(msg,type="info"){let r=$("#toastRoot");if(!r){r=document.createElement("div");r.id="toastRoot";r.className="toast-stack";document.body.appendChild(r)}
 let t=document.createElement("div");t.className="toast "+(type==="success"?"success":type==="warn"?"warn":"");t.textContent=msg;r.appendChild(t);setTimeout(()=>t.remove(),3800)}
function toggleTheme(){let cur=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",cur);localStorage.setItem("gorail_theme",cur);render()}
function liveBadge(){return `<span class="live-badge off" title="Live status is confirmed only after a successful API response"><span class="dot"></span>LIVE API</span>`}
function sourceBadge(kind){
 if(kind==="live") return `<span class="pill ok">LIVE</span>`;
 if(kind==="timetable") return `<span class="pill">TIMETABLE</span>`;
 return `<span class="pill warn">SAVED ON THIS DEVICE</span>`;
}
function requireAdmin(){ if(session?.role==="admin") return true; toast("Admin actions need an admin claim on the signed-in account.","warn"); return false; }
function settingsModal(){let gk=getGMapsKey();modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>⚙️ Live Data Settings</h2><button class="close" onclick="closeModal()">×</button></div>
 <p class="muted">GoRail uses RailRadar for live train status, PNR enquiry, and seat availability/vacancy through a secure server-side proxy. Add your API key as <b>RAILRADAR_API_KEY</b> in your Vercel project Environment Variables. Never place the key in this public repository or browser storage. Live features require an active RailRadar plan and API quota.</p>


 <div class="notice" style="margin-top:16px">Live train status, PNR, and seat vacancy require the server-side RailRadar key. Live station weather works with <b>no key</b> through the free Open-Meteo API.</div>
 <hr style="margin:20px 0;border:none;border-top:1px solid var(--line)">
 <h3>🗺️ Google Maps</h3>
 <p class="muted">Add a Google Maps JavaScript API key to use real Google Maps on the Live Map page. Without one, GoRail automatically uses free OpenStreetMap maps instead — the map always works either way.</p>
 <div class="field" style="margin-top:10px"><label>Google Maps API Key</label><input id="gmapsKeyInput" placeholder="paste your Google Maps API key" value="${esc(gk)}"></div>
 <div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveGMapsKey()">Save Key</button>${gk?`<button class="btn danger" onclick="clearGMapsKey()">Remove Key</button>`:""}</div>
 <hr style="margin:20px 0;border:none;border-top:1px solid var(--line)">
 <h3>🚆 All-India train &amp; station database</h3>
 <p class="muted">Loads the complete open Indian-Railway-Data timetable: 5,208+ trains and 8,990+ stations, with ordered route stops, halt times, journey days and running days. The train master is about 96.6 MB, so it is downloaded only when requested and then indexed/cached in this browser.</p>
 <div id="railDatasetStatus" class="notice" style="margin-top:10px">${railDatasetLoaded()?`✅ Loaded: ${ALL_TRAINS_INDEX.length.toLocaleString()} trains · ${ALL_STATIONS.length.toLocaleString()} stations`:"Not loaded yet."}</div>
 <button class="btn primary" style="margin-top:10px" onclick="loadFullDataset()">${railDatasetLoaded()?"Reload dataset":"Load all India trains & stations"}</button>
 </div></div>`;drawModal()}
function saveGMapsKey(){setGMapsKey($("#gmapsKeyInput").value);closeModal();toast(hasGoogleMaps()?"Google Maps connected.":"Key cleared — using OpenStreetMap.","success");render()}
function clearGMapsKey(){setGMapsKey("");closeModal();toast("Google Maps disconnected — using OpenStreetMap.");render()}
async function loadFullDataset(){
 let box=$("#railDatasetStatus");if(box)box.textContent="Starting…";
 try{
  const res=await loadAllIndiaRailData(msg=>{if(box)box.textContent=msg});
  if(box)box.innerHTML=`✅ Loaded: ${res.trains.toLocaleString()} trains · ${res.stations.toLocaleString()} stations · ${res.scheduleStops?.toLocaleString()||0} timetable stops`;
  toast("All-India railway dataset loaded.","success");
 }catch(e){
  if(box)box.innerHTML=`<span style="color:#a31616">Failed to load (${esc(e.message)}). Check your internet connection and try again.</span>`;
  toast("Dataset download failed — check your connection.","warn");
 }
}
function navItems(admin=false){
 return admin?[
  ["dashboard","📊","Dashboard"],["manage-trains","🚆","Manage Trains"],["complaints","🛠️","Complaints"]
 ]:[
  ["dashboard","🏠","Home"],["search","🔎","Train Enquiry"],["map","🗺️","Live Map"],["bookings","🎫","My Tickets"],["pnr","🔢","PNR Status"],
  ["live","📍","Live Status"],["stations","🚉","Station Info"],["food","🍱","Order Food"],["complaints","📝","Complaints"],
  ["profile","👤","Profile"]
 ]}
function shell(){
 const admin=session?.role==="admin";
 return `<header class="topbar"><div class="brand">${icon("🚆")} GoRail</div><div class="top-actions">
   ${liveBadge()}
   <button class="btn small theme-toggle" title="Toggle dark mode" onclick="toggleTheme()">${document.documentElement.getAttribute("data-theme")==="dark"?"☀️":"🌙"}</button>
   <button class="btn small gear" title="Live data settings" onclick="settingsModal()">⚙️</button>
   <div class="avatar">${esc((session?.name||"G").slice(0,1).toUpperCase())}</div>
   <button class="btn small" onclick="logout()">Logout</button></div></header>
 <div class="layout"><aside class="sidebar">
   <div class="nav-title">${admin?"Administration":"Passenger"}</div>
   ${navItems(admin).map(n=>`<button class="nav ${page===n[0]?"active":""}" onclick="goto('${n[0]}')">${n[1]} <span>${n[2]}</span></button>`).join("")}
   ${!admin?`<div class="nav-title">More</div>
   <button class="nav" onclick="goto('fare')">💰 <span>Fare Enquiry</span></button>
   <button class="nav" onclick="goto('seat')">💺 <span>Seat Availability</span></button>
   <button class="nav" onclick="goto('special')">⭐ <span>Special Trains</span></button>
   <button class="nav" onclick="goto('emergency')">🚨 <span>Emergency Help</span></button>`:""}
 </aside><main class="main">${renderPage()}</main></div>
 <div class="mobile-nav">${navItems(admin).slice(0,5).map(n=>`<button class="nav ${page===n[0]?"active":""}" onclick="goto('${n[0]}')">${n[1]}<span>${n[2]}</span></button>`).join("")}</div>`;
}
function render(){
 document.querySelector("#app").innerHTML=session?shell():loginView();
}
function loginView(){return `<div class="login-wrap"><div class="login">
 <div class="brand">🚆 GoRail</div><h1>Railway Operations & Management</h1><p class="muted">Passenger and railway management portal</p>
 <div class="form-grid" style="margin-top:22px"><div class="field" style="grid-column:1/-1"><label>Email</label><input id="lemail" type="email" placeholder="name@example.com" autocomplete="username"></div>
 <div class="field" style="grid-column:1/-1"><label>Password</label><input id="lpass" type="password" placeholder="Enter your password" autocomplete="current-password"></div></div>
 <button class="btn primary" style="width:100%;margin-top:16px" onclick="login()">Login</button>
 <button class="btn" style="width:100%;margin-top:10px" onclick="registerModal()">Create passenger account</button>
 <div class="notice" style="margin-top:16px">Use your registered email and password. New users must create an account with a password of at least 8 characters.</div>
 </div></div>`}
function pageTitle(title,sub,actions=""){return `<div class="page-title"><div><h1>${title}</h1><div class="muted">${sub||""}</div></div><div class="actions">${actions}</div></div>`}
function renderPage(){
 switch(page){
  case "dashboard": return dashboard();
  case "search": return searchPage();
  case "bookings": return bookingsPage();
  case "pnr": return pnrPage();
  case "live": return livePage();
  case "map": return mapPage();
  case "stations": return stationsPage();
  case "food": return foodPage();
  case "complaints": return complaintsPage();
  case "profile": return profilePage();
  case "fare": return farePage();
  case "seat": return seatPage();
  case "special": return specialPage();
  case "emergency": return emergencyPage();
  case "manage-trains": return manageTrainsPage();
  default:return dashboard();
 }}
function dashboard(){
 if(session.role==="admin") return adminDashboard();
 return `<div class="hero"><h1>Welcome back, ${esc(session.name||"Passenger")} 👋</h1><p>Plan your journey, check train availability, track trains and manage tickets.</p>
 <button class="btn" onclick="goto('search')">🔎 Search Trains</button></div>
 <div class="quick">${[
 ["🔎","Train Enquiry","search"],["🎫","My Tickets","bookings"],["🔢","PNR Status","pnr"],["📍","Live Status","live"],
 ["💺","Seat Availability","seat"],["🚉","Station Info","stations"],["🍱","Order Food","food"],["🚨","Emergency Help","emergency"]
 ].map(x=>`<div class="card" onclick="goto('${x[2]}')"><div class="icon">${x[0]}</div><b>${x[1]}</b></div>`).join("")}</div>
 <div class="card" style="margin-top:20px"><h3>⏱️ Tatkal booking opens in <span class="muted" style="font-weight:400">(live IST clock)</span></h3>
 <div class="tatkal-box"><div class="tatkal-item">AC classes (10:00 AM)<div class="t" id="tatkalAc">--:--:--</div></div><div class="tatkal-item">Non-AC classes (11:00 AM)<div class="t" id="tatkalNonAc">--:--:--</div></div></div></div>
 <div style="margin-top:20px" class="grid g3">
 <div class="card"><h3>Saved enquiry</h3><p class="muted">Quotes stored on this device. Not IRCTC tickets.</p>${state.bookings.filter(b=>b.userId===session.id&&b.status!=="Removed").slice(0,1).map(ticketMini).join("")||"<div class='empty'>No saved enquiries</div>"}</div>
 <div class="card"><h3>Smart travel tools</h3><p>Compare fares, check route stops, coach position and platform information.</p><div class="actions"><button class="btn small" onclick="goto('fare')">Fare</button><button class="btn small" onclick="goto('special')">Special trains</button></div></div>
</div>`;
}
function adminDashboard(){return pageTitle("Railway Operations & Management Dashboard","Quick Admin Operations")
 +`<div class="grid g4">${[
 ["🚆","Total Trains",state.trains.length],["🎫","Bookings",state.bookings.length],["📝","Complaints",state.complaints.length]
 ].map(x=>`<div class="card"><div style="font-size:26px">${x[0]}</div><div class="muted">${x[1]}</div><div class="stat">${x[2]}</div></div>`).join("")}</div>
 <div class="card" style="margin-top:18px"><h3>Quick Admin Operations</h3><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="goto('manage-trains')">Manage Trains</button><button class="btn" onclick="goto('complaints')">Complaints</button></div></div>`}
function searchPage(){
  const loaded = railDatasetLoaded();
  const stationOptions = (ALL_STATIONS.length ? ALL_STATIONS : STATIONS_DB).map(s => '<option value="' + esc(s.name) + '">' + esc(s.code || "") + '</option>').join("");
  const datasetText = loaded ? "Loaded " + ALL_TRAINS_INDEX.length.toLocaleString() + " trains and " + ALL_STATIONS.length.toLocaleString() + " stations. Route stops are read from the timetable schedules." : "The complete open timetable is loaded on demand.";
  const resultsHtml = searchResults.length ? searchResults.map(trainResult).join("") : '<div class="empty">Load the database, then enter stations to find trains.</div>';
  return pageTitle("Train Enquiry","Search the complete Indian train timetable by actual route stops", '<button class="btn" onclick="resetSearch()">Reset</button>') +
    '<div class="card"><datalist id="stationList">' + stationOptions + '</datalist>' +
    '<div class="form-grid"><div class="field"><label>From station / code</label><input id="sfrom" list="stationList" placeholder="e.g. NDLS or New Delhi"></div>' +
    '<div class="field"><label>To station / code</label><input id="sto" list="stationList" placeholder="e.g. HWH or Howrah"></div>' +
    '<div class="field"><label>Date</label><input id="sdate" type="date" value="' + new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10) + '"></div>' +
    '<div class="field"><label>Class</label><select id="sclass"><option value="">Any class</option><option>1A</option><option>2A</option><option>3A</option><option>SL</option><option>CC</option><option>2S</option></select></div></div>' +
    '<div class="actions" style="margin-top:15px"><button class="btn primary" onclick="searchTrains()">Search timetable</button><button class="btn" onclick="searchLiveBetween()">Live trains between</button><button class="btn" onclick="loadFullDataset()">Load / Refresh Indian Railways Data</button></div>' +
    '<p class="muted" style="margin-top:10px">' + esc(datasetText) + '</p></div>' +
    '<div id="results" style="margin-top:18px">' + resultsHtml + '</div>';
}
function showRealTrainRoute(number){
 const t=ALL_TRAINS_INDEX.find(x=>String(x.number)===String(number));
 if(!t) return toast("Train not found in the loaded dataset.","warn");
 const stops=getTrainRouteStops(number);
 const route=getTrainRoute(number);
 const stopRows=stops.length?stops.map((s,i)=>`<div style="display:grid;grid-template-columns:38px 1fr auto;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)"><b>${i+1}</b><div><b>${esc(s.station_name||s.station_code||"")}</b><div class="muted">${esc(s.station_code||"")}</div></div><div style="text-align:right"><div>${esc(s.arrival||"—")} → ${esc(s.departure||"—")}</div><div class="muted">Day ${esc(s.day||"—")}</div></div></div>`).join(""):`<div class="empty">No schedule-stop records are available for this train in the timetable dataset.</div>`;
 modal=`<div class="modal-backdrop"><div class="modal" style="max-width:900px"><div class="modal-head"><h2>🚆 ${esc(t.number)} · ${esc(t.name)}</h2><button class="close" onclick="closeModal()">×</button></div><div class="notice"><b>${esc(t.from_name)}</b> → <b>${esc(t.to_name)}</b> · ${t.distance||"—"} km · ${t.duration_h||0}h ${t.duration_m||0}m · ${stops.length} scheduled stops</div><div class="actions" style="margin:12px 0">${(t.classes||[]).map(x=>`<span class="pill">${esc(x)}</span>`).join("")}<span class="pill">${esc(t.zone||"")}</span><span class="pill">${esc(t.type||"")}</span></div><div class="notice" style="margin-bottom:12px"><b>Runs:</b> ${Object.entries(t.runningDays||{}).filter(([,v])=>v).map(([d])=>d).join(", ")||"Schedule days not available"} · <b>Total distance:</b> ${esc(t.distance||"—")} km</div><div style="max-height:55vh;overflow:auto">${stopRows}</div><p class="muted" style="margin-top:12px">The timetable stop list comes from the open Indian-Railway-Data timetable snapshot. The line geometry is used for map routing where available.${route?` Route geometry contains ${route.length} coordinate points.`:""}</p></div></div>`;
 drawModal();
}
async function showRealTrainLive(number){
  const host=document.getElementById("live-"+number);
  if(host) host.innerHTML="<span class=\"muted\">Fetching live running status…</span>";
  try{
    const j=await GoRailAPI.liveStatus(number,"1");
    const d=j?.data||j?.result||j;
    const pos=d?.currentLocation||d?.current_position||d?.currentPosition||{};
    const station=pos.stationName||pos.station_name||pos.station||pos.currentStationName||pos.stationCode||"Location unavailable";
    const delay=d?.delay||d?.delayInMinutes||d?.delayMinutes||pos.delay||0;
    const status=d?.status||d?.trainStatus||pos.status||"Running status available";
    const next=d?.nextStation||d?.nextHalt||d?.next_station||{};
    const nextName=next.name||next.stationName||next.station_name||next.stationCode||"";
    const lat=pos.latitude??pos.lat??d?.latitude??d?.lat;
    const lon=pos.longitude??pos.lng??pos.lon??d?.longitude??d?.lng;
    if(host) host.innerHTML="<span class=\"pill ok\">● LIVE</span> <b>"+esc(String(station))+"</b> · "+esc(String(status))+(delay? " · "+esc(String(delay))+" min delay":"")+(nextName?" · Next: "+esc(String(nextName)):"")+(lat!=null&&lon!=null?" · "+Number(lat).toFixed(4)+", "+Number(lon).toFixed(4):"");
  }catch(e){
    if(host) host.innerHTML="<span class=\"pill warn\">Live status unavailable</span> <span class=\"muted\">Check the RailRadar API key, quota, and train number.</span>";
  }
}
function trainResult(t){
 const real=!!t.__real;
 if(real){
  const stops=getTrainRouteStops(t.number);
  return `<div class="card train-card" style="margin-bottom:14px">
   <div><div class="station-time">${esc(t.departure||"—")}</div><div class="station-name">${esc(t.from_name||t.from||"")}</div></div>
   <div><div class="route-line">● ───── 🚆 ───── ●</div><div style="text-align:center;margin-top:8px"><span class="pill">${t.duration_h||0}h ${t.duration_m||0}m</span> <span class="pill ok">TIMETABLE</span></div></div>
   <div style="text-align:right"><div class="station-time">${esc(t.arrival||"—")}</div><div class="station-name">${esc(t.to_name||t.to||"")}</div></div>
   <div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:13px">
    <div><b>${esc(t.number)}</b> · ${esc(t.name)} · ${t.distance?esc(t.distance)+" km":""} · ${stops.length.toLocaleString()} scheduled stops<div id="live-${esc(t.number)}" style="margin-top:7px"><span class="muted">Live location not loaded</span></div></div>
    <div class="actions"><button class="btn small" onclick="showRealTrainLive('${esc(t.number)}')">📍 Live Location</button><button class="btn primary small" onclick="showRealTrainRoute('${esc(t.number)}')">View Full Route</button></div>
   </div></div>`;
 }
 return `<div class="card train-card" style="margin-bottom:14px"><div><div class="station-time">${t.dep}</div><div class="station-name">${esc(t.from)}</div></div><div><div class="route-line">● ───── 🚆 ───── ●</div><div style="text-align:center;margin-top:8px"><span class="pill">${t.duration}</span> <span class="pill ${t.status==="On Time"?"ok":"warn"}">${t.status}</span></div></div><div style="text-align:right"><div class="station-time">${t.arr}</div><div class="station-name">${esc(t.to)}</div></div><div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:13px"><div><b>${t.number}</b> · ${esc(t.name)} · From ₹${t.fare}</div><button class="btn primary small" onclick="bookTrain('${t.id}')">Select & Book</button></div></div>`;
}
function bookingsPage(){
 const bs=state.bookings.filter(b=>b.userId===session.id);
 return pageTitle("Saved enquiries","Quotes stored on this device. These are not Indian Railways tickets.",`<button class="btn primary" onclick="goto('search')">+ New enquiry</button>`)
 + (bs.length?bs.map(b=>bookingCard(b)).join(""):`<div class="card empty">No saved enquiries yet.</div>`);
}
function bookingCard(b){let t=state.trains.find(x=>x.id===b.trainId)||b.train||{};return `<div class="ticket" style="margin-bottom:15px"><div class="ticket-head"><div><b>${esc(t.number)} · ${esc(t.name)}</b><div class="muted">${esc(t.from)} → ${esc(t.to)}</div></div>${sourceBadge("device")}</div><div class="ticket-body"><div class="ticket-grid"><div><div class="label">Enquiry ref</div><div class="value">${esc(b.ref||b.pnr)}</div></div><div><div class="label">Passenger</div><div class="value">${esc(b.passenger.name)}</div></div><div><div class="label">Class</div><div class="value">${esc(b.className)}</div></div><div><div class="label">Quoted fare</div><div class="value">₹${esc(b.fare)}</div></div></div><p class="muted">Saved on this device. Not an IRCTC reservation and not a payable ticket.</p><div class="actions" style="margin-top:16px"><button class="btn small" onclick="ticketDetail('${b.id}')">View enquiry</button>${b.status!=="Removed"?`<button class="btn danger small" onclick="cancelBooking('${b.id}')">Remove</button>`:""}</div></div></div>`}
function pnrPage(){return pageTitle("PNR Status","Live Indian Railways PNR lookup",liveBadge())
 +`<div class="card"><div class="field"><label>PNR Number</label><input id="pnrInput" placeholder="Enter 10 digit PNR"></div><button class="btn primary" style="margin-top:12px" onclick="checkPnr()">Check PNR</button><div id="pnrOut" style="margin-top:18px"></div>
 <p class="muted" style="margin-top:10px">This page asks RailRadar for a real 10-digit PNR. GoRail enquiry references are not PNRs.</p></div>`}
function livePage(){return pageTitle("Live Status","Current operational status of your selected train",liveBadge())
 +`<div class="card"><div class="field"><label>Train</label><select id="liveTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div>
 ${hasLiveData()?`<div class="field" style="margin-top:12px"><label>Or enter any real train number</label><input id="liveTrainNo" placeholder="e.g. 12951"></div>`:""}
 <button class="btn primary" style="margin-top:12px" onclick="showLive()">Track Train</button><div id="liveOut" style="margin-top:18px"></div></div>`}
function stationsPage(){
 const stations=(ALL_STATIONS.length?ALL_STATIONS:STATIONS_DB).slice(0,24);
 return pageTitle("Station Info","Station directory and live weather. Platform and facility details are not provided unless verified.")+
 '<div class="card"><div class="field"><label>Find station</label><input id="stationFilter" placeholder="Station name or code" oninput="filterStationCards()"></div><p class="muted">Showing stations from the loaded railway dataset or built-in weather directory. Operational facilities are not inferred.</p></div>'+
 '<div id="stationCards" class="grid g3" style="margin-top:14px">'+stations.map((st,i)=>'<div class="card station-card" data-search="'+esc((st.name+" "+st.code).toLowerCase())+'"><h3>🚉 '+esc(st.name)+'</h3><p class="muted">Station code: '+esc(st.code||"—")+'</p><div id="wx-'+i+'" class="muted" style="margin:8px 0">Weather available when coordinates are known.</div><p class="muted">Platform and facility information: not verified in this app.</p></div>').join("")+'</div>';
}
function filterStationCards(){const q=($("#stationFilter")?.value||"").trim().toLowerCase();$$(".station-card").forEach(card=>card.hidden=!card.dataset.search.includes(q));}

function loadStationsWeather(){let ss=["Mumbai Central","New Delhi","Bengaluru","Howrah","Hyderabad","Bhubaneswar","Khurda Road","Cuttack"];
 ss.forEach(async(s,i)=>{const w=await stationWeather(s);const el=$("#wx-"+i);if(!el)return;el.innerHTML=w?`<span class="weather-chip">☁️ ${Math.round(w.temp)}°C · ${esc(w.desc)}</span>`:"Weather unavailable";});}
function foodPage(){
 let cart=[];try{cart=JSON.parse(localStorage.getItem("gorail_cart")||"[]")}catch(_e){}
 if(!Array.isArray(cart))cart=[];
 const menu=state.food||[],total=cart.reduce((sum,x)=>sum+(Number(x.price)||0),0);
 const orders=Array.isArray(state.foodOrders)?state.foodOrders.filter(o=>o.userId===session.id).slice().reverse():[];
 return pageTitle("Order Food","Order meals for your train journey",'<span class="pill success">IRCTC eCatering</span>')+
 '<div class="card" style="border:1px solid var(--primary);margin-bottom:16px"><div class="actions" style="align-items:center;gap:12px"><div style="font-size:34px">🚆</div><div style="flex:1"><h2 style="margin:0 0 4px">Food on Train</h2><div class="muted">Order from restaurants serving your train route through official IRCTC eCatering.</div></div></div><div class="notice" style="margin:12px 0">Enter your PNR on the official IRCTC page to see restaurants and menus available for your journey. Select a delivery station, place your order, and track it there.</div><button class="btn primary" style="width:100%" onclick="openIRCTCFood()">Find restaurants &amp; order on IRCTC eCatering ↗</button><div class="muted" style="font-size:12px;margin-top:8px">Opens the official IRCTC eCatering website in a new tab. GoRail does not receive your PNR or payment details.</div></div>'+
 '<div class="card" style="margin-bottom:16px"><h3>How to order</h3><ol><li>Open IRCTC eCatering using the button above.</li><li>Enter your PNR to load your journey.</li><li>Choose a station, restaurant, and food items.</li><li>Pay online or choose an available payment option.</li><li>Use the official page/app to view order updates.</li></ol></div>'+
 ''+
 '<style>.food-cart-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}.food-cart-row span{flex:1}.food-cart-row b{white-space:nowrap}</style>';
}
function openIRCTCFood(){
 const url="https://ecatering.irctc.co.in/";
 const opened=window.open(url,"_blank","noopener,noreferrer");
 if(!opened)toast("Pop-up blocked. Open https://ecatering.irctc.co.in/ in your browser.","warn");
}
function complaintsPage(){if(session.role==="admin")return adminComplaints();return pageTitle("Complaints & Support","Submit and track passenger complaints",`<button class="btn primary" onclick="complaintModal()">New Complaint</button>`)
 +`<div class="grid g2">${state.complaints.filter(c=>c.userId===session.id).map(c=>`<div class="card"><div class="actions" style="justify-content:space-between"><b>${esc(c.subject)}</b><span class="pill ${c.status==="Resolved"?"ok":"warn"}">${c.status}</span></div><p>${esc(c.message)}</p><small class="muted">${c.date}</small></div>`).join("")||`<div class="card empty">No complaints submitted.</div>`}</div>`}
function adminComplaints(){return pageTitle("Manage Complaints","Review and update passenger complaints")
 +`<div class="card"><table class="table"><thead><tr><th>Subject</th><th>Message</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.complaints.map(c=>`<tr><td>${esc(c.subject)}</td><td>${esc(c.message)}</td><td><span class="pill ${c.status==="Resolved"?"ok":"warn"}">${c.status}</span></td><td><button class="btn small success" onclick="resolveComplaint('${c.id}')">Resolve</button></td></tr>`).join("")||`<tr><td colspan="4" class="empty">No complaints.</td></tr>`}</tbody></table></div>`}
function profilePage(){return pageTitle("Profile","Manage your passenger account")
 +`<div class="card"><div class="form-grid"><div class="field"><label>Name</label><input id="pname" value="${esc(session.name)}"></div><div class="field"><label>Phone</label><input id="pphone" value="${esc(session.phone||"")}"></div><div class="field"><label>Email</label><input value="${esc(session.email)}" disabled></div></div><button class="btn primary" style="margin-top:14px" onclick="saveProfile()">Save Profile</button></div>`}
function farePage(){return pageTitle("Fare Enquiry","Estimate fare using the same train/class selection logic",liveBadge())
 +`<div class="card"><div class="form-grid"><div class="field"><label>Train</label><select id="fareTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="fareClass"><option>1A</option><option>2A</option><option>3A</option><option>SL</option></select></div><div class="field"><label>Passengers</label><input id="farePax" type="number" min="1" max="6" value="1"></div>
 ${hasLiveData()?`<div class="field"><label>From code</label><input id="fareFrom" placeholder="e.g. NDLS"></div><div class="field"><label>To code</label><input id="fareTo" placeholder="e.g. HWH"></div>`:""}</div><button class="btn primary" style="margin-top:14px" onclick="calcFare()">Calculate Fare</button><div id="fareOut" style="margin-top:18px"></div></div>`}
function seatPage(){return pageTitle("Seat Availability","Check class-wise availability",liveBadge())
 +`<div class="card"><div class="field"><label>Train</label><select id="seatTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div>
 ${hasLiveData()?`<div class="form-grid" style="margin-top:12px"><div class="field"><label>From station code</label><input id="seatFrom" placeholder="e.g. NDLS"></div><div class="field"><label>To station code</label><input id="seatTo" placeholder="e.g. HWH"></div><div class="field"><label>Class</label><select id="seatClass"><option>SL</option><option>3A</option><option>2A</option><option>1A</option></select></div><div class="field"><label>Date</label><input id="seatDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div></div>`:""}
 <button class="btn primary" style="margin-top:12px" onclick="showSeats()">Check Availability</button><div id="seatOut" style="margin-top:18px"></div></div>`}
function specialPage(){return pageTitle("Special Trains","Special-service data is not connected yet.")+
 '<div class="card"><div class="notice warn">GoRail does not currently have a verified special-train feed. Regular demo trains are not labeled as special services.</div><p class="muted">Use Train Enquiry to search the available timetable, and verify special services with an official railway source before travelling.</p><button class="btn primary" onclick="goto(\'search\')">Search timetable</button></div>'}

function emergencyPage(){return pageTitle("Emergency Help","Quick-access railway support contacts")
 +`<div class="grid g3">${[["🚨","Railway Security","139"],["🏥","Medical Emergency","112"],["📞","Railway Helpline","139"],["🛡️","RPF","182"],["🔥","Fire Emergency","101"],["ℹ️","Railway Enquiry","139"]].map(x=>`<div class="card"><div style="font-size:30px">${x[0]}</div><h3>${x[1]}</h3><p class="muted">Emergency contact</p><a class="btn primary" href="tel:${x[2]}">Call ${x[2]}</a></div>`).join("")}</div>`}
function manageTrainsPage(){return pageTitle("Manage Trains","Add, edit and delete train records",`<button class="btn primary" onclick="trainModal()">+ Add Train</button>`)
 +`<div class="card"><table class="table"><thead><tr><th>Train</th><th>Route</th><th>Departure</th><th>Arrival</th><th>Seats</th><th>Action</th></tr></thead><tbody>${state.trains.map(t=>`<tr><td><b>${t.number}</b><br>${esc(t.name)}</td><td>${esc(t.from)} → ${esc(t.to)}</td><td>${t.dep}</td><td>${t.arr}</td><td>${t.seats}</td><td><button class="btn small" onclick="trainModal('${t.id}')">Edit</button> <button class="btn danger small" onclick="deleteTrain('${t.id}')">Delete</button></td></tr>`).join("")}</tbody></table></div>`}
function mapPage(){
 const loaded=railDatasetLoaded();
 const stations=(ALL_STATIONS||[]).slice(0,10000);
 return pageTitle("Find My Train","Find trains between stations and track live running status",liveBadge())+
 '<div class="card gr-search-card"><div class="gr-station-field"><span class="gr-station-marker">●</span><div class="field"><label>From station</label><input id="mapFromStation" list="mapStationOptions" placeholder="Enter boarding station" autocomplete="off"></div><button class="gr-clear" type="button" onclick="document.getElementById(\'mapFromStation\').value=\'\'">×</button></div>'+
 '<div class="gr-station-connector">⋮<br>↓</div><div class="gr-station-field"><span class="gr-station-marker">●</span><div class="field"><label>To station</label><input id="mapToStation" list="mapStationOptions" placeholder="Enter destination station" autocomplete="off"></div><button class="gr-clear" type="button" onclick="document.getElementById(\'mapToStation\').value=\'\'">×</button></div>'+
 '<div class="gr-search-actions"><button class="btn primary" onclick="findTrainsForJourney()">Find trains</button><button class="btn" type="button" onclick="swapJourneyStations()">⇅</button></div></div>'+
 '<datalist id="mapStationOptions">'+stations.map(st=>'<option value="'+esc(st.name||"")+'"></option><option value="'+esc(st.code||"")+'"></option>').join("")+'</datalist>'+
 '<div class="card gr-train-search"><div class="gr-train-icon">🚆</div><div class="field autocomplete"><label>Train No. / Train Name</label><input id="mapTrainQuery" placeholder="Enter train number or name" oninput="mapSuggest()" autocomplete="off"><div id="mapAcList"></div></div><button class="btn primary gr-icon-button" type="button" onclick="trackTrainOnMap()" aria-label="Track train">⌕</button></div>'+
 '<div class="field" style="margin-top:12px"><label>Journey date</label><input id="mapDate" type="date" value="'+new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)+'"></div>'+
 (loaded?'':'<p class="muted" style="margin-top:10px">Load the all-India timetable in Settings to search more trains and stations.</p>')+
 '<div id="mapJourneyMatches" style="margin-top:12px"></div><div id="mapResultInfo" style="margin-top:16px"></div>'+
 '<style>.gr-search-card{background:var(--card);padding:16px}.gr-station-field{display:grid;grid-template-columns:24px minmax(0,1fr) 28px;gap:10px;align-items:center}.gr-station-marker{color:#9bc7ff;font-size:19px;text-align:center}.gr-station-field .field{margin:0}.gr-clear{border:0;background:transparent;color:var(--muted);font-size:25px;cursor:pointer}.gr-station-connector{margin-left:7px;padding:0 0 0 0;height:30px;line-height:13px;color:var(--muted);font-size:16px}.gr-search-actions{display:flex;gap:8px;margin-top:14px}.gr-search-actions .btn:first-child{flex:1}.gr-train-search{display:grid;grid-template-columns:44px minmax(0,1fr) 52px;gap:12px;align-items:center;margin-top:14px}.gr-train-icon{font-size:28px}.gr-train-search .field{margin:0}.gr-icon-button{height:48px;font-size:25px;padding:0}@media(max-width:480px){.gr-train-search{grid-template-columns:34px minmax(0,1fr) 46px;gap:8px}}</style>';
}
function swapJourneyStations(){const a=$("#mapFromStation"),b=$("#mapToStation");if(!a||!b)return;const v=a.value;a.value=b.value;b.value=v;}
function findTrainsForJourney(){
 const from=($("#mapFromStation")?.value||"").trim(),to=($("#mapToStation")?.value||"").trim(),box=$("#mapJourneyMatches");
 if(!from||!to){toast("Enter both boarding and destination stations.","warn");return}
 if(from.toLowerCase()===to.toLowerCase()){toast("Choose two different stations.","warn");return}
 const all=railDatasetLoaded()?ALL_TRAINS_INDEX:[];
 const match=(q)=>q.toLowerCase();
 const results=all.filter(t=>{
  const stops=ALL_TRAIN_SCHEDULES?.get?.(String(t.number))||[];
  const idx=stops.findIndex(st=>[st.station_code,st.stationCode,st.code,st.station_name,st.stationName,st.name].some(v=>String(v||"").toLowerCase()===match(qStation(from))));
  const j=stops.findIndex(st=>[st.station_code,st.stationCode,st.code,st.station_name,st.stationName,st.name].some(v=>String(v||"").toLowerCase()===match(qStation(to))));
  return idx>=0&&j>idx;
 }).slice(0,20);
 box.innerHTML=results.length?'<div class="card"><h3>Trains for your journey</h3>'+results.map(t=>'<button class="btn" style="display:block;width:100%;text-align:left;margin:8px 0" onclick="selectMapTrain(\''+esc(String(t.number))+'\',\''+esc(String(t.name||"")).replace(/'/g,"\\'")+'\')">'+esc(String(t.number))+' · '+esc(String(t.name||"Train"))+' <span class="muted">('+esc(String(t.from||""))+' → '+esc(String(t.to||""))+')</span></button>').join("")+'</div>':'<div class="notice warn">No matching trains found in the loaded timetable. You can still enter a train number below to check its running status.</div>';
}
function qStation(v){return String(v||"").trim().toLowerCase();}

function mapSuggest(){
 const q=$("#mapTrainQuery").value.trim();const box=$("#mapAcList");
 if(!q){box.innerHTML="";return}
 let results;
 if(railDatasetLoaded()) results=searchAllTrains(q,10).map(t=>({label:`${t.number} · ${t.name} (${t.from} → ${t.to})`,number:t.number}));
 else results=state.trains.filter(t=>t.number.includes(q)||t.name.toLowerCase().includes(q.toLowerCase())).map(t=>({label:`${t.number} · ${t.name}`,number:t.number}));
 box.className="ac-list";
 box.innerHTML=results.map(r=>`<div onclick="selectMapTrain('${r.number}','${esc(r.label).replace(/'/g,"\\'")}')">${esc(r.label)}</div>`).join("")||"";
}
function selectMapTrain(number,label){$("#mapTrainQuery").value=number;$("#mapAcList").innerHTML="";}
async function trackTrainOnMap(){
 const q=$("#mapTrainQuery")?.value.trim(),date=$("#mapDate")?.value,info=$("#mapResultInfo");
 if(!q){toast("Enter a train number or name.","warn");return}
 const real=railDatasetLoaded()?(ALL_TRAINS_INDEX.find(t=>String(t.number)===q)||searchAllTrains(q,1)[0]):null;
 const demo=state.trains.find(t=>String(t.number)===q||t.id===q||t.name.toLowerCase().includes(q.toLowerCase()));
 if(!real&&!demo&&!/^\\d{5}$/.test(q)){info.innerHTML='<div class="notice warn">Train not found. Check the number or load the all-India timetable in Settings.</div>';return}
 const number=String(real?.number||demo?.number||q),name=real?.name||demo?.name||number;
 info.innerHTML='<div class="card">Loading timetable and checking live running status…</div>';
 let live=null,liveError=null;
 try{const response=await GoRailAPI.liveStatus(number,"1",date||undefined);live=response?.data||response?.result||response;}
 catch(e){liveError=e}
 let stops=(ALL_TRAIN_SCHEDULES?.get?.(number)||[]).slice();
 if(!stops.length&&Array.isArray(live?.route))stops=live.route.map((s,i)=>({station_code:s.stationCode||s.station_code||s.code||"",station_name:s.stationName||s.station_name||s.name||"",arrival:s.scheduledArrival||s.arrival||"",departure:s.scheduledDeparture||s.departure||"",day:s.day||"",distance:s.distance??s.distanceFromSource??""}));
 if(!stops.length&&demo)stops=[{station_code:"",station_name:demo.from,arrival:"",departure:demo.dep||"",day:""},{station_code:"",station_name:demo.to,arrival:demo.arr||"",departure:"",day:""}];
 const pos=live?.currentLocation||live?.current_position||live?.currentPosition||{};
 const currentCode=String(pos.stationCode||pos.station_code||live?.current_station_code||live?.current_station||"").toUpperCase();
 const currentName=String(pos.stationName||pos.station_name||live?.current_station_name||"");
 let currentIndex=stops.findIndex(s=>currentCode&&String(s.station_code||s.stationCode||s.code||"").toUpperCase()===currentCode);
 if(currentIndex<0&&currentName)currentIndex=stops.findIndex(s=>String(s.station_name||s.stationName||s.name||"").toLowerCase()===currentName.toLowerCase());
 const fromInput=($("#mapFromStation")?.value||"").trim(),toInput=($("#mapToStation")?.value||"").trim();
 const stationMatch=(query)=>{if(!query)return -1;const q=query.toLowerCase();return stops.findIndex(st=>{const code=String(st.station_code||st.stationCode||st.code||"").toLowerCase(),nm=String(st.station_name||st.stationName||st.name||"").toLowerCase();return code===q||nm===q;});};
 const fromIndex=fromInput?stationMatch(fromInput):0,toIndex=toInput?stationMatch(toInput):stops.length-1;
 if(fromInput&&fromIndex<0){info.innerHTML='<div class="notice warn">Boarding station was not found in this train’s timetable. Enter a station name or code from the route.</div>';return}
 if(toInput&&toIndex<0){info.innerHTML='<div class="notice warn">Destination station was not found in this train’s timetable. Enter a station name or code from the route.</div>';return}
 if(stops.length&&fromIndex>=0&&toIndex>=0&&fromIndex>=toIndex){info.innerHTML='<div class="notice warn">Choose a destination station that comes after the boarding station on this train’s route.</div>';return}
 const journeyStops=stops.length?stops.slice(fromIndex,toIndex+1):stops;
 const journeyStart=journeyStops[0],journeyEnd=journeyStops[journeyStops.length-1];
 const stationLabel=st=>st?(st.station_name||st.stationName||st.name||st.station_code||st.stationCode||st.code||""):"";
 const delayValue=live?.delayMinutes??live?.delayInMinutes??live?.delay??pos.delayMinutes;
 const delay=Number(delayValue);
 const status=live?.status||live?.trainStatus||pos.status||"Running status unavailable";
 const safe= v=>esc(v==null||v===""?"—":String(v));
 const dateObj=date?new Date(date+"T12:00:00"):new Date();
 const dateLabel=dateObj.toLocaleDateString("en-IN",{day:"numeric",month:"short",weekday:"short"});
 const rows=journeyStops.map((st,j)=>{const i=fromIndex+j;
  const code=st.station_code||st.stationCode||st.code||"";
  const station=st.station_name||st.stationName||st.name||code||"Station";
  const isCurrent=i===currentIndex;
  const passed=currentIndex>=0&&i<currentIndex;
  const arr=st.actualArrival||st.arrival||st.scheduledArrival||"—";
  const dep=st.actualDeparture||st.departure||st.scheduledDeparture||"—";
  const arrDelay=st.delayArrival??st.arrivalDelay??"";
  const depDelay=st.delayDeparture??st.departureDelay??"";
  const distance=st.distance??st.distanceFromSource;
  return '<div class="gr-stop '+(isCurrent?'current':passed?'passed':'')+'"><div class="gr-time gr-arr"><span>'+safe(arr)+'</span>'+(arrDelay!==""?'<small>'+safe(arrDelay)+' min</small>':'')+'</div><div class="gr-rail"><span class="gr-dot"></span></div><div class="gr-stop-main"><div class="gr-stop-name">'+safe(station)+(isCurrent?'<span class="gr-current-tag">CURRENT</span>':'')+'</div><div class="gr-stop-meta">'+(distance!==undefined&&distance!==""?safe(distance)+' km':'')+(code?' · '+safe(code):'')+(st.day?' · Day '+safe(st.day):'')+'</div></div><div class="gr-time gr-dep"><span>'+safe(dep)+'</span>'+(depDelay!==""?'<small>'+safe(depDelay)+' min</small>':'')+'</div></div>';
 }).join("");
 info.innerHTML='<style>.gr-running{background:#111318;color:#e8edf5;border-radius:16px;overflow:hidden;border:1px solid var(--line)}.gr-running-head{background:#202a3b;padding:16px 18px}.gr-running-head h2{margin:0 0 5px;font-size:20px}.gr-running-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.gr-running-actions span{background:#303b4e;border-radius:22px;padding:8px 13px;font-size:13px}.gr-columns{display:grid;grid-template-columns:72px 1fr 72px;gap:12px;background:#08090c;padding:10px 14px;font-size:12px;color:#dce3ef}.gr-columns span:last-child{text-align:right}.gr-stops{max-height:65vh;overflow:auto;padding:12px 12px 20px}.gr-stop{display:grid;grid-template-columns:72px 18px minmax(0,1fr) 72px;gap:10px;min-height:76px;position:relative;align-items:start}.gr-time{font-size:12px;color:#d4d9e2;padding-top:9px;display:flex;flex-direction:column;gap:3px}.gr-time small{color:#ff8676}.gr-dep{text-align:right}.gr-rail{position:relative;display:flex;justify-content:center;height:100%;min-height:76px}.gr-rail:before{content:"";position:absolute;top:0;bottom:0;width:12px;background:#243650}.gr-dot{position:relative;z-index:1;width:13px;height:13px;border-radius:50%;background:#9bc7ff;border:2px solid #243650;margin-top:12px}.gr-stop.passed .gr-dot{background:#65c18c}.gr-stop.current .gr-dot{background:#ff796b;box-shadow:0 0 0 5px #ff796b33}.gr-stop-main{padding:7px 0 16px;min-width:0}.gr-stop-name{font-size:16px;font-weight:600;overflow-wrap:anywhere}.gr-stop-meta{font-size:12px;color:#aeb8c8;margin-top:5px}.gr-current-tag{display:inline-block;margin-left:7px;background:#b42318;color:white;border-radius:5px;padding:2px 5px;font-size:9px;vertical-align:middle}.gr-status{background:#202a3b;padding:14px 16px;border-top:1px solid #394456}.gr-status strong{font-size:17px;color:#ff8577}.gr-muted{font-size:12px;color:#b5bfce;margin-top:7px}@media(max-width:480px){.gr-columns{grid-template-columns:58px 1fr 58px}.gr-stop{grid-template-columns:58px 14px minmax(0,1fr) 58px;gap:7px}.gr-stop-name{font-size:14px}.gr-time{font-size:11px}}</style>'+
 '<section class="gr-running"><div class="gr-running-head"><h2>'+safe(number)+' '+safe(name)+'</h2><div class="gr-muted">Train starts: '+safe(stationLabel(stops[0])||real?.from_name||demo?.from||"—")+' → Train ends: '+safe(stationLabel(stops[stops.length-1])||real?.to_name||demo?.to||"—")+'</div><div class="gr-muted">Your journey: '+safe(fromInput?stationLabel(journeyStart)||fromInput:stationLabel(journeyStart)||real?.from_name||demo?.from||"Start")+' → '+safe(toInput?stationLabel(journeyEnd)||toInput:stationLabel(journeyEnd)||real?.to_name||demo?.to||"End")+'</div><div class="gr-running-actions"><span>📅 '+safe(dateLabel)+'</span><span>⏰ Live running status</span></div></div>'+
 '<div class="gr-columns"><span>Arrival</span><span>Journey · '+safe(dateLabel)+'</span><span>Departure</span></div>'+
 '<div class="gr-stops">'+(rows||'<div class="gr-muted">No timetable stops are available for this train. Try loading the all-India timetable in Settings.</div>')+'</div>'+
 '<div class="gr-status"><strong>'+(currentIndex>=0?'Current location: '+safe(currentName||stationLabel(stops[currentIndex])||"current station"):safe(status))+'</strong><div class="gr-muted">'+(currentIndex>=0&&currentIndex>=fromIndex&&currentIndex<=toIndex?'Train is within your selected journey.':currentIndex>=0?'Train is currently outside your selected boarding-to-destination segment.':'Live station location was not returned.')+' '+(Number.isFinite(delay)?'Reported delay: '+delay+' min · ':'')+(live?.lastUpdatedAt?'Updated '+safe(live.lastUpdatedAt):'Live update time not provided')+'</div>'+
 (liveError?'<div class="gr-muted">Live status unavailable: '+safe(liveError.message||liveError)+'. Timetable shown where available.</div>':(!live?'':'') )+
 (currentIndex<0&&currentName?'<div class="gr-muted">Reported location: '+safe(currentName)+' · Station could not be matched to the timetable.</div>':'')+
 '</div></section>';
}

function ticketMini(b){let t=state.trains.find(x=>x.id===b.trainId)||b.train||{};return `<div style="margin-top:12px"><b>${esc(t.number)} · ${esc(t.name)}</b><p class="muted">${esc(t.from)} → ${esc(t.to)}<br>${esc(b.ref||b.pnr)} · saved on this device</p></div>`}
function goto(p){page=p;searchResults=[];render();window.scrollTo({top:0,behavior:"smooth"});if(p==="stations")setTimeout(loadStationsWeather,10);if(p==="search")setTimeout(bindStationLookup,10)}
let stationLookupTimer;
function bindStationLookup(){
 ["sfrom","sto","fareFrom","fareTo","seatFrom","seatTo"].forEach(id=>{
  const el=$("#"+id); if(!el || el.dataset.lookup==="1") return;
  el.dataset.lookup="1";
  el.addEventListener("input",()=>{
   clearTimeout(stationLookupTimer);
   const q=el.value.trim();
   if(q.length<2) return;
   stationLookupTimer=setTimeout(async()=>{
    try{
     const r=await GoRailAPI.searchStation(q);
     const raw=r?.data||r;
     const arr=Array.isArray(raw)?raw:(raw?.stations||raw?.results||[]);
     let dl=$("#stationList");
     if(!dl){dl=document.createElement("datalist");dl.id="stationList";document.body.appendChild(dl);el.setAttribute("list","stationList")}
     arr.slice(0,12).forEach(s=>{
      const code=s.code||s.stationCode||s.station_code;
      const name=s.name||s.stationName||s.station_name||code;
      if(!code) return;
      const opt=document.createElement("option");
      opt.value=String(code).toUpperCase();
      opt.label=name+" ("+code+")";
      dl.appendChild(opt);
     });
    }catch(_e){}
   },350);
  });
 });
}
function isValidEmail(email){return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email.trim())}
function isStrongPassword(pass){return pass.length>=8}
async function login(){let email=$("#lemail").value.trim().toLowerCase(),pass=$("#lpass").value;
 if(!isValidEmail(email)){toast("Enter a valid Gmail address ending in @gmail.com.","warn");return}
 if(!pass){toast("Enter your password.","warn");return}
 try{
  const cred=await goRailAuth.signInWithEmailAndPassword(email,pass);
  if(!cred.user.emailVerified){
   await goRailAuth.signOut();
   modal='<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Verify your email</h2><button class="close" onclick="closeModal()">×</button></div><div class="notice warn">Your GoRail account is not verified yet. Access is available after you verify your email address.</div><p>Open the verification email sent during registration and tap its verification link. Then return here and log in again.</p><p class="muted">If you cannot find it, check your Spam folder. Avoid repeatedly requesting emails; Firebase may temporarily block requests.</p><button class="btn primary" style="width:100%" onclick="closeModal()">I understand</button></div></div>';
   drawModal();
   return;
  }
  const savedUser=state.users.find(x=>String(x.email).toLowerCase()===email)||{};
  session={id:cred.user.uid,name:savedUser.name||cred.user.displayName||email.split("@")[0],email,phone:savedUser.phone||"",role:"passenger"};
  save();goto("dashboard");
 }catch(e){
  const code=e&&e.code;
  const message=code==="auth/user-not-found"||code==="auth/wrong-password"||code==="auth/invalid-credential"?"Invalid Gmail or password.":code==="auth/too-many-requests"?"Firebase has temporarily blocked sign-in attempts from this device due to too many requests. Wait and try again later; do not keep retrying.":code==="auth/network-request-failed"?"Network error. Check your internet connection and try again.":e.message||"Login failed.";
  toast(message,"warn");
 }
}
async function logout(){try{await goRailAuth.signOut()}catch(e){} session=null;render()}
function registerModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Create Account</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid"><div class="field"><label>Name</label><input id="rname" type="text" autocomplete="name" oninput="this.value=this.value.replace(/[^a-zA-Z ]/g,'')" placeholder="Letters only"></div><div class="field"><label>Phone</label><input id="rphone" type="tel" inputmode="numeric" autocomplete="tel" oninput="this.value=this.value.replace(/[^0-9]/g,'')" placeholder="Numbers only"></div><div class="field"><label>Email</label><input id="remail" type="email" autocomplete="email"></div><div class="field"><label>Password</label><input id="rpass" type="password" autocomplete="new-password"></div></div><button class="btn primary" style="margin-top:15px" onclick="register()">Register</button></div></div>`;drawModal()}
async function register(){let name=$("#rname").value.trim(),email=$("#remail").value.trim().toLowerCase(),pass=$("#rpass").value,phone=$("#rphone").value.trim();
 if(!name||!email||!pass){toast("Please fill required fields.","warn");return}
 if(!/^[A-Za-z ]+$/.test(name)){toast("Name can contain letters and spaces only.","warn");return}
 if(phone&&!/^[0-9]+$/.test(phone)){toast("Phone number can contain digits only.","warn");return}
 if(!isValidEmail(email)){toast("Enter a valid Gmail address ending in @gmail.com.","warn");return}
 if(!isStrongPassword(pass)){toast("Password must be at least 8 characters long.","warn");return}
 try{
  const cred=await goRailAuth.createUserWithEmailAndPassword(email,pass);
  await cred.user.updateProfile({displayName:name});
  await cred.user.sendEmailVerification();
  state.users=state.users.filter(u=>String(u.email).toLowerCase()!==email);
  state.users.push({id:cred.user.uid,name,email,phone,role:"passenger"});
  save();
  await goRailAuth.signOut();
  closeModal();
  toast("Account created. Verify your Gmail using the link we sent, then log in.","success");
 }catch(e){const code=e&&e.code;toast(code==="auth/email-already-in-use"?"This Gmail is already registered. Please log in.":code==="auth/weak-password"?"Choose a stronger password.":code==="auth/too-many-requests"?"Firebase has temporarily blocked account requests from this device. Wait before trying again.":e.message||"Registration failed.","warn")}
}
function closeModal(){modal=null;drawModal()}
function drawModal(){let old=$("#modalRoot");if(old)old.remove();if(modal){let d=document.createElement("div");d.id="modalRoot";d.innerHTML=modal;document.body.appendChild(d)}}
function bookTrain(id){let t=state.trains.find(x=>x.id===id);if(!t)return;modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Save enquiry</h2><button class="close" onclick="closeModal()">×</button></div><div class="notice warn">This stores a quote on this device. It does not reserve a berth and it does not create an IRCTC PNR.</div><div class="notice">${t.number} · ${esc(t.name)} · ${esc(t.from)} → ${esc(t.to)}</div><div class="form-grid" style="margin-top:15px"><div class="field"><label>Passenger Name</label><input id="bname" value="${esc(session.name)}"></div><div class="field"><label>Age</label><input id="bage" type="number" value="21"></div><div class="field"><label>Class</label><select id="bclass">${t.classes.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="field"><label>Gender</label><select id="bgender"><option>Male</option><option>Female</option><option>Other</option></select></div></div><button class="btn primary" style="margin-top:15px;width:100%" onclick="confirmBooking('${t.id}')">Save enquiry · quoted ₹${t.fare}</button></div></div>`;drawModal()}
function confirmBooking(id){
 const t=state.trains.find(x=>x.id===id);if(!t)return toast("Train not found.","warn");
 const name=$("#bname").value.trim(),age=Number($("#bage").value),cls=$("#bclass").value,gender=$("#bgender").value;
 if(!name||name.length>100){toast("Enter a passenger name (up to 100 characters).","warn");return}
 if(!Number.isInteger(age)||age<1||age>120){toast("Enter a valid passenger age (1–120).","warn");return}
 if(!(t.classes||[]).includes(cls)){toast("Select a valid class.","warn");return}
 const now=Date.now(),ref="ENQ"+now.toString(36).toUpperCase();
 const b={id:"enq"+now,kind:"enquiry",userId:session.id,trainId:id,train:{...t},passenger:{name,age,gender},className:cls,fare:t.fare,ref,status:"Saved enquiry",source:"device",date:new Date().toLocaleDateString("en-IN")};
 state.bookings.push(b);
 if(!save()){state.bookings.pop();return}
 closeModal();toast("Enquiry saved on this device.","success");ticketDetail(b.id);
}

function ticketDetail(id){let b=state.bookings.find(x=>x.id===id),t=state.trains.find(x=>x.id===b.trainId)||b.train;modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Saved enquiry</h2><button class="close" onclick="closeModal()">×</button></div><div id="qr" style="float:right"></div><div class="notice warn">Saved on this device. Not an IRCTC reservation.</div><div class="notice"><b>${esc(b.ref||b.pnr)}</b> · ${esc(b.status)}</div><h3 style="margin-top:18px">${esc(t.number)} · ${esc(t.name)}</h3><p>${esc(t.from)} → ${esc(t.to)} · ${esc(t.dep)} → ${esc(t.arr)}</p><div class="ticket-grid"><div><div class="label">Passenger</div><div class="value">${esc(b.passenger.name)}</div></div><div><div class="label">Age/Gender</div><div class="value">${b.passenger.age}/${esc(b.passenger.gender)}</div></div><div><div class="label">Class</div><div class="value">${esc(b.className)}</div></div><div><div class="label">Quoted fare</div><div class="value">₹${esc(b.fare)}</div></div></div><button class="btn primary" style="margin-top:16px" onclick="window.print()">🖨️ Print / Save as PDF</button></div></div>`;drawModal();setTimeout(()=>{let q=$("#qr");if(q)new QRCode(q,{text:`GORAIL|ENQUIRY:${b.ref||b.id}|TRAIN:${t.number}|NOT_A_PNR`,width:110,height:110})},20)}
function cancelBooking(id){if(!confirm("Remove this saved enquiry?"))return;let b=state.bookings.find(x=>x.id===id);if(!b)return;b.status="Removed";save();render()}
async function checkPnr(){
 let x=$("#pnrInput").value.trim(),out=$("#pnrOut");
 if(!/^\d{10}$/.test(x)){out.innerHTML=`<div class="notice warn">Enter a valid 10-digit PNR number. GoRail enquiry references are not PNRs.</div>`;return}
 out.innerHTML=`<div class="card">Fetching live PNR status…</div>`;
 try{
  const r=await GoRailAPI.pnrStatus(x),d=r?.data||r;
  const passengers=d?.passengers||d?.passengerDetails||d?.passengerList||[];
  const rows=passengers.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.currentStatus||p.bookingStatus||p.status||"—")}</td><td>${esc(p.coach||p.coachNumber||"—")}</td><td>${esc(p.berth||p.berthNumber||"—")}</td></tr>`).join("");
  out.innerHTML=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">PNR ${esc(x)}</h3><span class="pill ok">LIVE</span></div>
   <p><b>${esc(d?.trainName||d?.train?.name||"Train details")}</b> · ${esc(d?.trainNumber||d?.train?.number||"")}</p>
   <p><b>Journey date:</b> ${esc(d?.journeyDate||d?.dateOfJourney||d?.doj||"—")}</p>
   <p><b>Chart status:</b> ${esc(d?.chartStatus||d?.chartingStatus||"—")}</p>
   ${rows?`<table class="table"><thead><tr><th>Passenger</th><th>Current status</th><th>Coach</th><th>Berth</th></tr></thead><tbody>${rows}</tbody></table>`:`<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin-top:10px">${esc(JSON.stringify(d,null,2)).slice(0,1800)}</pre>`}</div>`;
 }catch(e){out.innerHTML=`<div class="notice warn">RailRadar PNR lookup failed: ${esc(e.message||e)}. Check the PNR, API key, and quota.</div>`}
}

async function showLive(){
 let t=state.trains.find(x=>x.id===$("#liveTrain").value);
 let out=$("#liveOut");out.innerHTML=`<div class="card">Fetching live train status…</div>`;
 let trainNo=$("#liveTrainNo")?.value?.trim()||t?.number;
 if(!/^\d{5}$/.test(String(trainNo||""))){out.innerHTML=`<div class="notice warn">Enter a valid 5-digit train number.</div>`;return}
 try{
  const r=await GoRailAPI.liveStatus(trainNo),d=r?.data||r;
  const pos=d?.currentLocation||{},next=d?.nextHalt||{},prev=d?.previousHalt||{};
  const status=String(d?.status||"Status unavailable").replace(/-/g," ");
  const station=pos.stationName||pos.stationCode||"Location unavailable";
  const delay=Number(d?.delayMinutes??0);
  const details=(d?.route||[]).map(s=>`<tr><td>${esc(s.stationCode||"")}</td><td>${esc(s.stationName||"")}</td><td>${esc(s.status||"—")}</td><td>${esc(s.actualArrival||s.scheduledArrival||"—")}</td><td>${esc(s.actualDeparture||s.scheduledDeparture||"—")}</td><td>${s.delayArrival??s.delayDeparture??"—"}</td></tr>`).join("");
  out.innerHTML=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">${esc(d?.trainName||d?.train?.name||t?.name||trainNo)} · ${esc(trainNo)}</h3><span class="pill ok">LIVE</span></div>
   <div class="grid g3" style="margin-top:12px"><div><div class="muted">Running status</div><b>${esc(status)}</b></div><div><div class="muted">Current location</div><b>${esc(station)}</b></div><div><div class="muted">Delay</div><b>${Number.isFinite(delay)?delay+" min":"—"}</b></div></div>
   <p style="margin-top:12px"><b>Previous halt:</b> ${esc(prev.stationName||prev.stationCode||"—")} &nbsp; <b>Next halt:</b> ${esc(next.stationName||next.stationCode||"—")}</p>
   <p class="muted">Last updated: ${esc(d?.lastUpdatedAt||"Not provided")}</p>
   ${details?`<h3>Live route progress</h3><div style="overflow:auto"><table class="table"><thead><tr><th>Code</th><th>Station</th><th>Status</th><th>Arrival</th><th>Departure</th><th>Delay (min)</th></tr></thead><tbody>${details}</tbody></table></div>`:""}
  </div>`;
 }catch(e){out.innerHTML=`<div class="notice warn">RailRadar live status failed: ${esc(e.message||e)}. Check the train number, server API key, and quota.</div>`}
}
async function calcFare(){
 let t=state.trains.find(x=>x.id===$("#fareTrain").value),p=Math.max(1,+$("#farePax").value||1),c=$("#fareClass").value,out=$("#fareOut");
 let fromC=$("#fareFrom")?.value?.trim(),toC=$("#fareTo")?.value?.trim();
 if(hasLiveData()&&fromC&&toC){
  out.innerHTML=`<div class="card">Fetching live fare…</div>`;
  try{
   const r=await GoRailAPI.fare({trainNo:t.number,fromStationCode:fromC,toStationCode:toC});const d=r?.data||r;
   out.innerHTML=`<div class="notice"><div class="actions" style="justify-content:space-between"><b>Live fare · ${esc(t.number)}</b>${liveBadge()}</div><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin-top:8px">${esc(JSON.stringify(d,null,2)).slice(0,1200)}</pre></div>`;
   return;
  }catch(e){out.innerHTML=`<div class="notice warn">Live fare lookup failed: ${esc(e.message||e)}. No estimate is shown as a live fare.</div>`;return}
 }
 out.innerHTML=`<div class="notice warn">Enter From and To station codes to request a live fare. GoRail does not invent a fare.</div>`;
}
function seatMap(available,total=48){let cells=[];for(let i=1;i<=total;i++){let taken=i>available;let rac=!taken&&i>available-4;cells.push(`<div class="seat ${taken?"taken":rac?"rac":""}">${i}</div>`)}return `<div class="coach-map">${cells.join("")}</div>`}
async function showSeats(){
 let t=state.trains.find(x=>x.id===$("#seatTrain").value),out=$("#seatOut");
 let fromC=$("#seatFrom")?.value?.trim().toUpperCase(),toC=$("#seatTo")?.value?.trim().toUpperCase(),cls=$("#seatClass")?.value,date=$("#seatDate")?.value;
 if(!t){out.innerHTML=`<div class="notice warn">Select a train.</div>`;return}
 if(!fromC||!toC||!cls||!date){out.innerHTML=`<div class="notice warn">Enter source and destination station codes, class, and journey date.</div>`;return}
 out.innerHTML=`<div class="card">Checking live seat availability and vacancy…</div>`;
 try{
  const r=await GoRailAPI.seatVacancy({trainNo:t.number,fromStationCode:fromC,toStationCode:toC,classType:cls,date});
  const d=r?.data||r,days=d?.avlDayList||d?.availability||d?.days||[];
  const cards=days.map(day=>{
   const status=String(day?.availablityStatus||day?.availabilityStatus||day?.status||day?.available||"Not available");
   const match=status.match(/AVAILABLE[- ]?(\d+)/i),vacant=match?Number(match[1]):null;
   const badge=vacant!==null?`<span class="pill ok">${vacant} seats/berths available</span>`:`<span class="pill ${/RAC/i.test(status)||/WL|WAIT/i.test(status)?"warn":"red"}">${/RAC/i.test(status)?"RAC / shared berth":/WL|WAIT/i.test(status)?"Waitlist":"Unavailable"}</span>`;
   return `<div class="card"><div class="muted">${esc(day?.availablityDate||day?.availabilityDate||day?.date||"")}</div><h3>${esc(status)}</h3>${badge}</div>`;
  }).join("");
  out.innerHTML=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">${esc(d?.trainName||t.name)} · ${esc(d?.trainNumber||t.number)}</h3><span class="pill ok">LIVE</span></div>
   <p>${esc(d?.sourceStation||fromC)} → ${esc(d?.destinationStation||toC)} · ${esc(d?.classCode||cls)} · Quota ${esc(d?.quotaCode||"GN")}</p></div>
   <div class="grid g3" style="margin-top:12px">${cards||`<div class="card"><pre style="white-space:pre-wrap">${esc(JSON.stringify(d,null,2)).slice(0,1800)}</pre></div>`}</div>
   <p class="muted">Seat vacancy is shown from the live availability status. Availability can change before booking.</p>`;
 }catch(e){out.innerHTML=`<div class="notice warn">RailRadar seat lookup failed: ${esc(e.message||e)}. Check train number, station codes, date, API access, and quota.</div>`}
}

function addFood(id){
 const item=(state.food||[]).find(f=>String(f.id)===String(id));if(!item)return toast("Menu item not found.","warn");
 let cart=[];try{cart=JSON.parse(localStorage.getItem("gorail_cart")||"[]")}catch(_e){}
 if(!Array.isArray(cart))cart=[];
 cart.push({id:item.id,name:item.name,price:Number(item.price)||0,cat:item.cat||"Food",quantity:1});
 try{localStorage.setItem("gorail_cart",JSON.stringify(cart))}catch(_e){return toast("Could not save cart in this browser.","warn")}
 render();toast(item.name+" added to cart.","success");
}

function removeFood(index){
 let cart=[];try{cart=JSON.parse(localStorage.getItem("gorail_cart")||"[]")}catch(_e){}
 if(!Array.isArray(cart)||index<0||index>=cart.length)return;
 cart.splice(index,1);try{localStorage.setItem("gorail_cart",JSON.stringify(cart))}catch(_e){toast("Could not update cart.","warn");return}
 render();
}
function placeFood(){
 let cart=[];try{cart=JSON.parse(localStorage.getItem("gorail_cart")||"[]")}catch(_e){}
 if(!Array.isArray(cart)||!cart.length)return toast("Add at least one food item to your cart.","warn");
 const trainNo=$("#foodTrain")?.value.trim()||"",station=$("#foodStation")?.value.trim()||"",coach=$("#foodCoach")?.value.trim()||"",seat=$("#foodSeat")?.value.trim()||"",passenger=$("#foodPassenger")?.value.trim()||"",phone=$("#foodPhone")?.value.trim()||"",date=$("#foodDate")?.value||"";
 if(!/^\\d{5}$/.test(trainNo))return toast("Enter a valid 5-digit train number.","warn");
 if(!station)return toast("Enter your delivery station.","warn");
 if(!coach||!seat)return toast("Enter coach and seat/berth details.","warn");
 if(!passenger)return toast("Enter passenger name.","warn");
 if(!/^[6-9]\\d{9}$/.test(phone.replace(/\\D/g,"")))return toast("Enter a valid 10-digit Indian mobile number.","warn");
 if(!date)return toast("Select the delivery date.","warn");
 const items=cart.map(x=>({id:x.id,name:String(x.name||"Food"),price:Number(x.price)||0,quantity:1}));
 const total=items.reduce((sum,x)=>sum+x.price,0),id="GRF"+Date.now().toString(36).toUpperCase();
 if(!Array.isArray(state.foodOrders))state.foodOrders=[];
 const order={id,userId:session.id,trainNo,station,coach,seat,passenger,phone,date,items,total,status:"Request saved (demo)",createdAt:new Date().toLocaleString("en-IN"),tracking:[{status:"Request saved (demo)",time:new Date().toLocaleString("en-IN"),note:"Saved locally; not sent to a restaurant."}]};
 state.foodOrders.push(order);
 if(!save()){state.foodOrders.pop();return}
 try{localStorage.removeItem("gorail_cart")}catch(_e){}
 render();toast("Order request saved locally. No food has been ordered.","warn");
}

function complaintModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>New Complaint</h2><button class="close" onclick="closeModal()">×</button></div><div class="field"><label>Subject</label><input id="csub"></div><div class="field" style="margin-top:12px"><label>Message</label><textarea id="cmsg"></textarea></div><button class="btn primary" style="margin-top:14px" onclick="submitComplaint()">Submit Complaint</button></div></div>`;drawModal()}
function submitComplaint(){let subject=$("#csub").value.trim(),message=$("#cmsg").value.trim();if(!subject||!message)return toast("Enter subject and message.");state.complaints.push({id:"c"+Date.now(),userId:session.id,subject,message,status:"Open",date:new Date().toLocaleDateString("en-IN")});save();closeModal();render()}
function resolveComplaint(id){if(!requireAdmin())return;let c=state.complaints.find(x=>x.id===id);if(c)c.status="Resolved";save();render()}
function saveProfile(){
 const name=$("#pname").value.trim(),phone=$("#pphone").value.trim();
 if(!name||name.length>100){toast("Enter a name up to 100 characters.","warn");return}
 if(phone&&!/^\\+?[0-9 ()-]{7,20}$/.test(phone)){toast("Enter a valid phone number.","warn");return}
 const old={name:session.name,phone:session.phone};session.name=name;session.phone=phone;
 const u=state.users.find(x=>x.id===session.id);if(u){u.name=name;u.phone=phone}
 if(!save()){session.name=old.name;session.phone=old.phone;if(u){u.name=old.name;u.phone=old.phone}return}
 toast("Profile updated on this device.","success");render();
}

function trainModal(id){let t=id?state.trains.find(x=>x.id===id):{number:"",name:"",from:"",to:"",dep:"",arr:"",duration:"",fare:1000,seats:50,platform:"1",status:"On Time",classes:["1A","2A","3A"]};
 modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${id?"Edit":"Add"} Train</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid">
 ${["number","name","from","to","dep","arr","duration","fare","seats","platform"].map(k=>`<div class="field"><label>${k}</label><input id="t_${k}" value="${esc(t[k])}"></div>`).join("")}
 <div class="field"><label>Status</label><select id="t_status"><option ${t.status==="On Time"?"selected":""}>On Time</option><option ${t.status!=="On Time"?"selected":""}>Delayed 15m</option></select></div>
 </div><button class="btn primary" style="margin-top:15px" onclick="saveTrain('${id||""}')">Save Train</button></div></div>`;drawModal()}
function saveTrain(id){
 if(!requireAdmin())return;
 const o={id:id||Date.now().toString(),number:$("#t_number").value.trim(),name:$("#t_name").value.trim(),from:$("#t_from").value.trim(),to:$("#t_to").value.trim(),dep:$("#t_dep").value,arr:$("#t_arr").value,duration:$("#t_duration").value.trim(),fare:Number($("#t_fare").value),seats:Number($("#t_seats").value),platform:$("#t_platform").value.trim(),status:$("#t_status").value,classes:["1A","2A","3A","SL"]};
 if(!/^\\d{5}$/.test(o.number)||!o.name||!o.from||!o.to||o.from.toLowerCase()===o.to.toLowerCase()){toast("Enter a 5-digit train number, name, and different origin/destination.","warn");return}
 if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(o.dep)||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(o.arr)){toast("Enter valid departure and arrival times (HH:MM).","warn");return}
 if(!Number.isFinite(o.fare)||o.fare<0||!Number.isInteger(o.seats)||o.seats<0){toast("Fare and seat count must be valid non-negative numbers.","warn");return}
 const duplicate=state.trains.find(x=>x.number===o.number&&x.id!==id);if(duplicate){toast("A train with this number already exists.","warn");return}
 const i=state.trains.findIndex(x=>x.id===id);if(i>=0)state.trains[i]=o;else state.trains.push(o);
 if(!save())return;closeModal();render();toast("Train saved locally.","success");
}

function deleteTrain(id){if(!requireAdmin())return;if(!confirm("Delete this train?"))return;state.trains=state.trains.filter(t=>t.id!==id);save();render()}
let autoRailLoadPromise=null;
async function autoLoadRailDataset(){
 if(railDatasetLoaded()) return true;
 if(autoRailLoadPromise) return autoRailLoadPromise;
 autoRailLoadPromise=(async()=>{
  try{
   const result=await loadAllIndiaRailData();
   if(page==="search"||page==="map") render();
   if(result?.cached) console.info("Restored the complete railway dataset from this browser.");
   return true;
  }catch(e){
   console.warn("Automatic railway dataset load failed:",e);
   return false;
  }
 })();
 try{return await autoRailLoadPromise;}finally{autoRailLoadPromise=null;}
}
function resetSearch(){searchResults=[];goto("search")}
async function searchTrains(){
 let f=$("#sfrom").value.trim(), to=$("#sto").value.trim(), cl=$("#sclass").value;
 if(!railDatasetLoaded()){
  toast("Loading the complete Indian train database…");
  try{ await loadAllIndiaRailData(msg=>toast(msg)); }catch(e){ toast("Could not load Indian Railways dataset: "+(e.message||e),"warn"); return; }
 }
 const real=searchRealTrains(f,to,cl,100).map(t=>({...t,__real:true}));
 searchResults=(f||to||cl)?real:ALL_TRAINS_INDEX.slice(0,100).map(t=>({...t,__real:true}));
 if(!f&&!to&&!cl) toast("Showing the first 100 trains from the complete Indian Railways database.");
 if((f||to||cl)&&!real.length) toast("No timetable match found for the selected route.","warn");
 render();
}
async function searchLiveBetween(){
 const from=$("#sfrom").value.trim().toUpperCase(), to=$("#sto").value.trim().toUpperCase(), date=$("#sdate").value;
 const out=$("#results");
 if(!/^[A-Z0-9]{2,10}$/.test(from)||!/^[A-Z0-9]{2,10}$/.test(to)||from===to){toast("Enter two different station codes, for example NDLS and HWH.","warn");return}
 if(out) out.innerHTML=`<div class="card">Fetching live trains between stations…</div>`;
 try{
  const r=await GoRailAPI.trainsBetween({fromStationCode:from,toStationCode:to,dateOfJourney:date});
  const d=r?.data||r;
  const trains=d?.trains||d?.data||(Array.isArray(d)?d:[]);
  const rows=(Array.isArray(trains)?trains:[]).slice(0,40).map(t=>{
   const number=t.trainNumber||t.number||t.train_number||"";
   const name=t.trainName||t.name||t.train_name||"Train";
   return `<div class="card" style="margin-bottom:12px"><div class="actions" style="justify-content:space-between"><b>${esc(number)} · ${esc(name)}</b>${sourceBadge("live")}</div><p class="muted">${esc(from)} → ${esc(to)}</p></div>`;
  }).join("");
  if(out) out.innerHTML=rows||`<div class="card"><span class="pill ok">LIVE</span><pre style="white-space:pre-wrap">${esc(JSON.stringify(d,null,2)).slice(0,1800)}</pre></div>`;
 }catch(e){ if(out) out.innerHTML=`<div class="notice warn">Live trains-between failed: ${esc(e.message||e)}</div>`; }
}

goRailAuth.onAuthStateChanged(async user=>{
 if(!user){session=null;localStorage.removeItem("gorail_session");render();return}
 if(!user.emailVerified){try{await goRailAuth.signOut()}catch(e){} session=null;render();return}
 const email=(user.email||"").toLowerCase();
 if(!isValidEmail(email)){try{await goRailAuth.signOut()}catch(e){} session=null;render();return}
 const savedUser=state.users.find(x=>String(x.email).toLowerCase()===email)||{};
 let role="passenger";
 try{
  const token=await user.getIdTokenResult();
  if(token.claims.admin===true || token.claims.role==="admin") role="admin";
 }catch(_e){}
 session={id:user.uid,name:savedUser.name||user.displayName||email.split("@")[0],email,phone:savedUser.phone||"",role};
 let isNewBrowser=false;
 const deviceKey="gorail_seen_device_"+user.uid;
 try{
  if(localStorage.getItem(deviceKey)!=="1"){
   isNewBrowser=true;
   localStorage.setItem(deviceKey,"1");
  }
 }catch(_e){}
 save();render();
 if(isNewBrowser){
  modal='<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>🔐 New device sign-in</h2><button class="close" onclick="closeModal()">×</button></div><div class="notice warn">This browser has not signed in to your GoRail account before.</div><p>If you just logged in on a new phone or computer, you can continue using GoRail.</p><p><b>If this was not you:</b> change your account password and secure your email account.</p><button class="btn primary" style="width:100%" onclick="closeModal()">Continue</button></div></div>';
  drawModal();
 }
 setTimeout(()=>autoLoadRailDataset(),600);
});
render();drawModal();
// Automatically load the complete timetable after a verified passenger/admin session.
// Cached data is reused when available; otherwise the deployed Vercel app downloads and indexes it.
setTimeout(()=>{ if(session) autoLoadRailDataset(); },1200);
// Refresh live train position every 60 seconds while the Live Map page is open.
clearInterval(mapRefreshTimer);
mapRefreshTimer=setInterval(()=>{ if(session && page==="map" && $("#mapTrainQuery")?.value?.trim()) trackTrainOnMap(); },60000);
setInterval(()=>{const {ac,nonAc}=tatkalCountdown();const a=$("#tatkalAc"),n=$("#tatkalNonAc");if(a)a.textContent=ac;if(n)n.textContent=nonAc;},1000);
