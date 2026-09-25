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
function save(){localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem("gorail_session",JSON.stringify(session))}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function icon(x){return `<span>${x}</span>`}
function navItems(admin=false){
 return admin?[
  ["dashboard","📊","Dashboard"],["manage-trains","🚆","Manage Trains"],["complaints","🛠️","Complaints"],["broadcast","📢","Broadcast Notice"]
 ]:[
  ["dashboard","🏠","Home"],["search","🔎","Train Enquiry"],["bookings","🎫","My Tickets"],["pnr","🔢","PNR Status"],
  ["live","📍","Live Status"],["stations","🚉","Station Info"],["food","🍱","Order Food"],["complaints","📝","Complaints"],
  ["notifications","🔔","Notifications"],["profile","👤","Profile"]
 ]}
function shell(){
 const admin=session?.role==="admin";
 return `<header class="topbar"><div class="brand">${icon("🚆")} GoRail</div><div class="top-actions">
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
 return pageTitle("Train Enquiry","Search trains by source, destination and date",`<button class="btn" onclick="resetSearch()">Reset</button>`)
 +`<div class="card"><div class="form-grid"><div class="field"><label>From</label><input id="sfrom" placeholder="e.g. Mumbai Central"></div><div class="field"><label>To</label><input id="sto" placeholder="e.g. New Delhi"></div><div class="field"><label>Date</label><input id="sdate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Class</label><select id="sclass"><option value="">Any class</option><option>1A</option><option>2A</option><option>3A</option><option>SL</option></select></div></div><button class="btn primary" style="margin-top:15px" onclick="searchTrains()">Search Trains</button></div>
 <div id="results" style="margin-top:18px">${searchResults.length?searchResults.map(trainResult).join(""):`<div class="empty">Enter journey details and search.</div>`}</div>`;
}
function trainResult(t){return `<div class="card train-card" style="margin-bottom:14px"><div><div class="station-time">${t.dep}</div><div class="station-name">${esc(t.from)}</div></div><div><div class="route-line">● ───── 🚆 ───── ●</div><div style="text-align:center;margin-top:8px"><span class="pill">${t.duration}</span> <span class="pill ${t.status==="On Time"?"ok":"warn"}">${t.status}</span></div></div><div style="text-align:right"><div class="station-time">${t.arr}</div><div class="station-name">${esc(t.to)}</div></div><div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:13px"><div><b>${t.number}</b> · ${esc(t.name)} · From ₹${t.fare}</div><button class="btn primary small" onclick="bookTrain('${t.id}')">Select & Book</button></div></div>`}
function bookingsPage(){
 const bs=state.bookings.filter(b=>b.userId===session.id);
 return pageTitle("My Tickets","View, open and cancel your bookings",`<button class="btn primary" onclick="goto('search')">+ New Booking</button>`)
 + (bs.length?bs.map(b=>bookingCard(b)).join(""):`<div class="card empty">No tickets yet. Search a train to create your first booking.</div>`);
}
function bookingCard(b){let t=state.trains.find(x=>x.id===b.trainId)||b.train;return `<div class="ticket" style="margin-bottom:15px"><div class="ticket-head"><div><b>${t.number} · ${esc(t.name)}</b><div class="muted">${esc(t.from)} → ${esc(t.to)}</div></div><span class="pill ${b.status==="Confirmed"?"ok":"red"}">${b.status}</span></div><div class="ticket-body"><div class="ticket-grid"><div><div class="label">PNR</div><div class="value">${b.pnr}</div></div><div><div class="label">Passenger</div><div class="value">${esc(b.passenger.name)}</div></div><div><div class="label">Class</div><div class="value">${b.className}</div></div><div><div class="label">Fare</div><div class="value">₹${b.fare}</div></div></div><div class="actions" style="margin-top:16px"><button class="btn small" onclick="ticketDetail('${b.id}')">View Ticket</button>${b.status==="Confirmed"?`<button class="btn danger small" onclick="cancelBooking('${b.id}')">Cancel Ticket</button>`:""}</div></div></div>`}
function pnrPage(){return pageTitle("PNR Status","Check the current status of a booking")
 +`<div class="card"><div class="field"><label>PNR Number</label><input id="pnrInput" placeholder="Enter 10 digit PNR"></div><button class="btn primary" style="margin-top:12px" onclick="checkPnr()">Check PNR</button><div id="pnrOut" style="margin-top:18px"></div></div>`}
function livePage(){return pageTitle("Live Status","Current operational status of your selected train")
 +`<div class="card"><div class="field"><label>Train</label><select id="liveTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div><button class="btn primary" style="margin-top:12px" onclick="showLive()">Track Train</button><div id="liveOut" style="margin-top:18px"></div></div>`}
function stationsPage(){let ss=["Mumbai Central","New Delhi","Bengaluru","Howrah","Hyderabad","Bhubaneswar","Khurda Road","Cuttack"];return pageTitle("Station Info","Facilities, platforms and operational information")
 +`<div class="grid g3">${ss.map((s,i)=>`<div class="card"><h3>🚉 ${s}</h3><p class="muted">Station code: ${["MMCT","NDLS","SBC","HWH","SC","BBS","KUR","CTC"][i]}</p><div class="pill ok">Open</div><p>Platforms: ${3+(i%6)} · Food · Waiting room · Help desk</p><button class="btn small" onclick="alert('Station information for ${s}: platform and service details available.')">View Details</button></div>`).join("")}</div>`}
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
function farePage(){return pageTitle("Fare Enquiry","Estimate fare using the same train/class selection logic")
 +`<div class="card"><div class="form-grid"><div class="field"><label>Train</label><select id="fareTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div><div class="field"><label>Class</label><select id="fareClass"><option>1A</option><option>2A</option><option>3A</option><option>SL</option></select></div><div class="field"><label>Passengers</label><input id="farePax" type="number" min="1" max="6" value="1"></div></div><button class="btn primary" style="margin-top:14px" onclick="calcFare()">Calculate Fare</button><div id="fareOut" style="margin-top:18px"></div></div>`}
function seatPage(){return pageTitle("Seat Availability","Check class-wise availability")
 +`<div class="card"><div class="field"><label>Train</label><select id="seatTrain">${state.trains.map(t=>`<option value="${t.id}">${t.number} · ${esc(t.name)}</option>`).join("")}</select></div><button class="btn primary" style="margin-top:12px" onclick="showSeats()">Check Availability</button><div id="seatOut" style="margin-top:18px"></div></div>`}
function specialPage(){return pageTitle("Special Trains","Seasonal and special service listing")
 +`<div class="grid g2">${state.trains.slice(0,3).map((t,i)=>`<div class="card"><span class="pill warn">SPECIAL SERVICE</span><h3 style="margin-top:10px">${t.number} · ${esc(t.name)}</h3><p>${esc(t.from)} → ${esc(t.to)}</p><p class="muted">Runs with special operational schedule. Check live status before travel.</p><button class="btn primary small" onclick="bookTrain('${t.id}')">Book</button></div>`).join("")}</div>`}
function emergencyPage(){return pageTitle("Emergency Help","Quick-access railway support contacts")
 +`<div class="grid g3">${[["🚨","Railway Security","139"],["🏥","Medical Emergency","112"],["📞","Railway Helpline","139"],["🛡️","RPF","182"],["🔥","Fire Emergency","101"],["ℹ️","Railway Enquiry","139"]].map(x=>`<div class="card"><div style="font-size:30px">${x[0]}</div><h3>${x[1]}</h3><p class="muted">Emergency contact</p><a class="btn primary" href="tel:${x[2]}">Call ${x[2]}</a></div>`).join("")}</div>`}
function manageTrainsPage(){return pageTitle("Manage Trains","Add, edit and delete train records",`<button class="btn primary" onclick="trainModal()">+ Add Train</button>`)
 +`<div class="card"><table class="table"><thead><tr><th>Train</th><th>Route</th><th>Departure</th><th>Arrival</th><th>Seats</th><th>Action</th></tr></thead><tbody>${state.trains.map(t=>`<tr><td><b>${t.number}</b><br>${esc(t.name)}</td><td>${esc(t.from)} → ${esc(t.to)}</td><td>${t.dep}</td><td>${t.arr}</td><td>${t.seats}</td><td><button class="btn small" onclick="trainModal('${t.id}')">Edit</button> <button class="btn danger small" onclick="deleteTrain('${t.id}')">Delete</button></td></tr>`).join("")}</tbody></table></div>`}
function broadcastPage(){return pageTitle("Broadcast Notice","Send a notice to passenger notification feeds")
 +`<div class="card"><div class="field"><label>Notice</label><textarea id="broadcastText" placeholder="Enter railway notice..."></textarea></div><button class="btn primary" style="margin-top:12px" onclick="sendBroadcast()">Broadcast Notice</button></div>
 <div class="card" style="margin-top:18px"><h3>Previous notices</h3>${state.broadcasts.slice().reverse().map(b=>`<p><b>${b.date}</b> — ${esc(b.message)}</p>`).join("")||"<p class='muted'>No notices.</p>"}</div>`}

function ticketMini(b){let t=state.trains.find(x=>x.id===b.trainId)||b.train;return `<div style="margin-top:12px"><b>${t.number} · ${esc(t.name)}</b><p class="muted">${t.from} → ${t.to}<br>PNR ${b.pnr}</p></div>`}
function goto(p){page=p;searchResults=[];render();window.scrollTo({top:0,behavior:"smooth"})}
function login(){let email=$("#lemail").value.trim(),pass=$("#lpass").value;let u=state.users.find(x=>x.email===email&&x.password===pass);
 if(email==="admin@gorail.app"&&pass==="admin123"){session={id:"admin",name:"Admin Panel",email,role:"admin"};save();goto("dashboard");return}
 if(!u){alert("Invalid login. Use passenger@gorail.app / 123456 or the demo admin.");return}session={...u};save();goto("dashboard")}
function logout(){session=null;save();render()}
function registerModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Create Account</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid"><div class="field"><label>Name</label><input id="rname"></div><div class="field"><label>Phone</label><input id="rphone"></div><div class="field"><label>Email</label><input id="remail"></div><div class="field"><label>Password</label><input id="rpass" type="password"></div></div><button class="btn primary" style="margin-top:15px" onclick="register()">Register</button></div></div>`;drawModal()}
function register(){let name=$("#rname").value.trim(),email=$("#remail").value.trim(),pass=$("#rpass").value,phone=$("#rphone").value.trim();if(!name||!email||!pass){alert("Please fill required fields.");return}if(state.users.some(u=>u.email===email)){alert("Email already registered.");return}let u={id:"u"+Date.now(),name,email,password:pass,phone,role:"passenger"};state.users.push(u);session={...u};save();closeModal();goto("dashboard")}
function closeModal(){modal=null;drawModal()}
function drawModal(){let old=$("#modalRoot");if(old)old.remove();if(modal){let d=document.createElement("div");d.id="modalRoot";d.innerHTML=modal;document.body.appendChild(d)}}
function bookTrain(id){let t=state.trains.find(x=>x.id===id);if(!t)return;modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Passenger Details</h2><button class="close" onclick="closeModal()">×</button></div><div class="notice">${t.number} · ${esc(t.name)} · ${esc(t.from)} → ${esc(t.to)}</div><div class="form-grid" style="margin-top:15px"><div class="field"><label>Passenger Name</label><input id="bname" value="${esc(session.name)}"></div><div class="field"><label>Age</label><input id="bage" type="number" value="21"></div><div class="field"><label>Class</label><select id="bclass">${t.classes.map(c=>`<option>${c}</option>`).join("")}</select></div><div class="field"><label>Gender</label><select id="bgender"><option>Male</option><option>Female</option><option>Other</option></select></div></div><button class="btn primary" style="margin-top:15px;width:100%" onclick="confirmBooking('${t.id}')">Confirm Booking · ₹${t.fare}</button></div></div>`;drawModal()}
function confirmBooking(id){let t=state.trains.find(x=>x.id===id);let p={name:$("#bname").value,age:+$("#bage").value,gender:$("#bgender").value};let cls=$("#bclass").value;
 if(!p.name||!p.age){alert("Enter passenger details.");return} if(t.seats<=0){alert("No seats available.");return}
 let b={id:"b"+Date.now(),userId:session.id,trainId:id,train:{...t},passenger:p,className:cls,fare:t.fare,pnr:String(Math.floor(1000000000+Math.random()*8999999999)),status:"Confirmed",date:new Date().toLocaleDateString("en-IN")};
 state.bookings.push(b);t.seats--;state.notifications.push({id:"n"+Date.now(),title:"Booking Confirmed",body:`PNR ${b.pnr} for ${t.name}.`,date:b.date});save();closeModal();ticketDetail(b.id)}
function ticketDetail(id){let b=state.bookings.find(x=>x.id===id),t=state.trains.find(x=>x.id===b.trainId)||b.train;modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Ticket Confirmation</h2><button class="close" onclick="closeModal()">×</button></div><div id="qr" style="float:right"></div><div class="notice"><b>PNR ${b.pnr}</b> · ${b.status}</div><h3 style="margin-top:18px">${t.number} · ${esc(t.name)}</h3><p>${esc(t.from)} → ${esc(t.to)} · ${t.dep} → ${t.arr}</p><div class="ticket-grid"><div><div class="label">Passenger</div><div class="value">${esc(b.passenger.name)}</div></div><div><div class="label">Age/Gender</div><div class="value">${b.passenger.age}/${b.passenger.gender}</div></div><div><div class="label">Class</div><div class="value">${b.className}</div></div><div><div class="label">Fare</div><div class="value">₹${b.fare}</div></div></div></div></div>`;drawModal();setTimeout(()=>{let q=$("#qr");if(q)new QRCode(q,{text:`GORAIL|PNR:${b.pnr}|TRAIN:${t.number}`,width:110,height:110})},20)}
function cancelBooking(id){if(!confirm("Cancel this ticket?"))return;let b=state.bookings.find(x=>x.id===id);if(!b)return;b.status="Cancelled";let t=state.trains.find(x=>x.id===b.trainId);if(t)t.seats++;save();render()}
function checkPnr(){let x=$("#pnrInput").value.trim(),b=state.bookings.find(b=>b.pnr===x);$("#pnrOut").innerHTML=b?bookingCard(b):`<div class="notice warn">PNR not found in this demo database.</div>`}
function showLive(){let t=state.trains.find(x=>x.id===$("#liveTrain").value);$("#liveOut").innerHTML=`<div class="card"><h3>${t.number} · ${esc(t.name)}</h3><p>${esc(t.from)} → ${esc(t.to)}</p><span class="pill ${t.status==="On Time"?"ok":"warn"}">${t.status}</span><p class="muted">Platform ${t.platform} · Live operational view</p><div class="route-line" style="margin-top:18px">● ───── 🚆 ───── ●</div></div>`}
function calcFare(){let t=state.trains.find(x=>x.id===$("#fareTrain").value),p=Math.max(1,+$("#farePax").value||1),c=$("#fareClass").value;let mult={SL:.7, "3A":1, "2A":1.45,"1A":2.1}[c]||1;let base=Math.round(t.fare*mult),total=base*p;$("#fareOut").innerHTML=`<div class="notice"><b>Estimated fare: ₹${total}</b><br>${p} passenger(s) · ${c}<br>Base ₹${base} per passenger · Taxes/charges are illustrative.</div>`}
function showSeats(){let t=state.trains.find(x=>x.id===$("#seatTrain").value),base=t.seats;$("#seatOut").innerHTML=`<div class="grid g4">${t.classes.map((c,i)=>`<div class="card"><h3>${c}</h3><div class="stat">${Math.max(0,base-i*11)}</div><span class="pill ok">Available</span></div>`).join("")}</div>`}
function addFood(id){let f=state.food.find(x=>x.id===id),cart=JSON.parse(localStorage.getItem("gorail_cart")||"[]");cart.push(f);localStorage.setItem("gorail_cart",JSON.stringify(cart));let total=cart.reduce((s,x)=>s+x.price,0);$("#foodCart").innerHTML=cart.map(x=>`<p>${x.name} — ₹${x.price}</p>`).join("")+`<hr><b>Total ₹${total}</b><br><button class="btn primary small" style="margin-top:10px" onclick="placeFood()">Place Order</button>`}
function placeFood(){localStorage.removeItem("gorail_cart");state.notifications.push({id:"f"+Date.now(),title:"Food Order Placed",body:"Your food order has been accepted for processing.",date:new Date().toLocaleDateString("en-IN")});save();alert("Food order placed.");goto("notifications")}
function complaintModal(){modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>New Complaint</h2><button class="close" onclick="closeModal()">×</button></div><div class="field"><label>Subject</label><input id="csub"></div><div class="field" style="margin-top:12px"><label>Message</label><textarea id="cmsg"></textarea></div><button class="btn primary" style="margin-top:14px" onclick="submitComplaint()">Submit Complaint</button></div></div>`;drawModal()}
function submitComplaint(){let subject=$("#csub").value.trim(),message=$("#cmsg").value.trim();if(!subject||!message)return alert("Enter subject and message.");state.complaints.push({id:"c"+Date.now(),userId:session.id,subject,message,status:"Open",date:new Date().toLocaleDateString("en-IN")});save();closeModal();render()}
function resolveComplaint(id){let c=state.complaints.find(x=>x.id===id);if(c)c.status="Resolved";save();render()}
function saveProfile(){session.name=$("#pname").value.trim()||session.name;session.phone=$("#pphone").value.trim();let u=state.users.find(x=>x.id===session.id);if(u){u.name=session.name;u.phone=session.phone}save();alert("Profile updated.");render()}
function trainModal(id){let t=id?state.trains.find(x=>x.id===id):{number:"",name:"",from:"",to:"",dep:"",arr:"",duration:"",fare:1000,seats:50,platform:"1",status:"On Time",classes:["1A","2A","3A"]};
 modal=`<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>${id?"Edit":"Add"} Train</h2><button class="close" onclick="closeModal()">×</button></div><div class="form-grid">
 ${["number","name","from","to","dep","arr","duration","fare","seats","platform"].map(k=>`<div class="field"><label>${k}</label><input id="t_${k}" value="${esc(t[k])}"></div>`).join("")}
 <div class="field"><label>Status</label><select id="t_status"><option ${t.status==="On Time"?"selected":""}>On Time</option><option ${t.status!=="On Time"?"selected":""}>Delayed 15m</option></select></div>
 </div><button class="btn primary" style="margin-top:15px" onclick="saveTrain('${id||""}')">Save Train</button></div></div>`;drawModal()}
function saveTrain(id){let o={id:id||Date.now().toString(),number:$("#t_number").value,name:$("#t_name").value,from:$("#t_from").value,to:$("#t_to").value,dep:$("#t_dep").value,arr:$("#t_arr").value,duration:$("#t_duration").value,fare:+$("#t_fare").value,seats:+$("#t_seats").value,platform:$("#t_platform").value,status:$("#t_status").value,classes:["1A","2A","3A","SL"]};if(!o.number||!o.name||!o.from||!o.to)return alert("Fill train details.");let i=state.trains.findIndex(x=>x.id===id);if(i>=0)state.trains[i]=o;else state.trains.push(o);save();closeModal();render()}
function deleteTrain(id){if(!confirm("Delete this train?"))return;state.trains=state.trains.filter(t=>t.id!==id);save();render()}
function sendBroadcast(){let m=$("#broadcastText").value.trim();if(!m)return alert("Enter a notice.");state.broadcasts.push({id:"br"+Date.now(),message:m,date:new Date().toLocaleDateString("en-IN")});state.notifications.push({id:"bn"+Date.now(),title:"Railway Notice",body:m,date:new Date().toLocaleDateString("en-IN")});save();alert("Notice broadcasted.");render()}
function resetSearch(){searchResults=[];goto("search")}
function searchTrains(){let f=$("#sfrom").value.trim().toLowerCase(),to=$("#sto").value.trim().toLowerCase(),cl=$("#sclass").value;searchResults=state.trains.filter(t=>(!f||t.from.toLowerCase().includes(f))&&(!to||t.to.toLowerCase().includes(to))&&(!cl||t.classes.includes(cl)));render()}

render();drawModal();
