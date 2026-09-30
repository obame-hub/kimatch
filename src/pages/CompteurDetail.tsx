import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Flame, Trash2, Zap } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DialogSuppression } from '@/components/ui/dialog-suppression'
import { InlineField } from '@/components/ui/inline-field'
import { MenuCreer } from '@/components/layout/MenuCreer'
import { OpportunitesDuCompteur } from '@/components/compteur/OpportunitesDuCompteur'
import { CreateRecommandationDialog } from '@/pages/Recommandations'
import { BlocCaracteristiques, BlocConsommation, BlocLieu, BlocPostes } from '@/components/compteur/fiche/ColonnePrincipale'
import { BlocCompte, BlocContacts, BlocContratEnCours, BlocQualiteCompte } from '@/components/compteur/fiche/ColonneLaterale'
import {
  OngletContrats, OngletFichiers, OngletMandats, OngletRecommandations, useRecommandationsDuCompteur,
} from '@/components/compteur/fiche/Onglets'
import {
  PDL_FORMAT_RE, useCompteur, useDeleteCompteur, useMajTechniqueCompteur, useSyncCompteurElec, useSyncCompteurGaz, useUpdateCompteurField,
} from '@/lib/data/compteurs'
import { nettoyerSaisie, cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useEnedisFetch } from '@/lib/data/enedis'
import { useGrdFetch } from '@/lib/data/grd'
import { useConsommationsDuCompteur } from '@/lib/data/consommations'
import { useSite } from '@/lib/data/sites'
import { useCompte } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useContrats, useUpdateContratPartiel } from '@/lib/data/contrats'
import { natureEcheance } from '@/lib/echeance'
import { statutVieContrat } from '@/lib/statutVieContrat'
import { useMandats } from '@/lib/data/mandats'
import { useDocuments, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { useCanManageEnregistrement } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { useGoBack } from '@/lib/useGoBack'
import { useNoterConsultation } from '@/lib/data/consultationsRecentes'
import { useDeclarerCompteCourant } from '@/lib/creationContact'
import { useCreerUnMandat } from '@/lib/creationMandat'
import { mandatKiweeCouvre } from '@/lib/couvertureMandat'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA FICHE COMPTEUR — v4
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 30/09/2026 : « Voici tout le prompt qui vient de Claude Design pour redesigner la page
 * compteur dans Kimatch. Je veux que ce soit pixel perfect. » Le paquet (`handoff-fiche-compteur`)
 * décrit le volet central ; le bandeau reste celui de la production, hormis l'icône d'énergie qui
 * inversait les couleurs (l'électricité était bleu ciel).
 *
 * ══ CE QUI CHANGE D'ORGANISATION ══
 *
 *   Onglets     Compteur · Contrats · Recommandations (nouveau) · Mandats · Fichiers. L'onglet
 *               « Rattachements » disparaît : compte, contacts et lieu sont sur l'onglet Compteur,
 *               les opportunités passent dans Recommandations.
 *   Compteur    deux colonnes — le lieu, la plaque technique, les postes, la consommation à gauche ;
 *               la qualité du compte, le compte, les contacts et le contrat en cours à droite, qui
 *               reste visible pendant le défilement.
 *   Retirés     la carte « Couverture », le barème de qualité du compteur (seule la qualité du
 *               COMPTE reste), la saisie manuelle d'une consommation et le bloc « Détail du compteur »
 *               — décisions de William du 30/09/2026.
 *
 * Les composants vivent dans `src/components/compteur/fiche/`. Cette page ne fait que charger les
 * données, porter les écritures et poser les blocs.
 */

type CleOnglet = 'apercu' | 'contrats' | 'recos' | 'mandats' | 'fichiers'

export default function CompteurDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: compteur } = useCompteur(id)

  useNoterConsultation({
    type: 'compteur',
    id: compteur?.id,
    libelle: compteur ? compteur.numero_pdl : null,
    sousLibelle: compteur ? [compteur.site_nom, compteur.ville].filter(Boolean).join(' · ') : null,
    chemin: `/compteurs/${id}`,
  })

  const { data: consommations } = useConsommationsDuCompteur(id)
  const { data: siteDuCompteur } = useSite(compteur?.site_id)
  /* LE COMPTE SE LIT SUR LE COMPTEUR (`compteurs.compte_id`), jamais à travers le site : c'est lui
     qui fait foi partout ailleurs. Le repli sur le site ne sert que le temps du chargement. */
  const { data: compte } = useCompte(compteur?.compte_id ?? siteDuCompteur?.compte_id)
  useDeclarerCompteCourant(compte?.id, compte?.nom)
  const { data: contrats } = useContrats()
  const { data: mandats } = useMandats()
  const { data: documents } = useDocuments()
  const { data: typesDocsRef } = useReferenceTable('types_documents')
  const typesDocs = typesDocsRef && typesDocsRef.length > 0 ? typesDocsRef : FALLBACK_TYPES_DOCUMENTS
  const canManage = useCanManageEnregistrement(compteur?.proprietaire_id)
  const creerUnMandat = useCreerUnMandat()

  const contratsDuCompteur = useMemo(() => contrats?.filter((ct) => ct.compteurs.some((cc) => cc.id === id)) ?? [], [contrats, id])
  /* LES MANDATS PAR COMPTEUR, le caduc compris (règle du 15/09/2026) : un document signé reste
     visible sur le compteur qu'il a couvert, avec sa caducité écrite dessus. */
  const mandatsDuCompteur = useMemo(
    () =>
      (mandats ?? [])
        .filter((m) => compteur && (m.compteur_ids.includes(compteur.id) || m.compteur_ids_caducs.includes(compteur.id)))
        .map((m) => ({ mandat: m, caduc: Boolean(compteur && m.compteur_ids_caducs.includes(compteur.id)) })),
    [mandats, compteur],
  )
  const documentsDuCompteur = useMemo(() => documents?.filter((d) => d.entite_type === 'compteur' && d.entite_id === id) ?? [], [documents, id])
  const echeance = useMemo(() => natureEcheance(compteur?.date_echeance, contratsDuCompteur), [compteur?.date_echeance, contratsDuCompteur])
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const contratEnCours = useMemo(
    () => contratsDuCompteur.find((c) => statutVieContrat(c.date_debut, c.date_fin, aujourdhui, c.date_resiliation) === 'EN_COURS') ?? null,
    [contratsDuCompteur, aujourdhui],
  )

  const { data: tousContacts } = useContacts()
  const contactsDuCompte = useMemo(
    () => (compte ? (tousContacts ?? []).filter((c) => c.comptes.some((l) => l.id === compte.id)) : []),
    [tousContacts, compte],
  )

  const [onglet, setOnglet] = useState<CleOnglet>('apercu')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lancerReco, setLancerReco] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 2200)
  }

  const majChampCompteur = useUpdateCompteurField()
  const majTechnique = useMajTechniqueCompteur()
  const majContrat = useUpdateContratPartiel()
  const televerser = useTeleverserDocuments()

  async function majCompteur(patch: Record<string, unknown>) {
    if (!compteur) return
    await majChampCompteur.mutateAsync({ id: compteur.id, patch })
  }
  async function majTech(patch: Record<string, unknown>) {
    if (!compteur) return
    await majTechnique.mutateAsync({ compteurId: compteur.id, energie: compteur.type_energie, patch })
  }

  /**
   * Changer le numéro du point de livraison. LE DOUBLON SE CHERCHE EN BASE ; le vide bloque ; le
   * format inhabituel alerte sans bloquer (règle de `PDL_FORMAT_RE`). Tous les espaces partent.
   */
  async function commitNumeroPdl(saisi: string) {
    if (!compteur) return
    const numero = nettoyerSaisie(saisi).replace(/\s+/g, '')
    if (!numero) throw new Error('Un compteur ne peut pas être sans numéro.')
    if (numero === compteur.numero_pdl) return
    const { data: deja, error } = await supabase
      .from('compteurs')
      .select('id, reference')
      .eq('numero_point', numero)
      .neq('id', compteur.id)
      .limit(1)
    if (error) throw new Error(error.message)
    if (deja && deja.length > 0) throw new Error(`Ce numéro est déjà porté par le compteur ${deja[0].reference ?? deja[0].id}.`)
    await majCompteur({ numero_point: numero })
    if (!PDL_FORMAT_RE.test(numero)) showToast('✓ enregistré — format inhabituel (ni 14 chiffres ni GI + 6)')
  }

  const deleteCompteur = useDeleteCompteur()
  const goBack = useGoBack(compteur ? `/sites/${compteur.site_id}` : '/compteurs')
  const enedisFetch = useEnedisFetch()
  const syncCompteurElec = useSyncCompteurElec()
  const grdFetch = useGrdFetch()
  const syncCompteurGaz = useSyncCompteurGaz()
  const suppression = useSuppression()
  const synchroEnCours = enedisFetch.isPending || syncCompteurElec.isPending || grdFetch.isPending || syncCompteurGaz.isPending
  /* ══ AUCUN APPEL AU GESTIONNAIRE DE RÉSEAU SANS MANDAT KIWEE ACTIF (30/09/2026) ══
     Tant que les mandats ne sont pas chargés, la réponse est « non » : on grise d'abord. */
  const synchroAutorisee = Boolean(compteur && mandats && mandatKiweeCouvre(mandats, compteur.id))

  function handleDelete() {
    if (!compteur) return
    suppression.supprimer(
      () => deleteCompteur.mutateAsync(compteur.id),
      () => navigate(`/sites/${compteur.site_id}`),
    )
  }

  async function synchroniser() {
    if (!compteur || synchroEnCours) return
    const estElec = compteur.type_energie === 'electricite'
    if (!synchroAutorisee) {
      showToast('Aucun mandat KiWee actif ne couvre ce compteur : synchronisation impossible.')
      return
    }
    try {
      if (estElec) {
        const result = await enedisFetch.mutateAsync(compteur.numero_pdl)
        if (!result.success) { showToast(result.error ?? 'Échec de la synchronisation Enedis.'); return }
        await syncCompteurElec.mutateAsync({ compteurId: compteur.id, result })
        showToast('✓ Synchronisation Enedis réussie')
      } else {
        const codePostal = compteur.code_postal ?? siteDuCompteur?.code_postal
        if (!codePostal) { showToast('Impossible de synchroniser : aucun code postal sur ce compteur.'); return }
        const result = await grdFetch.mutateAsync({ pce: compteur.numero_pdl, codePostal })
        if (!result.success) { showToast(result.error ?? 'Échec de la synchronisation GRDF.'); return }
        await syncCompteurGaz.mutateAsync({ compteurId: compteur.id, result })
        showToast('✓ Synchronisation GRDF réussie')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Échec de la synchronisation ${estElec ? 'Enedis' : 'GRDF'}.`)
    }
  }

  if (!compteur && id) {
    return (
      <div>
        <TitreOnglet crumb="Compteurs" title="Compteur" />
        <div className="p-4 sm:p-6"><p className="text-sm text-km-faint">Chargement…</p></div>
      </div>
    )
  }
  if (!compteur) {
    return (
      <div>
        <TitreOnglet crumb="Compteurs" title="Compteur" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}><ArrowLeft className="h-4 w-4" />Retour au site</Button>
          <p className="text-sm text-km-muted">Compteur introuvable.</p>
        </div>
      </div>
    )
  }

  const estElec = compteur.type_energie === 'electricite'
  const Icone = estElec ? Zap : Flame

  return (
    <div>
      <TitreOnglet crumb="Compteurs" title={`Compteur ${compteur.numero_pdl}`} />

      {/* ══ LE BANDEAU — celui de la production ══
          Seul changement v4 : l'icône d'énergie, dorée pour l'électricité et bleutée pour le gaz. */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-km-line bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour au site"><ArrowLeft className="h-4 w-4" /></Button>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]', estElec ? 'bg-km-elec-soft text-km-elec' : 'bg-km-gaz-soft text-km-gaz')}>
          <Icone className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-km-text">{compteur.utilisation || compteur.libelle_site || compteur.numero_pdl}</p>
            <Badge tone={compteur.statut === 'actif' ? 'kiwi' : 'neutral'}>{compteur.statut}</Badge>
          </div>
          <div className="max-w-[22rem]">
            <InlineField
              variant="text"
              value={compteur.numero_pdl}
              mono
              emptyLabel="numéro du point de livraison"
              disabled={!canManage}
              onCommit={commitNumeroPdl}
              onSaved={() => showToast('✓ numéro enregistré')}
              onError={(e) => showToast(`Erreur : ${e.message}`)}
            />
          </div>
          <p className="truncate text-km-xs text-km-faint">
            {compteur.date_creation && <>Créé le {new Date(compteur.date_creation).toLocaleDateString('fr-FR')} · </>}
            Propriétaire : {compteur.proprietaire_nom || 'Aucun'}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            <MenuCreer />
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" />Supprimer</Button>
          </div>
        )}
      </div>

      <BarreOnglets
        courant={onglet}
        onChoisir={setOnglet}
        nbContrats={contratsDuCompteur.length}
        nbFichiers={documentsDuCompteur.length}
        compteur={compteur}
      />

      {/* LA HAUTEUR DE LIGNE DE LA MAQUETTE : celle du navigateur (« normal »), pas le 1,5 que Kimatch
          impose partout. C'est elle qui donne aux cartes leur hauteur exacte — mesurée bloc par bloc
          contre la référence, de 3 à 19 px d'écart sans ce réglage. */}
      <div className="bg-km-bg px-6 pb-[90px] pt-5 leading-[normal]">
        {onglet === 'apercu' && (
          <div className="grid animate-[kmFade_.18s_ease-out] grid-cols-[minmax(0,1fr)_320px] items-start gap-4">
            <div className="flex min-w-0 flex-col gap-[14px]">
              <BlocLieu compteur={compteur} modifiable={canManage} enregistrer={majCompteur} onToast={showToast} />
              <BlocCaracteristiques
                compteur={compteur}
                echeance={echeance}
                modifiable={canManage}
                enregistrerCompteur={majCompteur}
                enregistrerTechnique={majTech}
                commitNumero={commitNumeroPdl}
                onToast={showToast}
                synchroniser={() => void synchroniser()}
                synchroEnCours={synchroEnCours}
                synchroAutorisee={synchroAutorisee}
              />
              {estElec && <BlocPostes compteur={compteur} />}
              <BlocConsommation compteur={compteur} consommations={consommations ?? []} />
            </div>
            <div className="sticky top-0 flex flex-col gap-[14px]">
              <BlocQualiteCompte compteId={compteur.compte_id ?? compte?.id} />
              <BlocCompte compteur={compteur} compte={compte ?? undefined} modifiable={canManage} />
              <BlocContacts
                compteur={compteur}
                compte={compte ?? undefined}
                contactsDuCompte={contactsDuCompte}
                modifiable={canManage}
                enregistrer={majCompteur}
                onToast={showToast}
              />
              <BlocContratEnCours
                contrat={contratEnCours}
                echeance={echeance}
                compteur={compteur}
                modifiable={canManage}
                onNature={async (nature) => {
                  if (!contratEnCours) return
                  try {
                    await majContrat.mutateAsync({ id: contratEnCours.id, patch: { nature_contrat: nature } })
                    showToast('✓ enregistré')
                  } catch (e) {
                    showToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                  }
                }}
                onVoirContrats={() => setOnglet('contrats')}
              />
            </div>
          </div>
        )}

        {onglet === 'contrats' && <OngletContratsDuCompteur compteur={compteur} contrats={contratsDuCompteur} />}

        {onglet === 'recos' && (
          <OngletRecosDuCompteur
            compteur={compteur}
            contratEnCours={contratEnCours}
            echeance={echeance.date}
            onLancer={() => setLancerReco(true)}
          />
        )}

        {onglet === 'mandats' && (
          <OngletMandats
            compteur={compteur}
            mandats={mandatsDuCompteur}
            onSynchroniser={() => void synchroniser()}
            synchroEnCours={synchroEnCours}
            synchroAutorisee={synchroAutorisee}
            onPreparer={() => creerUnMandat({ compte: compte ? { id: compte.id, nom: compte.nom } : undefined, compteurIds: [compteur.id] })}
            modifiable={canManage}
          />
        )}

        {onglet === 'fichiers' && (
          <OngletFichiers
            documents={documentsDuCompteur}
            types={typesDocs}
            onDeposer={async (fichiers, typeDocumentId) => {
              await televerser.mutateAsync({
                fichiers,
                entite_type: 'compteur',
                entite_id: compteur.id,
                type_document_id: typeDocumentId,
                type_document_libelle: typesDocs.find((x) => x.id === typeDocumentId)?.libelle ?? '',
              })
            }}
          />
        )}
      </div>

      {lancerReco && (
        <CreateRecommandationDialog
          open
          onClose={() => setLancerReco(false)}
          initialCompteId={compteur.compte_id ?? compte?.id}
          initialCompteurIds={[compteur.id]}
          onCreated={(recoId) => { setLancerReco(false); navigate(`/recommandations/${recoId}`) }}
        />
      )}
      <DialogSuppression
        ouvert={confirmDelete}
        onFermer={() => { suppression.reinitialiser(); setConfirmDelete(false) }}
        type="compteur"
        id={compteur.id}
        nom={compteur.numero_pdl}
        onConfirmer={handleDelete}
        enCours={suppression.enCours}
        erreur={suppression.erreur}
      />
      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 animate-[kmToast_.2s_ease-out] whitespace-nowrap rounded-[10px] bg-ink-800 px-[14px] py-2 text-[13px] text-white shadow-[0_6px_20px_rgba(0,0,0,.25)]">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ══ LA BARRE D'ONGLETS ══ — 13 px, soulignement de 2 px, badges de 9 px. Le badge des
   Recommandations dit « n en cours » dès qu'une reco ouverte couvre le compteur. */
function BarreOnglets({ courant, onChoisir, nbContrats, nbFichiers, compteur }: {
  courant: CleOnglet
  onChoisir: (o: CleOnglet) => void
  nbContrats: number
  nbFichiers: number
  compteur: NonNullable<ReturnType<typeof useCompteur>['data']>
}) {
  const { ouvertes, passees } = useRecommandationsDuCompteur(compteur)
  const badgeRecos = ouvertes.length > 0 ? `${ouvertes.length} en cours` : passees.length > 0 ? String(passees.length) : null
  const onglets: { cle: CleOnglet; libelle: string; badge: string | null; bleu?: boolean }[] = [
    { cle: 'apercu', libelle: 'Compteur', badge: null },
    { cle: 'contrats', libelle: 'Contrats', badge: nbContrats ? String(nbContrats) : null },
    { cle: 'recos', libelle: 'Recommandations', badge: badgeRecos, bleu: ouvertes.length > 0 },
    { cle: 'mandats', libelle: 'Mandats', badge: null },
    { cle: 'fichiers', libelle: 'Fichiers', badge: nbFichiers ? String(nbFichiers) : null },
  ]
  return (
    <div className="flex overflow-x-auto border-b border-km-line bg-white leading-[normal]">
      <div className="flex items-stretch gap-0.5 px-[18px]">
        {onglets.map((o) => {
          const actif = o.cle === courant
          return (
            <button
              key={o.cle}
              type="button"
              onClick={() => onChoisir(o.cle)}
              className={cn(
                '-mb-px flex select-none items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px]',
                actif ? 'border-ink-800 font-semibold text-km-text' : 'border-transparent font-normal text-km-muted hover:text-km-text',
              )}
            >
              {o.libelle}
              {o.badge && (
                <span
                  className="rounded-[5px] px-1.5 py-px text-[9px] font-bold"
                  style={o.bleu ? { color: '#3F6E9C', background: '#EAF1F8' } : { color: '#69716C', background: '#F3F5F2' }}
                >
                  {o.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OngletContratsDuCompteur({ compteur, contrats }: { compteur: NonNullable<ReturnType<typeof useCompteur>['data']>; contrats: Parameters<typeof OngletContrats>[0]['contrats'] }) {
  const { ouvertes } = useRecommandationsDuCompteur(compteur)
  return <OngletContrats compteur={compteur} contrats={contrats} recoOuverte={ouvertes[0] ?? null} />
}

function OngletRecosDuCompteur({ compteur, contratEnCours, echeance, onLancer }: {
  compteur: NonNullable<ReturnType<typeof useCompteur>['data']>
  contratEnCours: Parameters<typeof OngletRecommandations>[0]['contratEnCours']
  echeance: string | null
  onLancer: () => void
}) {
  const { ouvertes, passees } = useRecommandationsDuCompteur(compteur)
  return (
    <OngletRecommandations
      ouvertes={ouvertes}
      passees={passees}
      contratEnCours={contratEnCours}
      echeance={echeance}
      contratProspect={contratEnCours?.nature_contrat === 'PROSPECT'}
      onLancer={onLancer}
      opportunites={<OpportunitesDuCompteur compteurId={compteur.id} />}
    />
  )
}
