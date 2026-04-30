const CACHE='apex-deal-feed-v2';
const ASSETS=['./','index.html','style.css','app.js','manifest.json','data/deals.json','data/lenders.json'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))));
