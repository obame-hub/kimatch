import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
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
import { cn } from '@/lib/utils'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useCompteurs, useCreateCompteur } from '@/lib/data/compteurs'
import { useTeleverserDocuments } from '@/lib/data/documents'
import { useExtractDocument } from '@/lib/data/ocr'
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
  titre = 'Nouveau compteur',
  compteIdParDefaut,
  onSaved,
  onCrees,
  enTete,
  responsableParDefautId,
  libelleValidation,
  sansCadre = false,
  unParUn = false,
  onCompteurCree,
}: {
  open: boolean
  onClose: () => void
  /** Compte de rattachement. Absent depuis la liste des sites : un sélecteur est alors affiché. */
  compte?: Compte
  sites: Site[]
  /** Conservé pour les appelants : la zone de dépôt est désormais toujours visible dans le
   *  formulaire, il n'y a plus de mode « extraction » à distinguer. */
  methode?: PdlMethode
  /** « Nouveau site » depuis la liste des sites — même parcours, autre intitulé. */
  titre?: string
  /** Présélectionne le compte dans le sélecteur (ex. « créer un site » depuis une fiche compte). */
  compteIdParDefaut?: string
  onSaved: (message: string) => void
  /* ══ LES DEUX CROCHETS DU PARCOURS DE CONVERSION (23/09/2026) ══
     Ce dialogue est l'étape « périmètre » du parcours de conversion d'une piste. Il y est réemployé
     tel quel plutôt que recopié : c'est le même geste, avec les mêmes contrôles d'éligibilité, et
     deux écrans de saisie de PDL qui divergeraient seraient deux écrans à corriger. */
  /** Les compteurs créés, avec leurs identifiants. `onSaved` ne rend qu'une phrase : la suite du
   *  parcours (opportunité puis mandat) a besoin des identifiants eux-mêmes.
   *  LE FOURNIR REMPLACE AUSSI L'ÉCRAN DE SORTIE : `MandatChainPrompt` propose d'enchaîner sur un
   *  mandat, ce que le parcours fait déjà de lui-même. Le laisser poserait deux fois la même
   *  question, avec deux réponses possibles. */
  onCrees?: (compteurs: ChainedCompteur[]) => void
  /** Rendu en tête du dialogue : le parcours y place son ruban d'étapes, pour qu'on ne perde pas
   *  de vue où l'on en est au moment où l'écran change. */
  enTete?: React.ReactNode
  /** Le responsable désigné d'avance sur chaque PDL. Le parcours de conversion y met le contact
   *  qu'il vient de créer : c'est lui qu'on a eu au téléphone, c'est lui qui signera le mandat, et
   *  le redemander PDL par PDL juste après l'avoir saisi n'apprend rien à personne.
   *  Pré-rempli, pas imposé : le sélecteur reste ouvert, un syndic peut confier la chaufferie à
   *  quelqu'un d'autre. */
  responsableParDefautId?: string
  /** Remplace « Créer le PDL » : le parcours de conversion crée un PÉRIMÈTRE, pas un PDL isolé. */
  libelleValidation?: string
  /** ══ UN COMPTEUR À LA FOIS ══
   *  William, 24/09/2026 : « si je clique sur "+ Ajouter un compteur", le premier compteur créé se
   *  met dans la barre de gauche et l'écran revient à 0 pour la création du prochain — je ne veux
   *  pas que de nouveaux champs apparaissent en dessous comme actuellement ».
   *  Le bouton ENREGISTRE donc, puis vide le formulaire. C'est ce qui permet au tout de tenir sans
   *  défilement : un compteur à l'écran, les précédents rangés dans le rail. */
  unParUn?: boolean
  /** Appelé pour CHAQUE compteur créé, dès sa création — c'est lui qui remplit le rail au fur et à
   *  mesure, au lieu d'attendre la fin. */
  onCompteurCree?: (compteur: ChainedCompteur) => void
  /** ══ RENDU SANS SA PROPRE FENÊTRE ══
   *  Le parcours de conversion a déjà la sienne, avec son rail à gauche : imbriquer un second
   *  `Dialog` dedans poserait un voile par-dessus le voile et une carte par-dessus la carte. On
   *  rend donc le seul formulaire, que le parcours place dans son panneau de droite. */
  sansCadre?: boolean
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
  const televerser = useTeleverserDocuments()
  const extraire = useExtractDocument()

  // Plus d'etape « adresse » ni d'ecran de desambiguisation : le site est un simple libelle saisi
  // dans le formulaire du PDL, resolu ou cree a l'enregistrement (decision William 06/08/2026).
  const [drafts, setDrafts] = useState<PdlDraft[]>([emptyPdlDraft(responsableParDefautId)])
  const [submitting, setSubmitting] = useState(false)
  const [createdCompteurs, setCreatedCompteurs] = useState<ChainedCompteur[] | null>(null)
  // Champs de la facture extraits à l'étape adresse : ils servent l'adresse tout de suite, puis
  // le brouillon PDL une fois le site résolu.
  /* LE FICHIER DÉPOSÉ NE SERT PLUS SEULEMENT À LIRE. William, 24/09/2026 : « le fichier sera lié
     aux fichiers du compteur créé ». On le garde donc jusqu'à la création, puis on le téléverse. */
  const [facture, setFacture] = useState<File | null>(null)
  const [factureEnCours, setFactureEnCours] = useState(false)
  const [factureErreur, setFactureErreur] = useState<string | null>(null)
  /* Les compteurs déjà enregistrés dans cette session de saisie — voir `unParUn`. */
  const [dejaCrees, setDejaCrees] = useState<ChainedCompteur[]>([])

  const fournisseurs = (comptes ?? []).filter((c) => c.type_compte === 'fournisseur')
  // Tous les contacts du compte, rattachements indirects compris (William, 07/09/2026).
  const contactsDuCompte = contactsRattaches(contacts, compte?.id)

  /** Extraction depuis une facture : remplit l'adresse (étape en cours) et mémorise le reste pour
   * pré-remplir le brouillon PDL. On ne remplace jamais ce que l'utilisateur a déjà saisi. */
  /** Le geste complet du dépôt : garder le fichier pour le joindre, et le faire lire tout de suite. */
  async function deposerFacture(fichier: File) {
    setFacture(fichier)
    setFactureErreur(null)
    setFactureEnCours(true)
    try {
      const resultat = await extraire.mutateAsync(fichier)
      /* ══ LE SERVICE RÉPOND « INDISPONIBLE » AVEC UN CODE 200 ══
         Clé Anthropic absente, document illisible : la réponse est un succès HTTP portant
         `success: false`. `useExtractDocument` ne lève donc pas, et mon premier code se contentait
         de ne rien faire — un dépôt sans effet passait pour un dépôt réussi. C'est ce qui est
         arrivé à William le 24/09/2026. On regarde désormais le contenu, pas le code HTTP. */
      if (resultat.extracted && Object.keys(resultat.extracted).length > 0) {
        handleFactureExtraite(resultat.extracted)
      } else {
        setFactureErreur(resultat.error ?? 'Aucun champ n’a pu être lu dans ce document.')
      }
    } catch (e) {
      setFactureErreur(e instanceof Error ? e.message : 'Lecture impossible.')
    } finally {
      setFactureEnCours(false)
    }
  }

  function handleFactureExtraite(fields: Record<string, ExtractedField>) {
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
    setDrafts([emptyPdlDraft(responsableParDefautId)])
    setSubmitting(false)
    setCreatedCompteurs(null)
    setFacture(null)
    setFactureErreur(null)
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

  async function handleSubmitPdl(e: React.FormEvent | null, continuer = false) {
    e?.preventDefault()
    setSubmitting(true)
    let created = 0
    let echecs = 0
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
        /* LA FACTURE REJOINT LE COMPTEUR. Sans `await` bloquant l'enregistrement : le PDL est ce
           qu'on est venu créer, le fichier est un enrichissement. Un échec de téléversement ne doit
           pas faire croire que le compteur n'existe pas. */
        if (facture) {
          void televerser
            .mutateAsync({
              fichiers: [facture],
              entite_type: 'compteur',
              entite_id: result.compteur.id,
              type_document_id: null,
              type_document_libelle: 'Facture',
            })
            .catch(() => {})
        }
        onCompteurCree?.({ id: result.compteur.id, numero_pdl: result.compteur.numero_pdl, responsable_contact_id: result.compteur.responsable_contact_id ?? null })
        nouveaux.push({ id: result.compteur.id, numero_pdl: result.compteur.numero_pdl, responsable_contact_id: result.compteur.responsable_contact_id ?? null })
      } catch (err) {
        echecs += 1
        patchDraft(d.key, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Erreur inconnue' })
      }
    }
    setSubmitting(false)
    if (created > 0) {
      const quoi = created > 1 ? `${created} PDL créés` : 'PDL créé'
      const ou = sitesCrees > 0 ? `nouveau site « ${dernierSiteNom} »` : `site « ${dernierSiteNom} »`
      onSaved(`✓ ${quoi} sur le ${ou}`)
    }
    /* ══ « TOUT EST PASSÉ » SE COMPTE, IL NE SE RELIT PAS DANS L'ÉTAT ══
       C'était `setDrafts((prev) => ...)` qui décidait, en relisant les statuts — un effet de bord
       glissé dans une fonction de mise à jour, que React a le droit d'exécuter deux fois. Anodin
       tant qu'il n'appelait qu'un `setState` du même composant ; plus du tout maintenant qu'il
       prévient le parcours, qui enchaînerait alors deux fois sur l'opportunité.
       Le compte des échecs est tenu par la boucle elle-même : c'est la même information, prise là
       où elle est sûre. */
    if (echecs === 0 && nouveaux.length > 0) {
      const tous = [...dejaCrees, ...nouveaux]
      if (continuer) {
        /* ON REPART À ZÉRO, en gardant la mémoire de ce qui a été créé : c'est le rail qui affiche
           les précédents, pas ce formulaire. */
        setDejaCrees(tous)
        setDrafts([emptyPdlDraft(responsableParDefautId)])
            setFacture(null)
        setFactureErreur(null)
        return
      }
      if (onCrees) onCrees(tous)
      else setCreatedCompteurs(tous)
    }
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

  const corps = (
    <>
      {enTete}
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
      <div className={cn(sansCadre && 'flex min-h-0 flex-1 flex-col')}>
      {/* LE BOUTON « DÉPOSER UNE FACTURE » A QUITTÉ LE HAUT DE L'ÉCRAN le 24/09/2026 : il est
          devenu la zone de glisser-déposer de la première zone du formulaire, à côté du
          responsable. Même moteur de lecture, une étape de moins. */}
      <form onSubmit={handleSubmitPdl} className={cn('space-y-4 overflow-y-auto pr-1', sansCadre ? 'min-h-0 flex-1' : 'max-h-[70vh]')}>
          <PdlDraftRows
            drafts={drafts}
            onChange={patchDraft}
            onRemove={(key) => setDrafts((prev) => prev.filter((d) => d.key !== key))}
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
            responsableParDefautId={responsableParDefautId}
            facture={{ nom: facture?.name ?? null, enCours: factureEnCours, erreur: factureErreur, onFichier: (f) => void deposerFacture(f) }}
          />
          <div className="flex items-center gap-2 border-t border-km-line pt-3">
            {/* ══ « AJOUTER UN COMPTEUR » ENREGISTRE CELUI-CI D'ABORD ══
                C'est ce qui range le précédent dans le rail et rend l'écran au suivant. Il obéit
                donc aux mêmes conditions que l'enregistrement : un compteur incomplet ne se range
                nulle part. */}
            {unParUn && (
              <Button
                type="button"
                variant="outline"
                disabled={submitting || draftsIncomplets}
                onClick={() => void handleSubmitPdl(null, true)}
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter un compteur
              </Button>
            )}
            {dejaCrees.length > 0 && (
              <span className="text-km-label text-km-muted">
                {dejaCrees.length} {dejaCrees.length > 1 ? 'compteurs enregistrés' : 'compteur enregistré'}
              </span>
            )}
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Fermer</Button>
            <Button type="submit" disabled={submitting || draftsIncomplets || drafts.every((d) => d.status === 'saved')}>
              {libelleValidation ?? (drafts.length > 1 ? `Créer les ${drafts.length} PDL` : 'Créer le PDL')}
            </Button>
          </div>
      </form>
      </div>
      )}
    </>
  )

  if (sansCadre) return corps

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose() }}
      title={titre}
      className="max-w-xl"
      description="Le site est retrouvé ou créé automatiquement à partir du libellé et de l'adresse."
    >
      {corps}
    </Dialog>
  )
}
