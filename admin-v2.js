/* SWEET MART Admin V2 upgrade layer */
(function(){
  "use strict";
  var META_KEY="sweetMartV2Meta";
  var ENHANCED_VERSION="3.0";
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
    wrap.innerHTML='<div class="modal-card v2-center-card"><div class="modal-head"><div><div class="modal-title">SWEET MART Admin V2 · Enhanced</div><div class="small-muted">System health, offline tools and recovery</div></div><button class="close" id="v2Close">×</button></div><div class="modal-body"><div id="v2Health"></div><div class="panel" style="margin-top:12px"><div class="panel-head"><div class="panel-title">Offline & Sync</div></div><div class="panel-body"><div class="quick-actions"><button class="btn primary" id="v2Sync">↻ Sync now</button><button class="btn" id="v2Retry">🔁 Retry queued</button><button class="btn" id="v2RefreshSW">♻ Check app update</button></div><div class="small-muted" id="v2SyncText" style="margin-top:9px"></div><div id="v2QueueDetail" class="list" style="margin-top:10px"></div></div></div><div class="panel"><div class="panel-head"><div class="panel-title">Local Backup</div></div><div class="panel-body"><div class="small-muted">Creates a backup of locally cached dashboard data and preferences. Passwords and session tokens are never included.</div><div class="quick-actions" style="margin-top:9px"><button class="btn" id="v2Export">⬇ Export backup</button><button class="btn" id="v2Import">⬆ Import backup</button><input id="v2File" type="file" accept=".json,application/json" hidden></div></div></div><div class="panel"><div class="panel-head"><div class="panel-title">Session protection</div></div><div class="panel-body"><div class="small-muted">The dashboard locks after 30 minutes of inactivity. Your existing sign-in flow remains unchanged.</div><div class="quick-actions" style="margin-top:9px"><button class="btn" id="v2Lock">🔒 Lock dashboard</button></div></div></div></div></div>';
    document.body.appendChild(wrap);
    document.getElementById("v2Close").onclick=function(){wrap.remove()};
    wrap.addEventListener("click",function(e){if(e.target===wrap)wrap.remove()});
    renderHealth();
    document.getElementById("v2Sync").onclick=async function(){
      this.disabled=true;
      try{
        window.dispatchEvent(new Event("online"));
        setLastSync();
        await renderHealth();
        toast2("Sync requested.","success");
      }catch(e){toast2("Sync could not be completed yet.","error")}
      finally{this.disabled=false}
    };
    document.getElementById("v2Retry").onclick=requestQueueRetry;
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
      var lb=document.querySelector(".nav-logout"); if(lb)lb.click(); else { localStorage.removeItem("sweetMartAdminCredentials"); location.reload(); }
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

  async function restoreDbSnapshot(items){
    return new Promise(function(resolve){
      try{
        if(!("indexedDB" in window)){resolve(false);return}
        var req=indexedDB.open(backupDbName);
        req.onerror=function(){resolve(false)};
        req.onsuccess=function(){
          var db=req.result;
          if(!db.objectStoreNames.contains(backupStore)){db.close();resolve(false);return}
          try{
            var tx=db.transaction(backupStore,"readwrite"),store=tx.objectStore(backupStore);
            items.forEach(function(item){if(item&&item.key!==undefined)store.put(item.value,item.key)});
            tx.oncomplete=function(){db.close();resolve(true)};
            tx.onerror=function(){db.close();resolve(false)};
          }catch(e){db.close();resolve(false)}
        };
      }catch(e){resolve(false)}
    });
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
      if(Array.isArray(data.indexedDb)&&data.indexedDb.length&&("indexedDB" in window)){await restoreDbSnapshot(data.indexedDb)}
      toast2("Backup preferences and local cache restored. Reloading saved data…","success");
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
          var tx=db.transaction(backupStore,"readonly"),store=tx.objectStore(backupStore),getReq=store.get("offlineQueue");
          getReq.onsuccess=function(){
            var q=getReq.result;
            db.close();
            resolve(Array.isArray(q)?q.length:0);
          };
          getReq.onerror=function(){db.close();resolve(0)};
        }catch(e){db.close();resolve(0)}
      };
    });
  }

  async function queueItems(){
    return new Promise(function(resolve){
      if(!("indexedDB" in window)){resolve([]);return}
      var req;
      try{req=indexedDB.open(backupDbName)}catch(e){resolve([]);return}
      req.onerror=function(){resolve([])};
      req.onsuccess=function(){
        var db=req.result;
        if(!db.objectStoreNames.contains(backupStore)){db.close();resolve([]);return}
        try{
          var tx=db.transaction(backupStore,"readonly"),store=tx.objectStore(backupStore),getReq=store.get("offlineQueue");
          getReq.onsuccess=function(){var q=getReq.result;db.close();resolve(Array.isArray(q)?q:[])};
          getReq.onerror=function(){db.close();resolve([])};
        }catch(e){db.close();resolve([])}
      };
    });
  }

  async function renderQueueDetail(){
    var el=document.getElementById("v2QueueDetail");if(!el)return;
    var q=await queueItems();
    if(!q.length){el.innerHTML='<div class="empty">No queued changes. Everything is synchronized.</div>';return}
    el.innerHTML=q.slice(0,12).map(function(x,i){
      var action=esc2(x.action||"Queued change");
      var when=x.queuedAt?new Date(x.queuedAt).toLocaleString():"Pending";
      var tries=Number(x.attempts||0);
      return '<div class="item"><div class="item-title">'+(i+1)+'. '+action+'</div><div class="item-sub">'+esc2(when)+' · '+tries+' attempt'+(tries===1?"":"s")+'</div></div>';
    }).join("")+(q.length>12?'<div class="small-muted">Showing first 12 of '+q.length+' queued changes.</div>':"");
  }

  async function requestQueueRetry(){
    if(!navigator.onLine){toast2("You are offline. Retry will start when the connection returns.","info");return}
    window.dispatchEvent(new Event("online"));
    setTimeout(function(){renderHealth();renderQueueDetail();renderDashboardHealth()},1800);
  }

  async function renderHealth(){
    var el=document.getElementById("v2Health");if(!el)return;
    var q=await queueCount();
    var online=navigator.onLine;
    var last=getLastSync();
    el.innerHTML='<div class="report-grid"><div class="card blue-top"><div class="label">Connection</div><div class="value">'+(online?"Online":"Offline")+'</div><div class="sub">Live browser status</div></div><div class="card amber-top"><div class="label">Pending sync</div><div class="value">'+q+'</div><div class="sub">Local queued operations</div></div><div class="card green-top"><div class="label">Last sync</div><div class="value" style="font-size:15px">'+(last?esc2(new Date(last).toLocaleTimeString()):"Not recorded")+'</div><div class="sub">'+(last?esc2(new Date(last).toLocaleDateString()):"Use Sync now")+'</div></div><div class="card purple-top"><div class="label">App</div><div class="value" style="font-size:15px">V2</div><div class="sub">Reliability layer active</div></div></div>';
    var st=document.getElementById("v2SyncText");
    if(st)st.textContent=q?("There are "+q+" locally queued operations. Automatic retry is active."):("No queued operations detected in the local cache.");
    renderQueueDetail();
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

  async function openExecutiveCenter(){
    var old=document.getElementById("smExecutiveCenter");
    if(old)old.remove();
    var wrap=document.createElement("div");
    wrap.id="smExecutiveCenter";
    wrap.className="modal open";
    wrap.innerHTML='<div class="modal-card v2-center-card"><div class="modal-head"><div><div class="modal-title">📊 SWEET MART Executive Center</div><div class="small-muted">Business intelligence, operations and data tools</div></div><button class="close" id="execClose">×</button></div><div class="modal-body"><div id="execLoading" class="empty">Loading live business intelligence…</div><div id="execBody" style="display:none"><div id="execSummary" class="report-grid"></div><div class="grid2" style="margin-top:12px"><section class="panel"><div class="panel-head"><div class="panel-title">Top Products</div></div><div class="panel-body"><div id="execProducts" class="list"></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title">Inventory Signals</div></div><div class="panel-body"><div id="execInventory" class="list"></div></div></section></div><section class="panel"><div class="panel-head"><div class="panel-title">Data & Reporting</div><div class="panel-meta">Export current records</div></div><div class="panel-body"><div class="quick-actions"><button class="btn" id="exportOrdersBtn">⬇ Orders CSV</button><button class="btn" id="exportCustomersBtn">⬇ Customers CSV</button><button class="btn" id="exportProductsBtn">⬇ Products CSV</button><button class="btn primary" id="execReportsBtn">📈 Open Reports</button></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title">Finance & Inventory Operations</div><div class="panel-meta">Live figures from the existing backend</div></div><div class="panel-body"><div class="stat-row"><div class="item"><div class="item-title" id="execPaid">—</div><div class="item-sub">Paid orders</div></div><div class="item"><div class="item-title" id="execUnpaid">—</div><div class="item-sub">Unpaid orders</div></div><div class="item"><div class="item-title" id="execOut">—</div><div class="item-sub">Out of stock</div></div><div class="item"><div class="item-title" id="execLow">—</div><div class="item-sub">Low/slow stock signals</div></div></div></div></section><section class="panel"><div class="panel-head"><div class="panel-title">Security & Accountability</div></div><div class="panel-body"><div class="stat-row"><div class="item"><div class="item-title">👤 Staff</div><div class="item-sub" id="execStaff"></div></div><div class="item"><div class="item-title">📝 Audit log</div><div class="item-sub">Available from Activity</div></div><div class="item"><div class="item-title">🔐 Session lock</div><div class="item-sub">30-minute inactivity protection</div></div><div class="item"><div class="item-title">💾 Offline</div><div class="item-sub">Queued changes sync on reconnect</div></div></div></div></section></div></div></div>';
    document.body.appendChild(wrap);
    document.getElementById("execClose").onclick=function(){wrap.remove()};
    wrap.addEventListener("click",function(e){if(e.target===wrap)wrap.remove()});
    try{
      var apiFn=window.__smOriginalApiForV2;
      if(typeof apiFn!=="function")throw new Error("API bridge unavailable");
      var results=await Promise.allSettled([
        apiFn("admin_dashboard",{}, {force:true}),
        apiFn("admin_inventory",{}, {force:true}),
        apiFn("admin_staff",{}, {force:true})
      ]);
      var d=results[0].status==="fulfilled"?results[0].value:{summary:{},topProducts:[]};
      var inv=results[1].status==="fulfilled"&&Array.isArray(results[1].value)?results[1].value:[];
      var staff=results[2].status==="fulfilled"&&Array.isArray(results[2].value)?results[2].value:[];
      var s=d.summary||{};
      document.getElementById("execSummary").innerHTML='<div class="card blue-top"><div class="label">Revenue</div><div class="value">'+money2(s.totalRevenue)+'</div><div class="sub">'+num2(s.totalSales)+' recorded sales</div></div><div class="card green-top"><div class="label">Recorded profit</div><div class="value">'+money2(s.totalProfit)+'</div><div class="sub">Based on current sales data</div></div><div class="card amber-top"><div class="label">Orders</div><div class="value">'+num2(s.totalOrders)+'</div><div class="sub">'+num2(s.pendingOrders)+' pending · '+num2(s.unpaidOrders)+' unpaid</div></div><div class="card red-top"><div class="label">Stock alerts</div><div class="value">'+num2(inv.filter(function(x){return String(x.stockStatus||"").indexOf("OUT")>=0}).length)+'</div><div class="sub">'+num2(inv.filter(function(x){return x.classification==="FAST MOVING"}).length)+' fast-moving</div></div>';
      document.getElementById("execProducts").innerHTML=(d.topProducts||[]).slice(0,5).map(function(p,i){return '<div class="item"><div class="item-title">'+(i+1)+'. '+esc2(p.productName)+'</div><div class="item-sub">'+num2(p.quantity)+' units · '+money2(p.revenue)+' revenue · '+money2(p.profit)+' profit</div></div>'}).join("")||'<div class="empty">No product data.</div>';
      var alerts=inv.filter(function(x){return String(x.stockStatus||"").indexOf("OUT")>=0||x.classification==="SLOW MOVING"}).slice(0,8);
      document.getElementById("execInventory").innerHTML=alerts.map(function(x){return '<div class="item"><div class="item-title">'+esc2(x.productName)+'</div><div class="item-sub">'+esc2(x.category)+' · '+esc2(x.stockStatus)+' · '+esc2(x.classification)+'</div></div>'}).join("")||'<div class="empty">No critical inventory signals.</div>';
      document.getElementById("execStaff").textContent=staff.filter(function(x){return x.active!==false}).length+' active of '+staff.length+' accounts';
      document.getElementById("execLoading").style.display="none";
      document.getElementById("execBody").style.display="block";
    }catch(e){document.getElementById("execLoading").textContent="Unable to load executive data right now."}
    document.getElementById("exportOrdersBtn").onclick=function(){exportApiCsv("admin_orders",{},"sweet-mart-orders")};
    document.getElementById("exportCustomersBtn").onclick=function(){exportApiCsv("admin_customers",{},"sweet-mart-customers")};
    document.getElementById("exportProductsBtn").onclick=function(){exportApiCsv("admin_products",{},"sweet-mart-products")};
    document.getElementById("execReportsBtn").onclick=function(){wrap.remove();if(typeof showPage==="function")showPage("reports")};
  }
  function money2(v){return"GH₵"+Number(v||0).toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2})}
  function num2(v){return Number(v||0).toLocaleString("en-GH")}
  function csvCell(v){var s=String(v==null?"":v);return '"'+s.replace(/"/g,'""')+'"'}
  async function exportApiCsv(action,data,name){
    try{
      toast2("Preparing "+name+" export…","info");
      var apiFn=window.__smOriginalApiForV2;
      if(typeof apiFn!=="function")throw new Error("API bridge unavailable");
      var d=await apiFn(action,data,{force:true});
      var rows=Array.isArray(d)?d:((d&&Array.isArray(d.orders))?d.orders:[]);
      if(!rows.length){toast2("No records available to export.","info");return}
      var keys=[];
      rows.forEach(function(row){Object.keys(row||{}).forEach(function(k){if(keys.indexOf(k)<0)keys.push(k)})});
      var csv=[keys.map(csvCell).join(",")].concat(rows.map(function(row){return keys.map(function(k){return csvCell(row[k])}).join("\\n")})).join("\\n");
      var blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
      var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name+"-"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(a.href);
      toast2("CSV exported successfully.","success");
    }catch(e){toast2("Export failed: "+(e.message||"Unknown error"),"error")}
  }

  function addExecutiveNavButton(){
    var side=document.getElementById("sideNav");
    if(side&&!document.getElementById("execNavBtn")){
      var b=document.createElement("button");b.id="execNavBtn";b.type="button";b.innerHTML='📊 <span class="nav-label">Executive Center</span>';b.onclick=openExecutiveCenter;
      side.insertBefore(b,side.firstChild);
    }
  }

  function setupIdleLock(){
    var activity=function(){
      clearTimeout(idleTimer);
      if(!document.getElementById("app")||document.getElementById("app").classList.contains("hidden"))return;
      idleTimer=setTimeout(function(){
        if(document.getElementById("app")&&!document.getElementById("app").classList.contains("hidden")){
          var lb=document.querySelector(".nav-logout"); if(lb)lb.click(); else { localStorage.removeItem("sweetMartAdminCredentials"); location.reload(); }
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
          if(modal&&modal.classList.contains("open")){var x=document.getElementById("modalClose"); if(x)x.click();return}
          if(window.innerWidth<=1000&&document.querySelector(".sidebar.open")){document.querySelector(".sidebar").classList.remove("open");var ov=document.getElementById("sidebarOverlay");if(ov)ov.classList.remove("open");return}
          var app=document.getElementById("app");
          if(app&&!app.classList.contains("hidden")){
            if(confirm("Exit SWEET MART Admin?"))window.Capacitor.Plugins.App.exitApp();
          }
        });
      }
    }catch(e){}
  }

  window.SweetMartV2RefreshNav=function(){addNavButton();addExecutiveNavButton();};
  window.SweetMartV2RefreshDashboard=function(){
    addDashboardHealth();
    renderDashboardHealth();
  };

  function setup(){
    addNavButton();
    addExecutiveNavButton();
    addDashboardHealth();
    setupIdleLock();
    setupAndroid();
    var retrySync=function(){
      if(!navigator.onLine)return;
      queueCount().then(function(q){
        if(q>0){window.dispatchEvent(new Event("online"));}
        setTimeout(function(){setLastSync();renderDashboardHealth()},1800);
      });
    };
    window.addEventListener("online",function(){setTimeout(retrySync,700)});
    window.addEventListener("offline",function(){renderDashboardHealth();renderHealth()});
    document.addEventListener("visibilitychange",function(){if(!document.hidden)retrySync()});
    setInterval(function(){if(navigator.onLine)retrySync()},15000);

    var m=meta();m.version=3;m.updatedAt=new Date().toISOString();saveMeta(m);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);else setup();
})();
