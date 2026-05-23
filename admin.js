// ================================================================
//  KSP CLINIC -- admin.js
//  Direct dashboard -- no login
//  Firebase Firestore + Storage, Jitsi lazy-loaded
// ================================================================

/* -- Firebase init --------------------------------------------- */
var FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDyFDmfg1s-1RgOEWiCmt0pTO43Um6NxXQ",
  authDomain:        "kotwal-skin-and-pain.firebaseapp.com",
  projectId:         "kotwal-skin-and-pain",
  storageBucket:     "kotwal-skin-and-pain.appspot.com",
  messagingSenderId: "461562185631",
  appId:             "1:461562185631:web:5f3b763edffa94bf80dfaa"
};

var db, storage, adminJitsiAPI, adminJitsiLoaded = false;

try {
  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
  db      = firebase.firestore();
  storage = firebase.storage();
} catch(e) {
  console.error('Firebase init failed:', e);
  document.body.innerHTML =
    '<div style="padding:40px;font-family:sans-serif;color:#ef4444;font-size:1rem;">' +
    '<b>Firebase failed to load.</b><br>Check internet connection and try refreshing.' +
    '</div>';
}

/* -- State ----------------------------------------------------- */
var allAppts       = [];
var allUsers       = [];
var unsubAppts     = null;
var unsubUsers     = null;
var currentModalId = null;
var toastTimer     = null;

/* -- Helpers --------------------------------------------------- */
var $ = function(id){ return document.getElementById(id); };

function toast(msg, type){
  var t = $('adminToast'); if(!t) return;
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className = 'toast ' + (type||'') + ' show';
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, type==='error' ? 5000 : 3000);
}

function esc(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function cap(s){ return s ? s[0].toUpperCase()+s.slice(1) : ''; }
function setText(id,v){ var e=$(id); if(e) e.textContent=v; }
function avatarURL(n){ return 'https://ui-avatars.com/api/?name='+encodeURIComponent(n||'U')+'&size=80&background=dbeafe&color=1d4ed8'; }
function emptyHTML(icon,msg){ return "<div class='empty-msg'><i class='fa-solid "+icon+"'></i><p>"+msg+"</p></div>"; }
function mkbtn(cls,action,label){ return "<button class='abtn "+cls+"' type='button' onclick=\""+action+"\">"+label+"</button>"; }

/* -- Start on page load ---------------------------------------- */
window.addEventListener('load', function(){
  if(db){
    startListeners();
  } else {
    toast('Database not available -- check Firebase config', 'error');
  }
});

/* -- Global error handler -- prevents blank page on JS errors --- */
window.addEventListener('error', function(e){
  console.error('Admin JS error:', e.message, e.lineno);
  // Don't crash the whole page -- just log it
});
window.addEventListener('unhandledrejection', function(e){
  console.error('Admin unhandled promise:', e.reason);
});

/* ===============================================================
   FIRESTORE LISTENERS
=============================================================== */
function startListeners(){
  /* Appointments */
  if(unsubAppts){ try{unsubAppts();}catch(e){} }
  unsubAppts = db.collection('appointments')
    .orderBy('bookingTimestamp','desc')
    .onSnapshot(function(snap){
      allAppts = [];
      snap.forEach(function(d){ allAppts.push(Object.assign({id:d.id}, d.data())); });
      refreshStats();
      refreshRecent();
      filterList('offline');
      filterList('online');
      refreshBadges();
      // Refresh open modal with latest data
      if(currentModalId && $('modal') && $('modal').classList.contains('open')){
        openDetail(currentModalId);
      }
    }, function(e){
      console.error('Appointments listener:', e);
      if(e.code === 'permission-denied'){
        toast('Firestore permission denied -- check Security Rules', 'error');
      } else {
        toast('Database error: '+e.message, 'error');
      }
    });

  /* Users */
  if(unsubUsers){ try{unsubUsers();}catch(e){} }
  unsubUsers = db.collection('users')
    .onSnapshot(function(snap){
      allUsers = [];
      snap.forEach(function(d){ allUsers.push(Object.assign({id:d.id}, d.data())); });
      renderUsers();
      setText('sUsers', allUsers.length);
    }, function(e){ console.error('Users listener:', e); });
}

/* ===============================================================
   SIDEBAR / TABS
=============================================================== */
function openSidebar(){
  var s=$('sidebar'), o=$('overlay');
  if(s) s.classList.add('open');
  if(o) o.classList.add('open');
}
function closeSidebar(){
  var s=$('sidebar'), o=$('overlay');
  if(s) s.classList.remove('open');
  if(o) o.classList.remove('open');
}

function switchTab(name, btn){
  document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(b){ b.classList.remove('active'); });
  var tab = $('tab-'+name);
  if(tab) tab.classList.add('active');
  if(btn) btn.classList.add('active');
  var titles = {dashboard:'Dashboard',offline:'Offline Appointments',online:'Online Consultations',users:'Users'};
  setText('topbarTitle', titles[name]||name);
  closeSidebar();
}

