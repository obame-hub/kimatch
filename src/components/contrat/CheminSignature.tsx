import { useState } from 'react'
import type { Contrat } from '@/types/domain'
import { FriseJalons, contexteDe, jourFr, type Jalon } from '@/components/parcours/FriseJalons'
import { PictoBrouillon, PictoConsulte, PictoEnvoye } from '@/components/mandat/pictos'

/**
 * ══ LE CYCLE DE SIGNATURE D'UN CONTRAT — PREMIER DES DEUX CHEMINS ══
 *
 * William, appel du 09/09/2026 : « le contrat doit avoir deux chemins, c'est vraiment important
 * qu'il ait ça. » Et sa règle de partage, qui décide de tout : « TANT QU'IL N'EST PAS SIGNÉ, TU NE
 * PEUX PAS LUI DONNER UN STATUT [de vie] — il est encore dans le cycle de signature. »
 *
 * Ce composant est le premier chemin. Le second — à venir / en cours / expiré — est `CycleDeVie`,
 * et il ne s'affiche qu'une fois celui-ci clos.
 *
 * ── LES SIX JALONS, ET CE QUE CHACUN VEUT DIRE ──
 *
 * Ils viennent de sa description du parcours réel, pas d'un référentiel :
 *
 *   BROUILLON     le contrat vient d'être créé. Une notification part vers Erwan.
 *   DEMANDÉ       Erwan a demandé le contrat au fournisseur.
 *   RÉCEPTIONNÉ   il l'a reçu et déposé dans les fichiers. Notification au commercial.
 *   ENVOYÉ        le commercial l'a envoyé en signature via DocuSign.
 *   CONSULTÉ      le signataire l'a ouvert. NOUVEAU le 09/09/2026.
 *   SIGNÉ         la signature du client est revenue.
 *
 * ── « CONSULTÉ » REMPLACE « EN ATTENTE DE SIGNATURE » ──
 *
 * « En attente de signature ne sert à rien, c'était un truc qui ne servait à rien, on le savait. À
 * la place, comme sur les mandats, c'est le fait qu'on sache quand est-ce qu'il a été consulté. »
 *
 * Aucun contrat ne l'a aujourd'hui, et il l'avait prévu : « c'est normal qu'il n'y ait aucun
 * contrat à Consulté, mais il faut le mettre en place. » Le jalon se remplira par le webhook
 * DocuSign, comme pour le mandat.
 *
 * ── DEUX JALONS N'ONT PAS DE DATE, ET C'EST ASSUMÉ ──
 *
 * `contrats` ne porte aucune colonne pour la date de la demande au fournisseur ni pour celle de la
 * réception. Ces deux jalons s'affichent donc franchis, en gras, sans ligne de date — la règle du
 * mandat, où 1 380 signatures antérieures au suivi sont dans le même cas. Inventer un horodatage
 * depuis `date_modification` serait pire : il bougerait à la prochaine retouche de la fiche.
 *
 * ── CE QUI REND UN JALON FRANCHI ──
 *
 * Jamais l'ordre dans le référentiel, toujours un fait : une enveloppe DocuSign existe, une date
 * est posée, ou l'avancement a dépassé l'étape. Le tableau `APRES` dit, pour chaque jalon, quels
 * avancements l'impliquent — c'est plus long qu'une comparaison d'entiers, et ça ne se trompe pas
 * le jour où un statut d'échec s'intercale avec un ordre élevé.
 */

/* Les trois pictos manquants. Les autres viennent de `mandat/pictos` — recopiés du handoff de
   William du 08/09 et volontairement non remplacés par lucide : « à recopier tels quels, pas
   d'équivalents approximatifs d'une bibliothèque d'icônes ». Ceux-ci suivent la même grille 24×24
   et les mêmes épaisseurs de trait, et reprennent les icônes que le référentiel
   `statuts_contrats_avancement` nomme déjà : `send`, `inbox`, `check-check`. */
type ProprietesPicto = { taille?: number }

