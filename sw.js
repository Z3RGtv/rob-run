/* Notification-only worker. Authenticated responses and PDFs are never cached. */
const database=new Promise((resolve,reject)=>{const r=indexedDB.open('rob-run-notifications',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function read(key){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function write(key,value){const db=await database;return new Promise((resolve,reject)=>{const t=db.transaction('state','readwrite');t.objectStore('state').put(value,key);t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}
async function claim(key){const db=await database;return new Promise((resolve,reject)=>{const t=db.transaction('state','readwrite'),s=t.objectStore('state'),r=s.get(key);let fresh=false;r.onsuccess=()=>{fresh=!r.result||r.result<Date.now();if(fresh)s.put(Date.now()+7200000,key);};t.oncomplete=()=>resolve(fresh);t.onerror=()=>reject(t.error);});}
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{await self.clients.claim();const db=await database;const t=db.transaction('state','readwrite'),s=t.objectStore('state'),r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.key!=='binding'&&typeof c.value==='number'&&c.value<Date.now())c.delete();c.continue();}};})()));
self.addEventListener('message',e=>{
 if(!e.source?.url?.startsWith(self.registration.scope))return;
 e.waitUntil((async()=>{const m=e.data||{};let result=false;
  if(m.type==='bind'){await write('binding',{userId:m.userId,subscriptionId:m.subscriptionId||null});result=true;}
  if(m.type==='unbind'){await write('binding',null);for(const n of await self.registration.getNotifications())n.close();result=true;}
  if(m.type==='claim-sound'){const b=await read('binding');if(b?.userId===m.userId)result=await claim('sound:'+m.userId+':'+m.id);}
  e.ports[0]?.postMessage(result);
 })());
});
self.addEventListener('push',e=>e.waitUntil((async()=>{
 let p;try{p=e.data.json();}catch{return;}
 const binding=await read('binding');
 if(!binding||binding.userId!==p.userId||binding.subscriptionId!==p.subscriptionId||!p.id||Date.now()>=p.expiresAt)return;
 if(!await claim('push:'+p.userId+':'+p.id))return;
 const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(self.registration.scope));
 const foreground=windows.some(c=>c.visibilityState==='visible');
 if(!foreground)await claim('sound:'+p.userId+':'+p.id);
 await self.registration.showNotification(p.title,{body:p.body,tag:'rob-run-'+p.id,icon:new URL('brand/z3rg-logo.png',self.registration.scope).href,
  renotify:false,silent:foreground,requireInteraction:!p.test,data:{alertId:p.alertId,userId:p.userId},actions:[{action:'open',title:p.test?'Abrir site':'Abrir mapa'}]});
 for(const c of windows)c.postMessage({type:'clan-push',id:p.id,test:Boolean(p.test)});
})()));
self.addEventListener('notificationclick',e=>{
 e.notification.close();e.waitUntil((async()=>{
  const b=await read('binding');if(!b||b.userId!==e.notification.data.userId)return;
  const url=new URL(self.registration.scope);url.hash='clan';
  if(e.notification.data.alertId)url.searchParams.set('alert',e.notification.data.alertId);
  const windows=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>c.url.startsWith(self.registration.scope));
  if(windows[0]){await windows[0].navigate(url.href);await windows[0].focus();}else await self.clients.openWindow(url.href);
 })());
});