/* ===============================================================
   STATS + BADGES
=============================================================== */
function refreshStats(){
  var total=0, pending=0, payment=0, approved=0, completed=0;
  for(var i=0;i<allAppts.length;i++){
    var s=allAppts[i].status; total++;
    if(s==='pending')                          pending++;
    if(s==='payment_uploaded'||s==='pending_approval') payment++;
    if(s==='approved')                         approved++;
    if(s==='completed')                        completed++;
  }
  setText('sTotal',    total);
  setText('sPending',  pending);
  setText('sPayment',  payment);
  setText('sApproved', approved);
  setText('sCompleted',completed);
}

function refreshBadges(){
  var offP=0, onP=0;
  for(var i=0;i<allAppts.length;i++){
    var a=allAppts[i];
    if(a.type!=='online' && a.status==='pending') offP++;
    if(a.type==='online' && (a.status==='payment_uploaded'||a.status==='pending_approval')) onP++;
  }
  var ob=$('offlineBadge'), onb=$('onlineBadge');
  if(ob){ ob.textContent=offP; ob.style.display=offP>0?'inline-block':'none'; }
  if(onb){ onb.textContent=onP; onb.style.display=onP>0?'inline-block':'none'; }
}

/* ===============================================================
   RECENT (Dashboard)
=============================================================== */
function refreshRecent(){
  var el=$('recentList'); if(!el) return;
  var recent=allAppts.slice(0,10);
  if(!recent.length){ el.innerHTML=emptyHTML('fa-calendar-xmark','No appointments yet'); return; }
  el.innerHTML=buildTable(recent, true);
}

/* ===============================================================
   FILTER LISTS
=============================================================== */
function filterList(type){
  var isOnline = (type==='online');
  var qId     = isOnline ? 'onSearch'  : 'offSearch';
  var dateId  = isOnline ? 'onDate'    : 'offDate';
  var statId  = isOnline ? 'onStatus'  : 'offStatus';
  var listId  = isOnline ? 'onlineList': 'offlineList';

  var q    = ($(qId)    ? $(qId).value    : '').toLowerCase().trim();
  var date = ($(dateId) ? $(dateId).value : '');
  var stat = ($(statId) ? $(statId).value : '');

  var list = allAppts.filter(function(a){
    if(isOnline ? a.type !== 'online' : a.type === 'online') return false;
    var pts = a.patients||[];
    if(q){
      var names = pts.map(function(p){return (p.name||'').toLowerCase();}).join(' ');
      if(!names.includes(q) && !(a.userEmail||'').toLowerCase().includes(q) &&
         !(a.userName||'').toLowerCase().includes(q) && !(a.appointmentId||'').toLowerCase().includes(q)) return false;
    }
    if(date && !pts.some(function(p){return p.date===date;})) return false;
    if(stat && a.status!==stat) return false;
    return true;
  });

  var el=$(listId); if(!el) return;
  if(!list.length){ el.innerHTML=emptyHTML('fa-magnifying-glass','No appointments match filters'); return; }
  el.innerHTML=buildTable(list, false);
}

/* ===============================================================
   BUILD TABLE
=============================================================== */
function fmtStatus(s){
  var map={
    pending:' Pending', payment_uploaded:'Payment Up',
    pending_approval:'Awaiting', approved:'Approved',
    rejected:'Rejected', completed:'Completed'
  };
  return map[s]||cap(s||'pending');
}

