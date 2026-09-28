/* SWEET MART Admin V2 upgrade layer */
(function(){
  "use strict";
  var META_KEY="sweetMartV2Meta";
  var LAST_SYNC_KEY="sweetMartV2LastSync";
  var AUTO_LOCK_MS=30*60*1000;
  var idleTimer=null;
  var backupDbName="sweetMartAdminOfflineV2";
  var backupStore="cache";

  function safeParse(v,f){try{return JSON.parse(v)}catch(e){return f}}
  function meta(){return safeParse(localStorage.getItem(META_KEY)||"{}",{})}
  function saveMeta(m){try{localStorage.setItem(META_KEY,JSON.stringify(m))}catch(e){}}
  function setLastSync(){try{localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString())}catch(e){}}
  function getLastSync(){try{return localStorage.getItem(LAST_SYNC_KEY)||""}catch(e){return ""}}

  function toast2(msg,type){
    var stack=document.getElementById("toastStack");
    if(!stack)return;
    var el=document.createElement("div");
    el.className="toast "+(type||"info");
    el.textContent=msg;
    stack.appendChild(el);
    setTimeout(function(){el.remove()},3500);
  }

  function openV2Center(){
    var old=document.getElementById("smV2Center");
    if(old)old.remove();
    var wrap=document.createElement("div");
    wrap.id="smV2Center";
    wrap.className="modal open";
    wrap.innerHTML='<div class="modal-card v2-center-card"><div class="modal-head"><div><div class="modal-title">SWEET MART Admin V2</div><div class="small-muted">System health, offline tools and recovery</div></div><button class="close" id="v2Close">×</button></div><div class="modal-body"><div id="v2Health"></div><div class="panel" style="margin-top:12px"><div class="panel-head"><div class="panel-title">Offline & Sync</div></div><div class="panel-body"><div class="quick-actions"><button class="btn primary" id="v2Sync">↻ Sync now</button><button class="btn" id="v2RefreshSW">♻ Check app update</button></div><div class="small-muted" id="v2SyncText" style="margin-top:9px"></div></div></div><div class="panel"><div class="panel-head"><div class="panel-title">Local Backup</div></div><div class="panel-body"><div class="small-muted">Creates a backup of locally cached dashboard data and preferences. Passwords and session tokens are never included.</div><div class="quick-actions" style="margin-top:9px"><button class="btn" id="v2Export">⬇ Export backup</button><button class="btn" id="v2Import">⬆ Import backup</button><input id="v2File" type="file" accept=".json,application/json" hidden></div></div></div><div class="panel"><div class="panel-head"><div class="panel-title">Session protection</div></div><div class="panel-body"><div class="small-muted">The dashboard locks after 30 minutes of inactivity. Your existing sign-in flow remains unchanged.</div><div class="quick-actions" style="margin-top:9px"><button class="btn" id="v2Lock">🔒 Lock dashboard</button></div></div></div></div></div>';
    document.body.appendChild(wrap);
    document.getElementById("v2Close").onclick=function(){wrap.remove()};
    wrap.addEventListener("click",function(e){if(e.target===wrap)wrap.remove()});
    renderHealth();
    document.getElementById("v2Sync").onclick=async function(){
      this.disabled=true;
      try{
        if(typeof window.flushOfflineQueue==="function")await window.flushOfflineQueue();
        setLastSync();
        await renderHealth();
        toast2("Sync requested.","success");
      }catch(e){toast2("Sync could not be completed yet.","error")}
      finally{this.disabled=false}
    };
    document.getElementById("v2RefreshSW").onclick=async function(){
      try{
        if("serviceWorker" in navigator){
          var regs=await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(function(r){return r.update()}));
        }
        toast2("App update check completed.","success");
      }catch(e){toast2("Update check failed.","error")}
    };
    document.getElementById("v2Export").onclick=exportBackup;
    document.getElementById("v2Import").onclick=function(){document.getElementById("v2File").click()};
    document.getElementById("v2File").onchange=function(){if(this.files&&this.files[0])importBackup(this.files[0])};
    document.getElementById("v2Lock").onclick=function(){
      wrap.remove();
      if(typeof window.clearSession==="function")window.clearSession();
      if(typeof window.showLogin==="function")window.showLogin("Dashboard locked. Please sign in again.");
      toast2("Dashboard locked.","info");
    };
  }

  async function dbSnapshot(){
    return new Promise(function(resolve){
      if(!("indexedDB" in window)){resolve([]);return}
      var req;
      try{req=indexedDB.open(backupDbName)}catch(e){resolve([]);return}
      req.onerror=function(){resolve([])};
      req.onsuccess=function(){
        var db=req.result;
        if(!db.objectStoreNames.contains(backupStore)){db.close();resolve([]);return}
        var out=[];
        try{
          var tx=db.transaction(backupStore,"readonly"),store=tx.objectStore(backupStore);
          var cur=store.openCursor();
          cur.onsuccess=function(){
            var c=cur.result;
            if(!c){db.close();resolve(out);return}
            out.push({key:c.key,value:c.value});
            c.continue();
          };
          cur.onerror=function(){db.close();resolve(out)};
        }catch(e){db.close();resolve([])}
      };
    });
  }

  async function exportBackup(){
    try{
      var ls={};
      for(var i=0;i<localStorage.length;i++){
        var k=localStorage.key(i);
        if(!k)continue;
        if(/password|session|token|credential/i.test(k))continue;
        ls[k]=localStorage.getItem(k);
      }
      var data={format:"SWEET-MART-ADMIN-V2-BACKUP",version:2,createdAt:new Date().toISOString(),localStorage:ls,indexedDb:await dbSnapshot()};
      var blob=new Blob([JSON.stringify(data)],{type:"application/json"});
      var a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download="sweet-mart-admin-v2-backup-"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
      toast2("Backup exported. Sensitive credentials were excluded.","success");
    }catch(e){toast2("Backup export failed.","error")}
  }

  async function importBackup(file){
    try{
      var data=safeParse(await file.text(),null);
      if(!data||data.format!=="SWEET-MART-ADMIN-V2-BACKUP")throw new Error("Invalid backup");
      if(data.localStorage){
        Object.keys(data.localStorage).forEach(function(k){
          if(!/password|session|token|credential/i.test(k))localStorage.setItem(k,String(data.localStorage[k]));
        });
      }
      toast2("Backup preferences restored. Reloading saved data…","success");
      setTimeout(function(){location.reload()},700);
    }catch(e){toast2("Invalid or unreadable backup file.","error")}
  }

  async function queueCount(){
    return new Promise(function(resolve){
      if(!("indexedDB" in window)){resolve(0);return}
      var req;
      try{req=indexedDB.open(backupDbName)}catch(e){resolve(0);return}
      req.onerror=function(){resolve(0)};
      req.onsuccess=function(){
        var db=req.result;
        if(!db.objectStoreNames.contains(backupStore)){db.close();resolve(0);return}
        try{
          var tx=db.transaction(backupStore,"readonly"),store=tx.objectStore(backupStore),count=0,cur=store.openCursor();
          cur.onsuccess=function(){var c=cur.result;if(!c){db.close();resolve(count);return}var v=c.value||{};if(v.type==="mutation"||v.action)count++;c.continue()};
          cur.onerror=function(){db.close();resolve(0)};
        }catch(e){db.close();resolve(0)}
      };
    });
  }

  async function renderHealth(){
    var el=document.getElementById("v2Health");if(!el)return;
    var q=await queueCount();
    var online=navigator.onLine;
    var last=getLastSync();
    el.innerHTML='<div class="report-grid"><div class="card blue-top"><div class="label">Connection</div><div class="value">'+(online?"Online":"Offline")+'</div><div class="sub">Live browser status</div></div><div class="card amber-top"><div class="label">Pending sync</div><div class="value">'+q+'</div><div class="sub">Local queued operations</div></div><div class="card green-top"><div class="label">Last sync</div><div class="value" style="font-size:15px">'+(last?esc2(new Date(last).toLocaleTimeString()):"Not recorded")+'</div><div class="sub">'+(last?esc2(new Date(last).toLocaleDateString()):"Use Sync now")+'</div></div><div class="card purple-top"><div class="label">App</div><div class="value" style="font-size:15px">V2</div><div class="sub">Reliability layer active</div></div></div>';
    var st=document.getElementById("v2SyncText");
    if(st)st.textContent=q?("There are "+q+" locally queued operations."):("No queued operations detected in the local cache.");
  }
  function esc2(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}

  function addNavButton(){
    var side=document.getElementById("sideNav");
    if(side&&!document.getElementById("v2NavBtn")){
      var b=document.createElement("button");b.id="v2NavBtn";b.type="button";b.innerHTML='🛡️ <span class="nav-label">V2 System Center</span>';b.onclick=openV2Center;side.appendChild(b);
    }
  }

  function addDashboardHealth(){
    var page=document.getElementById("page-dashboard");
    if(!page||page.dataset.v2Health==="1")return;
    var panel=document.createElement("div");
    panel.className="panel";
    panel.innerHTML='<div class="panel-head"><div><div class="panel-title">V2 System Health</div><div class="panel-meta">Offline readiness, synchronization and application status</div></div><button class="btn small" id="v2DashboardOpen">Open System Center</button></div><div class="panel-body"><div id="v2DashboardHealth"></div></div>';
    page.insertBefore(panel,page.firstChild);
    page.dataset.v2Health="1";
    document.getElementById("v2DashboardOpen").onclick=openV2Center;
    renderDashboardHealth();
  }
  async function renderDashboardHealth(){
    var el=document.getElementById("v2DashboardHealth");if(!el)return;
    var q=await queueCount(), last=getLastSync();
    el.innerHTML='<div class="stat-row"><div class="item"><div class="item-title">'+(navigator.onLine?"🟢 Online":"🟠 Offline")+'</div><div class="item-sub">Connection state</div></div><div class="item"><div class="item-title">'+q+' pending</div><div class="item-sub">Offline operations</div></div><div class="item"><div class="item-title">'+(last?esc2(new Date(last).toLocaleTimeString()):"—")+'</div><div class="item-sub">Last V2 sync</div></div><div class="item"><div class="item-title">Protected</div><div class="item-sub">30-minute inactivity lock</div></div></div>';
  }

  function setupIdleLock(){
    var activity=function(){
      clearTimeout(idleTimer);
      if(!document.getElementById("app")||document.getElementById("app").classList.contains("hidden"))return;
      idleTimer=setTimeout(function(){
        if(document.getElementById("app")&&!document.getElementById("app").classList.contains("hidden")){
          if(typeof window.clearSession==="function")window.clearSession();
          if(typeof window.showLogin==="function")window.showLogin("Your dashboard was locked after 30 minutes of inactivity.");
          toast2("Dashboard locked for security.","info");
        }
      },AUTO_LOCK_MS);
    };
    ["click","keydown","touchstart","mousemove"].forEach(function(ev){window.addEventListener(ev,activity,{passive:true})});
    activity();
  }

  function setupAndroid(){
    try{
      if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App){
        window.Capacitor.Plugins.App.addListener("backButton",function(){
          var modal=document.getElementById("modal");
          var v2=document.getElementById("smV2Center");
          if(v2){v2.remove();return}
          if(modal&&modal.classList.contains("open")){if(typeof window.closeModal==="function")window.closeModal();return}
          if(window.innerWidth<=1000&&document.querySelector(".sidebar.open")){if(typeof window.closeSidebar==="function")window.closeSidebar();return}
          var app=document.getElementById("app");
          if(app&&!app.classList.contains("hidden")&&typeof window.showLogin==="function"){
            if(confirm("Exit SWEET MART Admin?"))window.Capacitor.Plugins.App.exitApp();
          }
        });
      }
    }catch(e){}
  }

  function setup(){
    addNavButton();
    addDashboardHealth();
    setupIdleLock();
    setupAndroid();
    window.addEventListener("online",function(){setTimeout(function(){setLastSync();renderDashboardHealth()},1200)});
    window.addEventListener("offline",renderDashboardHealth);
    setInterval(function(){addNavButton();addDashboardHealth();renderDashboardHealth()},5000);
    var m=meta();m.version=2;m.updatedAt=new Date().toISOString();saveMeta(m);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);else setup();
})();
