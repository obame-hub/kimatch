/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES TROIS RATTACHEMENTS D'UN COMPTEUR, EN CARDS, ET CHANGEABLES SUR PLACE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « Modifie la page pour afficher les enregistrements rattachés (compte,
 * contact principal (responsable), contact CS) sous forme de card. Très important de pouvoir changer
 * rapidement de rattachement. » Maquette validée le même jour.
 *
 * ══ POURQUOI TROIS CARDS ET NON UNE HIÉRARCHIE ══
 *
 * L'onglet montrait un arbre — compte › lieu › compteur — qui décrivait une STRUCTURE alors que la
 * question posée ici est « à qui ce PDL appartient-il, et qui appelle-t-on ». Trois objets, trois
 * cards, chacune avec son geste : l'action est à côté de la réponse qu'elle modifie, jamais dans un
 * menu d'en-tête.
 *
 * ══ LE CHANGEMENT SE FAIT DANS LA CARD, PAS DANS UNE FENÊTRE ══
 *
 * Une fenêtre modale recouvre ce qu'on est en train de vérifier. Ici la card se déplie : le compte
 * actuel reste lisible au-dessus de la recherche, et l'aperçu des conséquences s'ouvre en dessous.
 * On ne quitte jamais l'écran où l'on a posé la question.
 *
 * ══ LE COMPTE SE LIT SUR LE COMPTEUR, PLUS À TRAVERS LE SITE ══
 *
 * C'est `compteur.compte_id` qui fait foi — c'est lui que lisent l'onglet Compteurs du compte, les
 * listes et la recherche. La fiche lisait `sites.compte_id`, et c'est exactement ce qui a masqué la
 * panne des deux seuls déplacements jamais faits : la fiche affichait la nouvelle société pendant
 * que le compteur restait dans le portefeuille de l'ancienne.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Building2, Check, FileWarning, Gauge, MoveRight, Search, User, UserCheck, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import {
  useApercuRattachement, useContactRattacheAuCompte, useRattacherCompteur, useRechercheComptes,
  type ActionResponsable, type CompteTrouve, type ResultatRattachement,
} from '@/lib/data/rattachementCompteur'
import { useContactsParCompte } from '@/lib/data/contacts'
import { nomComplet } from '@/lib/civilite'
import { cn } from '@/lib/utils'
import type { Compte, Compteur } from '@/types/domain'

/* ═══════════════════════════════ LES BRIQUES D'AFFICHAGE ══════════════════════════════════════ */

/** L'intitulé d'une card, et son geste. */
function EnTeteCarte({
  titre,
  action,
  libelleAction,
  ton = 'normal',
}: {
  titre: string
  action?: () => void
  libelleAction?: string
  ton?: 'normal' | 'annuler'
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-km-xs font-bold uppercase tracking-wide text-km-faint">{titre}</p>
      {action && libelleAction && (
        <button
          type="button"
          onClick={action}
          className={cn(
            'shrink-0 text-km-label font-semibold hover:underline',
            ton === 'annuler' ? 'text-km-muted' : 'text-km-green',
          )}
        >
          {libelleAction}
        </button>
      )}
    </div>
  )
}

/** Une ligne « enregistrement rattaché » : pastille, identité, seconde ligne, chevron. */
function LigneRattachement({
  vers,
  pastille,
  fond,
  teinte,
  nom,
  detail,
  marque,
}: {
  vers?: string
  pastille: React.ReactNode
  fond: string
  teinte: string
  nom: string
  detail?: React.ReactNode
  marque?: React.ReactNode
}) {
  const contenu = (
    <>
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: fond, color: teinte }}
      >
        {pastille}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold leading-tight text-km-text">{nom}</span>
        {detail && <span className="block truncate text-km-label leading-snug text-km-faint">{detail}</span>}
      </span>
      {marque}
      {vers && <span className="shrink-0 text-km-faint">›</span>}
    </>
  )

  const classes = 'flex items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left'
  return vers ? (
    <Link to={vers} className={cn(classes, 'transition-colors hover:bg-km-soft')}>{contenu}</Link>
  ) : (
    <div className={classes}>{contenu}</div>
  )
}

