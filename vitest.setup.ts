/**
 * Le client Supabase se construit au chargement de `src/lib/supabase.ts`, et sa partie « temps
 * réel » exige un constructeur WebSocket dès l'import — même si personne ne s'y abonne. Node 18
 * n'en fournit pas, si bien qu'importer n'importe quel module de `lib/data` faisait échouer le
 * fichier de test entier avant d'exécuter la moindre assertion.
 *
 * Un objet vide suffit : aucun test ne se connecte. C'est un bouchon pour permettre l'import, pas
 * une simulation de WebSocket.
 */
if (!('WebSocket' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).WebSocket = class {
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  }
}