function buildTable(list, compact){
  var rows = '';
  for(var i=0;i<list.length;i++){
    var a   = list[i];
    var pts = a.patients||[];
    var p0  = pts[0]||{};
    var name1   = esc(p0.name||'Unknown');
    var extra   = pts.length>1?' <span style="font-size:.68rem;color:#94a3b8">+'+(pts.length-1)+' more</span>':'';
    var ts      = a.bookingTimestamp&&a.bookingTimestamp.toDate?a.bookingTimestamp.toDate():null;
    var booked  = ts?ts.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'--';
    var sid     = (a.appointmentId||a.id.slice(-8)).toUpperCase();
    var photo   = esc(a.userPhoto||avatarURL(a.userName));
    var fb      = esc(avatarURL('U'));
    var typeTag = "<span class='type-tag "+(a.type||'offline')+"'>"+(a.type==='online'?'? Online':'? Offline')+"</span>";
    var payThumb = '';
    if(a.type==='online' && a.paymentScreenshotURL && !compact){
      payThumb = "<img src='"+esc(a.paymentScreenshotURL)+"' class='pay-thumb' onclick=\"window.open('"+esc(a.paymentScreenshotURL)+"','_blank')\" title='View Screenshot' onerror=\"this.style.display='none'\"/>";
    }
    var btns = compact
      ? mkbtn('abtn-view',"openDetail('"+a.id+"')",'View')
      : mkbtn('abtn-view',"openDetail('"+a.id+"')",'View')+
        (a.status!=='approved'&&a.status!=='completed'?mkbtn('abtn-approve',"openDetail('"+a.id+"')",'v'):'') +
        (a.status!=='rejected'?mkbtn('abtn-reject',"openDetail('"+a.id+"')",'x'):'') +
        mkbtn('abtn-delete',"delAppt('"+a.id+"')","?");

    rows += "<tr>" +
      "<td><div class='ucell'>" +
        "<img src='"+photo+"' onerror=\"this.src='"+fb+"'\"/>" +
        "<div><div class='ucell-name'>"+esc(a.userName||'Unknown')+"</div>" +
        "<div class='ucell-email'>"+esc(a.userEmail||'')+"</div></div></div></td>" +
      "<td><span style='font-size:.7rem;color:#94a3b8'>#"+sid+"</span><br>"+name1+extra+"</td>" +
      "<td>"+typeTag+"</td>" +
      "<td>"+(p0.date||'--')+"</td>" +
      "<td style='font-size:.78rem'>"+(p0.slot||'--')+"</td>" +
      "<td><span class='badge "+(a.status||'pending')+"'>"+fmtStatus(a.status)+"</span></td>" +
      (compact?'':"<td>"+payThumb+"</td>") +
      "<td>"+booked+"</td>" +
      "<td><div class='acts'>"+btns+"</div></td>" +
    "</tr>";
  }

  return "<div style='overflow-x:auto'>" +
    "<table class='appt-table'><thead><tr>" +
      "<th>User</th><th>Patient</th><th>Type</th><th>Date</th><th>Slot</th><th>Status</th>" +
      (compact?'':"<th>Payment</th>") +
      "<th>Booked</th><th>Actions</th>" +
    "</tr></thead><tbody>"+rows+"</tbody></table></div>";
}

