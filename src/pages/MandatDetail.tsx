import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileCheck2, FileSignature, Trash2, Building2, MapPin, Gauge, FileText, Phone, Mail } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { Badge } from '@/components/ui/badge'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { EmailLink } from '@/components/ui/contact-link'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { InlineField } from '@/components/ui/inline-field'
import { useMandat, useMarkMandatEnvoye, useUpdateMandatPartiel, useDeleteMandat, type PatchMandat } from '@/lib/data/mandats'
import { useContacts } from '@/lib/data/contacts'
import { useComptes } from '@/lib/data/comptes'
import { useSites } from '@/lib/data/sites'
import { useCompteurs } from '@/lib/data/compteurs'
import { useDocuments, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCanManage, useIsAdmin, useProfilsAdmin } from '@/lib/data/roles'
import { useSuppression } from '@/lib/useSuppression'
import { FALLBACK_STATUTS_MANDATS, STATUT_MANDAT_TONE, FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { sendMandatForSignature, connectDocusign, DocusignNonConnecte } from '@/lib/data/docusign'
import { useGoBack } from '@/lib/useGoBack'
import { useRaccourcisOnglets } from '@/lib/useRaccourcisOnglets'
import { cn } from '@/lib/utils'
import type { Mandat, Contact, Compte, Compteur } from '@/types/domain'
import { generateMandatKiweePdf, generateMandatEnergixPdf } from '@/lib/mandatPdf'
import { appelerNumero } from '@/lib/telephonie'

type TabKey = 'mandat' | 'perimetre' | 'fichiers'

// Le code de reference reste 'KIWI' en base (cle utilisee par tout le pipeline d'import), seul
// le libelle affiche change -- renommer le code casserait les jointures existantes pour rien.
const COURTIER_LABEL: Record<string, string> = { KIWI: 'KIWEE', ENERGIX: 'Energix' }

function EnvoyerSignatureDialog({
  open,
  onClose,
  mandat,
  compte,
  compteurs,
  contact,
}: {
  open: boolean
  onClose: () => void
  mandat: Mandat
  compte: Compte | undefined
  compteurs: Compteur[]
  contact: Contact | undefined
}) {
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [besoinConnexionDocusign, setBesoinConnexionDocusign] = useState(false)
  const markEnvoye = useMarkMandatEnvoye()

  const dureeMois = mandat.duree_mois ?? 36
  const inclutEnergix = mandat.courtier_codes.includes('ENERGIX')

  async function envoyer() {
    if (!compte || !contact?.email) return
    setSending(true)
    setFeedback(null)
    try {
      const kiwee = await generateMandatKiweePdf({ compte, contact, compteurs, dureeMois })
      const documents = [kiwee]
      if (inclutEnergix) {
        const energix = await generateMandatEnergixPdf({ compte, contact, compteurs, dureeMois })
        documents.push(energix)
      }

      const result = await sendMandatForSignature({
        mandatId: mandat.id,
        documents,
        signerEmail: contact.email,
        signerName: `${contact.prenom} ${contact.nom}`,
        emailSubject: `KiWee Énergie — Mandat à signer (${mandat.compte_nom})`,
        draft: true,
        returnUrl: `${window.location.origin}/mandats/${mandat.id}`,
      })
      // Statut inchangé ici : c'est le webhook DocuSign qui fera passer le mandat à ENVOYE une
      // fois qu'un humain aura réellement cliqué "Envoyer" dans l'éditeur DocuSign (mode brouillon).
      await markEnvoye.mutateAsync({ mandatId: mandat.id, envelopeId: result.envelopeId, statutId: null })
      if (result.senderViewUrl) {
        window.location.href = result.senderViewUrl
        return
      }
      setFeedback('Enveloppe créée en brouillon.')
      setTimeout(onClose, 1200)
    } catch (e) {
      // Autorisation DocuSign manquante : geste a faire une fois, pas une panne. On propose la
      // connexion sur place plutot qu'un message que l'utilisateur ne peut pas exploiter.
      if (e instanceof DocusignNonConnecte) setBesoinConnexionDocusign(true)
      setFeedback(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Envoyer pour signature" description="Génère le(s) PDF de mandat et ouvre l'éditeur DocuSign pour vérification et envoi.">
      <div className="space-y-3">
        {!contact?.email && (
          <p className="text-xs text-red-600">Le contact signataire de ce mandat n'a pas d'adresse email renseignée.</p>
        )}
        {contact?.email && (
          <p className="text-xs text-navy-500">Signataire : {contact.prenom} {contact.nom} (<EmailLink value={contact.email!} />)</p>
        )}
        <p className="text-xs text-navy-500">
          Document{inclutEnergix ? 's' : ''} généré{inclutEnergix ? 's' : ''} : Mandat KiWee ({dureeMois} mois){inclutEnergix && ', Autorisation Energix'}.
        </p>
        <p className="text-[10.5px] text-navy-400">Tu seras redirigé·e vers DocuSign pour vérifier puis cliquer "Envoyer" toi-même — rien ne part automatiquement.</p>
        {feedback && <p className="text-xs text-navy-600">{feedback}</p>}
        {besoinConnexionDocusign && (
          <Button type="button" size="sm" onClick={() => { connectDocusign().catch(() => {}) }}>
            Connecter mon compte DocuSign
          </Button>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="button" onClick={envoyer} disabled={sending || !contact?.email || !compte}>
            {sending ? 'Génération…' : 'Générer et vérifier'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ConversionPathCard({ mandat }: { mandat: Mandat }) {
  const step = mandat.date_signature ? 2 : mandat.date_envoi || mandat.docusign_envelope_id ? 1 : 0
  const steps = [
    { label: 'Brouillon', icon: FileCheck2 },
    { label: 'Envoyé', icon: FileSignature },
    { label: 'Signé', icon: FileCheck2 },
  ]
  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-navy-400">Chemin de conversion</p>
      <div className="flex items-center">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  i <= step ? 'bg-gradient-to-br from-amber-600 to-amber-500 text-white shadow-sm' : 'bg-navy-100 text-navy-400',
                )}
              >
                <s.icon className="h-3.5 w-3.5" />
              </span>
              <span className={cn('whitespace-nowrap text-[11px] font-bold', i <= step ? 'text-navy-800' : 'text-navy-400')}>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mx-1 h-1 flex-1 rounded', i < step ? 'bg-gradient-to-r from-amber-600 to-amber-500' : 'bg-navy-100')} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ValiditeCard({ dateDebut, dateFin }: { dateDebut: string; dateFin: string }) {
  const debut = new Date(dateDebut).getTime()
  const fin = new Date(dateFin).getTime()
  const now = Date.now()
  const pct = Math.min(100, Math.max(0, ((now - debut) / (fin - debut)) * 100))
  const joursRestants = Math.round((fin - now) / 86400000)

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Validité</span>
        <div className="flex-1" />
        <span className={cn('text-[11px] font-bold', joursRestants < 0 ? 'text-navy-400' : joursRestants < 60 ? 'text-red-500' : 'text-amber-600')}>
          {joursRestants < 0 ? 'expiré' : `expire dans ${joursRestants} jour${joursRestants > 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-navy-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-kiwi-500 to-kiwi-400" style={{ width: `${pct}%` }} />
        {now >= debut && now <= fin && <div className="absolute -top-0.5 h-3.5 w-0.5 rounded bg-red-500" style={{ left: `${pct}%` }} />}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-navy-400">
        <span>{new Date(dateDebut).toLocaleDateString('fr-FR')}</span>
        {now >= debut && now <= fin && <span className="font-bold text-red-500">aujourd'hui</span>}
        <span>{new Date(dateFin).toLocaleDateString('fr-FR')}</span>
      </div>
    </div>
  )
}

export default function MandatDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Perimetre de la fiche, lu cote serveur : ces lectures parcouraient le CRM entier pour en
  // garder une ligne ou quelques-unes (meme correctif que les fiches compte et site).
  const { data: mandat } = useMandat(id)
  const { data: statutsRef } = useReferenceTable('statuts_mandats')
  const statuts = statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_MANDATS
  const { data: contacts } = useContacts()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: compteurs } = useCompteurs()
  const { data: documents } = useDocuments()
  const [showEnvoyer, setShowEnvoyer] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const televerser = useTeleverserDocuments()

  const { data: typesDocsRef } = useReferenceTable('types_documents')

  const typesDocs = typesDocsRef && typesDocsRef.length > 0 ? typesDocsRef : FALLBACK_TYPES_DOCUMENTS
  const [tab, setTab] = useState<TabKey>('mandat')
  const canManage = useCanManage(mandat?.proprietaire_id)
  const isAdmin = useIsAdmin()
  const { data: profilsAdmin } = useProfilsAdmin()
  const deleteMandat = useDeleteMandat()
  const goBack = useGoBack('/mandats')

  // Edition en place : la modale « Modifier » disparait.
  const updateMandatPartiel = useUpdateMandatPartiel()
  const majMandat = async (patch: PatchMandat) => {
    await updateMandatPartiel.mutateAsync({ id: id as string, patch })
  }
  const [toast, setToast] = useState<string | null>(null)
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }
  const retourInline = {
    onSaved: () => showToast('✓ enregistré'),
    onError: (e: Error) => showToast(`Erreur : ${e.message}`),
  }
  const compte = comptes?.find((c) => c.id === mandat?.compte_id)
  const contactSignataire = contacts?.find((c) => c.id === mandat?.contact_signataire_id)
  const sitesDuMandat = useMemo(() => sites?.filter((s) => mandat?.site_ids.includes(s.id)) ?? [], [sites, mandat])
  const compteursDuMandat = useMemo(() => compteurs?.filter((c) => mandat?.compteur_ids.includes(c.id)) ?? [], [compteurs, mandat])
  const documentsDuMandat = useMemo(() => documents?.filter((d) => d.entite_type === 'mandat' && d.entite_id === mandat?.id) ?? [], [documents, mandat?.id])

  const suppression = useSuppression()

  function handleDelete() {
    if (!mandat) return
    suppression.supprimer(
      () => deleteMandat.mutateAsync(mandat.id),
      () => navigate('/mandats'),
    )
  }

  const TABS: { key: TabKey; label: string; badge?: string }[] = [
    { key: 'mandat', label: 'Mandat' },
    { key: 'perimetre', label: 'Périmètre', badge: compteursDuMandat.length ? String(compteursDuMandat.length) : undefined },
    { key: 'fichiers', label: 'Fichiers', badge: documentsDuMandat.length ? String(documentsDuMandat.length) : undefined },
  ]

  // « 1–5 pour naviguer » : le raccourci annonce par la maquette dans la barre d'onglets.
  const clesOnglets = TABS.map((t) => t.key)
  useRaccourcisOnglets(clesOnglets, setTab)

  if (!mandat && id) {
    return (
      <div>
        <Topbar crumb="Mandats" title="Mandat" />
        <div className="p-4 sm:p-6"><p className="text-sm text-navy-400">Chargement…</p></div>
      </div>
    )
  }

  if (!mandat) {
    return (
      <div>
        <Topbar crumb="Mandats" title="Mandat" />
        <div className="p-4 sm:p-6">
          <Button variant="ghost" size="sm" className="mb-4" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Retour aux mandats
          </Button>
          <p className="text-sm text-navy-500">Mandat introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar crumb="Mandats" title={`Mandat — ${mandat.compte_nom}`} />

      {/* Bandeau mandat */}
      <div className="flex flex-wrap items-center gap-3.5 border-b border-navy-100 bg-white px-4 py-3.5 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux mandats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-amber-600 to-amber-500 text-white">
          <FileCheck2 className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-xl font-bold tracking-tight text-navy-800">Mandat {mandat.compte_nom}</p>
            <Badge tone={STATUT_MANDAT_TONE[mandat.statut] ?? 'neutral'}>{statuts.find((s) => s.code === mandat.statut)?.libelle ?? mandat.statut}</Badge>
          </div>
          <p className="truncate text-xs text-navy-500">{mandat.nb_sites_couverts} site{mandat.nb_sites_couverts > 1 ? 's' : ''} couvert{mandat.nb_sites_couverts > 1 ? 's' : ''}</p>
          <p className="truncate text-[10.5px] text-navy-400">
            {/* C'est le créateur qu'on affiche, pas un propriétaire : Mandat__c n'a pas d'OwnerId
                côté Salesforce, donc le mandat n'a jamais eu de propriétaire à reprendre. */}
            {mandat.date_creation && <>Créé le {new Date(mandat.date_creation).toLocaleDateString('fr-FR')} </>}
            par {mandat.createur_nom || mandat.proprietaire_nom || 'un auteur inconnu'}
            {mandat.id_salesforce && <> · <span className="font-mono">{mandat.id_salesforce}</span> (temporaire, pour contrôle)</>}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => setShowEnvoyer(true)}>
            <FileSignature className="h-3.5 w-3.5" />
            Envoyer pour signature
          </Button>
          {canManage && (
            <>
              {/* Plus de bouton « Modifier » : la date de signature s'edite dans « Détail du mandat ». */}
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-navy-100 bg-white px-4 pt-2.5 lg:gap-0.5 lg:pt-0 sm:px-6">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'mb-2.5 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors lg:mb-0 lg:rounded-none lg:border-b-2 lg:px-3 lg:py-2.5 lg:font-normal',
                isActive
                  ? 'bg-ink-800 text-white lg:border-navy-800 lg:bg-transparent lg:font-semibold lg:text-navy-800'
                  : 'border border-navy-200 bg-white text-navy-600 hover:bg-navy-50 lg:border-0 lg:border-b-2 lg:border-transparent lg:text-navy-500 lg:hover:bg-transparent lg:hover:text-navy-700',
              )}
            >
              {t.label}
              {t.badge && (
                <span className={cn('rounded px-1.5 py-0.5 text-[9.5px] font-bold', isActive ? 'bg-white/20 text-white lg:bg-navy-100 lg:text-navy-500' : 'bg-navy-100 text-navy-500')}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[256px_1fr]">
        {/* Colonne gauche (desktop uniquement) */}
        <div className="hidden flex-col gap-3.5 border-r border-navy-100 bg-navy-50/60 p-3.5 lg:flex">
          {compte && (
            <div className="rounded-xl border border-navy-100 bg-white p-3.5">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-sky-100 text-sky-500"><Building2 className="h-2.5 w-2.5" /></span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Compte</span>
                <div className="flex-1" />
                <EntityLink to={`/comptes/${compte.id}`}>ouvrir →</EntityLink>
              </div>
              <p className="text-[13px] font-bold text-sky-500">{compte.nom}</p>
            </div>
          )}

          {contactSignataire && (
            <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-white p-3.5">
              <div className="mb-2.5 flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-navy-400">Signataire</span>
                <div className="flex-1" />
                <EntityLink to={`/contacts/${contactSignataire.id}`}>ouvrir →</EntityLink>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-[11px] font-bold text-white">
                  {`${contactSignataire.prenom[0] ?? ''}${contactSignataire.nom[0] ?? ''}`.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-bold text-navy-800">{contactSignataire.prenom} {contactSignataire.nom}</p>
                  {contactSignataire.fonction && <p className="truncate text-[10px] text-navy-500">{contactSignataire.fonction}</p>}
                </div>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                {contactSignataire.telephone && (
                  <button
                    type="button"
                    onClick={() => void appelerNumero(contactSignataire.telephone)}
                    title="Appeler"
                    className="flex h-7 flex-1 items-center justify-center rounded-lg border border-navy-200 bg-white text-kiwi-600 hover:bg-kiwi-50"
                  >
                    <Phone className="h-3 w-3" />
                  </button>
                )}
                {contactSignataire.email && (
                  <a href={`mailto:${contactSignataire.email}`} title="Envoyer un email" className="flex h-7 flex-1 items-center justify-center rounded-lg border border-navy-200 bg-white text-sky-500 hover:bg-sky-50">
                    <Mail className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Centre */}
        <div className="bg-navy-50 p-4 sm:p-5">
          {tab === 'mandat' && (
            <div className="flex flex-col gap-3.5">
              <ConversionPathCard mandat={mandat} />
              {mandat.date_fin_validite && (mandat.date_debut_validite || mandat.date_signature) && (
                <ValiditeCard dateDebut={(mandat.date_debut_validite ?? mandat.date_signature) as string} dateFin={mandat.date_fin_validite} />
              )}
              <div className="rounded-xl border border-navy-100 bg-white p-4">
              <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-navy-400">Détail du mandat</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Edition en place : la date de signature se saisit ici, plus dans une modale.
                    C'est le seul champ que le mandat laisse modifier a la main -- tout le reste
                    vient de DocuSign ou du perimetre de compteurs. */}
                {canManage ? (
                  <InlineField
                    variant="date"
                    label="Date de signature"
                    emptyLabel="ajouter la date de signature"
                    value={mandat.date_signature ? mandat.date_signature.slice(0, 10) : null}
                    onCommit={(date_signature) => majMandat({ date_signature })}
                    {...retourInline}
                  />
                ) : (
                  <div>
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Date de signature</p>
                    <p className="text-xs font-semibold text-navy-800">{mandat.date_signature ? new Date(mandat.date_signature).toLocaleDateString('fr-FR') : '—'}</p>
                  </div>
                )}
                {isAdmin && (
                  <InlineField
                    variant="select"
                    label="Propriétaire"
                    emptyLabel="aucun"
                    value={mandat.proprietaire_id ?? ''}
                    options={(profilsAdmin ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
                    onCommit={(v) => majMandat({ proprietaire_id: v || null })}
                    {...retourInline}
                  />
                )}
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Sites couverts</p>
                  <p className="text-xs font-semibold text-navy-800">{mandat.nb_sites_couverts}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Courtiers couverts</p>
                  <p className="text-xs font-semibold text-navy-800">{mandat.courtier_codes.length > 0 ? mandat.courtier_codes.map((code) => COURTIER_LABEL[code] ?? code).join(', ') : '—'}</p>
                </div>
                {mandat.docusign_envelope_id && (
                  <div className="sm:col-span-2">
                    <p className="mb-0.5 text-[10px] uppercase tracking-wide text-navy-400">Enveloppe DocuSign</p>
                    <p className="font-mono text-xs text-navy-600">{mandat.docusign_envelope_id}</p>
                  </div>
                )}
              </div>
              <p className="mt-3 text-[10.5px] italic text-navy-400">
                Le mandat définit le périmètre de sites que KiWee est autorisé à analyser — une recommandation peut ne porter que sur une partie de ce périmètre.
              </p>
              <HistoriqueDiscret tableNom="mandats" ligneId={mandat.id} />
              </div>
            </div>
          )}

          {tab === 'perimetre' && (
            <div className="flex flex-col gap-3.5">
              {sitesDuMandat.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun compteur couvert par ce mandat.</p>
              ) : (
                sitesDuMandat.map((s) => {
                  const compteursDuSite = compteursDuMandat.filter((c) => c.site_id === s.id)
                  return (
                    <div key={s.id} className="rounded-xl border border-navy-100 bg-white p-3.5">
                      <div
                        onClick={() => navigate(`/sites/${s.id}`)}
                        className="mb-2.5 flex cursor-pointer items-center gap-3 hover:opacity-80"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-kiwi-100 text-kiwi-600">
                          <MapPin className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-navy-800">{s.nom}</p>
                          <p className="truncate text-[10.5px] text-navy-400">{s.type_site} · {s.ville}</p>
                        </div>
                        <Badge tone={s.statut === 'actif' ? 'kiwi' : 'neutral'}>{s.statut}</Badge>
                      </div>
                      <div className="flex flex-col gap-1.5 border-t border-navy-50 pt-2.5">
                        {compteursDuSite.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => navigate(`/compteurs/${c.id}`)}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-navy-50/60"
                          >
                            <Gauge className="h-3 w-3 shrink-0 text-navy-400" />
                            <p className="truncate text-xs font-semibold text-navy-700">{c.utilisation || c.numero_pdl}</p>
                            <p className="truncate font-mono text-[10px] text-navy-400">{c.numero_pdl}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {tab === 'fichiers' && (
            <div className="flex flex-col gap-3.5">
              {/* PAS DE BOUTON « Ajouter un fichier ». Naoelle, 21/08/2026 : « si on peut cliquer
                  ou deposer c'est bon, pas besoin de bruit visuel avec un bouton », puis « fais le
                  menage partout ». La zone juste en dessous dit les deux gestes et les accepte tous
                  les deux ; le bouton doublait l'un d'eux. Le rattachement par lien, qui n'etait
                  accessible que par lui, se fait desormais dans la zone — en y glissant le lien, ou
                  en le collant. */}
              {/* Depot reel de fichiers — possible depuis que le bucket « documents » a des
                  politiques d'ecriture (migration 20260816130000). */}
              <ZoneDepotFichiers
                types={typesDocs}
                onDeposer={async (fichiers, typeDocumentId) => {
                  await televerser.mutateAsync({
                    fichiers,
                    entite_type: 'mandat',
                    entite_id: mandat.id,
                    type_document_id: typeDocumentId,
                    type_document_libelle: typesDocs.find((x) => x.id === typeDocumentId)?.libelle ?? '',
                  })
                }}
              />
              {documentsDuMandat.length === 0 ? (
                <p className="text-sm text-navy-400">Aucun fichier lié à ce mandat.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
                  {documentsDuMandat.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/${d.id}`)}
                      className="flex cursor-pointer items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0 hover:bg-navy-50/60"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-500">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-navy-800">{d.nom}</p>
                        <p className="truncate text-[10.5px] text-navy-400">{d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <Badge tone="neutral">{d.type_document}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <EnvoyerSignatureDialog
        open={showEnvoyer}
        onClose={() => setShowEnvoyer(false)}
        mandat={mandat}
        compte={compte}
        compteurs={compteursDuMandat}
        contact={contactSignataire}
      />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Supprimer ce mandat ?"
        description="Cette action est irréversible. Les recommandations et documents liés à ce mandat ne seront pas supprimés mais perdront leur lien à ce mandat."
      >
        {suppression.erreur && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{suppression.erreur}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { suppression.reinitialiser(); setConfirmDelete(false) }}>Annuler</Button>
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={suppression.enCours} onClick={handleDelete}>
                {suppression.enCours ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
        </div>
      </Dialog>

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}
