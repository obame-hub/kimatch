/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉPLACER UN COMPTEUR : CHOISIR LA DESTINATION, PUIS VOIR CE QUI SUIT ET CE QUI RESTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 07/09/2026 : « donne la possibilité dans le compteur de changer le compte de ce compteur
 * et bien sûr aussi des objets qui sont dépendants de ce compteur ».
 *
 * ══ LA FENÊTRE DIT CE QU'ELLE VA FAIRE, ET SURTOUT CE QU'ELLE NE FERA PAS ══
 *
 * C'est la leçon de la fenêtre de suppression, réécrite ce matin parce qu'elle mentait : cinq
 * dialogues annonçaient « cette action est irréversible » sans jamais dire ce qu'elle emportait.
 * Ici, trois blocs, et le troisième est le plus important — mandats, contrats, recommandations et
 * opportunités RESTENT sur l'ancien compte, et sont nommés pour que la personne sache ce qu'il lui
 * reste à traiter.
 *
 * ══ POURQUOI DEUX CHOIX ET NON UN ══
 *
 * On choisit un COMPTE, puis un SITE de ce compte. Le compte est ce que la personne a en tête ;
 * le site est ce que le schéma exige. 2 086 comptes sur 2 774 n'ont qu'un seul site : dans trois
 * cas sur quatre le second choix se fait tout seul, et on ne le montre même pas.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Building2, MapPin, MoveRight, UserX } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { useComptes } from '@/lib/data/comptes'
