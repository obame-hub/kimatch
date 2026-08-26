import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * LE TÉLÉPHONE AIRCALL, DANS KIMATCH.
 *
 * Demandé par Michel le 26/08/2026, rapporté par Naoëlle : « quand les commerciaux cliquent sur
 * appeler ça leur ouvre l'app de leur ordi, alors qu'il veut que ça ouvre l'application Aircall
 * directement sur Kimatch, comme dans Tools ».
 *
 * CE QUE FAISAIT KIMATCH : un lien `tel:`. Le système d'exploitation l'attrape et ouvre ce qu'il veut
 * — Skype, FaceTime, rien du tout. Le commercial se retrouve à recopier le numéro à la main, et
 * l'appel n'est journalisé nulle part.
 *
 * « COMME DANS TOOLS » DÉSIGNE LEUR SALESFORCE, PAS LE TOOLS EN REACT. Vérifié le 26/08 : le dépôt
 * React n'a que des liens `tel:`, exactement comme nous. En revanche l'org Salesforce porte le paquet
 * « Aircall CTI for Salesforce » et un centre d'appels `AircallCTI` — c'est de ce panneau intégré
 * qu'il parle, et il a raison de le vouloir : un appel lancé depuis le CRM se rattache au client.
 *
 * LA SOLUTION EST CELLE D'AIRCALL POUR LES APPLICATIONS MAISON — le SDK `aircall-everywhere`, qui
 * charge le Workspace Aircall dans une iframe de la page et accepte `dial_number`. Aucune clé secrète
 * ne circule dans le navigateur : le commercial se connecte à son compte Aircall DANS le panneau,
 * exactement comme il le fait dans Salesforce.
 *
 * TROIS CHOIX QUI COMPTENT :
 *
 * · LE SDK NE SE CHARGE QU'À LA DEMANDE. Le charger au démarrage imposerait une iframe Aircall, un
 *   micro demandé et une session à tout le monde — y compris à ceux qui ne téléphonent jamais. Il
 *   s'initialise au premier clic sur « Appeler », ou quand on ouvre le panneau.
 * · PAS DE RETOUR SILENCIEUX AU LIEN `tel:`. Si Aircall n'est pas connecté, on ouvre le panneau et on
 *   le dit. Basculer en cachette vers l'ancien comportement ferait croire que ça marche, et c'est
 *   précisément ce qu'on corrige.
 * · LE NUMÉRO EST NORMALISÉ AVANT L'ENVOI. Aircall attend un numéro international ; nos contacts sont
 *   saisis « 06 12 34 56 78 ». Sans conversion, l'appel échoue sans dire pourquoi.
 */

/**
 * Un numéro français au format international, seul format qu'Aircall accepte sans ambiguïté.
 *
 * Rend `null` quand la conversion n'est pas sûre : mieux vaut dire « ce numéro n'est pas exploitable »
 * que composer un numéro inventé. Les cas traités sont ceux qu'on trouve réellement en base — espaces,
 * points, tirets, préfixe 0, 0033, +33.
 */
export function numeroInternational(brut: string | null | undefined): string | null {
  if (!brut) return null
  let n = brut.replace(/[\s.\-()/]/g, '')
  if (!n) return null

  if (n.startsWith('00')) n = '+' + n.slice(2)
  // Un numéro français à dix chiffres commençant par 0 : on remplace le 0 par l'indicatif.
  if (/^0[1-9]\d{8}$/.test(n)) n = '+33' + n.slice(1)
  // Neuf chiffres sans le 0 initial — saisie tronquée fréquente sur les mobiles.
  else if (/^[1-9]\d{8}$/.test(n)) n = '+33' + n

  if (!n.startsWith('+')) return null
  // Entre 8 et 15 chiffres après l'indicatif : la plage de la recommandation E.164.
  return /^\+\d{8,15}$/.test(n) ? n : null
}

type EtatTelephone = 'eteint' | 'chargement' | 'deconnecte' | 'connecte' | 'indisponible'

interface Telephonie {
  etat: EtatTelephone
  /** Le motif du dernier appel qui n'est pas parti. Affiché dans le panneau. */
  echec: string | null
  /** Le panneau est-il visible ? */
  ouvert: boolean
  ouvrir: () => void
  fermer: () => void
  /** Lance l'appel. Rend le motif d'échec, ou `null` si l'appel est parti. */
  appeler: (numero: string | null | undefined) => Promise<string | null>
  /** Le dernier numéro composé, pour l'afficher dans le panneau. */
  dernierNumero: string | null
}

const Contexte = createContext<Telephonie | null>(null)

