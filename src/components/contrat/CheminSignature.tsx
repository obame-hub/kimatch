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
  onValider,
  detail,
}: {
  contrat: Contrat
  onCopie: (message: string) => void
  /** Absent = lecture seule. Reçoit le code d'avancement à poser. */
  onAvancer?: (code: string, libelle: string) => void
  /**
   * VALIDER LE CONTRAT — le geste qui clôt le cycle de signature.
   *
   * William, 09/09/2026 : « je passais en Signé et j'avais un bouton VALIDER LE CONTRAT. À partir
   * de ce moment-là, ça clôturait le cycle de signature, et on passait finalement sur le cycle de
   * vie. »
   *
   * Ce n'est pas une formalité, et c'est pour ça qu'il y a une confirmation : la validation atteste
   * que le FOURNISSEUR a confirmé la prise en charge du contrat ET la commission — « on attend le
   * retour du fournisseur, et c'est une fois qu'il nous répond oui c'est bon, on atteste qu'on a
   * bien reçu le contrat et la marge que vous avez prise est de tant, qu'on validait ». Elle ouvre
   * la facturation et permet de clôturer l'opportunité.
   *
   * Absent = pas le droit de valider.
   */
  onValider?: () => void
  /**
   * LE DÉTAIL QUI SE REPLIE AVEC LE CYCLE : le suivi DocuSign, ses horodatages et ses relances.
   * Dans la maquette de William il est DANS cette carte, sous la frise — pas en bas de page comme
   * il l'était jusqu'ici. C'est le même sujet : ce que l'enveloppe a fait.
   */
  detail?: React.ReactNode
}) {
  const [copie, setCopie] = useState(false)
  const jalons = jalonsDuContrat(contrat)
  const badge = badgeSignature(contrat)

  /* ══ UN CYCLE CLÔTURÉ SE REPLIE, UN CYCLE EN COURS RESTE OUVERT ══
     La maquette montre les deux états : replié, une ligne — « Cycle de signature clôturé, signé le
     20/02/2024, validé par Thomas M. le 21/02/2024 » — avec un bouton « voir le détail » ; déplié,
     la frise entière et le suivi DocuSign.

     L'état par défaut suit le sens : un cycle terminé est de l'archive et n'a pas à occuper le haut
     de la fiche, alors qu'un cycle en cours est précisément ce qu'on vient regarder. Il ne se
     replie donc QUE lorsqu'il est signé ET validé — signé mais pas encore validé, il reste ouvert,
     parce qu'il attend un geste de nous. */
  const clos = Boolean((contrat.date_signature || contrat.avancement === 'SIGNE') && contrat.date_validation)
  const [deplie, setDeplie] = useState(!clos)

  /* LA VALIDATION SE CONFIRME EN DEUX TEMPS, sans fenêtre modale. Elle ouvre la facturation et
     n'a pas de bouton pour revenir en arrière : un clic malheureux sur un contrat de 20 000 € ne
     doit pas suffire. Deux clics et une phrase qui dit ce qu'on atteste suffisent — une modale pour
     ça interromprait la lecture de la fiche pour un geste qui s'y rattache. */
  const [confirme, setConfirme] = useState(false)
  const signe = Boolean(contrat.date_signature || contrat.avancement === 'SIGNE')
  const aValider = Boolean(onValider && signe && !contrat.date_validation)
  const suivante = onAvancer
    ? ETAPES_MANUELLES.find((e) => (e.depuis as readonly string[]).includes(contrat.avancement ?? ''))
    : undefined

  if (clos && !deplie) {
    return (
      <div
        className="flex items-center gap-3"
        style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 13, padding: '12px 16px' }}
      >
        <span
          className="flex flex-none items-center justify-center"
          style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#0d7a5fcc,#0d7a5f)', color: '#fff' }}
        >
          <PictoSigne taille={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 13, fontWeight: 750, color: '#0d7a5f', letterSpacing: '-.01em' }}>
            Cycle de signature clôturé
          </p>
          <p className="truncate" style={{ fontSize: 11, color: '#83868f', marginTop: 1 }}>
            signé le {jourFr(contrat.date_signature) ?? '—'}
            {contrat.valide_par_nom ? ` · validé par ${contrat.valide_par_nom}` : ' · validé'} le{' '}
            {jourFr(contrat.date_validation)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDeplie(true)}
          className="flex-none transition-colors hover:bg-km-soft"
          style={{ fontSize: 11.5, fontWeight: 600, color: '#5c5f66', border: '1px solid #e0dfdb', borderRadius: 8, padding: '5px 11px' }}
        >
          voir le détail
        </button>
      </div>
    )
  }

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

        {clos && (
          <button
            type="button"
            onClick={() => setDeplie(false)}
            title="Replier le cycle de signature"
            className="transition-colors hover:bg-km-soft"
            style={{ fontSize: 11.5, fontWeight: 600, color: '#83868f', border: '1px solid #eceae6', borderRadius: 8, padding: '3px 9px' }}
          >
            replier
          </button>
        )}
      </div>

      <FriseJalons jalons={jalons} />

      {/* LE DÉTAIL DE L'ENVELOPPE, sous la frise et dans la même carte — c'est là que la maquette le
          place, et c'est juste : la frise dit OÙ on en est, le détail dit COMMENT on y est arrivé. */}
      {detail && <div style={{ marginTop: 14 }}>{detail}</div>}

      {/* ══ VALIDER LE CONTRAT ══
          Il n'apparaît qu'entre la signature et la validation — c'est-à-dire exactement pendant la
          fenêtre où l'on attend le retour du fournisseur. Avant la signature il n'aurait rien à
          valider ; après, le cycle est clos. */}
      {aValider && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0efec' }}>
          {!confirme ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirme(true)}
                className="transition-opacity hover:opacity-90"
                style={{
                  fontSize: 12,
                  fontWeight: 750,
                  color: '#fff',
                  background: 'linear-gradient(135deg,#0d7a5fcc,#0d7a5f)',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 14px',
                }}
              >
                Valider le contrat
              </button>
              <span style={{ fontSize: 11, color: '#83868f' }}>
                Le client a signé. Reste à obtenir du fournisseur qu'il confirme la prise en charge
                et la commission.
              </span>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 11.5, color: '#5c5f66', marginBottom: 8 }}>
                <strong style={{ color: '#16181d' }}>En validant, vous attestez</strong> que le
                fournisseur a confirmé la prise en charge du contrat et la commission, et que les
                données de la fiche sont exactes. Le cycle de signature se clôt, la facturation
                s’ouvre, et l’opportunité peut être clôturée.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirme(false)
                    onValider?.()
                  }}
                  className="transition-opacity hover:opacity-90"
                  style={{
                    fontSize: 12,
                    fontWeight: 750,
                    color: '#fff',
                    background: 'linear-gradient(135deg,#0d7a5fcc,#0d7a5f)',
                    border: 'none',
                    borderRadius: 8,
                    padding: '7px 14px',
                  }}
                >
                  Oui, je valide
                </button>
                <button
                  type="button"
                  onClick={() => setConfirme(false)}
                  className="transition-colors hover:bg-km-soft"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#5c5f66',
                    border: '1px solid #e0dfdb',
                    borderRadius: 8,
                    padding: '6px 12px',
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