/* ===============================================================
   DETAIL MODAL
=============================================================== */
function openDetail(id){
  currentModalId = id;
  var a = null;
  for(var i=0;i<allAppts.length;i++){ if(allAppts[i].id===id){a=allAppts[i];break;} }
  if(!a){ toast('Appointment not found','error'); return; }

  var pts    = a.patients||[];
  var sid    = (a.appointmentId||a.id.slice(-8)).toUpperCase();
  var ts     = a.bookingTimestamp&&a.bookingTimestamp.toDate?a.bookingTimestamp.toDate():null;
  var booked = ts?ts.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'--';
  var photo  = esc(a.userPhoto||avatarURL(a.userName));
  var fb     = esc(avatarURL('U'));

  /* Patient cards */
  var ptsHtml = '';
  for(var j=0;j<pts.length;j++){
    var p=pts[j];
    ptsHtml += "<div class='m-patient'>" +
      "<div class='m-pt-head'><span class='m-pt-num'>"+(j+1)+"</span> Patient "+(j+1)+"</div>" +
      "<div class='m-grid'>" +
        mf('Full Name',p.name)+mf('Age',p.age)+mf('Gender',p.gender)+mf('Mobile',p.mobile)+
        mf('Email',p.email)+mf('Date',p.date)+mf('Time Slot',p.slot)+
        "<div class='m-field m-full'><div class='m-label'>Symptoms</div><div class='m-val'>"+esc(p.symptoms||'--')+"</div></div>" +
      "</div></div>";
  }

  /* Payment screenshot */
  var paySection = '';
  if(a.type==='online' && a.paymentScreenshotURL){
    paySection = "<div style='margin:14px 0'>" +
      "<div class='m-label' style='margin-bottom:8px;color:#8b5cf6'><i class='fa-solid fa-money-bill'></i> PAYMENT SCREENSHOT</div>" +
      "<img src='"+esc(a.paymentScreenshotURL)+"' class='pay-screenshot' " +
        "onclick=\"window.open('"+esc(a.paymentScreenshotURL)+"','_blank')\" " +
        "title='Click to view full size' onerror=\"this.outerHTML='<p style=color:#ef4444>Screenshot failed to load</p>'\"/>" +
    "</div>";
  }

  /* Doctor message + action buttons */
  var existingMsg = esc(a.doctorMessage||'');
  var actionSection =
    "<div class='m-msg-section'>" +
      "<div class='m-msg-label'><i class='fa-solid fa-comment-medical'></i> Message to Patient</div>" +
      "<textarea id='doctorMsg' class='m-msg-ta' placeholder='Optional message for the patient...'>" +existingMsg+ "</textarea>" +
      "<div class='m-msg-hint'>Patient sees this instantly when you approve or reject.</div>" +
    "</div>" +
    "<div class='m-actions'>" +
      (a.status!=='approved'&&a.status!=='completed' ? mkbtn('abtn-approve',"setStatus('"+a.id+"','approved')","Approve &amp; Notify") : '') +
      (a.status!=='rejected' ? mkbtn('abtn-reject',"setStatus('"+a.id+"','rejected')","Reject &amp; Notify") : '') +
      mkbtn('abtn-delete',"delAppt('"+a.id+"')","Delete") +
    "</div>";

  /* Video section (online only) */
  var videoSection = '';
  if(a.type==='online'){
    var roomId = a.videoRoomId||'';
    videoSection = "<div class='m-video-section'>" +
      "<div class='m-video-label'><i class='fa-solid fa-video'></i> Video Room</div>" +
      (roomId
        ? "<div class='m-room-id'>Room: ksp-"+esc(roomId)+" <i class='fa-regular fa-copy' onclick=\"copyRoomId('"+esc(roomId)+"')\" title='Copy'></i></div>"
        : "<div class='m-room-id' style='color:#94a3b8'>Room auto-generated on approval</div>")+
      "<button class='m-join-btn' type='button' onclick=\"adminJoinCall('"+a.id+"','"+esc(roomId||a.id.slice(-8))+"')\">" +
        "<i class='fa-solid fa-video'></i> Join / Start Video Call</button>" +
    "</div>";
  }

  /* Prescription section */
  var rxSection = "<div class='rx-upload-section'>" +
    "<div class='rx-upload-label'><i class='fa-solid fa-file-medical'></i> Upload Prescription</div>" +
    "<input type='file' id='rxFileInput' accept='image/*,.pdf' onchange=\"uploadPrescription('"+a.id+"',this)\"/>" +
    "<button class='rx-upload-btn' type='button' onclick=\"$('rxFileInput').click()\">" +
      "<i class='fa-solid fa-cloud-arrow-up'></i> Upload Prescription (Image or PDF)</button>" +
    (a.prescriptionURL
      ? "<div class='rx-current'><i class='fa-solid fa-file-medical' style='color:#10b981'></i> Prescription uploaded " +
        "<a href='"+esc(a.prescriptionURL)+"' target='_blank' rel='noopener'>View / Download</a></div>"
      : "") +
  "</div>";

  $('modalBody').innerHTML =
    "<div class='m-title'>Appointment Details</div>" +
    "<div class='m-id'>#"+sid+" &nbsp;&middot;&nbsp; "+booked +
      " &nbsp;&middot;&nbsp; <span class='badge "+(a.status||'pending')+"'>"+fmtStatus(a.status)+"</span></div>" +
    "<div class='m-user-row'>" +
      "<img src='"+photo+"' onerror=\"this.src='"+fb+"'\" alt='User'/>" +
      "<div><div class='m-user-name'>"+esc(a.userName||'Unknown')+"</div>" +
           "<div class='m-user-email'>"+esc(a.userEmail||'')+"</div></div></div>" +
    ptsHtml + paySection + actionSection + videoSection + rxSection;

  $('modal').classList.add('open');
}

