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
  notifications:[{id:"n1",title:"Welcome to GoRail",body:"Search trains, check availability and manage your journey from one place.",date:"Today"}],
  broadcasts:[],
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
  ["dashboard","📊","Dashboard"],["manage-trains","🚆","Manage Trains"],["complaints","🛠️","Complaints"],["broadcast","📢","Broadcast Notice"]
 ]:[
  ["dashboard","🏠","Home"],["search","🔎","Train Enquiry"],["map","🗺️","Live Map"],["bookings","🎫","My Tickets"],["pnr","🔢","PNR Status"],
  ["live","📍","Live Status"],["stations","🚉","Station Info"],["food","🍱","Order Food"],["complaints","📝","Complaints"],
  ["notifications","🔔","Notifications"],["profile","👤","Profile"]
 ]}
function shell(){
 const admin=session?.role==="admin";
 return `<header class="topbar"><div class="brand">${icon("🚆")} GoRail</div><div class="top-actions">
   ${liveBadge()}
   <button class="btn small theme-toggle" title="Toggle dark mode" onclick="toggleTheme()">${document.documentElement.getAttribute("data-theme")==="dark"?"☀️":"🌙"}</button>
   <button class="btn small gear" title="Live data settings" onclick="settingsModal()">⚙️</button>
   <button class="btn small" onclick="goto('notifications')">🔔</button>
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
  case "notifications": return notificationsPage();
  case "profile": return profilePage();
  case "fare": return farePage();
  case "seat": return seatPage();
  case "special": return specialPage();
  case "emergency": return emergencyPage();
  case "manage-trains": return manageTrainsPage();
  case "broadcast": return broadcastPage();
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
 <div class="card"><h3>Latest notice</h3><p>${esc(state.broadcasts.at(-1)?.message||"No new railway notice.")}</p></div></div>`;
}
function adminDashboard(){return pageTitle("Railway Operations & Management Dashboard","Quick Admin Operations")
 +`<div class="grid g4">${[
 ["🚆","Total Trains",state.trains.length],["🎫","Bookings",state.bookings.length],["📝","Complaints",state.complaints.length],["📢","Notices",state.broadcasts.length]
 ].map(x=>`<div class="card"><div style="font-size:26px">${x[0]}</div><div class="muted">${x[1]}</div><div class="stat">${x[2]}</div></div>`).join("")}</div>
 <div class="card" style="margin-top:18px"><h3>Quick Admin Operations</h3><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="goto('manage-trains')">Manage Trains</button><button class="btn" onclick="goto('complaints')">Complaints</button><button class="btn" onclick="goto('broadcast')">Broadcast Notice</button></div></div>`}