/** Le cartouche vert « contact du compte », ou son avertissement ambre. */
function MarqueRattachement({ rattache, compteNom }: { rattache: boolean; compteNom: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-[6px] px-1.5 py-px text-km-tiny font-bold',
        rattache ? 'bg-km-green-soft text-km-green' : 'bg-km-amber-soft text-km-amber',
      )}
      title={rattache ? `Rattaché à ${compteNom}` : `N'appartient pas à ${compteNom}`}
    >
      {rattache ? 'contact du compte' : 'autre société'}
    </span>
  )
}

/** Une case vide qui dit ce qui manque, et ce que ça coûte. */
function CarteVide({ pastille, fond, teinte, texte }: { pastille: React.ReactNode; fond: string; teinte: string; texte: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[9px] border border-dashed border-km-line px-2 py-2 text-km-label text-km-faint">
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: fond, color: teinte }}
      >
        {pastille}
      </span>
      {texte}
    </div>
  )
}

/* ═══════════════════════════════ LA RECHERCHE DE SOCIÉTÉ ══════════════════════════════════════ */

/** Ce qui distingue deux sociétés d'un même groupe, dans l'ordre où on le lit. */
function detailDuCompte(c: CompteTrouve): string {
  return [
    c.segment || c.type_compte,
    c.ville,
    c.siren ? `SIREN ${c.siren}` : null,
    c.nbCompteurs > 0 ? `${c.nbCompteurs} compteur${c.nbCompteurs > 1 ? 's' : ''}` : 'aucun compteur',
  ]
    .filter(Boolean)
    .join(' · ')
}

function RechercheCompte({
  exclureId,
  onChoisir,
}: {
  exclureId: string | undefined
  onChoisir: (c: CompteTrouve) => void
}) {
  const [saisie, setSaisie] = useState('')
  const [terme, setTerme] = useState('')
  const champ = useRef<HTMLInputElement>(null)

  // LE DÉBOUNCE EST ICI, PAS DANS LA REQUÊTE : sans lui, « DIMOTRANS » part en dix recherches dont
  // neuf sont jetées, et les réponses peuvent revenir dans le désordre.
  useEffect(() => {
    const t = window.setTimeout(() => setTerme(saisie), 220)
    return () => window.clearTimeout(t)
  }, [saisie])

  // Le champ prend le curseur à l'ouverture : on vient de cliquer « Changer », on veut taper.
  useEffect(() => { champ.current?.focus() }, [])

  const { data: trouves, isFetching, error } = useRechercheComptes(terme, exclureId)
  const assezLong = terme.trim().length >= 2

  return (
    <div className="overflow-hidden rounded-[9px] border-[1.5px] border-km-green bg-white">
      <div className="flex items-center gap-2 border-b border-km-line-soft px-2.5 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-km-faint" />
        <input
          ref={champ}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Nom, ville ou SIREN…"
          className="w-full border-0 bg-transparent p-0 text-sm text-km-text outline-none placeholder:text-km-faint"
        />
        {isFetching && <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-km-faint border-t-transparent" />}
      </div>

      {assezLong && (
        <div className="max-h-[210px] overflow-y-auto">
          {error && (
            <p className="px-2.5 py-3 text-km-label text-km-red">
              {error instanceof Error ? error.message : 'Recherche impossible'}
            </p>
          )}
          {!error && (trouves ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChoisir(c)}
              className="flex w-full items-center gap-2.5 border-b border-km-line-soft px-2.5 py-2 text-left last:border-b-0 hover:bg-km-green-tint"
            >
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-km-blue-soft text-km-blue">
                <Building2 className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-km-body font-semibold text-km-text">{c.nom}</span>
                <span className="block truncate text-km-label text-km-faint">{detailDuCompte(c)}</span>
              </span>
            </button>
          ))}
          {!error && !isFetching && (trouves ?? []).length === 0 && (
            <p className="px-2.5 py-3 text-center text-km-label text-km-faint">Aucune société ne correspond.</p>
          )}
        </div>
      )}

      <p className="bg-km-soft px-2.5 py-1.5 text-km-label text-km-faint">
        {assezLong
          ? 'La recherche accepte le nom, la ville, le SIREN et le SIRET.'
          : 'Deux caractères au moins — nom, ville, SIREN ou SIRET.'}
      </p>
    </div>
  )
}