function Cadre({ taille = 16, epaisseur, children }: ProprietesPicto & { epaisseur: number; children: React.ReactNode }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Demandé — une main tendue vers le fournisseur : la flèche qui sort. */
function PictoDemande(p: ProprietesPicto) {
  return (
    <Cadre {...p} epaisseur={2.2}>
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </Cadre>
  )
}

/** Réceptionné — la corbeille d'arrivée, et la flèche qui y descend. */
function PictoReceptionne(p: ProprietesPicto) {
  return (
    <Cadre {...p} epaisseur={2.2}>
      <path d="M4 14v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
    </Cadre>
  )
}

/** Signé — la double coche : reçue ET vérifiée. C'est l'icône `check-check` du référentiel. */
function PictoSigne(p: ProprietesPicto) {
  return (
    <Cadre {...p} epaisseur={2.4}>
      <path d="m2 13 4 4L14 7" />
      <path d="m12 15 2 2 8-10" />
    </Cadre>
  )
}

/**
 * Pour chaque jalon, les avancements qui l'impliquent.
 *
 * Lu à l'endroit : « si le contrat est à SIGNE, alors il est forcément passé par ENVOYE ». C'est ce
 * qui permet d'afficher un parcours complet sur les 1 579 contrats signés avant que le suivi
 * n'existe, sans leur inventer de dates.
 */
const APRES: Record<string, string[]> = {
  demande: ['DEMANDE', 'RECEPTIONNE', 'ENVOYE', 'CONSULTE', 'SIGNE'],
  receptionne: ['RECEPTIONNE', 'ENVOYE', 'CONSULTE', 'SIGNE'],
  envoye: ['ENVOYE', 'CONSULTE', 'SIGNE'],
  consulte: ['CONSULTE', 'SIGNE'],
  signe: ['SIGNE'],
}

export function jalonsDuContrat(contrat: Contrat): Jalon[] {
  const a = contrat.avancement ?? ''
  const atteint = (cle: keyof typeof APRES) => APRES[cle].includes(a)

  return [
    {
      cle: 'brouillon',
      libelle: 'Brouillon',
      picto: PictoBrouillon,
      // Le contrat existe : le premier jalon est franchi par définition.
      franchi: true,
      date: contrat.date_creation ?? null,
      contexte: contexteDe(contrat.date_creation),
    },
    {
      cle: 'demande',
      libelle: 'Demandé',
      picto: PictoDemande,
      franchi: atteint('demande'),
      // Aucune colonne ne porte cette date — voir l'en-tête.
      date: null,
      contexte: null,
    },
    {
      cle: 'receptionne',
      libelle: 'Réceptionné',
      picto: PictoReceptionne,
      franchi: atteint('receptionne'),
      date: null,
      contexte: null,
    },
    {
      cle: 'envoye',
      libelle: 'Envoyé',
      picto: PictoEnvoye,
      /* L'ENVELOPPE DOCUSIGN SUFFIT. 19 contrats sont à « Envoyé » dans le référentiel, mais
         l'envoi peut avoir eu lieu sans que l'avancement ait suivi — la date le prouve mieux que
         le statut. */
      franchi: Boolean(contrat.date_envoi_signature) || atteint('envoye'),
      date: contrat.date_envoi_signature,
      contexte: contexteDe(contrat.date_envoi_signature),
    },
    {
      cle: 'consulte',
      libelle: 'Consulté',
      picto: PictoConsulte,
      /* SIGNER IMPLIQUE AVOIR OUVERT. Ce n'est pas une déduction hasardeuse : on ne signe pas une
         enveloppe qu'on n'a pas ouverte. Les 1 579 contrats signés avant le suivi affichent donc ce
         jalon franchi, sans date — leur consultation est un fait, son heure n'a jamais été relevée. */
      franchi: Boolean(contrat.date_consultation) || atteint('consulte'),
      date: contrat.date_consultation ?? null,
      contexte: contexteDe(
        contrat.date_consultation,
        // `null` et 0 ne disent pas la même chose : sans relevé, on n'écrit rien.
        contrat.nb_ouvertures ? `ouvert ${contrat.nb_ouvertures} fois` : null,
      ),
    },
    {
      cle: 'signe',
      libelle: 'Signé',
      picto: PictoSigne,
      franchi: Boolean(contrat.date_signature) || atteint('signe'),
      couleur: '#0d7a5f',
      date: contrat.date_signature,
      contexte: contexteDe(contrat.date_signature, 'signature du client'),
    },
  ]
}

/** L'état du cycle de signature, en un mot — calculé, jamais saisi. */
function badgeSignature(contrat: Contrat): { texte: string; couleur: string; fond: string; bordure: string } {
  const signe = Boolean(contrat.date_signature) || contrat.avancement === 'SIGNE'
  if (signe && contrat.date_validation) {
    return { texte: 'SIGNÉ ET VALIDÉ', couleur: '#0d7a5f', fond: '#eaf4f0', bordure: '#d3e5de' }
  }
  /* SIGNÉ MAIS PAS ENCORE VALIDÉ : c'est l'état où quelque chose est attendu de nous, et William
     le décrit précisément — « ça envoie une notification au commercial en disant tiens, le contrat
     il est signé, il faut vite que tu l'envoies au fournisseur pour validation ». Le badge le dit
     plutôt que d'afficher un « signé » qui laisserait croire que c'est fini. */
  if (signe) return { texte: 'À VALIDER', couleur: '#b57a24', fond: '#fdf9f0', bordure: '#f0e4cd' }
  if (contrat.date_envoi_signature || contrat.avancement === 'ENVOYE' || contrat.avancement === 'CONSULTE') {
    return { texte: 'EN ATTENTE DE SIGNATURE', couleur: '#b57a24', fond: '#fdf9f0', bordure: '#f0e4cd' }
  }
  return { texte: 'EN PRÉPARATION', couleur: '#5c5f66', fond: '#f0efec', bordure: '#e0dfdb' }
}

/**
 * ══ LES DEUX SEULES ÉTAPES QU'ON AVANCE À LA MAIN ══
 *
 * William décrit le parcours réel : « Erwan faisait la demande au fournisseur, et quand il faisait
 * la demande il appuyait sur DEMANDER. […] Une fois qu'il a reçu le contrat, il venait le mettre
 * dans les fichiers et il appuyait sur RÉCEPTIONNÉ. »
 *
 * Le reste ne se clique pas : « Envoyé » vient de DocuSign quand le commercial envoie, « Consulté »
 * de l'ouverture par le signataire, « Signé » de la signature. Offrir un bouton pour eux inviterait
 * à mentir sur un fait que le fournisseur d'horodatage connaît mieux que nous.
 *
 * D'où deux boutons, et seulement quand ils ont un sens — pas une frise entièrement cliquable.
 */
const ETAPES_MANUELLES = [
  { code: 'DEMANDE', libelle: 'Demandé au fournisseur', depuis: ['', 'BROUILLON'] },
  { code: 'RECEPTIONNE', libelle: 'Contrat réceptionné', depuis: ['DEMANDE'] },
] as const

export function CheminSignature({
  contrat,
  onCopie,
  onAvancer,
}: {
  contrat: Contrat
  onCopie: (message: string) => void
  /** Absent = lecture seule. Reçoit le code d'avancement à poser. */
  onAvancer?: (code: string, libelle: string) => void
}) {
  const [copie, setCopie] = useState(false)
  const jalons = jalonsDuContrat(contrat)
  const badge = badgeSignature(contrat)
  const suivante = onAvancer
    ? ETAPES_MANUELLES.find((e) => (e.depuis as readonly string[]).includes(contrat.avancement ?? ''))
    : undefined

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 13, padding: '14px 24px 16px' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span
          className="uppercase"
          style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: '#a3a5a0' }}
        >
          Cycle de signature
        </span>
        <span className="flex-1" />

        {contrat.docusign_envelope_id && (
          <button
            type="button"
            title="Copier l’ID d’enveloppe DocuSign"
            onClick={() => {
              void navigator.clipboard.writeText(contrat.docusign_envelope_id as string)
              setCopie(true)
              onCopie('⧉ Copié')
              window.setTimeout(() => setCopie(false), 1200)
            }}
            className="font-mono transition-colors"
            style={{
              fontSize: 9.5,
              color: copie ? '#16181d' : '#83868f',
              background: copie ? '#eceae6' : '#f6f6f4',
              borderRadius: 5,
              padding: '3px 8px',
              cursor: 'copy',
            }}
          >
            {contrat.docusign_envelope_id.slice(0, 18).toUpperCase()} ⧉
          </button>
        )}

        <span
          style={{
            fontSize: 8.5,
            fontWeight: 800,
            letterSpacing: '.05em',
            borderRadius: 11,
            padding: '2px 9px',
            color: badge.couleur,
            background: badge.fond,
            border: `1px solid ${badge.bordure}`,
          }}
        >
          {badge.texte}
        </span>
      </div>

      <FriseJalons jalons={jalons} />

      {/* LE GESTE SUIVANT, quand c'en est un qui se fait à la main. */}
      {suivante && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0efec' }}>
          <button
            type="button"
            onClick={() => onAvancer?.(suivante.code, suivante.libelle)}
            className="transition-colors"
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: '#b57a24',
              background: '#fdf9f0',
              border: '1px solid #f0e4cd',
              borderRadius: 8,
              padding: '5px 12px',
            }}
          >
            {suivante.libelle} →
          </button>
        </div>
      )}

      {/* LA CLÔTURE DU CYCLE, telle que la maquette la montre : « signé le 20 février 2024, validé
          par … le 21 juin ». Elle n'apparaît qu'une fois la validation faite — c'est elle qui fait
          passer le contrat de son cycle de signature à son cycle de vie. */}
      {contrat.date_validation && (
        <div
          className="font-mono"
          style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0efec', fontSize: 10.5, color: '#5c5f66' }}
        >
          Cycle de signature clôturé — validé
          {contrat.valide_par_nom ? ` par ${contrat.valide_par_nom}` : ''} le {jourFr(contrat.date_validation)}
        </div>
      )}
    </div>
  )
}
