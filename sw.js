/* Cache sûr : les données scolaires, connexions, reçus et URL à jeton ne
   doivent jamais être conservés dans le cache de l'application. */
const V='mdss-public-assets-v2';
const ASSETS=['logo.png','manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(V).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key.startsWith('mdss-')&&key!==V).map(key=>caches.delete(key))
  )).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.search)return;
  const name=url.pathname.split('/').pop();
  if(!ASSETS.includes(name))return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'){
      const copy=response.clone();
      event.waitUntil(caches.open(V).then(cache=>cache.put(request,copy)));
    }
    return response;
  }).catch(()=>caches.match(request)));
});
