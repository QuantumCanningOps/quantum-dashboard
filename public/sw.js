// No-op worker so probes for /sw.js don't 404. Does not control pages.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.registration.unregister());
});
