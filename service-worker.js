"use strict";
const CACHE_NAME="kennix-shell-v1";
self.addEventListener("install",event=>{self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil((async()=>{await self.clients.claim();})())});
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET"||new URL(event.request.url).origin!==self.location.origin)return;
 // Network-first passthrough: keep products, prices, checkout and order data fresh.
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
