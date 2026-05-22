// ================================================================
//  KSP CLINIC — ADMIN PANEL  admin.js
//  No login — direct dashboard
//  Firestore + Storage + Jitsi
// ================================================================

var firebaseConfig = {
  apiKey:            "AIzaSyDyFDmfg1s-1RgOEWiCmt0pTO43Um6NxXQ",
  authDomain:        "kotwal-skin-and-pain.firebaseapp.com",
  projectId:         "kotwal-skin-and-pain",
  storageBucket:     "kotwal-skin-and-pain.appspot.com",
  messagingSenderId: "461562185631",
  appId:             "1:461562185631:web:5f3b763edffa94bf80dfaa"
};
if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
var db      = firebase.firestore();
var storage = firebase.storage();

// ── State ─────────────────────────────────────────────────────────
var allAppts      = [];
var allUsers      = [];
var unsubAppts    = null;
var unsubUsers    = null;
var adminJitsiAPI = null;
var currentModalId = null;  // appointment ID open in modal

// ── Helpers ───────────────────────────────────────────────────────
var $ = function(id){ return document.getElementById(id); };

function toast(msg, type){
  var t=$("adminToast"); t.textContent=msg;
  t.className="toast "+(type||"")+" show";
  setTimeout(function(){ t.classList.remove("show"); },3200);
}
function esc(s){ return String(s||"").replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function cap(s){ return s?s[0].toUpperCase()+s.slice(1):""; }
function setText(id,v){ var e=$(id); if(e) e.textContent=v; }
function avatarURL(n){ return "https://ui-avatars.com/api/?name="+encodeURIComponent(n||"U")+"&size=80&background=dbeafe&color=1d4ed8"; }
function emptyHTML(icon,msg){ return "<div class='empty-msg'><i class='fa-solid "+icon+"'></i><p>"+msg+"</p></div>"; }
function mkbtn(cls,action,label){ return "<button class='abtn "+cls+"' onclick=\""+action+"\">"+label+"</button>"; }

// ── Start on page load ────────────────────────────────────────────
window.addEventListener("load", function(){ startListeners(); });

// ================================================================
//  FIRESTORE REAL-TIME LISTENERS
// ================================================================
function startListeners(){
  // All appointments
  if(unsubAppts) unsubAppts();
  unsubAppts = db.collection("appointments")
    .orderBy("bookingTimestamp","desc")
    .onSnapshot(function(snap){
      allAppts=[];
      snap.forEach(function(d){ allAppts.push(Object.assign({id:d.id},d.data())); });
      refreshStats();
      refreshRecent();
      filterList("offline");
      filterList("online");
      refreshBadges();
      // If modal open, refresh it
      if(currentModalId && $("modal").classList.contains("open")) openDetail(currentModalId);
    }, function(e){ console.error("appts:",e); });

  // All users
  if(unsubUsers) unsubUsers();
  unsubUsers = db.collection("users")
    .onSnapshot(function(snap){
      allUsers=[];
      snap.forEach(function(d){ allUsers.push(Object.assign({id:d.id},d.data())); });
      renderUsers();
      setText("sUsers", allUsers.length);
    }, function(e){ console.error("users:",e); });
}

// ================================================================
//  SIDEBAR / TABS
// ================================================================
function openSidebar(){ $("sidebar").classList.add("open"); $("overlay").classList.add("open"); }
function closeSidebar(){ $("sidebar").classList.remove("open"); $("overlay").classList.remove("open"); }

function switchTab(name, btn){
  document.querySelectorAll(".tab").forEach(function(t){ t.classList.remove("active"); });
  document.querySelectorAll(".nav-item").forEach(function(b){ b.classList.remove("active"); });
  $("tab-"+name).classList.add("active");
  if(btn) btn.classList.add("active");
  var titles={dashboard:"Dashboard",offline:"Offline Appointments",online:"Online Consultations",users:"Users"};
  $("topbarTitle").textContent=titles[name]||name;
  closeSidebar();
}

// ================================================================
//  STATS
// ================================================================
function refreshStats(){
  var total    = allAppts.length;
  var pending  = allAppts.filter(function(a){ return a.status==="pending"; }).length;
  var payment  = allAppts.filter(function(a){ return a.status==="payment_uploaded"||a.status==="pending_approval"; }).length;
  var approved = allAppts.filter(function(a){ return a.status==="approved"; }).length;
  var completed= allAppts.filter(function(a){ return a.status==="completed"; }).length;
  setText("sTotal",    total);
  setText("sPending",  pending);
  setText("sPayment",  payment);
  setText("sApproved", approved);
  setText("sCompleted",completed);
}

function refreshBadges(){
  var offPending = allAppts.filter(function(a){ return a.type!=="online" && a.status==="pending"; }).length;
  var onPending  = allAppts.filter(function(a){ return a.type==="online" && (a.status==="payment_uploaded"||a.status==="pending_approval"); }).length;
  var ob=$("offlineBadge"), onb=$("onlineBadge");
  if(ob){ ob.textContent=offPending; ob.style.display=offPending>0?"inline-block":"none"; }
  if(onb){ onb.textContent=onPending; onb.style.display=onPending>0?"inline-block":"none"; }
}

// ================================================================
//  RECENT (Dashboard)
// ================================================================
function refreshRecent(){
  var el=$("recentList"); if(!el) return;
  var recent=allAppts.slice(0,10);
  if(!recent.length){ el.innerHTML=emptyHTML("fa-calendar-xmark","No appointments yet"); return; }
  el.innerHTML=buildTable(recent, true);
}

// ================================================================
//  FILTER LISTS
// ================================================================
function filterList(type){
  var isOnline=(type==="online");
  var searchId=isOnline?"onSearch":"offSearch";
  var dateId  =isOnline?"onDate":"offDate";
  var statusId=isOnline?"onStatus":"offStatus";
  var listId  =isOnline?"onlineList":"offlineList";

  var q      = ($( searchId) ? $(searchId).value  : "").toLowerCase().trim();
  var date   = ($( dateId)   ? $(dateId).value     : "");
  var status = ($( statusId) ? $(statusId).value   : "");

  var base = allAppts.filter(function(a){
    return isOnline ? a.type==="online" : a.type!=="online";
  });

  var list = base.filter(function(a){
    var pts=a.patients||[];
    if(q){
      var names=pts.map(function(p){return(p.name||"").toLowerCase();}).join(" ");
      if(!names.includes(q)&&!(a.userEmail||"").toLowerCase().includes(q)&&
         !(a.userName||"").toLowerCase().includes(q)&&!(a.appointmentId||"").toLowerCase().includes(q)) return false;
    }
    if(date && !pts.some(function(p){return p.date===date;})) return false;
    if(status && a.status!==status) return false;
    return true;
  });

  var el=$(listId); if(!el) return;
  if(!list.length){ el.innerHTML=emptyHTML("fa-magnifying-glass","No appointments match"); return; }
  el.innerHTML=buildTable(list, false);
}

// ================================================================
//  BUILD TABLE HTML
// ================================================================
function buildTable(list, compact){
  var rows=list.map(function(a){
    var pts=a.patients||[]; var p0=pts[0]||{};
    var name1=esc(p0.name||"Unknown");
    var extra=pts.length>1?' <span style="font-size:.7rem;color:#94a3b8">+'+(pts.length-1)+' more</span>':"";
    var ts=a.bookingTimestamp&&a.bookingTimestamp.toDate?a.bookingTimestamp.toDate():null;
    var booked=ts?ts.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"—";
    var sid=(a.appointmentId||a.id.slice(-8)).toUpperCase();
    var photo=esc(a.userPhoto||avatarURL(a.userName));
    var fb=esc(avatarURL("U"));
    var typeTag="<span class='type-tag "+(a.type||"offline")+"'>"+(a.type==="online"?"📹 Online":"🏥 Offline")+"</span>";

    // Payment screenshot thumbnail (online only)
    var payThumb="";
    if(a.type==="online" && a.paymentScreenshotURL){
      payThumb="<img src='"+esc(a.paymentScreenshotURL)+"' class='pay-thumb' onclick=\"viewImage('"+esc(a.paymentScreenshotURL)+"')\" title='View Screenshot'/>";
    }

    var btns=compact
      ? mkbtn("abtn-view","openDetail('"+a.id+"')","View")
      : mkbtn("abtn-view","openDetail('"+a.id+"')","View")+
        (a.status!=="approved"&&a.status!=="completed" ? mkbtn("abtn-approve","openDetail('"+a.id+"')","✓ Approve") : "")+
        (a.status!=="rejected" ? mkbtn("abtn-reject","openDetail('"+a.id+"')","✕ Reject") : "")+
        mkbtn("abtn-delete","delAppt('"+a.id+"')","🗑");

    return "<tr>"+
      "<td><div class='ucell'>"+
        "<img src='"+photo+"' onerror=\"this.src='"+fb+"'\"/>"+
        "<div><div class='ucell-name'>"+esc(a.userName||"Unknown")+"</div>"+
        "<div class='ucell-email'>"+esc(a.userEmail||"")+"</div></div></div></td>"+
      "<td><span style='font-size:.72rem;color:#94a3b8'>#"+sid+"</span><br>"+name1+extra+"</td>"+
      "<td>"+typeTag+"</td>"+
      "<td>"+(p0.date||"—")+"</td>"+
      "<td style='font-size:.79rem'>"+(p0.slot||"—")+"</td>"+
      "<td><span class='badge "+(a.status||"pending")+"'>"+formatStatus(a.status)+"</span></td>"+
      (compact?"":"<td>"+payThumb+"</td>")+
      "<td>"+booked+"</td>"+
      "<td><div class='acts'>"+btns+"</div></td>"+
    "</tr>";
  }).join("");

  var extraCol=compact?"":"<th>Payment</th>";
  return "<div style='overflow-x:auto'>"+
    "<table class='appt-table'><thead><tr>"+
      "<th>User</th><th>Patient</th><th>Type</th><th>Date</th><th>Slot</th><th>Status</th>"+extraCol+"<th>Booked</th><th>Actions</th>"+
    "</tr></thead><tbody>"+rows+"</tbody></table></div>";
}

function formatStatus(s){
  var map={
    pending:"⏳ Pending", payment_uploaded:"💳 Payment Up",
    pending_approval:"🔍 Awaiting", approved:"✅ Approved",
    rejected:"❌ Rejected", completed:"🎯 Completed"
  };
  return map[s]||cap(s||"pending");
}

// ================================================================
//  OPEN DETAIL MODAL
// ================================================================
function openDetail(id){
  currentModalId=id;
  var a=null;
  for(var i=0;i<allAppts.length;i++){ if(allAppts[i].id===id){a=allAppts[i];break;} }
  if(!a) return;

  var pts=a.patients||[];
  var sid=(a.appointmentId||a.id.slice(-8)).toUpperCase();
  var ts=a.bookingTimestamp&&a.bookingTimestamp.toDate?a.bookingTimestamp.toDate():null;
  var booked=ts?ts.toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"—";
  var photo=esc(a.userPhoto||avatarURL(a.userName));
  var fb=esc(avatarURL("U"));

  // Patient details HTML
  var ptsHtml=pts.map(function(p,idx){
    return "<div class='m-patient'>"+
      "<div class='m-pt-head'><span class='m-pt-num'>"+(idx+1)+"</span> Patient "+(idx+1)+"</div>"+
      "<div class='m-grid'>"+
        mf("Full Name",p.name)+mf("Age",p.age)+
        mf("Gender",p.gender)+mf("Mobile",p.mobile)+
        mf("Email",p.email)+mf("Date",p.date)+
        mf("Time Slot",p.slot)+
        "<div class='m-field m-full'><div class='m-label'>Symptoms</div><div class='m-val'>"+esc(p.symptoms||"—")+"</div></div>"+
      "</div></div>";
  }).join("");

  // Payment screenshot section (online)
  var paySection="";
  if(a.type==="online" && a.paymentScreenshotURL){
    paySection="<div style='margin:14px 0'>"+
      "<div class='m-label' style='margin-bottom:8px'><i class='fa-solid fa-money-bill' style='color:#8b5cf6;margin-right:5px'></i>PAYMENT SCREENSHOT</div>"+
      "<img src='"+esc(a.paymentScreenshotURL)+"' class='pay-screenshot' onclick=\"window.open('"+esc(a.paymentScreenshotURL)+"','_blank')\" title='Click to view full size'/>"+
    "</div>";
  }

  // Doctor message + action buttons
  var existingMsg=esc(a.doctorMessage||"");
  var actionSection=
    "<div class='m-msg-section'>"+
      "<div class='m-msg-label'><i class='fa-solid fa-comment-medical'></i> Message to Patient (optional)</div>"+
      "<textarea id='doctorMsg' class='m-msg-ta' placeholder='Type message for patient...'>"+ existingMsg +"</textarea>"+
      "<div class='m-msg-hint'>Patient sees this instantly on approval/rejection.</div>"+
    "</div>"+
    "<div class='m-actions'>"+
      (a.status!=="approved"&&a.status!=="completed" ? mkbtn("abtn-approve","setStatus('"+a.id+"','approved')","✓ Approve &amp; Notify") : "")+
      (a.status!=="rejected" ? mkbtn("abtn-reject","setStatus('"+a.id+"','rejected')","✕ Reject &amp; Notify") : "")+
      mkbtn("abtn-delete","delAppt('"+a.id+"')","🗑 Delete")+
    "</div>";

  // Video room section (online + approved)
  var videoSection="";
  if(a.type==="online"){
    var roomId=a.videoRoomId||"";
    videoSection="<div class='m-video-section'>"+
      "<div class='m-video-label'><i class='fa-solid fa-video'></i> Video Room</div>"+
      (roomId
        ? "<div class='m-room-id'>Room: ksp-"+esc(roomId)+" <i class='fa-regular fa-copy' onclick=\"copyRoom('"+esc(roomId)+"')\" title='Copy'></i></div>"
        : "<div class='m-room-id' style='color:#94a3b8'>Room not generated yet</div>")+
      "<button class='m-join-btn' onclick=\"adminJoinCall('"+a.id+"','"+esc(roomId||a.id.slice(-8))+"')\">"+
        "<i class='fa-solid fa-video'></i> Join / Start Video Call</button>"+
    "</div>";
  }

  // Prescription section
  var rxSection="<div class='rx-upload-section'>"+
    "<div class='rx-upload-label'><i class='fa-solid fa-file-medical'></i> Upload Prescription</div>"+
    "<input type='file' id='rxFileInput' accept='image/*,.pdf' onchange=\"uploadPrescription('"+a.id+"',this)\"/>"+
    "<button class='rx-upload-btn' onclick=\"$('rxFileInput').click()\">"+
      "<i class='fa-solid fa-cloud-arrow-up'></i> Upload Prescription (Image / PDF)</button>"+
    (a.prescriptionURL
      ? "<div class='rx-current'><i class='fa-solid fa-file-medical' style='color:#10b981'></i> Prescription uploaded <a href='"+esc(a.prescriptionURL)+"' target='_blank'>View / Download</a></div>"
      : "")+
  "</div>";

  $("modalBody").innerHTML=
    "<div class='m-title'>Appointment Details</div>"+
    "<div class='m-id'>#"+sid+" &nbsp;·&nbsp; "+booked+
      " &nbsp;·&nbsp; <span class='badge "+(a.status||"pending")+"'>"+formatStatus(a.status)+"</span></div>"+
    "<div class='m-user-row'>"+
      "<img src='"+photo+"' onerror=\"this.src='"+fb+"'\"/>"+
      "<div><div class='m-user-name'>"+esc(a.userName||"Unknown")+"</div>"+
           "<div class='m-user-email'>"+esc(a.userEmail||"")+"</div></div></div>"+
    ptsHtml+
    paySection+
    actionSection+
    videoSection+
    rxSection;

  $("modal").classList.add("open");
}

function mf(label,val){
  return "<div class='m-field'><div class='m-label'>"+label+"</div><div class='m-val'>"+esc(val||"—")+"</div></div>";
}
function closeModal(){ $("modal").classList.remove("open"); currentModalId=null; }
function bgClose(e){ if(e.target===$("modal")) closeModal(); }

function viewImage(url){
  window.open(url,"_blank");
}
function copyRoom(roomId){
  if(navigator.clipboard) navigator.clipboard.writeText("ksp-"+roomId).then(function(){ toast("Room ID copied!","success"); });
}

// ================================================================
//  CHANGE STATUS
// ================================================================
function setStatus(id, status){
  var msgEl=$("doctorMsg");
  var msg=msgEl?msgEl.value.trim():"";

  // For online + approved → generate video room ID if not exists
  var updates={ status:status, doctorMessage:msg, updatedAt:firebase.firestore.FieldValue.serverTimestamp() };

  if(status==="approved"){
    var appt=allAppts.find(function(a){return a.id===id;});
    if(appt && appt.type==="online" && !appt.videoRoomId){
      updates.videoRoomId="room"+Date.now();
    }
  }

  db.collection("appointments").doc(id).update(updates)
    .then(function(){
      toast("Status updated to "+status+"! Patient notified.","success");
      if($("modal").classList.contains("open")) openDetail(id);
    })
    .catch(function(e){ toast("Error: "+e.message,"error"); });
}

// ================================================================
//  DELETE
// ================================================================
function delAppt(id){
  if(!confirm("Delete this appointment permanently?")) return;
  db.collection("appointments").doc(id).delete()
    .then(function(){ toast("Appointment deleted.","success"); closeModal(); })
    .catch(function(e){ toast("Error: "+e.message,"error"); });
}

// ================================================================
//  UPLOAD PRESCRIPTION
// ================================================================
function uploadPrescription(apptId, input){
  var file=input.files[0]; if(!file) return;
  toast("Uploading prescription...","");
  var ref=storage.ref("prescriptions/"+apptId+"_"+Date.now()+(file.name.endsWith(".pdf")?".pdf":".jpg"));
  ref.put(file).then(function(snap){
    return snap.ref.getDownloadURL();
  }).then(function(url){
    return db.collection("appointments").doc(apptId).update({
      prescriptionURL:url,
      status:"completed",
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    });
  }).then(function(){
    toast("Prescription uploaded! Appointment marked completed.","success");
    if($("modal").classList.contains("open")) openDetail(apptId);
  }).catch(function(e){ toast("Upload error: "+e.message,"error"); });
}

// ================================================================
//  VIDEO CALL (Admin side)
// ================================================================
function adminJoinCall(apptId, roomId){
  if(!roomId){ toast("No room ID available","error"); return; }

  // If room not saved yet, save it
  var appt=allAppts.find(function(a){return a.id===apptId;});
  if(appt && !appt.videoRoomId){
    db.collection("appointments").doc(apptId).update({videoRoomId:roomId});
  }

  // Clean up previous
  if(adminJitsiAPI){ try{adminJitsiAPI.dispose();}catch(e){} adminJitsiAPI=null; }
  var container=$("adminJitsi");
  container.innerHTML="";

  adminJitsiAPI=new JitsiMeetExternalAPI("meet.jit.si",{
    roomName:"ksp-"+roomId,
    parentNode:container,
    width:"100%", height:460,
    userInfo:{ displayName:"Dr. Aejaz Kotwal" },
    configOverwrite:{ startWithAudioMuted:false, startWithVideoMuted:false },
    interfaceConfigOverwrite:{
      TOOLBAR_BUTTONS:["microphone","camera","hangup","chat","tileview","recording"],
      SHOW_JITSI_WATERMARK:false, SHOW_WATERMARK_FOR_GUESTS:false
    }
  });
  adminJitsiAPI.addEventListener("videoConferenceLeft",function(){ adminEndCall(); });

  closeModal();
  $("videoModal").classList.add("open");
}

function adminToggleMic(){
  if(!adminJitsiAPI) return;
  adminJitsiAPI.executeCommand("toggleAudio");
  var icon=$("adminMicIcon");
  if(icon) icon.className=icon.className==="fa-solid fa-microphone-slash"?"fa-solid fa-microphone":"fa-solid fa-microphone-slash";
}
function adminToggleCam(){
  if(!adminJitsiAPI) return;
  adminJitsiAPI.executeCommand("toggleVideo");
  var icon=$("adminCamIcon");
  if(icon) icon.className=icon.className==="fa-solid fa-video-slash"?"fa-solid fa-video":"fa-solid fa-video-slash";
}
function adminEndCall(){
  if(adminJitsiAPI){ try{adminJitsiAPI.dispose();}catch(e){} adminJitsiAPI=null; }
  $("adminJitsi").innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-size:1rem;font-weight:600;"><i class="fa-solid fa-phone-slash" style="margin-right:8px"></i>Call Ended</div>';
  toast("Call ended","success");
}
function closeVideoModal(){
  adminEndCall();
  $("videoModal").classList.remove("open");
}
function bgCloseVideo(e){ if(e.target===$("videoModal")) closeVideoModal(); }

// ================================================================
//  USERS
// ================================================================
function renderUsers(){
  var grid=$("userGrid"); if(!grid) return;
  if(!allUsers.length){ grid.innerHTML="<div class='empty-msg' style='grid-column:1/-1'><i class='fa-solid fa-users'></i><p>No users yet</p></div>"; return; }
  grid.innerHTML=allUsers.map(function(u){
    var photo=esc(u.photoURL||avatarURL(u.name));
    var fb=esc(avatarURL("U"));
    var ts=u.loginAt&&u.loginAt.toDate?u.loginAt.toDate():null;
    var login=ts?ts.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):"—";
    var cnt=allAppts.filter(function(a){return a.userUID===u.uid;}).length;
    return "<div class='user-card'>"+
      "<img src='"+photo+"' onerror=\"this.src='"+fb+"'\"/>"+
      "<div class='user-card-name'>"+esc(u.name||"Unknown")+"</div>"+
      "<div class='user-card-email'>"+esc(u.email||"—")+"</div>"+
      "<div class='user-card-meta'>Last login: "+login+"</div>"+
      "<span class='user-card-tag'>"+cnt+" Appointment"+(cnt!==1?"s":"")+"</span>"+
    "</div>";
  }).join("");
}
