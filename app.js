const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>[...root.querySelectorAll(s)];
const KEY="gorail_web_state_v1";
const seed={
  users:[{id:"u1",name:"Demo Passenger",email:"passenger@gorail.app",password:"123456",phone:"9876543210",role:"passenger"}],
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
let state=JSON.parse(localStorage.getItem(KEY)||"null")||seed;
let session=JSON.parse(localStorage.getItem("gorail_session")||"null");
let page="dashboard", modal=null, searchResults=[];
loadCachedIndex();
function save(){localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem("gorail_session",JSON.stringify(session))}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function icon(x){return `<span>${x}</span>`}
function toast(msg,type="info"){let r=$("#toastRoot");if(!r){r=document.createElement("div");r.id="toastRoot";r.className="toast-stack";document.body.appendChild(r)}
 let t=document.createElement("div");t.className="toast "+(type==="success"?"success":type==="warn"?"warn":"");t.textContent=msg;r.appendChild(t);setTimeout(()=>t.remove(),3800)}
function toggleTheme(){let cur=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",cur);localStorage.setItem("gorail_theme",cur);render()}
function liveBadge(){let on=hasLiveData();return `<span class="live-badge ${on?"":"off"}" title="${on?"Connected to live Indian Railways data (RapidAPI)":"Running on demo data — add a RapidAPI key in Settings for real live data"}"><span class="dot"></span>${on?"LIVE DATA":"DEMO DATA"}</span>`}
function settingsModal(){let k=getApiKey(),gk=getGMapsKey();modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>⚙️ Live Data Settings</h2><button class="close" onclick="closeModal()">×</button></div>
 <p class="muted">GoRail can pull <b>real</b> Indian Railways data (live running status, PNR status, seat availability, fare) through the <b>irctc1</b> API on RapidAPI. Paste your own personal RapidAPI key below — it's stored only in this browser (localStorage), never sent anywhere but RapidAPI's servers.</p>
 <div class="field" style="margin-top:14px"><label>RapidAPI Key</label><input id="apiKeyInput" placeholder="paste your RapidAPI key" value="${esc(k)}"></div>
 <div class="actions" style="margin-top:14px"><button class="btn primary" onclick="saveApiKey()">Save Key</button>${k?`<button class="btn danger" onclick="clearApiKey()">Remove Key</button>`:""}</div>
 <div class="notice" style="margin-top:16px">Don't have a key? Get a free-tier key at <b>rapidapi.com</b> (search "irctc1"). Without a key, GoRail keeps working with clearly-labelled demo data — nothing breaks.<br><br>✅ Live station weather works with <b>no key at all</b> (free public Open-Meteo API), and already appears on Live Status and Station Info.</div>
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
function saveApiKey(){setApiKey($("#apiKeyInput").value);closeModal();toast(hasLiveData()?"Live data connected.":"Key cleared — using demo data.","success");render()}
function clearApiKey(){setApiKey("");closeModal();toast("Live data disconnected — using demo data.");render()}
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
 <div class="form-grid" style="margin-top:22px"><div class="field" style="grid-column:1/-1"><label>Email</label><input id="lemail" value="passenger@gorail.app"></div>
 <div class="field" style="grid-column:1/-1"><label>Password</label><input id="lpass" type="password" value="123456"></div></div>
 <button class="btn primary" style="width:100%;margin-top:16px" onclick="login()">Login</button>
 <button class="btn" style="width:100%;margin-top:10px" onclick="registerModal()">Create passenger account</button>
 <div class="notice" style="margin-top:16px">Demo admin: <b>admin@gorail.app</b> / <b>admin123</b></div>
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
 <div class="card"><h3>Upcoming journey</h3><p class="muted">Your confirmed bookings appear here.</p>${state.bookings.filter(b=>b.userId===session.id&&b.status==="Confirmed").slice(0,1).map(ticketMini).join("")||"<div class='empty'>No upcoming tickets</div>"}</div>
 <div class="card"><h3>Smart travel tools</h3><p>Compare fares, check route stops, coach position and platform information.</p><div class="actions"><button class="btn small" onclick="goto('fare')">Fare</button><button class="btn small" onclick="goto('special')">Special trains</button></div></div>
 <div class="card"><h3>Latest notice</h3><p>${esc(state.broadcasts.at(-1)?.message||"No new railway notice.")}</p></div></div>`;
}
function adminDashboard(){return pageTitle("Railway Operations & Management Dashboard","Quick Admin Operations")
 +`<div class="grid g4">${[
 ["🚆","Total Trains",state.trains.length],["🎫","Bookings",state.bookings.length],["📝","Complaints",state.complaints.length],["📢","Notices",state.broadcasts.length]
 ].map(x=>`<div class="card"><div style="font-size:26px">${x[0]}</div><div class="muted">${x[1]}</div><div class="stat">${x[2]}</div></div>`).join("")}</div>
 <div class="card" style="margin-top:18px"><h3>Quick Admin Operations</h3><div class="actions" style="margin-top:14px"><button class="btn primary" onclick="goto('manage-trains')">Manage Trains</button><button class="btn" onclick="goto('complaints')">Complaints</button><button class="btn" onclick="goto('broadcast')">Broadcast Notice</button></div></div>`}
function searchPage(){
 return pageTitle("Train Enquiry","Search the complete Indian train timetable by actual route stops",`<button class="btn" onclick="resetSearch()">Reset</button>`)
 +`<div class="card"><datalist id="stationList">${(ALL_STATIONS.length?ALL_STATIONS:STATIONS_DB).map(s=>`<option value="${esc(s.name)}">${esc(s.code||"")}</option>`).join("")}</datalist>
 <div class="form-grid"><div class="field"><label>From station / code</label><input id="sfrom" list="stationList" placeholder="e.g. NDLS or New Delhi"></div>
 <div class="field"><label>To station / code</label><input id="sto" list="stationList" placeholder="e.g. HWH or Howrah"></div>
 <div class="field"><label>Date</label><input id="sdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
 <div class="field"><label>Class</label><select id="sclass"><option value="">Any class</option><option>1A</option><option>2A</option><option>3A</option><option>SL</option><option>CC</option><option>2S</option></select></div></div>
 <div class="actions" style="margin-top:15px"><button class="btn primary" onclick="searchTrains()">Search All Indian Trains</button><button class="btn" onclick="loadFullDataset()">Load / Refresh Indian Railways Data</button></div>
 <p class="muted" style="margin-top:10px">${railDatasetLoaded()?`Loaded ${ALL_TRAINS_INDEX.length.toLocaleString()} trains and ${ALL_STATIONS.length.toLocaleString()} stations. Route stops are read from the timetable schedules.`:"The complete open timetable is loaded on demand. The first load downloads the train and station datasets; each train already contains its complete ordered route and timetable stops."</p></div>
 <div id="results" style="margin-top:18px">${searchResults.length?searchResults.map(trainResult).join(""):`<div class="empty">Load the database, then enter stations to find trains that actually stop at both locations.</div>`}</div>`;
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
function trainResult(t){
 const real=!!t.__real;
 if(real){
  const stops=getTrainRouteStops(t.number);
  return `<div class="card train-card" style="margin-bottom:14px">
   <div><div class="station-time">${esc(t.departure||"—")}</div><div class="station-name">${esc(t.from_name||t.from||"")}</div></div>
   <div><div class="route-line">● ───── 🚆 ───── ●</div><div style="text-align:center;margin-top:8px"><span class="pill">${t.duration_h||0}h ${t.duration_m||0}m</span> <span class="pill ok">TIMETABLE</span></div></div>
   <div style="text-align:right"><div class="station-time">${esc(t.arrival||"—")}</div><div class="station-name">${esc(t.to_name||t.to||"")}</div></div>
   <div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:13px">
    <div><b>${esc(t.number)}</b> · ${esc(t.name)} · ${t.distance?esc(t.distance)+" km":""} · ${stops.length.toLocaleString()} scheduled stops</div>
    <button class="btn primary small" onclick="showRealTrainRoute('${esc(t.number)}')">View Full Route</button>
   </div></div>`;
 }
 return `<div class="card train-card" style="margin-bottom:14px"><div><div class="station-time">${t.dep}</div><div class="station-name">${esc(t.from)}</div></div><div><div class="route-line">● ───── 🚆 ───── ●</div><div style="text-align:center;margin-top:8px"><span class="pill">${t.duration}</span> <span class="pill ${t.status==="On Time"?"ok":"warn"}">${t.status}</span></div></div><div style="text-align:right"><div class="station-time">${t.arr}</div><div class="station-name">${esc(t.to)}</div></div><div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:13px"><div><b>${t.number}</b> · ${esc(t.name)} · From ₹${t.fare}</div><button class="btn primary small" onclick="bookTrain('${t.id}')">Select & Book</button></div></div>`;
}
function bookingsPage(){
 const bs=state.bookings.filter(b=>b.userId===session.id);
 return pageTitle("My Tickets","View, open and cancel your bookings",`<button class="btn primary" onclick="goto('search')">+ New Booking</button>`)
 + (bs.length?bs.map(b=>bookingCard(b)).join(""):`<div class="card empty">No tickets yet. Search a train to create your first booking.</div>`);
}
function bookingCard(b){let t=state.trains.find(x=>x.id===b.trainId)||b.train;return `<div class="ticket" style="margin-bottom:15px"><div class="ticket-head"><div><b>${t.number} · ${esc(t.name)}</b><div class="muted">${esc(t.from)} → ${esc(t.to)}</div></div><span class="pill ${b.status==="Confirmed"?"ok":"red"}">${b.status}</span></div><div class="ticket-body"><div class="ticket-grid"><div><div class="label">PNR</div><div class="value">${b.pnr}</div></div><div><div class="label">Passenger</div><div class="value">${esc(b.passenger.name)}</div></div><div><div class="label">Class</div><div class="value">${b.className}</div></div><div><div class="label">Fare</div><div class="value">₹${b.fare}</div></div></div><div class="actions" style="margin-top:16px"><button class="btn small" onclick="ticketDetail('${b.id}')">View Ticket</button>${b.status==="Confirmed"?`<button class="btn danger small" onclick="cancelBooking('${b.id}')">Cancel Ticket</button>`:""}</div></div></div>`}
function pnrPage(){return pageTitle("PNR Status","Check the current status of a booking",liveBadge())
 +`<div class="card"><div class="field"><label>PNR Number</label><input id="pnrInput" placeholder="Enter 10 digit PNR"></div><button class="btn primary" style="margin-top:12px" onclick="checkPnr()">Check PNR</button><div id="pnrOut" style="margin-top:18px"></div>
 <p class="muted" style="margin-top:10px">${hasLiveData()?"Real PNRs from actual bookings are looked up live via RapidAPI; demo PNRs generated inside this app are matched locally.":"Connect a RapidAPI key in Settings to also look up real IRCTC PNR numbers."}</p></div>`}
function livePage(){return pageTitle("Live Status","Current operational status of your selected train",liveBadge())
 +`<div class="card"><div class="field"><label>Train</label><select id="liveTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div>
 ${hasLiveData()?`<div class="field" style="margin-top:12px"><label>Or enter any real train number</label><input id="liveTrainNo" placeholder="e.g. 12951"></div>`:""}
 <button class="btn primary" style="margin-top:12px" onclick="showLive()">Track Train</button><div id="liveOut" style="margin-top:18px"></div></div>`}
function stationsPage(){let ss=["Mumbai Central","New Delhi","Bengaluru","Howrah","Hyderabad","Bhubaneswar","Khurda Road","Cuttack"];return pageTitle("Station Info","Facilities, platforms and operational information",`<span class="weather-chip">🌦️ Live weather (Open-Meteo)</span>`)
 +`<div class="grid g3">${ss.map((s,i)=>`<div class="card"><h3>🚉 ${s}</h3><p class="muted">Station code: ${["MMCT","NDLS","SBC","HWH","HYB","BBS","KUR","CTC"][i]}</p><div class="pill ok">Open</div><div id="wx-${i}" class="muted" style="margin:8px 0">Loading live weather…</div><p>Platforms: ${3+(i%6)} · Food · Waiting room · Help desk</p><button class="btn small" onclick="toast('Station information for ${s}: platform and service details available.')">View Details</button></div>`).join("")}</div>`}
function loadStationsWeather(){let ss=["Mumbai Central","New Delhi","Bengaluru","Howrah","Hyderabad","Bhubaneswar","Khurda Road","Cuttack"];
 ss.forEach(async(s,i)=>{const w=await stationWeather(s);const el=$("#wx-"+i);if(!el)return;el.innerHTML=w?`<span class="weather-chip">☁️ ${Math.round(w.temp)}°C · ${esc(w.desc)}</span>`:"Weather unavailable";});}
function foodPage(){return pageTitle("Order Food","Add onboard/at-station food items to a sample order")
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
 +`<div class="grid g2">${state.trains.slice(0,3).map((t,i)=>`<div class="card"><span class="pill warn">SPECIAL SERVICE</span><h3 style="margin-top:10px">${t.number} · ${esc(t.name)}</h3><p>${esc(t.from)} → ${esc(t.to)}</p><p class="muted">Runs with special operational schedule. Check live status before travel.</p><button class="btn primary small" onclick="bookTrain('${t.id}')">Book</button></div>`).join("")}</div>`}
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
 const q=$("#mapTrainQuery").value.trim();const date=$("#mapDate").value;
 const info=$("#mapResultInfo");
 if(!q){toast("Enter a train number or name.");return}
 let real=railDatasetLoaded()?ALL_TRAINS_INDEX.find(t=>t.number===q)||searchAllTrains(q,1)[0]:null;
 let demo=state.trains.find(t=>t.number===q||t.id===q||t.name.toLowerCase().includes(q.toLowerCase()));
 if(!real&&!demo){info.innerHTML=`<div class="notice warn">Train not found. ${railDatasetLoaded()?"Check the number/name.":"Load the all-India dataset in Settings to search every real train."}</div>`;return}
 info.innerHTML=`<div class="card">Locating train…</div>`;

 let route=null, fromName, toName, distance, durH, durM, dep, number, name, classes=[];
 if(real){
  number=real.number;name=real.name;fromName=real.from_name;toName=real.to_name;
  distance=real.distance;durH=real.duration_h;durM=real.duration_m;dep=real.departure;classes=real.classes;
  route=getTrainRoute(real.number);
  if(!route && !ALL_TRAINS_GEOJSON){
   info.innerHTML=`<div class="card">Fetching real route data (one-time this session)…</div>`;
   try{ await loadAllIndiaRailData(()=>{}); route=getTrainRoute(real.number); }catch(e){ /* handled by the route null-check below */ }
  }
 } else {
  number=demo.number;name=demo.name;fromName=demo.from;toName=demo.to;dep=demo.dep;classes=demo.classes;
  const fS=findStation(demo.from), tS=findStation(demo.to);
  route = fS&&tS ? [[fS.lon,fS.lat],[tS.lon,tS.lat]] : null;
  const durMatch=(demo.duration||"").match(/(\d+)h\s*(\d+)?/); durH=durMatch?+durMatch[1]:0; durM=durMatch&&durMatch[2]?+durMatch[2]:0;
 }
 if(!route){info.innerHTML=`<div class="notice warn">No route geometry available for this train yet. Load the all-India dataset in Settings for real routes.</div>`;return}

 let posLabel="Estimated position (schedule-based, along the real route)";
 let trainPoint=null;
 if(hasLiveData()){
  try{
   const r=await GoRailAPI.liveStatus(number);const d=r?.data||r;
   const stCode = d?.current_station_code || d?.current_station || d?.station_code || d?.last_station_code;
   const stName = d?.current_station_name || d?.station_name;
   const st = (stCode&&findRealStation(stCode)) || (stName&&findRealStation(stName));
   if(st){ trainPoint={lat:st.lat,lon:st.lon}; posLabel="Live position — last reported station (via RapidAPI)"; }
  }catch(e){ /* fall back to schedule estimate below */ }
 }
 if(!trainPoint){
  const frac=scheduleFraction(dep,durH,durM,date);
  trainPoint=pointAtFraction(route,frac);
 }

 const stops=[route[0],route[route.length-1]].map((c,i)=>({lat:c[1],lon:c[0],name:i===0?fromName:toName}));
 renderTrainMap("trainMapEl",{routeCoords:route,trainPoint,stationStops:stops,trainLabel:`${number} · ${name}`});
 info.innerHTML=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">${esc(number)} · ${esc(name)}</h3><span class="live-badge ${posLabel.startsWith("Live")?"":"off"}"><span class="dot"></span>${posLabel.startsWith("Live")?"LIVE POSITION":"ESTIMATED"}</span></div>
 <p>${esc(fromName||"")} → ${esc(toName||"")}${distance?` · ${distance} km`:""}${durH!=null?` · ${durH}h ${durM||0}m`:""}</p>
 ${classes?.length?`<div class="actions">${classes.map(c=>`<span class="pill">${c}</span>`).join("")}</div>`:""}
 <p class="muted" style="margin-top:8px">${posLabel}</p></div>`;
}
function ticketMini(b){let t=state.trains.find(x=>x.id===b.trainId)||b.train;return `<div style="margin-top:12px"><b>${t.number} · ${esc(t.name)}</b><p class="muted">${t.from} → ${t.to}<br>PNR ${b.pnr}</p></div>`}
function goto(p){page=p;searchResults=[];render();window.scrollTo({top:0,behavior:"smooth"});if(p==="stations")setTimeout(loadStationsWeather,10)}
function login(){let email=$("#lemail").value.trim(),pass=$("#lpass").value;let u=state.users.find(x=>x.email===email&&x.password===pass);
 if(email==="admin@gorail.app"&&pass==="admin123"){session={id:"admin",name:"Admin Panel",email,role:"admin"};save();goto("dashboard");return}
 if(!u){toast("Invalid login. Use passenger@gorail.app / 123456 or the demo admin.");return}session={...u};save();goto("dashboard")}
function logout(){session=null;save();render()}
function registerModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Create Account</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid"><div class="field"><label>Name</label><input id="rname"></div><div class="field"><label>Phone</label><input id="rphone"></div><div class="field"><label>Email</label><input id="remail"></div><div class="field"><label>Password</label><input id="rpass" type="password"></div></div><button class="btn primary" style="margin-top:15px" onclick="register()">Register</button></div></div>`;drawModal()}
function register(){let name=$("#rname").value.trim(),email=$("#remail").value.trim(),pass=$("#rpass").value,phone=$("#rphone").value.trim();if(!name||!email||!pass){toast("Please fill required fields.");return}if(state.users.some(u=>u.email===email)){toast("Email already registered.");return}let u={id:"u"+Date.now(),name,email,password:pass,phone,role:"passenger"};state.users.push(u);session={...u};save();closeModal();goto("dashboard")}
function closeModal(){modal=null;drawModal()}
function drawModal(){let old=$("#modalRoot");if(old)old.remove();if(modal){let d=document.createElement("div");d.id="modalRoot";d.innerHTML=modal;document.body.appendChild(d)}}
function bookTrain(id){let t=state.trains.find(x=>x.id===id);if(!t)return;modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Passenger Details</h2><button class="close" onclick="closeModal()">×</button></div><div class="notice">${t.number} · ${esc(t.name)} · ${esc(t.from)} → ${esc(t.to)}</div><div class="form-grid" style="margin-top:15px"><div class="field"><label>Passenger Name</label><input id="bname" value="${esc(session.name)}"></div><div class="field"><label>Age</label><input id="bage" type="number" value="21"></div><div class="field"><label>Class</label><select id="bclass">${t.classes.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="field"><label>Gender</label><select id="bgender"><option>Male</option><option>Female</option><option>Other</option></select></div></div><button class="btn primary" style="margin-top:15px;width:100%" onclick="confirmBooking('${t.id}')">Confirm Booking · ₹${t.fare}</button></div></div>`;drawModal()}
function confirmBooking(id){let t=state.trains.find(x=>x.id===id);let p={name:$("#bname").value,age:+$("#bage").value,gender:$("#bgender").value};let cls=$("#bclass").value;
 if(!p.name||!p.age){toast("Enter passenger details.");return} if(t.seats<=0){toast("No seats available.");return}
 let b={id:"b"+Date.now(),userId:session.id,trainId:id,train:{...t},passenger:p,className:cls,fare:t.fare,pnr:String(Math.floor(1000000000+Math.random()*8999999999)),status:"Confirmed",date:new Date().toLocaleDateString("en-IN")};
 state.bookings.push(b);t.seats--;state.notifications.push({id:"n"+Date.now(),title:"Booking Confirmed",body:`PNR ${b.pnr} for ${t.name}.`,date:b.date});save();closeModal();toast("Booking confirmed — PNR "+b.pnr,"success");ticketDetail(b.id)}
function ticketDetail(id){let b=state.bookings.find(x=>x.id===id),t=state.trains.find(x=>x.id===b.trainId)||b.train;modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Ticket Confirmation</h2><button class="close" onclick="closeModal()">×</button></div><div id="qr" style="float:right"></div><div class="notice"><b>PNR ${b.pnr}</b> · ${b.status}</div><h3 style="margin-top:18px">${t.number} · ${esc(t.name)}</h3><p>${esc(t.from)} → ${esc(t.to)} · ${t.dep} → ${t.arr}</p><div class="ticket-grid"><div><div class="label">Passenger</div><div class="value">${esc(b.passenger.name)}</div></div><div><div class="label">Age/Gender</div><div class="value">${b.passenger.age}/${b.passenger.gender}</div></div><div><div class="label">Class</div><div class="value">${b.className}</div></div><div><div class="label">Fare</div><div class="value">₹${b.fare}</div></div></div><button class="btn primary" style="margin-top:16px" onclick="window.print()">🖨️ Print / Save as PDF</button></div></div>`;drawModal();setTimeout(()=>{let q=$("#qr");if(q)new QRCode(q,{text:`GORAIL|PNR:${b.pnr}|TRAIN:${t.number}`,width:110,height:110})},20)}
function cancelBooking(id){if(!confirm("Cancel this ticket?"))return;let b=state.bookings.find(x=>x.id===id);if(!b)return;b.status="Cancelled";let t=state.trains.find(x=>x.id===b.trainId);if(t)t.seats++;save();render()}
async function checkPnr(){
 let x=$("#pnrInput").value.trim(),out=$("#pnrOut"),b=state.bookings.find(b=>b.pnr===x);
 if(b){out.innerHTML=bookingCard(b);return}
 if(!hasLiveData()){out.innerHTML=`<div class="notice warn">PNR not found in this demo database. Connect a RapidAPI key in Settings to check real PNRs.</div>`;return}
 out.innerHTML=`<div class="card">Looking up live PNR…</div>`;
 try{
  const r=await GoRailAPI.pnrStatus(x);const d=r?.data||r;
  out.innerHTML=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">PNR ${esc(x)}</h3>${liveBadge()}</div><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin-top:10px">${esc(JSON.stringify(d,null,2)).slice(0,1600)}</pre></div>`;
 }catch(e){out.innerHTML=`<div class="notice warn">Live lookup failed (${esc(e.code||e.message)}). PNR not found.</div>`}
}
async function showLive(){
 let t=state.trains.find(x=>x.id===$("#liveTrain").value);
 let out=$("#liveOut");out.innerHTML=`<div class="card">Loading…</div>`;
 let liveHtml="";
 let trainNoOverride=$("#liveTrainNo")?.value?.trim();
 if(hasLiveData()){
  try{
   const r=await GoRailAPI.liveStatus(trainNoOverride||t.number);
   const d=r?.data||r;
   liveHtml=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">${esc(trainNoOverride||t.number)} · Live from RapidAPI</h3>${liveBadge()}</div>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin-top:10px">${esc(JSON.stringify(d,null,2)).slice(0,1600)}</pre></div>`;
  }catch(e){
   toast("Live status lookup failed ("+(e.code||e.message)+") — showing demo view.","warn");
  }
 }
 if(!liveHtml){
  liveHtml=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">${t.number} · ${esc(t.name)}</h3>${liveBadge()}</div><p>${esc(t.from)} → ${esc(t.to)}</p><span class="pill ${t.status==="On Time"?"ok":"warn"}">${t.status}</span><p class="muted">Platform ${t.platform} · ${hasLiveData()?"Demo view (real lookup failed)":"Add a RapidAPI key in Settings for the real live position"}</p><div class="route-line" style="margin-top:18px">● ───── 🚆 ───── ●</div></div>`;
 }
 const [wFrom,wTo]=await Promise.all([stationWeather(t.from),stationWeather(t.to)]);
 const wchip=w=>w?`<span class="weather-chip">☁️ ${w.station.name} · ${Math.round(w.temp)}°C · ${esc(w.desc)}</span>`:"";
 liveHtml+=`<div class="card" style="margin-top:14px"><h3>🌦️ Live weather along the route</h3><div class="actions">${wchip(wFrom)}${wchip(wTo)}</div><p class="muted" style="margin-top:8px">Real-time, no API key needed (Open-Meteo).</p></div>`;
 out.innerHTML=liveHtml;
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
  }catch(e){toast("Live fare lookup failed ("+(e.code||e.message)+") — showing estimate.","warn")}
 }
 let mult={SL:.7, "3A":1, "2A":1.45,"1A":2.1}[c]||1;let base=Math.round(t.fare*mult),total=base*p;
 out.innerHTML=`<div class="notice"><b>Estimated fare: ₹${total}</b><br>${p} passenger(s) · ${c}<br>Base ₹${base} per passenger · Taxes/charges are illustrative.${hasLiveData()?" Enter From/To codes above for a real fare.":""}</div>`;
}
function seatMap(available,total=48){let cells=[];for(let i=1;i<=total;i++){let taken=i>available;let rac=!taken&&i>available-4;cells.push(`<div class="seat ${taken?"taken":rac?"rac":""}">${i}</div>`)}return `<div class="coach-map">${cells.join("")}</div>`}
async function showSeats(){
 let t=state.trains.find(x=>x.id===$("#seatTrain").value),out=$("#seatOut"),base=t.seats;
 let fromC=$("#seatFrom")?.value?.trim(),toC=$("#seatTo")?.value?.trim(),cls=$("#seatClass")?.value,date=$("#seatDate")?.value;
 if(hasLiveData()&&fromC&&toC){
  out.innerHTML=`<div class="card">Checking live availability…</div>`;
  try{
   const r=await GoRailAPI.seatAvailability({trainNo:t.number,fromStationCode:fromC,toStationCode:toC,classType:cls,date});
   const d=r?.data||r;
   out.innerHTML=`<div class="card"><div class="actions" style="justify-content:space-between"><h3 style="margin:0">${esc(t.number)} · ${esc(fromC)} → ${esc(toC)} · ${esc(cls)}</h3>${liveBadge()}</div><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;margin-top:10px">${esc(JSON.stringify(d,null,2)).slice(0,1600)}</pre></div>`;
   return;
  }catch(e){toast("Live seat lookup failed ("+(e.code||e.message)+") — showing demo view.","warn")}
 }
 out.innerHTML=`<div class="grid g4">${t.classes.map((c,i)=>{let av=Math.max(0,base-i*11);return `<div class="card"><h3>${c}</h3><div class="stat">${av}</div><span class="pill ok">Available</span>${seatMap(Math.min(av,48))}</div>`}).join("")}</div>
 <p class="muted" style="margin-top:12px">${hasLiveData()?"Enter From/To station codes above for a real availability check.":"Demo availability model. Connect a RapidAPI key in Settings for real class-wise availability."}</p>`;
}
function addFood(id){let f=state.food.find(x=>x.id===id),cart=JSON.parse(localStorage.getItem("gorail_cart")||"[]");cart.push(f);localStorage.setItem("gorail_cart",JSON.stringify(cart));let total=cart.reduce((s,x)=>s+x.price,0);$("#foodCart").innerHTML=cart.map(x=>`<p>${x.name} — ₹${x.price}</p>`).join("")+`<hr><b>Total ₹${total}</b><br><button class="btn primary small" style="margin-top:10px" onclick="placeFood()">Place Order</button>`}
function placeFood(){localStorage.removeItem("gorail_cart");state.notifications.push({id:"f"+Date.now(),title:"Food Order Placed",body:"Your food order has been accepted for processing.",date:new Date().toLocaleDateString("en-IN")});save();toast("Food order placed.");goto("notifications")}
function complaintModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>New Complaint</h2><button class="close" onclick="closeModal()">×</button></div><div class="field"><label>Subject</label><input id="csub"></div><div class="field" style="margin-top:12px"><label>Message</label><textarea id="cmsg"></textarea></div><button class="btn primary" style="margin-top:14px" onclick="submitComplaint()">Submit Complaint</button></div></div>`;drawModal()}
function submitComplaint(){let subject=$("#csub").value.trim(),message=$("#cmsg").value.trim();if(!subject||!message)return toast("Enter subject and message.");state.complaints.push({id:"c"+Date.now(),userId:session.id,subject,message,status:"Open",date:new Date().toLocaleDateString("en-IN")});save();closeModal();render()}
function resolveComplaint(id){let c=state.complaints.find(x=>x.id===id);if(c)c.status="Resolved";save();render()}
function saveProfile(){session.name=$("#pname").value.trim()||session.name;session.phone=$("#pphone").value.trim();let u=state.users.find(x=>x.id===session.id);if(u){u.name=session.name;u.phone=session.phone}save();toast("Profile updated.");render()}
function trainModal(id){let t=id?state.trains.find(x=>x.id===id):{number:"",name:"",from:"",to:"",dep:"",arr:"",duration:"",fare:1000,seats:50,platform:"1",status:"On Time",classes:["1A","2A","3A"]};
 modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${id?"Edit":"Add"} Train</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid">
 ${["number","name","from","to","dep","arr","duration","fare","seats","platform"].map(k=>`<div class="field"><label>${k}</label><input id="t_${k}" value="${esc(t[k])}"></div>`).join("")}
 <div class="field"><label>Status</label><select id="t_status"><option ${t.status==="On Time"?"selected":""}>On Time</option><option ${t.status!=="On Time"?"selected":""}>Delayed 15m</option></select></div>
 </div><button class="btn primary" style="margin-top:15px" onclick="saveTrain('${id||""}')">Save Train</button></div></div>`;drawModal()}
