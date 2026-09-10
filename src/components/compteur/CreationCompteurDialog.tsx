import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
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
import { useCreateSite, useUpdateSitePartiel, normalizeTexte } from '@/lib/data/sites'
import { toUpperFR } from '@/lib/textFormat'
import { FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import type { Compte, Site } from '@/types/domain'
import type { PdlMethode } from '@/components/compteur/PdlMethodSheet'

import { contactsDuCompte as contactsRattaches } from '@/lib/contactsDuCompte'

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
  const navigate = useNavigate()
  const compte = compteImpose ?? (comptes ?? []).find((c) => c.id === compteChoisiId)
  const comptesClients = (comptes ?? []).filter((c) => c.type_compte !== 'fournisseur')
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const createSite = useCreateSite()
  // Sert à compléter l'adresse d'un site retrouvé sans adresse — voir `resoudreSitePourDraft`.
  const majSitePartiel = useUpdateSitePartiel()
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
  // Tous les contacts du compte, rattachements indirects compris (William, 07/09/2026).
  const contactsDuCompte = contactsRattaches(contacts, compte?.id)

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
      /* ══ L'ADRESSE SAISIE NE SE PERD PLUS QUAND LE SITE EXISTE DÉJÀ ══
         Le site retrouvé était rendu tel quel, et l'adresse tapée partait à la poubelle. Ça vidait
         de son sens l'obligation posée le 10/09/2026 (« faut rendre toutes les adresses
         obligatoires ») : sur les 6 374 sites, seuls 336 portent une adresse — 5 % — donc le cas
         courant est justement celui où le site existe SANS adresse et où la saisie aurait tout
         résolu.

         ON NE COMPLÈTE QUE LE VIDE. Jamais d'écrasement : une adresse déjà là a été vérifiée par
         quelqu'un, et une faute de frappe dans ce formulaire ne doit pas pouvoir l'effacer. Le
         déclencheur `trg_compteur_herite_de_son_site` la recopiera ensuite sur le compteur, donc
         dans `adresse_site`, donc dans la recherche. */
      const rue = d.adresse.trim()
      if (rue && !(existant.adresse ?? '').trim()) {
        try {
          await majSitePartiel.mutateAsync({ id: existant.id, patch: { adresse: toUpperFR(rue) } })
        } catch {
          /* On n'interrompt PAS la création du compteur pour ça : le PDL est ce qu'on est venu
             créer, l'adresse du site est un enrichissement. L'échec se verra à la relecture de la
             fiche, pas au milieu d'une saisie de quatre PDL. */
        }
      }
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
          // Le compte est connu ici : on l'écrit plutôt que de laisser le déclencheur le déduire.
          compte_id: compte!.id,
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
    /* LA MÊME SORTIE POUR LES DEUX GESTES : le bouton « Terminer sans créer de mandat » et la
       croix du dialogue disent la même chose — j'ai fini. Les traiter différemment ferait qu'un
       même utilisateur atterrit ailleurs selon qu'il a cliqué le bouton ou appuyé sur Échap. */
    const terminer = () => {
      const destination =
        createdCompteurs.length === 1 ? `/compteurs/${createdCompteurs[0].id}` : `/comptes/${compte!.id}`
      reset()
      onClose()
      navigate(destination)
    }
    return (
      <Dialog open={open} onClose={terminer} title="PDL créé(s) avec succès" description="Que veux-tu faire ensuite ?" className="max-w-xl">
        <MandatChainPrompt
          compteId={compte!.id}
          compteNom={compte!.nom}
          compteurs={createdCompteurs}
          contacts={contactsDuCompte}
          /* ══ TERMINER SANS MANDAT MÈNE AU COMPTEUR QU'ON VIENT DE CRÉER ══
             Naoëlle, 10/09/2026 : « ce serait bien que si je ne crée pas le mandat et que j'arrête
             après la création du compteur, ça me redirige sur la page du compteur que j'ai créé. »

             Le dialogue se contentait de se refermer, et on se retrouvait sur la liste d'où l'on
             était parti — sans savoir si le PDL était bien là, ni où le retrouver parmi 7 920. Or
             c'est le moment où l'on veut vérifier ce qu'on vient de saisir : l'adresse, le
             responsable, l'échéance.

             UN SEUL PDL MÈNE À SA FICHE. Plusieurs mènent à la fiche du compte, qui les liste tous
             dans son onglet Compteurs : en désigner un seul parmi quatre serait un choix
             arbitraire, et les abandonner sur la liste générale referait le problème. */
          onDone={terminer}
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
      {/* Recherche et non liste déroulante : voir `ChoixParRecherche`. Ce `<select>` déroulait
          tous les comptes clients (Naoëlle, 08/09/2026 : « montrer tous les comptes c'est horrible
          à l'affichage »). */}
      {!compteImpose && (
        <FormField label="Compte de rattachement" required>
          <ChoixParRecherche<Compte>
            items={comptesClients}
            valeur={compteChoisiId}
            onChoisir={(c) => setCompteChoisiId(c?.id ?? '')}
            placeholder="Chercher un compte…"
            principal={(c) => c.nom}
            secondaire={(c) => [c.ville, c.siret ? `SIRET ${c.siret}` : null].filter(Boolean).join(' · ') || null}
            filtre={(c, q) => c.nom.toLowerCase().includes(q) || (c.siret ?? '').includes(q) || (c.siren ?? '').includes(q)}
            totalLibelle={`${comptesClients.length} comptes`}
          />
        </FormField>
      )}

      {!compte && !compteImpose && (
        <p className="mt-2 text-km-label text-km-faint">
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
          <p className="flex items-start gap-1.5 text-km-label text-km-green">
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
