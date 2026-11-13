// Offline support: page files are fetched fresh when online, songs are served from the saved copy.
const CORE = "pmp-core-v1", SONGS = "pmp-songs-v1";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(url.pathname.includes("/songs/") ? song(e.request, url) : page(e.request));
});
async function page(req) {
  const cache = await caches.open(CORE);
  try {
    const net = await fetch(req);
    if (net.ok && net.status === 200) cache.put(req, net.clone());
    return net;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html")) || Response.error();
  }
}
async function song(req, url) {
  const cache = await caches.open(SONGS);
  const hit = await cache.match(url.href);
  const range = req.headers.get("range");
  if (!hit) return fetch(req);
  if (!range) return hit;
  // Safari asks for audio in byte ranges; answer them from the saved file.
  const buf = await hit.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start, end;
  if (m[1] === "" || m[1] === undefined) { start = Math.max(0, size - Number(m[2] || 0)); end = size - 1; }
  else { start = Number(m[1]); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "Content-Type": hit.headers.get("Content-Type") || "audio/mpeg",
    "Content-Range": "bytes " + start + "-" + end + "/" + size,
    "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}