function mf(label, val){
  return "<div class='m-field'><div class='m-label'>"+label+"</div><div class='m-val'>"+esc(val||'--')+"</div></div>";
}
function closeModal(){ $('modal').classList.remove('open'); currentModalId=null; }
function bgClose(e){ if(e.target===$('modal')) closeModal(); }

function copyRoomId(roomId){
  if(navigator.clipboard){
    navigator.clipboard.writeText('ksp-'+roomId).then(function(){ toast('Room ID copied!','success'); });
  }
}

/* ===============================================================
   CHANGE STATUS
=============================================================== */
function setStatus(id, status){
  if(!db){ toast('Database not available','error'); return; }
  var msgEl = $('doctorMsg');
  var msg   = msgEl ? msgEl.value.trim() : '';
  var updates = {
    status:        status,
    doctorMessage: msg,
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
  };

  /* Auto-generate video room ID on approval of online appointments */
  if(status === 'approved'){
    var appt = null;
    for(var i=0;i<allAppts.length;i++){ if(allAppts[i].id===id){appt=allAppts[i];break;} }
    if(appt && appt.type==='online' && !appt.videoRoomId){
      updates.videoRoomId = 'room' + Date.now();
    }
  }

  db.collection('appointments').doc(id).update(updates)
    .then(function(){
      toast('Appointment '+status+'! Patient notified.', 'success');
    })
    .catch(function(e){
      toast('Update failed: '+e.message, 'error');
      console.error('setStatus:', e);
    });
}

/* ===============================================================
   DELETE
=============================================================== */
function delAppt(id){
  if(!confirm('Delete this appointment permanently? This cannot be undone.')) return;
  if(!db){ toast('Database not available','error'); return; }
  db.collection('appointments').doc(id).delete()
    .then(function(){ toast('Appointment deleted.','success'); closeModal(); })
    .catch(function(e){ toast('Delete failed: '+e.message,'error'); });
}

/* ===============================================================
   UPLOAD PRESCRIPTION
=============================================================== */
function uploadPrescription(apptId, input){
  var file = input.files[0]; if(!file) return;
  if(!storage){ toast('Storage not available','error'); return; }
  if(file.size > 8*1024*1024){ toast('File too large -- max 8MB','error'); return; }

  toast('Uploading prescription...','');
  var ext = file.name.endsWith('.pdf') ? '.pdf' : '.jpg';
  var ref = storage.ref('prescriptions/'+apptId+'_'+Date.now()+ext);

  ref.put(file)
    .then(function(snap){ return snap.ref.getDownloadURL(); })
    .then(function(url){
      return db.collection('appointments').doc(apptId).update({
        prescriptionURL: url,
        status:          'completed',
        updatedAt:       firebase.firestore.FieldValue.serverTimestamp()
      });
    })
    .then(function(){
      toast('Prescription uploaded! Appointment marked completed.','success');
    })
    .catch(function(e){
      toast('Upload failed: '+e.message,'error');
      console.error('uploadPrescription:', e);
    });
}