/**
 * LA PORTE D'ENTREE GLOBALE — `appelerNumero`, utilisable sans passer par le contexte.
 *
 * IL N'Y A QU'UN TELEPHONE dans l'application, monte une fois dans la coquille : ce n'est pas un
 * etat qui varie d'un endroit a l'autre, c'est un peripherique. Or les boutons « Appeler » vivent
 * souvent au fond de fonctions de rendu imbriquees — une ligne de contact dans une liste, dans un
 * panneau, dans une fiche — ou un hook demanderait de remonter jusqu'au composant porteur et d'y
 * ajouter un appel qui n'a rien a y faire.
 *
 * La reference est posee par le fournisseur et retiree a son demontage. Appelee avant que la
 * coquille soit montee, la fonction le DIT au lieu de ne rien faire : un bouton d'appel qui reste
 * muet est le defaut qu'on est en train de corriger.
 */
let appelerCourant: ((numero: string | null | undefined) => Promise<string | null>) | null = null

export function appelerNumero(numero: string | null | undefined): Promise<string | null> {
  if (!appelerCourant) {
    return Promise.resolve('Le telephone n’est pas encore pret : rechargez la page.')
  }
  return appelerCourant(numero)
}

/** Le conteneur de l'iframe Aircall. Hors du flux React : le SDK écrit dedans lui-même. */
const ID_CONTENEUR = 'aircall-workspace'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Workspace = {
  send: (evenement: string, charge: unknown, retour?: (succes: boolean, donnees: unknown) => void) => void
  on: (evenement: string, retour: (donnees: unknown) => void) => void
  isLoggedIn: (retour: (connecte: boolean) => void) => void
}

export function TelephonieProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatTelephone>('eteint')
  const [ouvert, setOuvert] = useState(false)
  const [dernierNumero, setDernierNumero] = useState<string | null>(null)
  const [echec, setEchec] = useState<string | null>(null)
  const workspace = useRef<Workspace | null>(null)
  const enCours = useRef<Promise<Workspace | null> | null>(null)

  /**
   * Charge le SDK et monte le Workspace, une seule fois.
   *
   * `enCours` garde la promesse : deux clics rapides sur « Appeler » ne doivent pas monter deux
   * iframes Aircall — la seconde volerait le micro à la première.
   */
  const monter = useCallback(async (): Promise<Workspace | null> => {
    if (workspace.current) return workspace.current
    if (enCours.current) return enCours.current

    enCours.current = (async () => {
      setEtat('chargement')
      try {
        const mod = await import('aircall-everywhere')
        const AircallWorkspace = (mod as any).default ?? mod
        const w: Workspace = new AircallWorkspace({
          domToLoadWorkspace: '#' + ID_CONTENEUR,
          size: 'small',
          onLogin: () => setEtat('connecte'),
          onLogout: () => setEtat('deconnecte'),
        })
        workspace.current = w
        // Le SDK n'appelle `onLogin` qu'après une connexion réussie : sans cette interrogation, un
        // commercial déjà connecté resterait affiché « déconnecté » jusqu'à son prochain appel.
        w.isLoggedIn((connecte) => setEtat(connecte ? 'connecte' : 'deconnecte'))
        return w
      } catch (e) {
        console.error('Aircall Everywhere', e)
        setEtat('indisponible')
        return null
      } finally {
        enCours.current = null
      }
    })()

    return enCours.current
  }, [])

  const ouvrir = useCallback(() => {
    setOuvert(true)
    void monter()
  }, [monter])

  const appeler = useCallback(
    async (numero: string | null | undefined): Promise<string | null> => {
      /**
       * L'ÉCHEC S'AFFICHE, IL NE SE RETOURNE PAS SEULEMENT.
       *
       * Les appelants écrivent `void appelerNumero(n)` : ils ne lisent pas le motif, et c'est normal
       * — un bouton d'appel n'a pas à savoir gérer les pannes d'Aircall. Le panneau, lui, est déjà
       * ouvert : c'est là que le message a sa place. Sans ça, un numéro mal saisi ne produirait
       * rien du tout, et on retomberait exactement dans le défaut qu'on corrige.
       */
      const rater = (motif: string) => {
        setEchec(motif)
        return motif
      }

      setEchec(null)
      const e164 = numeroInternational(numero)
      if (!e164) {
        setOuvert(true)
        return rater('Ce numéro n’est pas exploitable : il manque l’indicatif ou des chiffres.')
      }

      setOuvert(true)
      const w = await monter()
      if (!w) return rater('Le téléphone Aircall n’a pas pu être chargé.')

      return new Promise<string | null>((resoudre) => {
        // Aircall ne rend pas d'erreur détaillée : `succes` vaut faux aussi bien pour une session
        // fermée que pour un numéro refusé. On dit donc ce qui est le plus souvent vrai, et le
        // panneau ouvert montre le reste.
        w.send('dial_number', { phone_number: e164 }, (succes) => {
          if (succes) {
            setDernierNumero(e164)
            resoudre(null)
          } else {
            resoudre(rater('L’appel n’a pas démarré. Connectez-vous à Aircall dans le panneau, puis réessayez.'))
          }
        })
      })
    },
    [monter],
  )

  // La fermeture ne démonte PAS l'iframe : un appel en cours survivrait mal à la disparition de son
  // conteneur. Le panneau se cache, la session Aircall reste.
  const fermer = useCallback(() => setOuvert(false), [])

  // Le peripherique se declare globalement le temps de sa vie.
  useEffect(() => {
    appelerCourant = appeler
    return () => {
      appelerCourant = null
    }
  }, [appeler])

  return (
    <Contexte.Provider value={{ etat, echec, ouvert, ouvrir, fermer, appeler, dernierNumero }}>
      {children}
      <BoutonTelephone />
      <PanneauAircall />
    </Contexte.Provider>
  )
}