function saveTrain(id){let o={id:id||Date.now().toString(),number:$("#t_number").value,name:$("#t_name").value,from:$("#t_from").value,to:$("#t_to").value,dep:$("#t_dep").value,arr:$("#t_arr").value,duration:$("#t_duration").value,fare:+$("#t_fare").value,seats:+$("#t_seats").value,platform:$("#t_platform").value,status:$("#t_status").value,classes:["1A","2A","3A","SL"]};if(!o.number||!o.name||!o.from||!o.to)return toast("Fill train details.");let i=state.trains.findIndex(x=>x.id===id);if(i>=0)state.trains[i]=o;else state.trains.push(o);save();closeModal();render()}
function deleteTrain(id){if(!confirm("Delete this train?"))return;state.trains=state.trains.filter(t=>t.id!==id);save();render()}
function sendBroadcast(){let m=$("#broadcastText").value.trim();if(!m)return toast("Enter a notice.");state.broadcasts.push({id:"br"+Date.now(),message:m,date:new Date().toLocaleDateString("en-IN")});state.notifications.push({id:"bn"+Date.now(),title:"Railway Notice",body:m,date:new Date().toLocaleDateString("en-IN")});save();toast("Notice broadcasted.");render()}
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

render();drawModal();
setInterval(()=>{const {ac,nonAc}=tatkalCountdown();const a=$("#tatkalAc"),n=$("#tatkalNonAc");if(a)a.textContent=ac;if(n)n.textContent=nonAc;},1000);
