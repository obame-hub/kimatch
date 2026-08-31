import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Select } from '@/components/ui/form'
import { ExtractDocumentButton } from '@/components/ui/document-extraction'
import { MandatChainPrompt, type ChainedCompteur } from '@/components/compteur/MandatChainPrompt'
import {
  PdlDraftRows,
  emptyPdlDraft,
  buildDraftCharacteristics,
  champsPdlManquants,
  applyExtractionToDraft,
  trouverSiteExistant,
  type PdlDraft,
  type ExtractedField,
} from '@/components/compteur/PdlDraftRows'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useCompteurs, useCreateCompteur } from '@/lib/data/compteurs'
import { useCreateSite, normalizeTexte } from '@/lib/data/sites'
import { FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import type { Compte, Site } from '@/types/domain'
import type { PdlMethode } from '@/components/compteur/PdlMethodSheet'

export function CreationCompteurDialog({
  open,
  onClose,
  compte: compteImpose,
  sites,
  methode = 'manuel',
  titre = 'Nouveau compteur',
  compteIdParDefaut,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Compte de rattachement. Absent depuis la liste des sites : un sélecteur est alors affiché. */
  compte?: Compte
  sites: Site[]
  /** « extraction » affiche le dépôt de facture, qui pré-remplit l'adresse puis le brouillon PDL. */
  methode?: PdlMethode
  /** « Nouveau site » depuis la liste des sites — même parcours, autre intitulé. */
  titre?: string
  /** Présélectionne le compte dans le sélecteur (ex. « créer un site » depuis une fiche compte). */
  compteIdParDefaut?: string
  onSaved: (message: string) => void
}) {
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const { data: utilisationsRef } = useReferenceTable('types_utilisations_compteur')
  const { data: comptes } = useComptes()
  // Depuis une fiche compte, le compte est connu. Depuis la liste des sites, l'utilisateur le
  // choisit ici — c'est la seule différence entre les deux points d'entrée.
  const [compteChoisiId, setCompteChoisiId] = useState(compteIdParDefaut ?? '')
  const compte = compteImpose ?? (comptes ?? []).find((c) => c.id === compteChoisiId)
  const comptesClients = (comptes ?? []).filter((c) => c.type_compte !== 'fournisseur')
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const createSite = useCreateSite()
  const createCompteur = useCreateCompteur()

  // Plus d'etape « adresse » ni d'ecran de desambiguisation : le site est un simple libelle saisi
  // dans le formulaire du PDL, resolu ou cree a l'enregistrement (decision William 06/08/2026).
  const [drafts, setDrafts] = useState<PdlDraft[]>([emptyPdlDraft()])
  const [submitting, setSubmitting] = useState(false)
  const [createdCompteurs, setCreatedCompteurs] = useState<ChainedCompteur[] | null>(null)
  // Champs de la facture extraits à l'étape adresse : ils servent l'adresse tout de suite, puis
  // le brouillon PDL une fois le site résolu.
  const [champsFacture, setChampsFacture] = useState<Record<string, ExtractedField> | null>(null)

  const fournisseurs = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur')
  const contactsDuCompte = (contacts ?? []).filter((c) => c.compte_id === compte?.id)

  /** Extraction depuis une facture : remplit l'adresse (étape en cours) et mémorise le reste pour
   * pré-remplir le brouillon PDL. On ne remplace jamais ce que l'utilisateur a déjà saisi. */
  function handleFactureExtraite(fields: Record<string, ExtractedField>) {
    setChampsFacture(fields)
    const val = (k: string) => (fields[k]?.value == null ? '' : String(fields[k].value).trim())
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== 0) return d
        return {
          ...d,
          ...applyExtractionToDraft(d, fields, energies, fournisseurs),
          // Site : on ne remplace jamais une saisie deja faite par l'utilisateur.
          libelleSite: d.libelleSite || val('site_nom'),
          adresse: d.adresse || val('adresse'),
          ville: d.ville || val('ville'),
          codePostal: d.codePostal || val('code_postal'),
        }
      }),
    )
  }

  // Un brouillon non encore créé auquel il manque un champ requis bloque l'enregistrement (Tools).
  const draftsIncomplets = drafts.some((d) => {
    if (d.status === 'saved' || d.status === 'saving') return false
    const code = energies.find((e) => e.id === d.typeEnergieId)?.code?.toLowerCase()
    return champsPdlManquants(d, code !== 'gaz').size > 0
  })

  function reset() {
    setDrafts([emptyPdlDraft()])
    setSubmitting(false)
    setCreatedCompteurs(null)
    setChampsFacture(null)
  }

  function patchDraft(key: string, patch: Partial<PdlDraft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  /** Retrouve le site correspondant au brouillon, ou le cree. Le cache evite de creer plusieurs
   * fois le meme site quand plusieurs PDL du lot partagent le meme libelle. */
  async function resoudreSitePourDraft(
    d: PdlDraft,
    cache: Map<string, { id: string; nom: string }>,
  ): Promise<{ id: string; nom: string }> {
    const cle = `${normalizeTexte(d.libelleSite)}|${normalizeTexte(d.ville)}|${d.codePostal.trim()}`
    const dejaCree = cache.get(cle)
    if (dejaCree) return dejaCree

    const existant = trouverSiteExistant(sites, compte!.id, d)
    if (existant) {
      const site = { id: existant.id, nom: existant.nom }
      cache.set(cle, site)
      return site
    }

    const result = await createSite.mutateAsync({
      nom: d.libelleSite.trim() || d.ville.trim() || 'Nouveau site',
      compte_id: compte!.id,
      compte_nom: compte!.nom,
      type_site_id: null,
      type_site_libelle: '',
      adresse: d.adresse,
      ville: d.ville,
      code_postal: d.codePostal,
    })
    cache.set(cle, result.site)
    return result.site
  }

  async function handleSubmitPdl(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    let created = 0
    let sitesCrees = 0
    const nouveaux: ChainedCompteur[] = []
    const cacheSites = new Map<string, { id: string; nom: string }>()
    let dernierSiteNom = ''
    for (const d of drafts) {
      if (d.status === 'saved') continue
      const energieChoisie = energies.find((en) => en.id === d.typeEnergieId)
      const typeEnergie = (energieChoisie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'
      const fournisseur = fournisseurs.find((f) => f.id === d.fournisseurActuelId)
      // Cherché dans TOUS les contacts : le sélecteur permet de désigner un responsable rattaché
      // à un autre compte (onglet « Autre contact »).
      const responsable = (contacts ?? []).find((c) => c.id === d.responsableContactId)
      patchDraft(d.key, { status: 'saving' })
      try {
        // Le site est resolu ici, pas dans une etape prealable : l'utilisateur a saisi un libelle
        // et une adresse, Kimatch retrouve le site correspondant ou le cree en arriere-plan.
        const avant = cacheSites.size
        const site = await resoudreSitePourDraft(d, cacheSites)
        if (cacheSites.size > avant && !trouverSiteExistant(sites, compte!.id, d)) sitesCrees += 1
        dernierSiteNom = site.nom
        const result = await createCompteur.mutateAsync({
          site_id: site.id,
          site_nom: site.nom,
          type_energie_id: d.typeEnergieId || null,
          type_energie: typeEnergie,
          numero_pdl: d.numeroPdl,
          utilisation: d.utilisation,
          type_utilisation_compteur_id: d.typeUtilisationId || null,
          date_echeance: d.dateEcheance || null,
          fournisseur_actuel_compte_id: d.fournisseurActuelId || null,
          fournisseur_actuel_nom: fournisseur?.nom ?? null,
          responsable_contact_id: d.responsableContactId || null,
          responsable_contact_nom: responsable ? `${responsable.prenom} ${responsable.nom}` : null,
          ...buildDraftCharacteristics(d, typeEnergie === 'electricite'),
        })
        patchDraft(d.key, { status: 'saved' })
        created += 1
        nouveaux.push({ id: result.compteur.id, numero_pdl: result.compteur.numero_pdl, responsable_contact_id: result.compteur.responsable_contact_id ?? null })
      } catch (err) {
        patchDraft(d.key, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Erreur inconnue' })
      }
    }
    setSubmitting(false)
    if (created > 0) {
      const quoi = created > 1 ? `${created} PDL créés` : 'PDL créé'
      const ou = sitesCrees > 0 ? `nouveau site « ${dernierSiteNom} »` : `site « ${dernierSiteNom} »`
      onSaved(`✓ ${quoi} sur le ${ou}`)
    }
    setDrafts((prev) => {
      if (prev.every((d) => d.status === 'saved') && nouveaux.length > 0) {
        setCreatedCompteurs(nouveaux)
      }
      return prev
    })
  }

  if (createdCompteurs) {
    return (
      <Dialog open={open} onClose={() => { reset(); onClose() }} title="PDL créé(s) avec succès" description="Que veux-tu faire ensuite ?" className="max-w-xl">
        <MandatChainPrompt
          compteId={compte!.id}
          compteNom={compte!.nom}
          compteurs={createdCompteurs}
          contacts={contactsDuCompte}
          onDone={() => { reset(); onClose() }}
        />
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose() }}
      title={titre}
      className="max-w-xl"
      description="Le site est retrouvé ou créé automatiquement à partir du libellé et de l'adresse."
    >
      {!compteImpose && (
        <FormField label="Compte de rattachement" required>
          <Select value={compteChoisiId} onChange={(e) => setCompteChoisiId(e.target.value)} required>
            <option value="">Sélectionner un compte…</option>
            {comptesClients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
      )}

      {!compte && !compteImpose && (
        <p className="mt-2 text-[11px] text-km-faint">
          Choisis d'abord le compte : le site et son point de livraison lui seront rattachés.
        </p>
      )}

      {compte && (
      <>
      <div className="mb-3 space-y-2">
        {/* Dépôt de facture : ce que promettait « Extraction automatique » sans jamais l'ouvrir.
            Proposé aussi en saisie manuelle -- ça ne coûte rien. */}
        <ExtractDocumentButton
          onExtracted={handleFactureExtraite}
          label="Déposer une facture PDF ou un scan"
          autoOpen={methode === 'extraction'}
        />
        {champsFacture && (
          <p className="flex items-start gap-1.5 text-[11px] text-km-green">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
            Facture analysée — les champs reconnus sont pré-remplis ci-dessous. Vérifie-les.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmitPdl} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <PdlDraftRows
            drafts={drafts}
            onChange={patchDraft}
            onRemove={(key) => setDrafts((prev) => prev.filter((d) => d.key !== key))}
            onAdd={() => setDrafts((prev) => [...prev, emptyPdlDraft()])}
            energies={energies}
            utilisationsRef={utilisationsRef}
            fournisseurs={fournisseurs}
            contacts={contactsDuCompte}
            allContacts={contacts ?? []}
            compteId={compte!.id}
            compteNom={compte!.nom}
            compteSegment={compte!.segment}
            existingCompteurs={compteurs ?? []}
            sites={sites}
          />
          {draftsIncomplets && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Complète les champs marqués d'une astérisque : ils alimentent l'éligibilité fournisseur lors de la cotation.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-km-line pt-3">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Fermer</Button>
            <Button type="submit" disabled={submitting || draftsIncomplets || drafts.every((d) => d.status === 'saved')}>
              {drafts.length > 1 ? `Créer les ${drafts.length} PDL` : 'Créer le PDL'}
            </Button>
          </div>
      </form>
      </>
      )}
    </Dialog>
  )
}