/* ===============================================================
   VIDEO CALL -- Jitsi lazy-loaded
=============================================================== */
function adminJoinCall(apptId, roomId){
  if(!roomId){ toast('No room ID available','error'); return; }

  /* Save room ID to Firestore if not already set */
  var appt = null;
  for(var i=0;i<allAppts.length;i++){ if(allAppts[i].id===apptId){appt=allAppts[i];break;} }
  if(appt && !appt.videoRoomId && db){
    db.collection('appointments').doc(apptId).update({ videoRoomId: roomId })
      .catch(function(e){ console.warn('Could not save roomId:', e); });
  }

  closeModal();
  $('videoModal').classList.add('open');

  if(adminJitsiLoaded){
    _startAdminJitsi(roomId);
  } else {
    var container = $('adminJitsi');
    if(container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;gap:10px"><i class="fa-solid fa-spinner fa-spin" style="font-size:22px"></i> Loading video...</div>';
    var script = document.createElement('script');
    script.src   = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = function(){
      adminJitsiLoaded = true;
      _startAdminJitsi(roomId);
    };
    script.onerror = function(){
      toast('Video service failed to load -- check internet','error');
      if(container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef4444;gap:10px"><i class="fa-solid fa-video-slash"></i> Video unavailable</div>';
    };
    document.body.appendChild(script);
  }
}

function _startAdminJitsi(roomId){
  if(adminJitsiAPI){ try{adminJitsiAPI.dispose();}catch(e){} adminJitsiAPI=null; }
  var container = $('adminJitsi');
  if(!container) return;
  container.innerHTML = '';
  try {
    adminJitsiAPI = new JitsiMeetExternalAPI('meet.jit.si', {
      roomName:   'ksp-'+roomId,
      parentNode: container,
      width:      '100%',
      height:     460,
      userInfo:   { displayName: 'Dr. Aejaz Kotwal' },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking:  true
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: ['microphone','camera','hangup','chat','tileview','recording'],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false
      }
    });
    adminJitsiAPI.addEventListener('videoConferenceLeft', function(){ adminEndCall(); });
  } catch(e){
    toast('Could not start video: '+e.message,'error');
    console.error('Jitsi admin error:', e);
  }
}

function adminToggleMic(){
  if(!adminJitsiAPI) return;
  try {
    adminJitsiAPI.executeCommand('toggleAudio');
    var icon = $('adminMicIcon');
    if(icon) icon.className = icon.className.includes('slash') ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';
  } catch(e){}
}
function adminToggleCam(){
  if(!adminJitsiAPI) return;
  try {
    adminJitsiAPI.executeCommand('toggleVideo');
    var icon = $('adminCamIcon');
    if(icon) icon.className = icon.className.includes('slash') ? 'fa-solid fa-video' : 'fa-solid fa-video-slash';
  } catch(e){}
}
function adminEndCall(){
  if(adminJitsiAPI){ try{adminJitsiAPI.dispose();}catch(e){} adminJitsiAPI=null; }
  var c=$('adminJitsi');
  if(c) c.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-weight:600;gap:10px"><i class="fa-solid fa-phone-slash"></i> Call Ended</div>';
  toast('Call ended','success');
}
function closeVideoModal(){ adminEndCall(); $('videoModal').classList.remove('open'); }
function bgCloseVideo(e){ if(e.target===$('videoModal')) closeVideoModal(); }

/* ===============================================================
   USERS
=============================================================== */
function renderUsers(){
  var grid=$('userGrid'); if(!grid) return;
  if(!allUsers.length){
    grid.innerHTML="<div class='empty-msg' style='grid-column:1/-1'><i class='fa-solid fa-users'></i><p>No users yet</p></div>";
    return;
  }
  var html='';
  for(var i=0;i<allUsers.length;i++){
    var u=allUsers[i];
    var photo=esc(u.photoURL||avatarURL(u.name));
    var fb=esc(avatarURL('U'));
    var ts=u.loginAt&&u.loginAt.toDate?u.loginAt.toDate():null;
    var login=ts?ts.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'--';
    var cnt=0;
    for(var j=0;j<allAppts.length;j++){ if(allAppts[j].userUID===u.uid) cnt++; }
    html += "<div class='user-card'>" +
      "<img src='"+photo+"' onerror=\"this.src='"+fb+"'\" alt='User'/>" +
      "<div class='user-card-name'>"+esc(u.name||'Unknown')+"</div>" +
      "<div class='user-card-email'>"+esc(u.email||'--')+"</div>" +
      "<div class='user-card-meta'>Last login: "+login+"</div>" +
      "<span class='user-card-tag'>"+cnt+" Appointment"+(cnt!==1?'s':'')+"</span>" +
    "</div>";
  }
  grid.innerHTML=html;
}
