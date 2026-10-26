/* Cache only this site's public visual shell. Never intercept auth/API/photo requests. */
const CACHE='diary-shell-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('diary-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=='GET'||url.search||url.pathname.endsWith('/config.js'))return;
  if(!/\.(?:css|js|jpg|png|woff2|svg|webmanifest)$/.test(url.pathname))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(event.request);if(response.ok)cache.put(event.request,response.clone());return response}catch(e){return await cache.match(event.request)||Response.error()}})());
});
