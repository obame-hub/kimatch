// Service worker minimal : ne fait aucune mise en cache (les données viennent de Supabase
// et doivent toujours être fraîches). Sert uniquement à satisfaire le critère d'installabilité
// PWA de Chrome (bouton "Installer l'application" / raccourci écran d'accueil).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
// Le handler existe pour l'installabilité, mais il n'appelle JAMAIS event.respondWith() : sans
// respondWith, le navigateur traite la requête normalement, exactement comme s'il n'y avait pas
// de service worker.
//
// La version précédente faisait `event.respondWith(fetch(event.request))`, qui ne reproduisait
// rien d'autre que le comportement par défaut mais transformait la moindre erreur réseau en
// échec de navigation : la promesse rejetée remontait au navigateur, qui abandonnait le
// chargement de la page. Symptôme observé en production le 06/08/2026 -- en cliquant un lien vers
// /comptes/:id, l'URL changeait mais la page ne s'affichait jamais, avec dans la console
// « FetchEvent ... resulted in a network error response: the promise was rejected », puis
// « Uncaught (in promise) TypeError: Failed to fetch at sw.js:7 ».
self.addEventListener('fetch', () => {})
