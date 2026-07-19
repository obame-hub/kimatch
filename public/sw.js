// Service worker minimal : ne fait aucune mise en cache (les données viennent de Supabase
// et doivent toujours être fraîches). Sert uniquement à satisfaire le critère d'installabilité
// PWA de Chrome (bouton "Installer l'application" / raccourci écran d'accueil).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