import { useSitesParCompte } from '@/lib/data/sites'
import {
  useDeplacerCompteur,
  useInventaireDeplacement,
  type ResultatDeplacement,
} from '@/lib/data/deplacementCompteur'
import { pluriel } from '@/lib/data/inventaireSuppression'
import type { Compte, Site } from '@/types/domain'

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
  const [siteCible, setSiteCible] = useState('')
  const [detacherContacts, setDetacherContacts] = useState(false)
  const [motif, setMotif] = useState('')
  const [resultat, setResultat] = useState<ResultatDeplacement | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const { data: comptes } = useComptes()
  const { data: sitesDuCompteCible } = useSitesParCompte(compteCible || undefined)
  const deplacer = useDeplacerCompteur()

  // À la réouverture, tout repart de zéro : garder le choix précédent ferait déplacer un autre
  // compteur vers une destination qu'on n'a pas relue.
  useEffect(() => {
    if (!ouvert) return
    setCompteCible('')
    setSiteCible('')
    setDetacherContacts(false)
    setMotif('')
    setResultat(null)
    setErreur(null)
  }, [ouvert])

  /* LE SITE ACTUEL N'EST PAS UNE DESTINATION. Le proposer laisserait cliquer « Déplacer » sur place,
     et la fonction en base refuserait avec une erreur — autant ne pas l'offrir. */
  const sitesPossibles = useMemo(
    () => (sitesDuCompteCible ?? []).filter((s) => s.id !== siteActuelId),
    [sitesDuCompteCible, siteActuelId],
  )

  // Un seul site possible : on le retient sans rien demander. C'est le cas de trois comptes sur
  // quatre, et un choix à une seule option n'est pas un choix.
  useEffect(() => {
    if (sitesPossibles.length === 1) setSiteCible(sitesPossibles[0].id)
    else if (!sitesPossibles.some((s) => s.id === siteCible)) setSiteCible('')
  }, [sitesPossibles, siteCible])

  const siteChoisi = sitesPossibles.find((s) => s.id === siteCible)
  const changeDeCompte = Boolean(compteCible) && compteCible !== compteActuelId

  const { data: inventaire, isLoading, error } = useInventaireDeplacement(
    compteurId,
    compteActuelId,
    compteCible || undefined,
    siteActuelId,
    ouvert && Boolean(siteCible),
  )

  const contactsEtrangers = (inventaire?.contacts ?? []).filter((c) => !c.rattacheALaDestination)
  const pret = Boolean(siteCible) && Boolean(inventaire) && !isLoading && !error && !deplacer.isPending && !resultat

  const lancer = () => {
    setErreur(null)
    deplacer
      .mutateAsync({
        compteurId,
        siteDestinationId: siteCible,
        detacherContacts,
        motif: motif.trim() || null,
      })
      .then(setResultat)
      .catch((e) => setErreur(e instanceof Error ? e.message : 'Le déplacement a échoué.'))
  }

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title={`Déplacer le compteur ${numeroPdl}`}
      description="Le rattacher à un autre site — donc, s’il appartient à une autre société, à un autre compte."
      className="max-w-[620px]"
    >
      {/* ══ CE QUI S'EST PASSÉ, quand c'est fait ══ */}
      {resultat ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-km border border-km-green-line bg-km-green-soft px-3 py-2.5">
            <p className="text-km-body font-bold text-km-green">Compteur déplacé</p>
            <p className="mt-1 text-km-label leading-snug text-km-text">
              {resultat.site_origine} <ArrowRight className="inline h-3 w-3" /> {resultat.site_destination}
            </p>
            {/* LES NOMBRES VIENNENT DE LA BASE, pas de l'aperçu : c'est ce qui a réellement été
                écrit. Un écart avec ce qu'annonçait la fenêtre se voit ici. */}
            <ul className="mt-1.5 flex flex-col gap-0.5 text-km-label text-km-muted">
              {resultat.suivis.signaux > 0 && <li>{pluriel(resultat.suivis.signaux, 'signal')} déplacé(s) avec lui</li>}
              {resultat.suivis.requetes > 0 && <li>{pluriel(resultat.suivis.requetes, 'requête')} déplacée(s) avec lui</li>}
              {resultat.suivis.contacts_detaches > 0 && <li>contacts d’une autre société détachés</li>}
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

          {/* ══ OÙ IL VA ══ */}
          <div>
            <p className="mb-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
              Nouveau compte
            </p>
            <ChoixParRecherche<Compte>
              items={comptes ?? []}
              valeur={compteCible}
              onChoisir={(c) => { setCompteCible(c?.id ?? ''); setSiteCible('') }}
              placeholder="Chercher une société…"
              principal={(c) => c.nom}
              secondaire={(c) => [c.ville, c.siret ? `SIRET ${c.siret}` : null].filter(Boolean).join(' · ') || null}
              filtre={(c, q) => c.nom.toLowerCase().includes(q) || (c.siret ?? '').includes(q) || (c.siren ?? '').includes(q)}
              totalLibelle={`${(comptes ?? []).length} comptes`}
            />
            {/* LE MÊME COMPTE EST UN CAS LÉGITIME, pas une erreur : c'est la correction d'un PDL rangé
                sous le mauvais site d'une société — le cas de GI155378 en août. On le dit, pour que
                personne ne croie s'être trompé de champ. */}
            {compteCible && !changeDeCompte && (
              <p className="mt-1.5 text-km-label text-km-muted">
                C’est le compte actuel : le compteur changera de site sans changer de société. Rien ne
                sera laissé derrière.
              </p>
            )}
          </div>

          {compteCible && (
            <div>
              <p className="mb-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
                Site de destination
              </p>
              {sitesPossibles.length === 0 ? (
                <p className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2.5 text-km-label leading-snug text-km-text">
                  Ce compte n’a aucun autre site où ranger le compteur. Créez d’abord le site depuis
                  la fiche du compte, puis revenez ici.
                </p>
              ) : sitesPossibles.length === 1 ? (
                <p className="flex items-center gap-1.5 rounded-km border border-km-line bg-white px-3 py-2 text-km-body text-km-text">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-km-faint" />
                  <span className="truncate font-medium">{sitesPossibles[0].nom}</span>
                  <span className="shrink-0 text-km-label text-km-faint">seul site du compte</span>
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
                  totalLibelle={`${sitesPossibles.length} sites sur ce compte`}
                />
              )}
            </div>
          )}

          {/* ══ L'APERÇU ══ */}
          {isLoading && (
            <p className="flex items-center gap-2 rounded-km border border-km-line bg-km-soft px-3 py-2.5 text-km-body text-km-muted">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-km-faint border-t-transparent" />
              Recherche de ce qui dépend de ce compteur…
            </p>
          )}

          {error && (
            <div className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
              <p className="text-km-body font-bold text-km-red">Impossible de savoir ce qui dépend de ce compteur</p>
              <p className="mt-1 text-km-label leading-snug text-km-text">
                {error instanceof Error ? error.message : 'Erreur inconnue'}
              </p>
              <p className="mt-1.5 text-km-label leading-snug text-km-muted">
                Le déplacement est bloqué tant qu’on ne peut pas dire ce qu’il entraîne.
              </p>
            </div>
          )}

          {inventaire && !error && (
            <>
              <div className="rounded-km border border-km-green-line bg-km-green-soft/40 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-green">
                  <MoveRight className="h-3.5 w-3.5" /> Suivra le compteur
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  <LigneFamille libelle="signal" nombre={inventaire.signaux} />
                  <LigneFamille libelle="requête" nombre={inventaire.requetes} />
                  <LigneFamille libelle="relevé de consommation" nombre={inventaire.consommations} />
                  {inventaire.signaux + inventaire.requetes + inventaire.consommations === 0 && (
                    <li className="text-km-label text-km-muted">
                      Le compteur part seul : rien d’autre n’est accroché à lui.
                    </li>
                  )}
                </ul>
              </div>

              {/* ══ LE BLOC QUI COMPTE : CE QUI RESTE ══ */}
              {inventaire.aDesRestes && (
                <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-amber">
                    <AlertTriangle className="h-3.5 w-3.5" /> Restera sur {compteActuelNom}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    <LigneFamille libelle="mandat" nombre={inventaire.mandats} />
                    <LigneFamille
                      libelle="contrat"
                      nombre={inventaire.contrats.length}
                      exemples={inventaire.contrats.map((c) => c.libelle)}
                    />
                    <LigneFamille
                      libelle="recommandation"
                      nombre={inventaire.recommandations.length}
                      exemples={inventaire.recommandations.map((r) => r.libelle)}
                    />
                    <LigneFamille
                      libelle="opportunité"
                      nombre={inventaire.opportunites.length}
                      exemples={inventaire.opportunites.map((o) => o.libelle)}
                    />
                  </ul>
                  <p className="mt-2 text-km-label leading-snug text-km-text">
                    Un mandat est signé et couvre souvent plusieurs compteurs : le faire suivre
                    réécrirait un document signé et arracherait les autres compteurs à leur propre
                    compte. Ces objets ne bougent donc pas — à reprendre un par un si nécessaire.
                  </p>
                </div>
              )}

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
                        <span className="text-km-muted"> — {c.role.toLowerCase()}, non rattaché au compte de destination</span>
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

              {/* LE MOTIF EST FACULTATIF ET VA DANS L'HISTORIQUE. « Pourquoi ce PDL a-t-il changé de
                  société ? » est la question qu'on se posera dans six mois, et une case vide ne
                  répond pas. */}
              <div>
                <p className="mb-1.5 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
                  Motif <span className="font-normal normal-case tracking-normal text-km-faint">(facultatif, conservé dans l’historique)</span>
                </p>
                <Input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Ex. PDL rangé sous la mauvaise société à la reprise Salesforce"
                />
              </div>
            </>
          )}

          {erreur && (
            <p className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5 text-km-body leading-snug text-km-red">
              {erreur}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-km-line pt-3">
            <Button variant="ghost" onClick={onFermer} disabled={deplacer.isPending}>
              Annuler
            </Button>
            {/* LE BOUTON PORTE LA DESTINATION, pas un « Confirmer » anonyme : c'est la dernière
                occasion de voir qu'on s'est trompé de société. */}
            <Button onClick={lancer} disabled={!pret}>
              {deplacer.isPending
                ? 'Déplacement…'
                : siteChoisi || sitesPossibles.length === 1
                  ? `Déplacer vers ${(siteChoisi ?? sitesPossibles[0]).nom}`
                  : 'Déplacer'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
