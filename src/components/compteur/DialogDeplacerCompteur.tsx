/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CHANGER LE COMPTE D'UN COMPTEUR : LE SITE SUIT, ET ON VOIT QUI SUIT AVEC LUI
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 07/09/2026 : « donne la possibilité dans le compteur de changer le compte de ce
 * compteur », puis « il faudrait que quand on change le compte du compteur, ça change
 * automatiquement le compte du site auquel il est rattaché ».
 *
 * ══ ON CHOISIT UNE SOCIÉTÉ, PAS UN SITE ══
 *
 * C'est la société que la personne a en tête. Le site est une conséquence, et par défaut il SUIT :
 * il change de compte avec le compteur, et l'immeuble entier va avec lui.
 *
 * DEUX FOIS SUR TROIS, ÇA N'EMMÈNE RIEN D'AUTRE — 5 352 compteurs sur 7 919 sont seuls sur leur
 * site. Le tiers restant partage son site, et alors la fenêtre NOMME les compteurs voisins qui
 * partiront aussi. C'est la leçon de la fenêtre de suppression réécrite ce matin : elle annonçait
 * « action irréversible » sans jamais dire ce qu'elle emportait.
 *
 * ══ ET UNE SORTIE POUR L'AUTRE CAS ══
 *
 * Quand un seul PDL d'un immeuble a été mal attribué, emmener l'immeuble serait faux. La fenêtre
 * propose alors de ranger le compteur dans un site existant de la société de destination, en
 * laissant son site d'origine tranquille. Offert seulement quand ce choix existe.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Building2, Gauge, MapPin, MoveRight, UserX } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { useComptes } from '@/lib/data/comptes'
import { useSitesParCompte } from '@/lib/data/sites'
import {
  useDeplacerCompteur,
  useDeplacerSite,
  useInventaireCompteur,
  useInventaireSite,
  type ResultatDeplacement,
  type RestesSurLAncienCompte,
} from '@/lib/data/deplacementCompteur'
import { pluriel } from '@/lib/data/inventaireSuppression'
import { cn } from '@/lib/utils'
import type { Compte, Site } from '@/types/domain'

/** « emmener » : le site change de société. « ranger » : seul le compteur bouge. */
type Geste = 'emmener' | 'ranger'

/** Une ligne « n objets » avec, en dessous, ce qu'ils sont quand on peut les nommer. */
function LigneFamille({ libelle, nombre, exemples }: { libelle: string; nombre: number; exemples?: string[] }) {
  if (nombre === 0) return null
  return (
    <li className="text-km-body leading-snug text-km-text">
      <span className="font-bold">{pluriel(nombre, libelle)}</span>
      {exemples && exemples.length > 0 && (
        <span className="block text-km-label text-km-muted">
          {exemples.slice(0, 4).join(' · ')}
          {exemples.length > 4 && ` · et ${exemples.length - 4} autre${exemples.length - 4 > 1 ? 's' : ''}`}
        </span>
      )}
    </li>
  )
}

/** Le bloc ambre : ce que le déplacement laisse sur l'ancienne société. */
function BlocRestes({ restes, compteNom }: { restes: RestesSurLAncienCompte; compteNom: string }) {
  if (!restes.aDesRestes) return null
  return (
    <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-amber">
        <AlertTriangle className="h-3.5 w-3.5" /> Restera sur {compteNom}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        <LigneFamille libelle="mandat" nombre={restes.mandats} />
        <LigneFamille libelle="contrat" nombre={restes.contrats.length} exemples={restes.contrats.map((c) => c.libelle)} />
        <LigneFamille libelle="recommandation" nombre={restes.recommandations.length} exemples={restes.recommandations.map((r) => r.libelle)} />
        <LigneFamille libelle="opportunité" nombre={restes.opportunites.length} exemples={restes.opportunites.map((o) => o.libelle)} />
      </ul>
      <p className="mt-2 text-km-label leading-snug text-km-text">
        Un mandat est signé et couvre souvent plusieurs compteurs : le faire suivre réécrirait un
        document signé et arracherait les autres compteurs à leur propre compte. Ces objets ne
        bougent donc pas — à reprendre un par un si nécessaire.
      </p>
    </div>
  )
}

