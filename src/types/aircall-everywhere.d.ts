/**
 * Le SDK `aircall-everywhere` est publié sans déclarations de types (vérifié sur la version 2.0.6 :
 * ni `types` dans son package.json, ni fichier `.d.ts` dans son dist). Sans ce module déclaré,
 * l'import échoue à la compilation.
 *
 * La signature reprend la documentation officielle du dépôt aircall/aircall-everywhere, et rien de
 * plus : déclarer des méthodes qu'on n'a pas vérifiées reviendrait à inventer un contrat.
 */
declare module 'aircall-everywhere' {
  interface OptionsWorkspace {
    domToLoadWorkspace: string
    size?: 'big' | 'small' | 'auto'
    integrationToLoad?: string
    debug?: boolean
    onLogin?: (reglages: unknown) => void
    onLogout?: () => void
  }

  export default class AircallWorkspace {
    constructor(options: OptionsWorkspace)
    send(
      evenement: string,
      charge: unknown,
      retour?: (succes: boolean, donnees: unknown) => void,
    ): void
    on(evenement: string, retour: (donnees: unknown) => void): void
    removeListener(evenement: string): void
    isLoggedIn(retour: (connecte: boolean) => void): void
  }
}
