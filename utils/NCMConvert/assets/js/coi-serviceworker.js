/*
 * @Description: 
 * @Author: DSTBP
 * @Date: 2026-02-05 13:39:58
 * @LastEditTime: 2026-02-05 13:40:05
 * @LastEditors: DSTBP
 */
/*! coi-serviceworker v0.1.7 - Meta headers override for SharedArrayBuffer */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener("message", (ev) => {
        if (!ev.data) return;
        if (ev.data.type === "deregister") {
            self.registration.unregister().then(() => self.clients.matchAll().then(clients => clients.forEach(client => client.navigate(client.url))));
        }
    });
    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
        
        const request = (coepCredentialless && r.mode === "no-cors" && r.destination === "image") ? 
            new Request(r, { "credentials": "omit" }) : r;
            
        event.respondWith(fetch(request).then((response) => {
            if (response.status === 0) return response;
            const newHeaders = new Headers(response.headers);
            newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
            if (!coepCredentialless) newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
            newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
            return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
        }).catch((e) => console.error(e)));
    });
} else {
    (() => {
        const re = new RegExp("coi-serviceworker.js"); // 自动识别文件名
        const src = document.currentScript.src;
        const search = src.split('?')[1];
        coepCredentialless = search && search.includes("coep=credentialless");
        if (window.crossOriginIsolated) return;
        if (navigator.serviceWorker) {
            navigator.serviceWorker.register(src).then((registration) => {
                console.log("COI Service Worker registered");
                registration.addEventListener("updatefound", () => {
                    console.log("Reloading page to activate COI...");
                    window.location.reload();
                });
                if (registration.active && !navigator.serviceWorker.controller) {
                    console.log("Reloading page to activate COI...");
                    window.location.reload();
                }
            }, (err) => console.error("COI registration failed: ", err));
        }
    })();
}