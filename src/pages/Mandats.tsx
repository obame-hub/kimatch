import { useEffect, useState } from 'react'
import { useListeServeur } from '@/lib/useListeServeur'
import { PiedDeListe } from '@/components/ui/pied-de-liste'
import { useCreerUnMandat } from '@/lib/creationMandat'
import { useSearchParams } from 'react-router-dom'
import { Plus, FileCheck2 } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Select } from '@/components/ui/form'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE } from '@/lib/referenceFallbacks'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { usePerimetre, BasculePerimetre } from '@/lib/perimetre'
import { useMonProfil } from '@/lib/data/roles'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

/** Une carte de la liste, telle que `v_mandats_liste` la renvoie. */
interface LigneMandat {
  id: string
  compte_id: string
  compte_nom: string | null
  /** `MDT-2026-0042`. La liste la cherchait déjà (`colonnesRecherche`) sans jamais l'afficher —
   *  et pour cause : les 1 483 mandats n'en avaient aucune avant le 14/09/2026. */
  reference: string | null
  id_salesforce: string | null
  statut: string
  date_signature: string | null
  nb_sites_couverts: number
}

/**
 * ENCAPSULABLE DANS LA PAGE PATRIMOINE. `sansEntete` masque la barre du haut quand cette liste est
 * affichée comme onglet de /patrimoine (diapositive 8 de Michel : « la page Patrimoine rassemble ces
 * objets et permet de naviguer du compte jusqu'au compteur et au contrat »). L'en-tête de page, lui,
 * reste : il porte le bouton de création et la phrase qui dit ce qu'est l'objet.
 */