/* ═══════════════════════════════ LE CHANGEMENT DE COMPTE ══════════════════════════════════════ */

/** Les quatre réponses possibles quand le responsable n'appartient pas à la société d'arrivée. */
const REPONSES_RESPONSABLE: { cle: ActionResponsable; titre: (n: string) => string; detail: string }[] = [
  {
    cle: 'CHOISIR',
    titre: (n) => `Choisir un responsable chez ${n}`,
    detail: 'Parmi les contacts de la société d’arrivée.',
  },
  {
    cle: 'RATTACHER',
    titre: (n) => `Rattacher cette personne à ${n}`,
    detail: 'Elle devient contact des deux sociétés. C’est le cas quand la même personne gère les deux.',
  },
  {
    cle: 'LAISSER',
    titre: () => 'Le laisser en place',
    detail: 'La donnée reste vraie même si elle est bancale : à traiter plus tard.',
  },
  {
    cle: 'RETIRER',
    titre: () => 'Retirer le responsable',
    detail: 'Le compteur arrive sans personne à appeler.',
  },
]

function ChangementDeCompte({
  compteur,
  compteActuel,
  responsableNom,
  onFini,
  onFermer,
}: {
  compteur: Compteur
  compteActuel: Compte | undefined
  responsableNom: string | null
  onFini: (r: ResultatRattachement) => void
  onFermer: () => void
}) {
  const [cible, setCible] = useState<CompteTrouve | null>(null)
  const [emmenerLeLieu, setEmmenerLeLieu] = useState(false)
  const [action, setAction] = useState<ActionResponsable>('LAISSER')
  const [nouveauResponsable, setNouveauResponsable] = useState('')
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const rattacher = useRattacherCompteur()
  /* LE LIEU SE DÉSIGNE PAR `site_id` : `groupe_site_id` n'est pas exposé côté front, et les deux
     colonnes portent la même valeur sur les 7 934 compteurs — le regroupement a été initialisé
     depuis le site, et `fn_rattacher_compteur` ne touche ni l'une ni l'autre. */
  const apercu = useApercuRattachement(
    compteur.id,
    compteur.site_id,
    compteur.compte_id ?? compteActuel?.id,
    cible?.id,
    compteur.responsable_contact_id ?? null,
  )
  const { data: contactsDeLaCible } = useContactsParCompte(
    cible && apercu.data && !apercu.data.responsableRattache ? cible.id : undefined,
  )

  // Le responsable étranger POSE une question ; tant qu'il est chez lui, il n'y a rien à décider.
  const aDecider = Boolean(compteur.responsable_contact_id) && apercu.data?.responsableRattache === false
  useEffect(() => {
    if (!aDecider) { setAction('LAISSER'); setNouveauResponsable('') }
  }, [aDecider])

  const pret =
    Boolean(cible) &&
    Boolean(apercu.data) &&
    !apercu.isLoading &&
    !apercu.error &&
    !rattacher.isPending &&
    (action !== 'CHOISIR' || Boolean(nouveauResponsable))

  const lancer = () => {
    if (!cible) return
    setErreur(null)
    rattacher
      .mutateAsync({
        compteurId: compteur.id,
        compteDestinationId: cible.id,
        emmenerLeLieu,
        actionResponsable: action,
        responsableContactId: action === 'CHOISIR' ? nouveauResponsable : null,
        motif: motif.trim() || null,
      })
      .then(onFini)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Le rattachement a échoué.'))
  }

  return (
    <div className="rounded-xl border border-km-green bg-white p-3.5">
      <EnTeteCarte titre="Compte" action={onFermer} libelleAction="Annuler" ton="annuler" />

      {/* ══ D'OÙ IL PART — reste lisible pendant qu'on cherche où il va ══ */}
      {!cible ? (
        <>
          <p className="flex items-center gap-1.5 px-1 pb-2 text-km-label text-km-faint">
            Actuellement
            <span className="font-semibold text-km-text">{compteActuel?.nom ?? 'compte inconnu'}</span>
            <ArrowRight className="h-3 w-3" />
          </p>
          <RechercheCompte exclureId={compteur.compte_id ?? compteActuel?.id} onChoisir={setCible} />
        </>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* ══ LE BASCULEMENT, LU D'UN COUP D'ŒIL ══ */}
          <div className="flex items-center gap-2.5 py-0.5">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-km-soft text-km-faint">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-km-label text-km-faint">Quitte</span>
              <span className="block truncate text-sm font-semibold text-km-muted line-through">{compteActuel?.nom}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-km-green" />
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-km-green-soft text-km-green">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-km-label text-km-faint">Rejoint</span>
              <span className="block truncate text-sm font-bold text-km-text">{cible.nom}</span>
            </span>
            <button
              type="button"
              onClick={() => { setCible(null); setEmmenerLeLieu(false) }}
              className="shrink-0 rounded p-1 text-km-faint hover:bg-km-soft hover:text-km-text"
              title="Choisir une autre société"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {apercu.isLoading && (
            <p className="flex items-center gap-2 rounded-km border border-km-line bg-km-soft px-3 py-2.5 text-km-body text-km-muted">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-km-faint border-t-transparent" />
              Recherche de ce que le changement entraîne…
            </p>
          )}

          {apercu.error && (
            <div className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
              <p className="text-km-body font-bold text-km-red">Impossible de savoir ce qui va suivre</p>
              <p className="mt-1 text-km-label leading-snug text-km-text">
                {apercu.error instanceof Error ? apercu.error.message : 'Erreur inconnue'}
              </p>
              <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                Le rattachement est bloqué tant qu’on ne peut pas dire ce qu’il entraîne.
              </p>
            </div>
          )}

          {apercu.data && !apercu.error && (
            <>
              {/* ══ ① CE QU'IL FAUT DÉCIDER — avant ce qui est seulement à savoir ══ */}
              {aDecider && (
                <div className="rounded-[10px] border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-km-xs font-bold uppercase tracking-[0.07em] text-km-amber">
                    <AlertTriangle className="h-3.5 w-3.5" /> Le responsable n’appartient pas à {cible.nom}
                  </p>
                  <p className="mt-1.5 text-km-body leading-snug text-km-text">
                    <span className="font-bold">{responsableNom}</span> est contact de{' '}
                    {compteActuel?.nom}. Il restera inscrit comme responsable d’un compteur qui ne
                    sera plus chez lui.
                  </p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {REPONSES_RESPONSABLE.map((r) => (
                      <button
                        key={r.cle}
                        type="button"
                        onClick={() => setAction(r.cle)}
                        className={cn(
                          'flex items-start gap-2 rounded-[9px] border px-2.5 py-2 text-left transition-colors',
                          action === r.cle ? 'border-km-green bg-km-green-tint' : 'border-km-line bg-white hover:bg-km-bg',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border-[1.5px]',
                            action === r.cle ? 'border-[4.5px] border-km-green' : 'border-km-faint',
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block text-km-body font-bold text-km-text">{r.titre(cible.nom)}</span>
                          <span className="block text-km-label leading-snug text-km-muted">{r.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {action === 'CHOISIR' && (
                    <div className="mt-2">
                      {(contactsDeLaCible ?? []).length === 0 ? (
                        <p className="rounded-[9px] border border-km-line bg-white px-2.5 py-2 text-km-label leading-snug text-km-muted">
                          {contactsDeLaCible
                            ? `${cible.nom} n’a aucun contact : impossible d’y choisir un responsable.`
                            : 'Lecture des contacts…'}
                        </p>
                      ) : (
                        <select
                          value={nouveauResponsable}
                          onChange={(e) => setNouveauResponsable(e.target.value)}
                          className="w-full rounded-[9px] border border-km-line bg-white px-2.5 py-2 text-km-body text-km-text"
                        >
                          <option value="">Choisir un contact…</option>
                          {(contactsDeLaCible ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {nomComplet(c)}{c.fonction ? ` — ${c.fonction}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ══ ② CE QUI SUIT LE COMPTEUR ══ */}
              <div className="rounded-[10px] border border-km-green-line bg-km-green-tint px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-km-xs font-bold uppercase tracking-[0.07em] text-km-green">
                  <MoveRight className="h-3.5 w-3.5" /> Suivra le compteur
                </p>
                <p className="mt-1.5 text-km-body leading-snug text-km-text">
                  {[
                    compteur.contact_conseil_syndical_id ? 'le relais du conseil syndical' : null,
                    apercu.data.signaux > 0 ? `${apercu.data.signaux} signal${apercu.data.signaux > 1 ? 'aux' : ''}` : null,
                    apercu.data.requetes > 0 ? `${apercu.data.requetes} requête${apercu.data.requetes > 1 ? 's' : ''}` : null,
                    apercu.data.consommations > 0 ? `${apercu.data.consommations} relevé${apercu.data.consommations > 1 ? 's' : ''} de consommation` : null,
                  ].filter(Boolean).join(' · ') || 'Le compteur part seul : rien d’autre n’est accroché à lui.'}
                </p>

                {/* LE VOISINAGE : LA MISE EN GARDE QUI COMPTE. Un tiers des compteurs partagent leur
                    lieu, et ne pas nommer ceux qu'on emmène serait le défaut de l'ancienne fenêtre
                    de suppression — « action irréversible » sans dire ce qu'elle emportait. */}
                {apercu.data.voisins.length === 0 ? (
                  <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                    Ce PDL est seul sur son lieu : aucun compteur voisin n’est emmené.
                  </p>
                ) : (
                  <div className="mt-2 rounded-[9px] border border-km-amber-line bg-km-amber-soft px-2.5 py-2">
                    <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-amber">
                      <Gauge className="h-3.5 w-3.5" />
                      {apercu.data.voisins.length} autre{apercu.data.voisins.length > 1 ? 's' : ''} compteur
                      {apercu.data.voisins.length > 1 ? 's' : ''} sur ce lieu
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {apercu.data.voisins.slice(0, 6).map((v) => (
                        <li key={v.id} className="text-km-label text-km-text">
                          <span className="font-mono font-semibold">{v.numero}</span>
                          {v.libelle && <span className="text-km-muted"> — {v.libelle}</span>}
                        </li>
                      ))}
                      {apercu.data.voisins.length > 6 && (
                        <li className="text-km-label text-km-muted">et {apercu.data.voisins.length - 6} autres</li>
                      )}
                    </ul>
                    <label className="mt-2 flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={emmenerLeLieu}
                        onChange={(e) => setEmmenerLeLieu(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-km-green"
                      />
                      <span className="text-km-label leading-snug text-km-text">
                        Emmener aussi ces compteurs.{' '}
                        <span className="text-km-muted">
                          Décoché, seul ce PDL change de société et le lieu se retrouve partagé entre
                          deux sociétés — ce qui est parfois la vérité.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* ══ ③ LES MANDATS QUE LE COMPTEUR QUITTE ══

                  William, 15/09/2026 : « un changement de compte entraîne de manière systémique une
                  caducité du mandat ». Ce bloc est le plus important de l'écran : c'est la seule
                  conséquence qui oblige à refaire signer un document, et donc la seule qui coûte du
                  temps commercial si on ne la voit pas avant de cliquer. */}
              {apercu.data.mandatsCaducs.length > 0 && (
                <div className="rounded-[10px] border border-km-red-line bg-km-red-soft px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-km-xs font-bold uppercase tracking-[0.07em] text-km-red">
                    <FileWarning className="h-3.5 w-3.5" />
                    {apercu.data.mandatsCaducs.length === 1
                      ? 'Le mandat ne couvrira plus ce compteur'
                      : `${apercu.data.mandatsCaducs.length} mandats ne couvriront plus ce compteur`}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {apercu.data.mandatsCaducs.map((m) => (
                      <li key={m.id} className="text-km-body leading-snug text-km-text">
                        <span className="font-semibold">{m.reference ?? 'Mandat sans référence'}</span>
                        <span className="text-km-muted">
                          {' — '}
                          {m.entier
                            ? m.statut === 'ACTIF'
                              ? 'c’est son dernier compteur : le mandat entier passera « Caduque »'
                              : 'c’est son dernier compteur ; le mandat n’étant pas actif, son statut ne change pas'
                            : 'le compteur sort de son périmètre, le mandat reste valide pour les autres'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                    Un mandat autorise une société à faire négocier SES points de livraison. Celui-ci
                    part ailleurs : il n’est plus couvert, et devra faire l’objet d’un nouveau mandat
                    signé par {cible.nom} avant toute recommandation.
                  </p>
                </div>
              )}

              {/* ══ ④ CE QUI NE BOUGE PAS ══ */}
              {apercu.data.aDesRestes && (
                <div className="rounded-[10px] border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-km-xs font-bold uppercase tracking-[0.07em] text-km-amber">
                    <AlertTriangle className="h-3.5 w-3.5" /> Restera sur {compteActuel?.nom}
                  </p>
                  <p className="mt-1.5 text-km-body leading-snug text-km-text">
                    {[
                      apercu.data.contrats > 0 ? `${apercu.data.contrats} contrat${apercu.data.contrats > 1 ? 's' : ''}` : null,
                      apercu.data.recommandations > 0 ? `${apercu.data.recommandations} recommandation${apercu.data.recommandations > 1 ? 's' : ''}` : null,
                      apercu.data.opportunites > 0 ? `${apercu.data.opportunites} opportunité${apercu.data.opportunites > 1 ? 's' : ''}` : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {/* LE CONTRAT NE DEVIENT PAS CADUC, ET C'EST UNE DÉCISION, pas un oubli. William,
                      15/09/2026 : « le contrat lui n'est pas caduque, il doit rester attaché au
                      compte de base et au(x) compteur(s). Dans la logique, un changement de société
                      devrait entraîner un avenant au contrat mentionnant le nouveau compte mais on
                      ne s'en occupe pas. » */}
                  <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                    Le contrat reste attaché au compte qui l’a signé et au compteur : la fourniture
                    court toujours. L’avenant au nouveau nom se traite hors de Kimatch.
                  </p>
                </div>
              )}

              {/* ══ ④ LE MOTIF ══
                  « Pourquoi ce PDL a-t-il changé de société ? » est la question qu'on se posera dans
                  six mois, et une case vide ne répond pas. */}
              <div>
                <p className="mb-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
                  Motif{' '}
                  <span className="font-normal normal-case tracking-normal text-km-faint">
                    (facultatif, conservé dans l’historique)
                  </span>
                </p>
                <Input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Ex. PDL rangé sous la mauvaise société à la reprise Salesforce"
                />
              </div>

              {erreur && (
                <p className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5 text-km-body leading-snug text-km-red">
                  {erreur}
                </p>
              )}

              {/* LE BOUTON PORTE LA DESTINATION, pas un « Confirmer » anonyme : c'est la dernière
                  occasion de voir qu'on s'est trompé de société. */}
              <div className="flex items-center justify-end gap-2 border-t border-km-line pt-3">
                <Button variant="ghost" onClick={onFermer} disabled={rattacher.isPending}>Annuler</Button>
                <Button onClick={lancer} disabled={!pret}>
                  {rattacher.isPending ? 'Rattachement…' : `Rattacher à ${cible.nom}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════ LE RÉSULTAT ══════════════════════════════════════════════════ */

function ResultatRattache({ r, onFermer }: { r: ResultatRattachement; onFermer: () => void }) {
  return (
    <div className="rounded-xl border border-km-green-line bg-km-green-soft p-3.5">
      <p className="flex items-center gap-1.5 text-km-body font-bold text-km-green">
        <Check className="h-4 w-4" /> Compteur rattaché
      </p>
      <p className="mt-1 text-km-label leading-snug text-km-text">
        {r.compte_origine} <ArrowRight className="inline h-3 w-3" /> {r.compte_destination}
      </p>
      {/* LES NOMBRES VIENNENT DE LA BASE, pas de l'aperçu : c'est ce qui a réellement été écrit. Un
          écart avec ce qu'annonçait l'écran se voit alors immédiatement. */}
      <ul className="mt-1.5 flex flex-col gap-0.5 text-km-label text-km-muted">
        {r.suivis.compteurs_voisins > 0 && <li>{r.suivis.compteurs_voisins} compteur(s) du lieu emmené(s)</li>}
        {r.suivis.requetes > 0 && <li>{r.suivis.requetes} requête(s) déplacée(s)</li>}
        {r.suivis.responsable_action === 'CHOISIR' && <li>Nouveau responsable : {r.suivis.responsable_nom}</li>}
        {r.suivis.responsable_action === 'RATTACHER' && <li>{r.suivis.responsable_nom} rattaché(e) à {r.compte_destination}</li>}
        {r.suivis.responsable_action === 'RETIRER' && <li>Responsable retiré</li>}
        {r.caducite.liens_caducs > 0 && (
          <li>
            {r.caducite.liens_caducs} lien{r.caducite.liens_caducs > 1 ? 's' : ''} de mandat passé
            {r.caducite.liens_caducs > 1 ? 's' : ''} en périmètre caduque
            {r.caducite.mandats_caducs > 0 && `, dont ${r.caducite.mandats_caducs} mandat${r.caducite.mandats_caducs > 1 ? 's' : ''} entièrement caduc${r.caducite.mandats_caducs > 1 ? 's' : ''}`}
          </li>
        )}
        {r.suivis.tache_relais && <li>Une tâche a été créée pour appeler {r.suivis.relais_nom}</li>}
      </ul>
      <div className="mt-2.5 flex justify-end">
        <Button variant="ghost" onClick={onFermer}>Fermer</Button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════ LE BLOC COMPLET ══════════════════════════════════════════════ */

export function CartesRattachement({
  compteur,
  compte,
  canManage,
  onModifierContacts,
  onDesignerRelais,
}: {
  compteur: Compteur
  compte: Compte | undefined
  canManage: boolean
  /** L'édition des contacts vit dans l'onglet Compteur, à un seul endroit. */
  onModifierContacts: () => void
  onDesignerRelais?: () => void
}) {
  const [enChangement, setEnChangement] = useState(false)
  const [resultat, setResultat] = useState<ResultatRattachement | null>(null)

  // Le responsable est-il chez lui ? Une seule question, un seul appel — l'aperçu complet compte
  // aussi les mandats et les requêtes, ce qui n'a aucun sens tant qu'on ne déplace rien.
  const { data: responsableRattache } = useContactRattacheAuCompte(
    compteur.responsable_contact_id,
    compteur.compte_id ?? compte?.id,
  )
  const responsableChezLui = responsableRattache !== false

  const detailCompte = useMemo(() => {
    if (!compte) return undefined
    return [compte.segment || compte.type_compte, compte.ville].filter(Boolean).join(' · ') || undefined
  }, [compte])

  if (resultat) return <ResultatRattache r={resultat} onFermer={() => { setResultat(null); setEnChangement(false) }} />

  return (
    <div className="flex flex-col gap-3">
      {/* ══ LE COMPTE ══ */}
      {enChangement ? (
        <ChangementDeCompte
          compteur={compteur}
          compteActuel={compte}
          responsableNom={compteur.responsable_contact_nom ?? 'Le responsable'}
          onFini={setResultat}
          onFermer={() => setEnChangement(false)}
        />
      ) : (
        <div className="rounded-xl border border-km-line bg-white p-3.5">
          <EnTeteCarte
            titre="Compte"
            action={canManage ? () => setEnChangement(true) : undefined}
            libelleAction="Changer"
          />
          {compte ? (
            <LigneRattachement
              vers={`/comptes/${compte.id}`}
              pastille={<Building2 className="h-3.5 w-3.5" />}
              fond="rgb(234 241 248)"
              teinte="rgb(63 110 156)"
              nom={compte.nom}
              detail={detailCompte}
            />
          ) : (
            <CarteVide
              pastille={<Building2 className="h-3.5 w-3.5" />}
              fond="rgb(243 245 242)"
              teinte="rgb(146 154 149)"
              texte="Compte inconnu."
            />
          )}
        </div>
      )}

      {/* ══ LE RESPONSABLE ══ */}
      <div className="rounded-xl border border-km-line bg-white p-3.5">
        <EnTeteCarte
          titre="Responsable"
          action={canManage ? onModifierContacts : undefined}
          libelleAction={compteur.responsable_contact_id ? 'Changer' : 'Désigner'}
        />
        {compteur.responsable_contact_id ? (
          <LigneRattachement
            vers={`/contacts/${compteur.responsable_contact_id}`}
            pastille={<User className="h-3.5 w-3.5" />}
            fond="rgb(238 240 250)"
            teinte="rgb(79 90 168)"
            nom={compteur.responsable_contact_nom ?? 'Contact'}
            marque={compte ? <MarqueRattachement rattache={responsableChezLui} compteNom={compte.nom} /> : undefined}
          />
        ) : (
          <CarteVide
            pastille={<User className="h-3.5 w-3.5" />}
            fond="rgb(238 240 250)"
            teinte="rgb(79 90 168)"
            texte="Aucun responsable — personne à appeler sur ce point de livraison."
          />
        )}
      </div>

      {/* ══ LE RELAIS DE CONSEIL SYNDICAL ══ */}
      <div className="rounded-xl border border-km-line bg-white p-3.5">
        <EnTeteCarte
          titre="Relais conseil syndical"
          action={canManage ? (onDesignerRelais ?? onModifierContacts) : undefined}
          libelleAction={compteur.contact_conseil_syndical_id ? 'Changer' : 'Désigner'}
        />
        {compteur.contact_conseil_syndical_id ? (
          <LigneRattachement
            vers={`/contacts/${compteur.contact_conseil_syndical_id}`}
            pastille={<UserCheck className="h-3.5 w-3.5" />}
            fond="rgb(241 236 248)"
            teinte="rgb(124 91 176)"
            nom={compteur.contact_conseil_syndical_nom ?? 'Contact'}
          />
        ) : (
          <CarteVide
            pastille={<UserCheck className="h-3.5 w-3.5" />}
            fond="rgb(241 236 248)"
            teinte="rgb(124 91 176)"
            texte="Aucun relais — personne à appeler si le cabinet change."
          />
        )}
      </div>
    </div>
  )
}