function searchPage(){
  const loaded = railDatasetLoaded();
  const stationOptions = (ALL_STATIONS.length ? ALL_STATIONS : STATIONS_DB).map(s => '<option value="' + esc(s.name) + '">' + esc(s.code || "") + '</option>').join("");
  const datasetText = loaded ? "Loaded " + ALL_TRAINS_INDEX.length.toLocaleString() + " trains and " + ALL_STATIONS.length.toLocaleString() + " stations. Route stops are read from the timetable schedules." : "The complete open timetable is loaded on demand.";
  const resultsHtml = searchResults.length ? searchResults.map(trainResult).join("") : '<div class="empty">Load the database, then enter stations to find trains.</div>';
  return pageTitle("Train Enquiry","Search the complete Indian train timetable by actual route stops", '<button class="btn" onclick="resetSearch()">Reset</button>') +
    '<div class="card"><datalist id="stationList">' + stationOptions + '</datalist>' +
    '<div class="form-grid"><div class="field"><label>From station / code</label><input id="sfrom" list="stationList" placeholder="e.g. NDLS or New Delhi"></div>' +
    '<div class="field"><label>To station / code</label><input id="sto" list="stationList" placeholder="e.g. HWH or Howrah"></div>' +
    '<div class="field"><label>Date</label><input id="sdate" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div>' +
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
function stationsPage(){let ss=["Mumbai Central","New Delhi","Bengaluru","Howrah","Hyderabad","Bhubaneswar","Khurda Road","Cuttack"];return pageTitle("Station Info","Facilities, platforms and operational information",`<span class="weather-chip">🌦️ Live weather (Open-Meteo)</span>`)
 +`<div class="grid g3">${ss.map((s,i)=>`<div class="card"><h3>🚉 ${s}</h3><p class="muted">Station code: ${["MMCT","NDLS","SBC","HWH","HYB","BBS","KUR","CTC"][i]}</p><div class="pill ok">Open</div><div id="wx-${i}" class="muted" style="margin:8px 0">Loading live weather…</div><p>Platforms: ${3+(i%6)} · Food · Waiting room · Help desk</p><button class="btn small" onclick="toast('Station information for ${s}: platform and service details available.')">View Details</button></div>`).join("")}</div>`}
function loadStationsWeather(){let ss=["Mumbai Central","New Delhi","Bengaluru","Howrah","Hyderabad","Bhubaneswar","Khurda Road","Cuttack"];
 ss.forEach(async(s,i)=>{const w=await stationWeather(s);const el=$("#wx-"+i);if(!el)return;el.innerHTML=w?`<span class="weather-chip">☁️ ${Math.round(w.temp)}°C · ${esc(w.desc)}</span>`:"Weather unavailable";});}
function foodPage(){return pageTitle("Order Food","Sample menu saved on this device. This does not place a railway catering order.",sourceBadge("device"))
 +`<div class="grid g4">${state.food.map(f=>`<div class="card"><div style="font-size:30px">🍱</div><h3>${esc(f.name)}</h3><div class="muted">${f.cat}</div><div style="font-weight:800;margin:12px 0">₹${f.price}</div><button class="btn primary small" onclick="addFood('${f.id}')">Add</button></div>`).join("")}</div><div class="card" style="margin-top:18px"><h3>Current Food Order</h3><div id="foodCart">No items selected.</div></div>`}
function complaintsPage(){if(session.role==="admin")return adminComplaints();return pageTitle("Complaints & Support","Submit and track passenger complaints",`<button class="btn primary" onclick="complaintModal()">New Complaint</button>`)
 +`<div class="grid g2">${state.complaints.filter(c=>c.userId===session.id).map(c=>`<div class="card"><div class="actions" style="justify-content:space-between"><b>${esc(c.subject)}</b><span class="pill ${c.status==="Resolved"?"ok":"warn"}">${c.status}</span></div><p>${esc(c.message)}</p><small class="muted">${c.date}</small></div>`).join("")||`<div class="card empty">No complaints submitted.</div>`}</div>`}
function adminComplaints(){return pageTitle("Manage Complaints","Review and update passenger complaints")
 +`<div class="card"><table class="table"><thead><tr><th>Subject</th><th>Message</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.complaints.map(c=>`<tr><td>${esc(c.subject)}</td><td>${esc(c.message)}</td><td><span class="pill ${c.status==="Resolved"?"ok":"warn"}">${c.status}</span></td><td><button class="btn small success" onclick="resolveComplaint('${c.id}')">Resolve</button></td></tr>`).join("")||`<tr><td colspan="4" class="empty">No complaints.</td></tr>`}</tbody></table></div>`}
function notificationsPage(){return pageTitle("Notifications","Journey and railway notices")
 +`<div class="grid g2">${[...state.notifications,...state.broadcasts.map((b,i)=>({id:"b"+i,title:"Railway Notice",body:b.message,date:b.date}))].reverse().map(n=>`<div class="card"><h3>🔔 ${esc(n.title)}</h3><p>${esc(n.body)}</p><small class="muted">${esc(n.date)}</small></div>`).join("")}</div>`}
function profilePage(){return pageTitle("Profile","Manage your passenger account")
 +`<div class="card"><div class="form-grid"><div class="field"><label>Name</label><input id="pname" value="${esc(session.name)}"></div><div class="field"><label>Phone</label><input id="pphone" value="${esc(session.phone||"")}"></div><div class="field"><label>Email</label><input value="${esc(session.email)}" disabled></div></div><button class="btn primary" style="margin-top:14px" onclick="saveProfile()">Save Profile</button></div>`}
function farePage(){return pageTitle("Fare Enquiry","Estimate fare using the same train/class selection logic",liveBadge())
 +`<div class="card"><div class="form-grid"><div class="field"><label>Train</label><select id="fareTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="fareClass"><option>1A</option><option>2A</option><option>3A</option><option>SL</option></select></div><div class="field"><label>Passengers</label><input id="farePax" type="number" min="1" max="6" value="1"></div>
 ${hasLiveData()?`<div class="field"><label>From code</label><input id="fareFrom" placeholder="e.g. NDLS"></div><div class="field"><label>To code</label><input id="fareTo" placeholder="e.g. HWH"></div>`:""}</div><button class="btn primary" style="margin-top:14px" onclick="calcFare()">Calculate Fare</button><div id="fareOut" style="margin-top:18px"></div></div>`}
function seatPage(){return pageTitle("Seat Availability","Check class-wise availability",liveBadge())
 +`<div class="card"><div class="field"><label>Train</label><select id="seatTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div>
 ${hasLiveData()?`<div class="form-grid" style="margin-top:12px"><div class="field"><label>From station code</label><input id="seatFrom" placeholder="e.g. NDLS"></div><div class="field"><label>To station code</label><input id="seatTo" placeholder="e.g. HWH"></div><div class="field"><label>Class</label><select id="seatClass"><option>SL</option><option>3A</option><option>2A</option><option>1A</option></select></div><div class="field"><label>Date</label><input id="seatDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div></div>`:""}
 <button class="btn primary" style="margin-top:12px" onclick="showSeats()">Check Availability</button><div id="seatOut" style="margin-top:18px"></div></div>`}
function specialPage(){return pageTitle("Special Trains","Seasonal and special service listing")
 +`<div class="grid g2">${state.trains.slice(0,3).map((t,i)=>`<div class="card"><span class="pill warn">SPECIAL SERVICE</span><h3 style="margin-top:10px">${t.number} · ${esc(t.name)}</h3><p>${esc(t.from)} → ${esc(t.to)}</p><p class="muted">Sample listing from the demo train set. Check live status before travel.</p><button class="btn primary small" onclick="bookTrain('${t.id}')">Save enquiry</button></div>`).join("")}</div>`}
function emergencyPage(){return pageTitle("Emergency Help","Quick-access railway support contacts")
 +`<div class="grid g3">${[["🚨","Railway Security","139"],["🏥","Medical Emergency","112"],["📞","Railway Helpline","139"],["🛡️","RPF","182"],["🔥","Fire Emergency","101"],["ℹ️","Railway Enquiry","139"]].map(x=>`<div class="card"><div style="font-size:30px">${x[0]}</div><h3>${x[1]}</h3><p class="muted">Emergency contact</p><a class="btn primary" href="tel:${x[2]}">Call ${x[2]}</a></div>`).join("")}</div>`}
function manageTrainsPage(){return pageTitle("Manage Trains","Add, edit and delete train records",`<button class="btn primary" onclick="trainModal()">+ Add Train</button>`)
 +`<div class="card"><table class="table"><thead><tr><th>Train</th><th>Route</th><th>Departure</th><th>Arrival</th><th>Seats</th><th>Action</th></tr></thead><tbody>${state.trains.map(t=>`<tr><td><b>${t.number}</b><br>${esc(t.name)}</td><td>${esc(t.from)} → ${esc(t.to)}</td><td>${t.dep}</td><td>${t.arr}</td><td>${t.seats}</td><td><button class="btn small" onclick="trainModal('${t.id}')">Edit</button> <button class="btn danger small" onclick="deleteTrain('${t.id}')">Delete</button></td></tr>`).join("")}</tbody></table></div>`}
function broadcastPage(){return pageTitle("Broadcast Notice","Send a notice to passenger notification feeds")
 +`<div class="card"><div class="field"><label>Notice</label><textarea id="broadcastText" placeholder="Enter railway notice..."></textarea></div><button class="btn primary" style="margin-top:12px" onclick="sendBroadcast()">Broadcast Notice</button></div>
 <div class="card" style="margin-top:18px"><h3>Previous notices</h3>${state.broadcasts.slice().reverse().map(b=>`<p><b>${b.date}</b> — ${esc(b.message)}</p>`).join("")||"<p class='muted'>No notices.</p>"}</div>`}

function mapPage(){
 const loaded=railDatasetLoaded();
 return pageTitle("Live Map","Real route + train position on a map",`${liveBadge()} <span class="live-badge ${hasGoogleMaps()?"":"off"}">${hasGoogleMaps()?"GOOGLE MAPS":"OPENSTREETMAP"}</span>`)
 +`<div class="card">
  ${loaded?`<div class="notice">✅ Searching across all <b>${ALL_TRAINS_INDEX.length.toLocaleString()}</b> real Indian trains.</div>`:
   `<div class="notice warn">All-India dataset not loaded yet — searching only the ${state.trains.length} demo trains. <button class="btn small" onclick="settingsModal()">Load all India trains (⚙️ Settings)</button></div>`}
  <div class="field autocomplete" style="margin-top:14px"><label>Train number or name</label><input id="mapTrainQuery" placeholder="e.g. 12951 or Rajdhani" oninput="mapSuggest()" autocomplete="off"><div id="mapAcList"></div></div>
  <div class="field" style="margin-top:12px"><label>Journey date (for schedule-based position, if not live)</label><input id="mapDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
  <button class="btn primary" style="margin-top:12px" onclick="trackTrainOnMap()">Track on Map</button>
 </div>
 <div id="mapResultInfo" style="margin-top:16px"></div>
 <div class="card" style="margin-top:16px;padding:0;overflow:hidden"><div id="trainMapEl" style="height:440px"></div></div>`;
}
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
 const q=$("#mapTrainQuery").value.trim(),date=$("#mapDate").value,info=$("#mapResultInfo");
 if(!q){toast("Enter a train number.");return}
 let real=railDatasetLoaded()?ALL_TRAINS_INDEX.find(t=>t.number===q)||searchAllTrains(q,1)[0]:null;
 let demo=state.trains.find(t=>t.number===q||t.id===q||t.name.toLowerCase().includes(q.toLowerCase()));
 if(!real&&!demo&&!/^\\d{5}$/.test(q)){info.innerHTML=`<div class="notice warn">Train not found. ${railDatasetLoaded()?"Check the number/name.":"Load the all-India dataset in Settings to search every real train."}</div>`;return}
 info.innerHTML=`<div class="card">Locating train…</div>`;
 let route=null,routeData=null,fromName="",toName="",distance=null,durH=0,durM=0,dep="00:00",number="",name="",classes=[];
 if(real){
  number=real.number;name=real.name;fromName=real.from_name||"";toName=real.to_name||"";
  distance=real.distance;durH=real.duration_h;durM=real.duration_m;dep=real.departure||"00:00";classes=real.classes||[];
  route=getTrainRoute(real.number);
 }else{
  number=demo?.number||q;name=demo?.name||number;fromName=demo?.from||"";toName=demo?.to||"";dep=demo?.dep||"00:00";classes=demo?.classes||[];
  const fS=demo?findStation(demo.from):null,tS=demo?findStation(demo.to):null;
  route=fS&&tS?[[fS.lon,fS.lat],[tS.lon,tS.lat]]:null;
  const dm=(demo?.duration||"").match(/(\d+)h\s*(\d+)?/);durH=dm?+dm[1]:0;durM=dm&&dm[2]?+dm[2]:0;
 }
 const livePromise=GoRailAPI.liveStatus(number,"1",date||undefined).then(value=>({value})).catch(error=>({error}));
 if(!route || route.length<2){
  try{
   const rr=await GoRailAPI.trainRoute(number);
   routeData=rr&&(rr.data||rr);
   const geo=routeData&&(routeData.geojson&&routeData.geojson.geometry&&routeData.geojson.geometry.coordinates||(routeData.geometry&&routeData.geometry.coordinates));
   const coords=routeData&&routeData.coordinates;
   if(Array.isArray(geo)&&geo.length>1)route=geo.map(p=>[Number(p[0]),Number(p[1])]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
   else if(Array.isArray(coords)&&coords.length>1)route=coords.map(p=>[Number(p[1]),Number(p[0])]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
   const stopList=routeData&&(routeData.stops||routeData.stations||routeData.route);
   if((!route||route.length<2)&&Array.isArray(stopList))route=stopList.filter(s=>Number.isFinite(Number(s.lat??s.latitude))&&Number.isFinite(Number(s.lng??s.lon??s.longitude))).map(s=>[Number(s.lng??s.lon??s.longitude),Number(s.lat??s.latitude)]);
   const src=routeData?.train?.source, dst=routeData?.train?.destination;
   if(src?.name) fromName=fromName||src.name;
   if(dst?.name) toName=toName||dst.name;
  }catch(e){console.warn("RailRadar route lookup:",e)}
 }
 let posLabel="Estimated position (based on timetable)",trainPoint=null,liveData=null;
 try{
  const liveResult=await livePromise;
  if(liveResult.error)throw liveResult.error;
  const r=liveResult.value,d=r?.data||r;
  liveData=d;
  // RailRadar can return authoritative route geometry with the live response.
  // Prefer that geometry so the map follows the actual railway path instead of a straight line.
  const liveGeo=d?.geometry?.coordinates || d?.routeGeometry?.coordinates || d?.geometry || d?.routeGeometry;
  if(Array.isArray(liveGeo)&&liveGeo.length>1&&Array.isArray(liveGeo[0])){
   const candidate=liveGeo.map(p=>Array.isArray(p)?[Number(p[0]),Number(p[1])]:null).filter(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
   if(candidate.length>1) route=candidate;
  }
  if(d?.trainName||d?.train?.name) name=d.trainName||d.train.name;
  if(d?.train?.source?.name) fromName=d.train.source.name;
  if(d?.train?.destination?.name) toName=d.train.destination.name;
  const pos=d?.currentLocation||d?.current_position||d?.currentPosition||{};
  const stCode=pos.stationCode||pos.station_code||d?.current_station_code||d?.current_station||d?.station_code||d?.last_station_code;
  const stName=pos.stationName||pos.station_name||d?.current_station_name||d?.station_name;
  const st=(stCode&&typeof findRealStation==="function"&&findRealStation(stCode))||(stName&&typeof findRealStation==="function"&&findRealStation(stName));
  const routeStops=[...(routeData?.stops||[]), ...(Array.isArray(d?.route)?d.route:[])];
  const liveStop=routeStops.find(s=>String(s.code||s.stationCode||"").toUpperCase()===String(stCode||"").toUpperCase());
  const src=d?.train?.source, dst=d?.train?.destination;
  const endpoint=[src,dst].find(s=>s && String(s.code||"").toUpperCase()===String(stCode||"").toUpperCase());
  const lat=pos.latitude??pos.lat??liveStop?.lat??liveStop?.latitude??endpoint?.lat??endpoint?.latitude;
  const lon=pos.longitude??pos.lng??pos.lon??liveStop?.lng??liveStop?.lon??liveStop?.longitude??endpoint?.lng??endpoint?.lon??endpoint?.longitude;
  if(lat!=null&&lon!=null&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lon))){
   trainPoint={lat:Number(lat),lon:Number(lon)};
   posLabel="Live position — "+(stName||stCode||"last reported station");
  }else if(st&&Number.isFinite(Number(st.lat))&&Number.isFinite(Number(st.lon))){
   trainPoint={lat:Number(st.lat),lon:Number(st.lon)};
   posLabel="Live position — "+(stName||stCode||"last reported station");
  }
 }catch(e){console.warn("GoRail live position unavailable:",e)}
 if(!trainPoint) posLabel="Timetable route only. Live position was not returned.";
 if(!trainPoint && !(route?.length>=2)){
  info.innerHTML=`<div class="notice warn">Live position was not returned, and no timetable route is available for this train.</div>`;return;
 }
 const stops=route?.length>=2?[route[0],route[route.length-1]].map((c,i)=>({lat:c[1],lon:c[0],name:i===0?fromName:toName})):[];
 try{
  await renderTrainMap("trainMapEl",{routeCoords:route||[],trainPoint,stationStops:stops,trainLabel:`${number} · ${name}`});
 }catch(e){
  console.error("GoRail map rendering failed:",e);
  const mapEl=$("#trainMapEl");if(mapEl)mapEl.innerHTML=`<div class="notice warn">Map could not load. Check your internet connection and allow the OpenStreetMap/Leaflet map resources.</div>`;
 }
 const live=posLabel.startsWith("Live ");
 info.innerHTML=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">${esc(number)} · ${esc(name)}</h3><span class="live-badge ${live?"":"off"}"><span class="dot"></span>${live?"LIVE POSITION":"ESTIMATED POSITION"}</span></div>
 <p>${esc(fromName)} → ${esc(toName)}${distance?` · ${distance} km`:""} · ${durH||0}h ${durM||0}m</p>
 ${classes.length?`<div class="actions">${classes.map(c=>`<span class="pill">${esc(c)}</span>`).join("")}</div>`:""}
 <p class="muted" style="margin-top:8px">${esc(posLabel)}${liveData?.lastUpdatedAt?` · Updated ${esc(liveData.lastUpdatedAt)}`:""}</p>
 ${!live?`<p class="muted">The line is the timetable route. A train marker appears only when RailRadar returns a live position.</p>`:""}
 </div>`;
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
   await cred.user.sendEmailVerification();
   await goRailAuth.signOut();
   toast("Please verify your email using the link sent to your Gmail before logging in.","warn");
   return;
  }
  const savedUser=state.users.find(x=>String(x.email).toLowerCase()===email)||{};
  session={id:cred.user.uid,name:savedUser.name||cred.user.displayName||email.split("@")[0],email,phone:savedUser.phone||"",role:"passenger"};
  save();goto("dashboard");
 }catch(e){toast(e.code==="auth/user-not-found"||e.code==="auth/wrong-password"||e.code==="auth/invalid-credential"?"Invalid Gmail or password.":e.message||"Login failed.","warn")}
}
async function logout(){try{await goRailAuth.signOut()}catch(e){} session=null;render()}
function registerModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Create Account</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid"><div class="field"><label>Name</label><input id="rname"></div><div class="field"><label>Phone</label><input id="rphone"></div><div class="field"><label>Email</label><input id="remail"></div><div class="field"><label>Password</label><input id="rpass" type="password"></div></div><button class="btn primary" style="margin-top:15px" onclick="register()">Register</button></div></div>`;drawModal()}
async function register(){let name=$("#rname").value.trim(),email=$("#remail").value.trim().toLowerCase(),pass=$("#rpass").value,phone=$("#rphone").value.trim();
 if(!name||!email||!pass){toast("Please fill required fields.","warn");return}
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
 }catch(e){toast(e.code==="auth/email-already-in-use"?"This Gmail is already registered. Please log in.":e.code==="auth/weak-password"?"Choose a stronger password.":e.message||"Registration failed.","warn")}
}
function closeModal(){modal=null;drawModal()}
function drawModal(){let old=$("#modalRoot");if(old)old.remove();if(modal){let d=document.createElement("div");d.id="modalRoot";d.innerHTML=modal;document.body.appendChild(d)}}
function bookTrain(id){let t=state.trains.find(x=>x.id===id);if(!t)return;modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Save enquiry</h2><button class="close" onclick="closeModal()">×</button></div><div class="notice warn">This stores a quote on this device. It does not reserve a berth and it does not create an IRCTC PNR.</div><div class="notice">${t.number} · ${esc(t.name)} · ${esc(t.from)} → ${esc(t.to)}</div><div class="form-grid" style="margin-top:15px"><div class="field"><label>Passenger Name</label><input id="bname" value="${esc(session.name)}"></div><div class="field"><label>Age</label><input id="bage" type="number" value="21"></div><div class="field"><label>Class</label><select id="bclass">${t.classes.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="field"><label>Gender</label><select id="bgender"><option>Male</option><option>Female</option><option>Other</option></select></div></div><button class="btn primary" style="margin-top:15px;width:100%" onclick="confirmBooking('${t.id}')">Save enquiry · quoted ₹${t.fare}</button></div></div>`;drawModal()}
function confirmBooking(id){let t=state.trains.find(x=>x.id===id);let p={name:$("#bname").value,age:+$("#bage").value,gender:$("#bgender").value};let cls=$("#bclass").value;
 if(!p.name||!p.age){toast("Enter passenger details.");return}
 let b={id:"enq"+Date.now(),kind:"enquiry",userId:session.id,trainId:id,train:{...t},passenger:p,className:cls,fare:t.fare,ref:"ENQ"+Date.now().toString(36).toUpperCase(),status:"Saved enquiry",source:"device",date:new Date().toLocaleDateString("en-IN")};
 state.bookings.push(b);state.notifications.push({id:"n"+Date.now(),title:"Enquiry saved",body:`${b.ref} for ${t.name}. Not an IRCTC ticket.`,date:b.date});save();closeModal();toast("Enquiry saved on this device.","success");ticketDetail(b.id)}
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

function addFood(id){let f=state.food.find(x=>x.id===id),cart=JSON.parse(localStorage.getItem("gorail_cart")||"[]");cart.push(f);localStorage.setItem("gorail_cart",JSON.stringify(cart));let total=cart.reduce((s,x)=>s+x.price,0);$("#foodCart").innerHTML=cart.map(x=>`<p>${x.name} — ₹${x.price}</p>`).join("")+`<hr><b>Total ₹${total}</b><br><button class="btn primary small" style="margin-top:10px" onclick="placeFood()">Place Order</button>`}
function placeFood(){localStorage.removeItem("gorail_cart");state.notifications.push({id:"f"+Date.now(),title:"Sample food list saved",body:"Saved on this device. This is not a railway catering order.",date:new Date().toLocaleDateString("en-IN")});save();toast("Sample list saved on this device.");goto("notifications")}
function complaintModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>New Complaint</h2><button class="close" onclick="closeModal()">×</button></div><div class="field"><label>Subject</label><input id="csub"></div><div class="field" style="margin-top:12px"><label>Message</label><textarea id="cmsg"></textarea></div><button class="btn primary" style="margin-top:14px" onclick="submitComplaint()">Submit Complaint</button></div></div>`;drawModal()}
function submitComplaint(){let subject=$("#csub").value.trim(),message=$("#cmsg").value.trim();if(!subject||!message)return toast("Enter subject and message.");state.complaints.push({id:"c"+Date.now(),userId:session.id,subject,message,status:"Open",date:new Date().toLocaleDateString("en-IN")});save();closeModal();render()}
function resolveComplaint(id){if(!requireAdmin())return;let c=state.complaints.find(x=>x.id===id);if(c)c.status="Resolved";save();render()}
function saveProfile(){session.name=$("#pname").value.trim()||session.name;session.phone=$("#pphone").value.trim();let u=state.users.find(x=>x.id===session.id);if(u){u.name=session.name;u.phone=session.phone}save();toast("Profile updated.");render()}
function trainModal(id){let t=id?state.trains.find(x=>x.id===id):{number:"",name:"",from:"",to:"",dep:"",arr:"",duration:"",fare:1000,seats:50,platform:"1",status:"On Time",classes:["1A","2A","3A"]};
 modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${id?"Edit":"Add"} Train</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid">
 ${["number","name","from","to","dep","arr","duration","fare","seats","platform"].map(k=>`<div class="field"><label>${k}</label><input id="t_${k}" value="${esc(t[k])}"></div>`).join("")}
 <div class="field"><label>Status</label><select id="t_status"><option ${t.status==="On Time"?"selected":""}>On Time</option><option ${t.status!=="On Time"?"selected":""}>Delayed 15m</option></select></div>
 </div><button class="btn primary" style="margin-top:15px" onclick="saveTrain('${id||""}')">Save Train</button></div></div>`;drawModal()}
function saveTrain(id){if(!requireAdmin())return;let o={id:id||Date.now().toString(),number:$("#t_number").value,name:$("#t_name").value,from:$("#t_from").value,to:$("#t_to").value,dep:$("#t_dep").value,arr:$("#t_arr").value,duration:$("#t_duration").value,fare:+$("#t_fare").value,seats:+$("#t_seats").value,platform:$("#t_platform").value,status:$("#t_status").value,classes:["1A","2A","3A","SL"]};if(!o.number||!o.name||!o.from||!o.to)return toast("Fill train details.");let i=state.trains.findIndex(x=>x.id===id);if(i>=0)state.trains[i]=o;else state.trains.push(o);save();closeModal();render()}
function deleteTrain(id){if(!requireAdmin())return;if(!confirm("Delete this train?"))return;state.trains=state.trains.filter(t=>t.id!==id);save();render()}
function sendBroadcast(){if(!requireAdmin())return;let m=$("#broadcastText").value.trim();if(!m)return toast("Enter a notice.");state.broadcasts.push({id:"br"+Date.now(),message:m,date:new Date().toLocaleDateString("en-IN")});state.notifications.push({id:"bn"+Date.now(),title:"Railway Notice",body:m,date:new Date().toLocaleDateString("en-IN")});save();toast("Notice broadcasted.");render()}
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
 save();render();
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