export default function Mandats({ sansEntete }: { sansEntete?: boolean }) {
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const [searchParams, setSearchParams] = useSearchParams()
  const compteFromUrl = searchParams.get('compte')
  const pdlsFromUrl = searchParams.get('pdls')
  const contactFromUrl = searchParams.get('contact')
  /* LA CRÉATION EST UN PARCOURS depuis le 29/09/2026 (`useCreerUnMandat`), ouvert par-dessus la
     liste. `?creer=1` (menu « Créer ») et `?compte=…&pdls=…&contact=…` (la proposition qui suit la
     création de compteurs) y mènent aussi. Le périmètre et le signataire passés dans l'adresse
     sont désormais REPRIS — l'ancien dialogue les recevait et les ignorait. */
  const creerUnMandat = useCreerUnMandat()
  useOuvrirCreation(() => creerUnMandat())
  const [statutFilter, setStatutFilter] = useState('')

  useEffect(() => {
    if (compteFromUrl) {
      creerUnMandat({
        compte: { id: compteFromUrl, nom: '' },
        contactId: contactFromUrl,
        compteurIds: pdlsFromUrl ? pdlsFromUrl.split(',').filter(Boolean) : undefined,
      })
      setSearchParams((prev) => { prev.delete('compte'); prev.delete('pdls'); prev.delete('contact'); return prev }, { replace: true })
    }
    /* Sur l'adresse et non au seul montage : la proposition de mandat peut y mener alors qu'on est
       déjà sur cette liste, sans la remonter. Les paramètres effacés, l'effet ne rejoue pas. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteFromUrl])

  /**

   * « LES MIENS » PAR DEFAUT, « TOUS » D'UN CLIC. Ce n'est pas une restriction : la base

   * laisse tout passer, et c'est la decision du 14/08 qu'on ne defait pas. Seul l'affichage

   * par defaut change, parce qu'on travaille d'abord son propre portefeuille — et il se

   * defait d'un clic quand on reprend celui d'un collegue absent.

   *

   * Le filtre part en base : le total du pied de liste suit, sans quoi il annoncerait un

   * nombre que la liste ne montre pas.

   */

  const { data: monProfil } = useMonProfil()

  const { perimetre, setPerimetre, sansBascule } = usePerimetre('mandats')

  const filtreProprietaire = perimetre === 'moi' && monProfil?.id ? monProfil.id : null


  const liste = useListeServeur<LigneMandat>({
    vue: 'v_mandats_liste',
    colonnesRecherche: ['compte_nom', 'id_salesforce', 'reference'],
    triParDefaut: 'compte_nom',
    filtres: { proprietaire_id: filtreProprietaire, statut: statutFilter || null },
    enabled: perimetre !== 'moi' || !!monProfil,
  })

  return (
    <div>
      {!sansEntete && <TitreOnglet title="Mandats" />}
      <div className="p-4 sm:p-6">
        <PageHeader
          titreMasque={sansEntete}
          title="Mandats"
          description="Le mandat autorise KiWee à intervenir sur un périmètre de sites — il ne se confond pas avec le périmètre étudié par une recommandation."
          actions={sansEntete ? undefined : <Button onClick={() => creerUnMandat()}><Plus className="h-4 w-4" />Nouveau mandat</Button>}
        />

        <ListToolbar query={liste.query} onQueryChange={liste.setQuery} placeholder="Rechercher un compte ou une référence…" count={liste.total}>
          {!sansBascule && <BasculePerimetre valeur={perimetre} onChange={setPerimetre} libelleMien="Mes mandats" libelleTous="Tous les mandats" />}
          <Select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} className="w-auto">
            <option value="">Tous les statuts</option>
            {statuts.map((s) => <option key={s.id} value={s.code}>{s.libelle}</option>)}
          </Select>
          <Select value={liste.tri} onChange={(e) => liste.trierPar(e.target.value)} className="w-auto">
            <option value="compte_nom">Trier par compte</option>
            <option value="date_signature">Trier par date de signature</option>
            <option value="nb_sites_couverts">Trier par nb. de sites</option>
          </Select>
        </ListToolbar>

        {liste.erreur && <p className="mb-4 text-sm text-km-red">{liste.erreur}</p>}
        {!liste.isLoading && !liste.erreur && liste.lignes.length === 0 && (
          <p className="mb-4 text-sm text-km-faint">
            {liste.query.trim() || statutFilter
              ? 'Aucun mandat ne correspond à la recherche.'
              : "Aucun mandat pour l'instant — le mandat signé par le client autorise KiWee à négocier sur un périmètre de sites précis. Utilise « Nouveau mandat » pour en créer un."}
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {liste.isLoading && <p className="text-sm text-km-faint">Chargement…</p>}
          {liste.lignes.map((m) => {
            const label = statuts.find((s) => s.code === m.statut)?.libelle ?? m.statut
            return (
              <Card
                key={m.id}
                to={`/mandats/${m.id}`}
                className="animate-fade-up cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-km-amber-soft text-amber-600">
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div>
                      {/* La référence d'abord : c'est celle qu'on se dit au téléphone. Le nom
                          Salesforce ne reste que pour les mandats qui n'en ont pas encore. */}
                      {(m.reference || m.id_salesforce) && (
                        <p className="font-mono text-km-label text-km-faint">{m.reference ?? m.id_salesforce}</p>
                      )}
                      <p className="font-display font-medium text-km-text">
                        <EntityLink to={`/comptes/${m.compte_id}`}>{m.compte_nom}</EntityLink>
                      </p>
                    </div>
                  </div>
                  <Badge tone={STATUT_MANDAT_TONE[m.statut] ?? 'neutral'}>{label}</Badge>
                </div>
                <div className="mt-4 space-y-1 text-xs text-km-muted">
                  <p>Sites couverts : <span className="font-medium text-km-text">{m.nb_sites_couverts}</span></p>
                  <p>Signé le : {m.date_signature ? new Date(m.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                </div>
              </Card>
            )
          })}
          <PiedDeListe
            affiches={liste.lignes.length}
            total={liste.total}
            reste={liste.reste}
            onAfficherPlus={liste.afficherPlus}
            tailleTrancheSuivante={liste.tailleTrancheSuivante}
            libelle="mandats"
          />
        </div>
      </div>
    </div>
  )
}