export function useTelephonie(): Telephonie {
  const c = useContext(Contexte)
  if (!c) throw new Error('useTelephonie hors de TelephonieProvider')
  return c
}

/**
 * LE PANNEAU. Toujours monté dès qu'il a servi une fois, seulement caché — l'iframe d'un appel en
 * cours ne peut pas être démontée sans couper la communication.
 */
/**
 * LE BOUTON FLOTTANT — il faut pouvoir se connecter à Aircall AVANT le premier appel.
 *
 * Sans lui, la seule façon d'ouvrir le panneau serait de cliquer sur « Appeler », donc de rater un
 * appel pour découvrir qu'on n'est pas connecté. Il disparaît quand le panneau est ouvert : deux
 * façons d'ouvrir la même chose au même endroit se gênent.
 */
function BoutonTelephone() {
  const { ouvert, ouvrir, etat } = useTelephonie()
  if (ouvert) return null
  return (
    <button
      type="button"
      onClick={ouvrir}
      title="Téléphone Aircall"
      className="fixed bottom-[70px] right-4 z-[55] flex h-10 items-center gap-2 rounded-kw-pill border border-kw-border bg-white px-3.5 text-kw-sm font-bold text-kw-ink shadow-kw-raised hover:bg-kw-bloc md:bottom-4"
    >
      <span
        className={
          'h-1.5 w-1.5 rounded-full ' + (etat === 'connecte' ? 'bg-kw-green' : 'bg-kw-ghost')
        }
      />
      Téléphone
    </button>
  )
}

function PanneauAircall() {
  const { etat, echec, ouvert, fermer, dernierNumero } = useTelephonie()

  /**
   * LE PANNEAU EST TOUJOURS DANS LE DOM, seulement caché — et c'est une correction, pas un choix
   * d'esthétique.
   *
   * Ma première version ne le montait qu'à la première ouverture. Or `appeler` fait `setOuvert(true)`
   * puis, dans la même fonction, construit le Workspace avec `domToLoadWorkspace: '#…'` — React n'a
   * pas encore rendu, le conteneur n'existe pas, et le SDK n'a rien où s'installer. Le premier appel
   * échouait donc systématiquement, et le second passait : le pire des symptômes, celui qu'on met une
   * heure à reproduire.
   *
   * Un div vide ne coûte rien, et il retire la course entièrement. C'est aussi ce qui permet à un
   * appel en cours de survivre à la fermeture du panneau : on cache, on ne démonte pas — démonter
   * l'iframe couperait la communication.
   */
  return (
    <div
      className={
        'fixed bottom-4 right-4 z-[60] w-[320px] overflow-hidden rounded-kw-2xl border border-kw-border bg-white shadow-kw-panel ' +
        (ouvert ? '' : 'pointer-events-none invisible opacity-0')
      }
      aria-hidden={!ouvert}
    >
      <div className="flex items-center gap-2 border-b border-kw-border bg-kw-bloc px-3 py-2">
        <span className="text-kw-sm font-extrabold text-kw-ink">Téléphone</span>
        <span className="text-kw-micro text-kw-meta">
          {etat === 'connecte'
            ? 'Aircall connecté'
            : etat === 'chargement'
              ? 'Chargement…'
              : etat === 'indisponible'
                ? 'Aircall indisponible'
                : 'Connectez-vous à Aircall'}
        </span>
        <button
          type="button"
          onClick={fermer}
          className="ml-auto rounded-kw-md px-1.5 py-0.5 text-kw-micro font-bold text-kw-meta hover:bg-white"
        >
          Réduire
        </button>
      </div>

      {/* Le SDK écrit son iframe ici. Le conteneur ne doit être ni conditionnel ni remonté. */}
      <div id={ID_CONTENEUR} className="min-h-[376px] w-full" />

      {echec && (
        <p className="border-t border-kw-border-faint bg-kw-amber-light px-3 py-2 text-kw-xs leading-relaxed text-kw-amber-dark">
          {echec}
        </p>
      )}

      {!echec && dernierNumero && (
        <p className="border-t border-kw-border-faint px-3 py-2 text-kw-xs text-kw-meta">
          Dernier appel : <span className="font-mono text-kw-ink">{dernierNumero}</span>
        </p>
      )}

      {etat === 'indisponible' && (
        <p className="border-t border-kw-border-faint px-3 py-2 text-kw-xs leading-relaxed text-kw-meta">
          Le téléphone Aircall n’a pas pu se charger. Vérifiez que l’intégration « Aircall
          Everywhere » est activée sur le compte Aircall de Kiwee.
        </p>
      )}
    </div>
  )
}