export function DialogDeplacerCompteur({
  ouvert,
  onFermer,
  compteurId,
  numeroPdl,
  compteActuelId,
  compteActuelNom,
  siteActuelId,
  siteActuelNom,
}: {
  ouvert: boolean
  onFermer: () => void
  compteurId: string
  numeroPdl: string
  compteActuelId: string | undefined
  compteActuelNom: string
  siteActuelId: string
  siteActuelNom: string
}) {
  const [compteCible, setCompteCible] = useState('')
  const [geste, setGeste] = useState<Geste>('emmener')
  const [siteCible, setSiteCible] = useState('')
  const [detacherContacts, setDetacherContacts] = useState(false)
  const [motif, setMotif] = useState('')
  const [resultat, setResultat] = useState<ResultatDeplacement | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const { data: comptes } = useComptes()
  const { data: sitesDuCompteCible } = useSitesParCompte(compteCible || undefined)
  const deplacerSite = useDeplacerSite()
  const deplacerCompteur = useDeplacerCompteur()

  // À la réouverture, tout repart de zéro : garder le choix précédent ferait déplacer un autre
  // compteur vers une destination qu'on n'a pas relue.
  useEffect(() => {
    if (!ouvert) return
    setCompteCible('')
    setGeste('emmener')
    setSiteCible('')
    setDetacherContacts(false)
    setMotif('')
    setResultat(null)
    setErreur(null)
  }, [ouvert])

  /* Le site actuel n'est pas une destination : le proposer laisserait cliquer « Déplacer » sur
     place, et la fonction en base refuserait avec une erreur. */
  const sitesPossibles = useMemo(
    () => (sitesDuCompteCible ?? []).filter((s) => s.id !== siteActuelId),
    [sitesDuCompteCible, siteActuelId],
  )

  // Un seul site possible : on le retient sans rien demander.
  useEffect(() => {
    if (sitesPossibles.length === 1) setSiteCible(sitesPossibles[0].id)
    else if (!sitesPossibles.some((s) => s.id === siteCible)) setSiteCible('')
  }, [sitesPossibles, siteCible])

  // « Ranger ailleurs » n'a de sens que si la société de destination a déjà un site où ranger.
  const rangerPossible = sitesPossibles.length > 0
  useEffect(() => {
    if (!rangerPossible) setGeste('emmener')
  }, [rangerPossible])

  const invSite = useInventaireSite(siteActuelId, compteurId, compteActuelId, compteCible || undefined, ouvert && geste === 'emmener')
  const invCompteur = useInventaireCompteur(compteurId, compteActuelId, compteCible || undefined, siteActuelId, ouvert && geste === 'ranger' && Boolean(siteCible))

  const enCours = deplacerSite.isPending || deplacerCompteur.isPending
  const chargement = geste === 'emmener' ? invSite.isLoading : invCompteur.isLoading
  const echecLecture = geste === 'emmener' ? invSite.error : invCompteur.error
  const inventaire = geste === 'emmener' ? invSite.data : invCompteur.data
  const contactsEtrangers = (invCompteur.data?.contacts ?? []).filter((c) => !c.rattacheALaDestination)

  const pret =
    Boolean(compteCible) &&
    Boolean(inventaire) &&
    !chargement &&
    !echecLecture &&
    !enCours &&
    !resultat &&
    (geste === 'emmener' || Boolean(siteCible))

  const lancer = () => {
    setErreur(null)
    const promesse =
      geste === 'emmener'
        ? deplacerSite.mutateAsync({ siteId: siteActuelId, compteDestinationId: compteCible, motif: motif.trim() || null })
        : deplacerCompteur.mutateAsync({ compteurId, siteDestinationId: siteCible, detacherContacts, motif: motif.trim() || null })
    promesse
      .then((r) => setResultat(r))
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Le déplacement a échoué.'))
  }

  const compteCibleNom = (comptes ?? []).find((c) => c.id === compteCible)?.nom ?? ''

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title={`Changer le compte du compteur ${numeroPdl}`}
      description="Par défaut, le site auquel il est rattaché change de société avec lui."
      className="max-w-[620px]"
    >
      {/* ══ CE QUI S'EST PASSÉ, quand c'est fait ══ */}
      {resultat ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-km border border-km-green-line bg-km-green-soft px-3 py-2.5">
            <p className="text-km-body font-bold text-km-green">
              {resultat.geste === 'site' ? 'Site déplacé' : 'Compteur déplacé'}
            </p>
            <p className="mt-1 text-km-label leading-snug text-km-text">
              {resultat.geste === 'site' ? (
                <>
                  {resultat.site} : {resultat.compte_origine} <ArrowRight className="inline h-3 w-3" />{' '}
                  {resultat.compte_destination}
                </>
              ) : (
                <>
                  {resultat.site_origine} <ArrowRight className="inline h-3 w-3" /> {resultat.site_destination}
                </>
              )}
            </p>
            {/* LES NOMBRES VIENNENT DE LA BASE, pas de l'aperçu : c'est ce qui a réellement été
                écrit. Un écart avec ce qu'annonçait la fenêtre se voit ici. */}
            <ul className="mt-1.5 flex flex-col gap-0.5 text-km-label text-km-muted">
              {resultat.geste === 'site' ? (
                <>
                  <li>{pluriel(resultat.suivis.compteurs, 'compteur')} sur ce site</li>
                  {resultat.suivis.signaux > 0 && <li>{pluriel(resultat.suivis.signaux, 'signal')}</li>}
                  {resultat.suivis.contacts_site > 0 && <li>{pluriel(resultat.suivis.contacts_site, 'contact de site')}</li>}
                  {resultat.suivis.actions > 0 && <li>{pluriel(resultat.suivis.actions, 'action')}</li>}
                  {resultat.suivis.requetes > 0 && <li>{pluriel(resultat.suivis.requetes, 'requête')}</li>}
                  {resultat.suivis.interactions > 0 && <li>{pluriel(resultat.suivis.interactions, 'interaction')}</li>}
                </>
              ) : (
                <>
                  {resultat.suivis.signaux > 0 && <li>{pluriel(resultat.suivis.signaux, 'signal')} déplacé(s) avec lui</li>}
                  {resultat.suivis.requetes > 0 && <li>{pluriel(resultat.suivis.requetes, 'requête')} déplacée(s) avec lui</li>}
                  {resultat.suivis.contacts_detaches > 0 && <li>contacts d’une autre société détachés</li>}
                </>
              )}
            </ul>
          </div>
          {(resultat.restes.mandats + resultat.restes.contrats + resultat.restes.recommandations + resultat.restes.opportunites) > 0 && (
            <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-km-body font-bold text-km-amber">
                <AlertTriangle className="h-3.5 w-3.5" /> Restés sur {compteActuelNom}
              </p>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-km-label text-km-text">
                <LigneFamille libelle="mandat" nombre={resultat.restes.mandats} />
                <LigneFamille libelle="contrat" nombre={resultat.restes.contrats} />
                <LigneFamille libelle="recommandation" nombre={resultat.restes.recommandations} />
                <LigneFamille libelle="opportunité" nombre={resultat.restes.opportunites} />
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={onFermer}>Fermer</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {/* ══ D'OÙ IL PART ══ */}
          <div className="rounded-km border border-km-line bg-km-soft px-3 py-2.5">
            <p className="text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">Actuellement</p>
            <p className="mt-1 flex items-center gap-1.5 text-km-body text-km-text">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-km-faint" />
              <span className="font-semibold">{compteActuelNom}</span>
              <span className="text-km-faint">›</span>
              <MapPin className="h-3.5 w-3.5 shrink-0 text-km-faint" />
              <span className="truncate">{siteActuelNom}</span>
            </p>
          </div>

          {/* ══ LA SOCIÉTÉ DE DESTINATION — le seul choix vraiment nécessaire ══ */}
          <div>
            <p className="mb-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
              Nouvelle société
            </p>
            <ChoixParRecherche<Compte>
              items={(comptes ?? []).filter((c) => c.id !== compteActuelId)}
              valeur={compteCible}
              onChoisir={(c) => { setCompteCible(c?.id ?? ''); setSiteCible(''); setGeste('emmener') }}
              placeholder="Chercher une société…"
              principal={(c) => c.nom}
              secondaire={(c) => [c.ville, c.siret ? `SIRET ${c.siret}` : null].filter(Boolean).join(' · ') || null}
              filtre={(c, q) => c.nom.toLowerCase().includes(q) || (c.siret ?? '').includes(q) || (c.siren ?? '').includes(q)}
              totalLibelle={`${(comptes ?? []).length - 1} autres sociétés`}
            />
          </div>

          {/* ══ LE GESTE, quand il y a un choix à faire ══ */}
          {compteCible && rangerPossible && (
            <div className="flex flex-col gap-1.5">
              <p className="text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">Comment</p>
              {([
                {
                  cle: 'emmener' as Geste,
                  titre: `Emmener le site « ${siteActuelNom} »`,
                  detail: `Le site change de société. Tout ce qu'il porte suit avec lui.`,
                },
                {
                  cle: 'ranger' as Geste,
                  titre: 'Ranger ce compteur dans un site existant',
                  detail: `Le site « ${siteActuelNom} » reste chez ${compteActuelNom}. Seul ce compteur bouge.`,
                },
              ]).map((o) => (
                <button
                  key={o.cle}
                  type="button"
                  onClick={() => setGeste(o.cle)}
                  className={cn(
                    'rounded-km border px-3 py-2 text-left transition-colors',
                    geste === o.cle
                      ? 'border-km-green bg-km-green-tint'
                      : 'border-km-line bg-white hover:bg-km-bg',
                  )}
                >
                  <p className="text-km-body font-semibold text-km-text">{o.titre}</p>
                  <p className="mt-0.5 text-km-label leading-snug text-km-muted">{o.detail}</p>
                </button>
              ))}
            </div>
          )}

          {/* ══ LE SITE D'ARRIVÉE, seulement pour « ranger » ══ */}
          {compteCible && geste === 'ranger' && (
            <div>
              <p className="mb-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
                Site de destination
              </p>
              {sitesPossibles.length === 1 ? (
                <p className="flex items-center gap-1.5 rounded-km border border-km-line bg-white px-3 py-2 text-km-body text-km-text">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-km-faint" />
                  <span className="truncate font-medium">{sitesPossibles[0].nom}</span>
                  <span className="shrink-0 text-km-label text-km-faint">seul site de cette société</span>
                </p>
              ) : (
                <ChoixParRecherche<Site>
                  items={sitesPossibles}
                  valeur={siteCible}
                  onChoisir={(s) => setSiteCible(s?.id ?? '')}
                  placeholder="Chercher un site…"
                  principal={(s) => s.nom}
                  secondaire={(s) => [s.adresse, [s.code_postal, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null}
                  filtre={(s, q) => s.nom.toLowerCase().includes(q) || (s.ville ?? '').toLowerCase().includes(q) || (s.code_postal ?? '').includes(q)}
                  totalLibelle={`${sitesPossibles.length} sites sur cette société`}
                />
              )}
            </div>
          )}

          {/* ══ L'APERÇU ══ */}
          {chargement && (
            <p className="flex items-center gap-2 rounded-km border border-km-line bg-km-soft px-3 py-2.5 text-km-body text-km-muted">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-km-faint border-t-transparent" />
              Recherche de ce qui va suivre…
            </p>
          )}

          {echecLecture && (
            <div className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
              <p className="text-km-body font-bold text-km-red">Impossible de savoir ce qui va suivre</p>
              <p className="mt-1 text-km-label leading-snug text-km-text">
                {echecLecture instanceof Error ? echecLecture.message : 'Erreur inconnue'}
              </p>
              <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                Le déplacement est bloqué tant qu’on ne peut pas dire ce qu’il entraîne.
              </p>
            </div>
          )}

          {/* ── ① Emmener le site ── */}
          {geste === 'emmener' && invSite.data && !echecLecture && (
            <>
              <div className="rounded-km border border-km-green-line bg-km-green-soft/40 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-green">
                  <MoveRight className="h-3.5 w-3.5" /> Passera chez {compteCibleNom}
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  <li className="text-km-body leading-snug text-km-text">
                    <span className="font-bold">Le site {siteActuelNom}</span>
                    <span className="text-km-muted"> et ce compteur</span>
                  </li>
                  <LigneFamille libelle="signal" nombre={invSite.data.signaux} />
                  <LigneFamille libelle="contact de site" nombre={invSite.data.contactsSite} />
                  <LigneFamille libelle="action" nombre={invSite.data.actions} />
                  <LigneFamille libelle="requête" nombre={invSite.data.requetes} />
                  <LigneFamille libelle="interaction" nombre={invSite.data.interactions} />
                </ul>
              </div>

              {/* LE VOISINAGE : LA MISE EN GARDE QUI COMPTE.
                  32,4 % des compteurs partagent leur site. Emmener le site les emmène tous, et ne
                  pas les nommer serait exactement le défaut de l'ancienne fenêtre de suppression. */}
              {invSite.data.voisins.length > 0 && (
                <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-amber">
                    <Gauge className="h-3.5 w-3.5" />
                    {pluriel(invSite.data.voisins.length, 'autre compteur')} sur ce site
                  </p>
                  <p className="mt-1 text-km-label leading-snug text-km-text">
                    Le site part avec tous ses compteurs. Ceux-ci changeront de société aussi :
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {invSite.data.voisins.slice(0, 8).map((v) => (
                      <li key={v.id} className="text-km-label text-km-text">
                        <span className="font-mono font-semibold">{v.numero}</span>
                        {v.libelle && <span className="text-km-muted"> — {v.libelle}</span>}
                      </li>
                    ))}
                    {invSite.data.voisins.length > 8 && (
                      <li className="text-km-label text-km-muted">
                        et {invSite.data.voisins.length - 8} autres
                      </li>
                    )}
                  </ul>
                  <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                    Si un seul compteur était mal attribué, choisissez plutôt « Ranger ce compteur
                    dans un site existant » ci-dessus.
                  </p>
                </div>
              )}

              <BlocRestes restes={invSite.data} compteNom={compteActuelNom} />
            </>
          )}

          {/* ── ② Ranger le compteur ailleurs ── */}
          {geste === 'ranger' && invCompteur.data && !echecLecture && (
            <>
              <div className="rounded-km border border-km-green-line bg-km-green-soft/40 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-green">
                  <MoveRight className="h-3.5 w-3.5" /> Suivra le compteur
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  <LigneFamille libelle="signal" nombre={invCompteur.data.signaux} />
                  <LigneFamille libelle="requête" nombre={invCompteur.data.requetes} />
                  <LigneFamille libelle="relevé de consommation" nombre={invCompteur.data.consommations} />
                  {invCompteur.data.signaux + invCompteur.data.requetes + invCompteur.data.consommations === 0 && (
                    <li className="text-km-label text-km-muted">
                      Le compteur part seul : rien d’autre n’est accroché à lui.
                    </li>
                  )}
                </ul>
              </div>

              <BlocRestes restes={invCompteur.data} compteNom={compteActuelNom} />

              {/* ══ LES CONTACTS QUI DEVIENNENT ÉTRANGERS ══ */}
              {contactsEtrangers.length > 0 && (
                <div className="rounded-km border border-km-line bg-white px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-faint">
                    <UserX className="h-3.5 w-3.5" /> À vérifier
                  </p>
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {contactsEtrangers.map((c) => (
                      <li key={c.id} className="text-km-body leading-snug text-km-text">
                        <span className="font-semibold">{c.nom}</span>
                        <span className="text-km-muted"> — {c.role.toLowerCase()}, non rattaché à la société de destination</span>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-2 flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={detacherContacts}
                      onChange={(e) => setDetacherContacts(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-km-green"
                    />
                    <span className="text-km-label leading-snug text-km-text">
                      Retirer ces contacts du compteur.{' '}
                      <span className="text-km-muted">
                        Décoché, ils restent en place : la donnée est réelle, même si la personne
                        appartient à une autre société.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </>
          )}

          {/* LE MOTIF EST FACULTATIF ET VA DANS L'HISTORIQUE. « Pourquoi ce PDL a-t-il changé de
              société ? » est la question qu'on se posera dans six mois, et une case vide ne
              répond pas. */}
          {inventaire && !echecLecture && (
            <div>
              <p className="mb-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
                Motif <span className="font-normal normal-case tracking-normal text-km-faint">(facultatif, conservé dans l’historique)</span>
              </p>
              <Input
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex. site rangé sous la mauvaise société à la reprise Salesforce"
              />
            </div>
          )}

          {erreur && (
            <p className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5 text-km-body leading-snug text-km-red">
              {erreur}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-km-line pt-3">
            <Button variant="ghost" onClick={onFermer} disabled={enCours}>
              Annuler
            </Button>
            {/* LE BOUTON PORTE LA DESTINATION, pas un « Confirmer » anonyme : c'est la dernière
                occasion de voir qu'on s'est trompé de société. */}
            <Button onClick={lancer} disabled={!pret}>
              {enCours
                ? 'Déplacement…'
                : compteCibleNom
                  ? `Déplacer vers ${compteCibleNom}`
                  : 'Déplacer'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
