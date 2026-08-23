import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Target, Plus, Check, AlertTriangle, Building2, User, MapPin, Gauge, FileSignature } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { WizardConnectionGate } from '@/components/ui/connection-gate'
import { FormField, Select, Textarea } from '@/components/ui/form'
import { InlineField } from '@/components/ui/inline-field'
import { EntityLink } from '@/components/ui/entity-link'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { FriseStatut } from '@/components/opportunite/FriseStatut'
import {
  prerequisOpportunite,
  statutDerive,
  PIPELINE_OPPORTUNITE,
  useOpportunite,
  useMajOpportunite,
  useMajPerimetreOpportunite,
  useStatutsOpportunites,
  ORIGINES_OPPORTUNITE,
  QUALIFICATIONS_FIN,
  type PatchOpportunite,
} from '@/lib/data/opportunites'
import { useSitesParCompte } from '@/lib/data/sites'
import { useCompteurs } from '@/lib/data/compteurs'
import { useContacts } from '@/lib/data/contacts'
import { useMandats } from '@/lib/data/mandats'
import { MandatWizard } from '@/components/mandat/MandatWizard'
import { useRecommandationsListe } from '@/lib/data/recommandations'
import { cn } from '@/lib/utils'
import type { Opportunite } from '@/types/domain'

/**
 * La fiche Opportunité, d'après la maquette « Fiche Opportunite » du 23/08/2026.
 *
 * CE QUE LA MAQUETTE APPORTE ET QUE JE N'AURAIS PAS DEVINÉ : le mandat vérifié CONTRE le périmètre
 * (« le périmètre entier est couvert » ou « un nouveau mandat doit être créé et envoyé à… »), le bloc
 * qui liste ce qui manque, et la règle de conversion affichée là où elle s'applique —
 * « une recommandation ne se crée qu'une fois l'opportunité qualifiée en Convertie ».
 *
 * PAS DE SCORE, ET CE N'EST PLUS UNE ATTENTE. La maquette décrivait une jauge — points par nature du
 * déclencheur × urgence, décote journalière. Michel a tranché le 23/08/2026 : « je ne préfère pas
 * utiliser le concept de score pour le moment, ça va nous embrouiller. Je préfère qu'on gère des
 * scores uniquement un peu plus tard, avec de l'historique. » Et il donne la mesure qui la remplace :
 * « la maturité se fait si les objets sont valides : un signal positif, un contact, un compte et des
 * compteurs avec des mandats, un accord ». La maturité n'est donc plus un chiffre mais une liste de
 * cases, celle-là même qui commande la conversion : un seul bloc, pas deux.
 */

export default function OpportuniteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: opportunite, isLoading } = useOpportunite(id)
  const { data: statuts } = useStatutsOpportunites()
  const { data: contacts } = useContacts()
  const { data: compteurs } = useCompteurs()
  const { data: mandats } = useMandats()
  const { data: recommandations } = useRecommandationsListe()
  const { data: sitesDuCompte } = useSitesParCompte(opportunite?.compte_id ?? undefined)
  const maj = useMajOpportunite()
  const majPerimetre = useMajPerimetreOpportunite()

  const [toast, setToast] = useState<string | null>(null)
  const [clotureOuverte, setClotureOuverte] = useState(false)
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  // « On peut lancer la demande de mandat depuis l'opportunité » (Michel, 23/08/2026). Le bouton
  // renvoyait sur la fiche compte, ce qui faisait perdre le périmètre qu'on vient d'établir.
  const [mandatOuvert, setMandatOuvert] = useState(false)
  const [onglet, setOnglet] = useState<'opportunite' | 'fichiers' | 'historique'>('opportunite')

  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  async function majOpp(patch: PatchOpportunite) {
    if (!opportunite) return
    await maj.mutateAsync({ id: opportunite.id, patch })
  }

  const retourInline = {
    onSaved: () => signaler('✓ Enregistré'),
    onError: (e: Error) => signaler(e.message),
  }

  // LE MÊME CALCUL QUE LA LISTE, ET AU MÊME ENDROIT. Prérequis, couverture du mandat et palier du
  // pipeline sortent de `prerequisOpportunite` et `statutDerive` : deux copies auraient fini par
  // afficher deux états différents du même dossier.
  const bilan = useMemo(
    () => (opportunite ? prerequisOpportunite(opportunite, mandats ?? []) : null),
    [opportunite, mandats],
  )
  const palier = useMemo(
    () => (opportunite ? statutDerive(opportunite, mandats ?? []) : null),
    [opportunite, mandats],
  )
  const couverture = {
    mandat: bilan?.mandat ?? null,
    couverts: bilan?.couverts ?? [],
    manquants: bilan?.manquantsDuMandat ?? [],
  }
  const mandatCouvre = bilan?.mandatCouvre ?? false
  const listePrerequis = bilan?.liste ?? []
  const manquants = bilan?.manquants ?? []
  const convertie = opportunite?.qualification_fin === 'CONVERTIE'

  const recosLiees = useMemo(
    () => (recommandations ?? []).filter((r) => opportunite?.recommandation_ids.includes(r.id)),
    [recommandations, opportunite],
  )

  const compteursDuPerimetre = useMemo(
    () => (compteurs ?? []).filter((c) => opportunite?.compteur_ids.includes(c.id)),
    [compteurs, opportunite],
  )

  // LE PÉRIMÈTRE EN ARBRE, comme dans la maquette : l'immeuble porte ses compteurs. Un compteur du
  // périmètre dont le site n'est pas retenu est affiché à part plutôt que caché — sinon on ne
  // comprendrait pas pourquoi le décompte ne tombe pas juste.
  const sitesDuPerimetre = useMemo(
    () => (sitesDuCompte ?? []).filter((st) => opportunite?.site_ids.includes(st.id)),
    [sitesDuCompte, opportunite],
  )
  const compteursHorsSite = useMemo(
    () => compteursDuPerimetre.filter((c) => !opportunite?.site_ids.includes(c.site_id ?? '')),
    [compteursDuPerimetre, opportunite],
  )
  const compteursParSite = (siteId: string) => compteursDuPerimetre.filter((c) => c.site_id === siteId)

  // Une échéance dépassée et non faite : c'est ce qui fait passer la carte au rouge.
  const enRetard = Boolean(
    opportunite?.prochaine_action_echeance &&
      !opportunite.prochaine_action_faite_le &&
      new Date(opportunite.prochaine_action_echeance) < new Date(),
  )

  async function retirer(table: 'sites' | 'compteurs', cible: string, libelle: string) {
    if (!opportunite) return
    try {
      await majPerimetre.mutateAsync({ opportuniteId: opportunite.id, table, action: 'retirer', cibleId: cible })
      signaler('✓ ' + libelle + ' retiré du périmètre')
    } catch (e) {
      signaler(e instanceof Error ? e.message : 'Retrait impossible')
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar title="Opportunité" />
        <div className="p-6 text-sm text-navy-400">Chargement…</div>
      </div>
    )
  }
  if (!opportunite) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <Topbar title="Opportunité" />
        <div className="p-6">
          <p className="text-sm text-navy-500">Cette opportunité n'existe pas ou n'est pas visible.</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate('/opportunites')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Retour aux opportunités
          </Button>
        </div>
      </div>
    )
  }

  const origine = ORIGINES_OPPORTUNITE.find((o) => o.code === opportunite.origine)
  const contact = (contacts ?? []).find((c) => c.id === opportunite.contact_id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Opportunité" crumb={opportunite.compte_nom || 'Opportunité'} />

      {/* ══ BANDEAU D'IDENTITÉ ══
          Relevé dans le fichier source de William : pastille de 40 px au dégradé magenta, référence
          en JetBrains Mono à 20 px, l'origine en pastille magenta cliquable, le type en pastille
          neutre, puis le compte et le résumé du périmètre en seconde ligne. À droite, le
          propriétaire et les dates dans un cartouche. */}
      <div className="flex flex-none flex-wrap items-center gap-4 border-b border-kw-border bg-white px-4 pb-3 pt-3.5 lg:px-6">
        <button
          type="button"
          onClick={() => navigate('/opportunites')}
          className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
          title="Retour aux opportunités"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-opp-600 to-opp-400 text-white shadow-[0_4px_12px_rgba(168,49,127,.28)]">
          <Target className="h-[19px] w-[19px]" strokeWidth={2.1} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[20px] font-bold tracking-tight text-navy-800">
              {opportunite.reference || 'Sans référence'}
            </span>
            <InlineField
              variant="select"
              label=""
              emptyLabel="origine à préciser"
              value={opportunite.origine ?? ''}
              options={ORIGINES_OPPORTUNITE.map((o) => ({ value: o.code, label: o.libelle }))}
              onCommit={(v) => majOpp({ origine: v || null })}
              className="inline-flex rounded-xl border border-opp-200 bg-opp-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-opp-600"
              {...retourInline}
            />
            <InlineField
              variant="text"
              label=""
              emptyLabel="type à préciser"
              value={opportunite.type_opportunite ?? ''}
              onCommit={(v) => majOpp({ type_opportunite: v.trim() || null })}
              className="inline-flex rounded-xl border border-kw-border bg-navy-50 px-2.5 py-0.5 text-[10px] font-bold text-navy-600"
              {...retourInline}
            />
            {opportunite.qualification_fin && (
              <Badge tone={convertie ? 'kiwi' : 'neutral'}>
                {QUALIFICATIONS_FIN.find((q) => q.code === opportunite.qualification_fin)?.libelle ?? opportunite.qualification_fin}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-navy-500">
            {opportunite.compte_id ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-sky-700">
                <Building2 className="h-3 w-3" />
                <EntityLink to={`/comptes/${opportunite.compte_id}`}>{opportunite.compte_nom}</EntityLink>
              </span>
            ) : (
              <span className="font-semibold text-amber-700">Compte à identifier</span>
            )}
            <span className="text-navy-200">·</span>
            <span>
              {opportunite.compteur_ids.length} compteur{opportunite.compteur_ids.length > 1 ? 's' : ''} ·{' '}
              {opportunite.site_ids.length} immeuble{opportunite.site_ids.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-none flex-col items-start gap-0.5 rounded-[10px] border border-kw-border-faint bg-kw-surface px-3 py-1.5">
          <span className="text-[10px] font-bold text-navy-600">
            {opportunite.proprietaire_nom || 'Sans propriétaire'}
          </span>
          <span className="whitespace-nowrap font-mono text-[9px] text-navy-400">
            Créée {new Date(opportunite.date_creation).toLocaleDateString('fr-FR')} · Modifiée{' '}
            {new Date(opportunite.date_modification).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </div>

      {/* ══ ONGLETS ══ Opportunité · Fichiers · Historique, comme la maquette. */}
      <div className="flex flex-none items-center gap-0.5 border-b border-kw-border bg-white px-4 pt-2.5 lg:px-6">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1.5 text-[12.5px] transition-colors',
              onglet === o.cle
                ? 'border-opp-500 font-bold text-navy-800'
                : 'border-transparent font-medium text-navy-500 hover:text-navy-700',
            )}
          >
            {o.libelle}
            {o.cle === 'historique' && null}
          </button>
        ))}
        <span className="ml-auto hidden font-mono text-[10px] text-navy-300 sm:block">1–3 pour naviguer</span>
      </div>

      {/* ══ TROIS COLONNES ══ 256 / reste / 300, les largeurs de la maquette. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[256px_minmax(0,1fr)_300px]">

        {/* ── COLONNE GAUCHE : les objets rattachés ── */}
        <div className="min-h-0 space-y-3 overflow-y-auto border-r border-kw-border bg-kw-subtle p-3.5 lg:block">
          <BlocLateral
            titre="Compte"
            couleurIcone="bg-sky-100 text-sky-700"
            icone={<Building2 className="h-[11px] w-[11px]" />}
            lien={opportunite.compte_id ? `/comptes/${opportunite.compte_id}` : undefined}
            couleurLien="text-sky-700"
          >
            {opportunite.compte_id ? (
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-100 text-[9.5px] font-bold text-sky-700">
                  {(opportunite.compte_nom || '?').slice(0, 2).toUpperCase()}
                </span>
                <EntityLink to={`/comptes/${opportunite.compte_id}`}>{opportunite.compte_nom}</EntityLink>
              </div>
            ) : (
              <p className="text-[11px] text-navy-500">À identifier — c'est un prérequis de conversion.</p>
            )}
          </BlocLateral>

          <BlocLateral
            titre="Contact principal"
            couleurIcone="bg-violet-100 text-violet-500"
            icone={<User className="h-[11px] w-[11px]" />}
            lien={contact ? `/contacts/${contact.id}` : undefined}
            couleurLien="text-violet-500"
          >
            {contact ? (
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-[11px] font-bold text-white">
                  {`${contact.prenom[0] ?? ''}${contact.nom[0] ?? ''}`.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <EntityLink to={`/contacts/${contact.id}`}>{contact.prenom} {contact.nom}</EntityLink>
                  {contact.fonction && <p className="truncate text-[10px] text-navy-400">{contact.fonction}</p>}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-navy-500">À identifier — c'est un prérequis de conversion.</p>
            )}
          </BlocLateral>

          {/* LE PÉRIMÈTRE EN ARBRE, comme la maquette : l'immeuble, puis ses compteurs indentés
              derrière un filet, chacun avec sa croix pour sortir du périmètre. */}
          <BlocLateral
            titre="Périmètre"
            couleurIcone="bg-indigo-50 text-indigo-600"
            icone={<Gauge className="h-[11px] w-[11px]" />}
            compteur={opportunite.site_ids.length + opportunite.compteur_ids.length}
          >
            {sitesDuPerimetre.length === 0 && compteursHorsSite.length === 0 ? (
              <p className="text-[11px] text-navy-500">
                Aucun site ni compteur. Ajoutez-en au moins un : c'est un prérequis de conversion.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {sitesDuPerimetre.map((site) => (
                  <div key={site.id}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-kiwi-50 text-kiwi-700">
                        <MapPin className="h-2.5 w-2.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold">
                        <EntityLink to={`/sites/${site.id}`}>{site.nom}</EntityLink>
                      </span>
                      <button
                        type="button"
                        onClick={() => retirer('sites', site.id, site.nom)}
                        title="Retirer du périmètre"
                        className="shrink-0 px-0.5 text-[11px] text-navy-300 hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                    <div className="ml-[7px] flex flex-col gap-0.5 border-l-[1.5px] border-kw-border-faint pl-2">
                      {compteursParSite(site.id).map((c) => (
                        <LigneCompteur
                          key={c.id}
                          compteur={c}
                          horsMandat={couverture.manquants.includes(c.id)}
                          onRetirer={() => retirer('compteurs', c.id, c.numero_pdl)}
                        />
                      ))}
                      {compteursParSite(site.id).length === 0 && (
                        <p className="py-0.5 text-[10px] text-navy-400">aucun compteur retenu</p>
                      )}
                    </div>
                  </div>
                ))}
                {compteursHorsSite.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {compteursHorsSite.map((c) => (
                      <LigneCompteur
                        key={c.id}
                        compteur={c}
                        horsMandat={couverture.manquants.includes(c.id)}
                        onRetirer={() => retirer('compteurs', c.id, c.numero_pdl)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            {opportunite.compte_id && (
              <button
                type="button"
                onClick={() => setAjoutOuvert(true)}
                className="mt-2 text-[11px] font-bold text-indigo-600 hover:underline"
              >
                ＋ Ajouter au périmètre
              </button>
            )}
          </BlocLateral>

          {/* LE MANDAT, VÉRIFIÉ CONTRE LE PÉRIMÈTRE — l'apport de la maquette : la question n'est
              pas « y a-t-il un mandat » mais « le périmètre est-il couvert ». */}
          <BlocLateral
            titre="Mandat"
            couleurIcone={mandatCouvre ? 'bg-kiwi-50 text-kiwi-700' : 'bg-amber-100 text-amber-700'}
            icone={<FileSignature className="h-[11px] w-[11px]" />}
            badge={mandatCouvre ? 'couvert' : couverture.mandat ? 'partiel' : 'absent'}
            badgeTon={mandatCouvre ? 'kiwi' : 'amber'}
          >
            {couverture.mandat ? (
              <>
                <p className="text-[11px] text-navy-700">
                  <EntityLink to={`/mandats/${couverture.mandat.id}`}>
                    {couverture.mandat.id_salesforce || 'Mandat actif'}
                  </EntityLink>
                  {couverture.mandat.date_fin_validite && (
                    <span className="block text-[10px] text-navy-400">
                      valide jusqu'au {new Date(couverture.mandat.date_fin_validite).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </p>
                {couverture.manquants.length > 0 && (
                  <p className="mt-1 text-[10.5px] font-semibold leading-snug text-amber-800">
                    {couverture.manquants.length} compteur{couverture.manquants.length > 1 ? 's' : ''} non couvert
                    {couverture.manquants.length > 1 ? 's' : ''} — un nouveau mandat doit être envoyé à{' '}
                    {contact ? `${contact.prenom} ${contact.nom}` : 'au signataire'}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] leading-snug text-navy-500">
                {opportunite.compte_id
                  ? 'Aucun mandat actif sur ce compte.'
                  : "Le compte n'est pas identifié : la couverture ne peut pas être vérifiée."}
              </p>
            )}
            {opportunite.compte_id && !mandatCouvre && (
              <button
                type="button"
                onClick={() => setMandatOuvert(true)}
                className="mt-2 text-[11px] font-bold text-opp-500 hover:underline"
              >
                ＋ Lancer la demande de mandat
              </button>
            )}
          </BlocLateral>
        </div>

        {/* ── COLONNE CENTRALE ── */}
        <div className="min-h-0 overflow-y-auto p-3.5 lg:px-5">
          {onglet === 'opportunite' && (
            <div className="flex animate-kw-fade-slide flex-col gap-3.5">

              {/* BANDEAU INCOMPLET — les manquants en pastilles tiretées, comme la maquette. */}
              {manquants.length > 0 && (
                <div className="flex items-center gap-3 rounded-xl border-[1.5px] border-amber-200 border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50 to-white px-3.5 py-2.5">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-amber-100 p-1 text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-amber-800">Opportunité incomplète</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {manquants.map((m) => (
                        <span
                          key={m.cle}
                          className="rounded-md border border-dashed border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-700"
                        >
                          {m.libelle}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* LA FRISE DE STATUT */}
              <Card className="px-4 pb-2.5 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">
                    Statut de l'opportunité
                  </p>
                  <span className="flex-1" />
                  {!opportunite.qualification_fin && manquants.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setClotureOuverte(true)}
                      className="rounded-lg border-[1.5px] border-opp-500 bg-opp-50 px-3 py-1.5 text-[11px] font-bold text-navy-800 transition-colors hover:bg-opp-100"
                    >
                      Qualifier la clôture… ▾
                    </button>
                  )}
                </div>
                <FriseStatut
                  jalons={PIPELINE_OPPORTUNITE.map((p) => ({ code: p.code, libelle: p.libelle }))}
                  courant={palier?.code ?? 'NOUVELLE'}
                  finalite={
                    opportunite.qualification_fin
                      ? {
                          libelle: QUALIFICATIONS_FIN.find((q) => q.code === opportunite.qualification_fin)?.libelle ?? '',
                          perdue: !convertie,
                        }
                      : null
                  }
                />
                <p className="border-t border-kw-border-faint pt-2 text-[11px] text-navy-500">
                  <span className="font-semibold text-navy-700">{palier?.libelle}</span> — {palier?.tache}
                </p>
                {opportunite.motif_cloture && (
                  <div className="mt-2 flex items-start gap-2 border-t border-kw-border-faint pt-2">
                    <span className="shrink-0 pt-px text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-navy-400">
                      Motif
                    </span>
                    <span className="text-[11.5px] leading-relaxed text-navy-700">{opportunite.motif_cloture}</span>
                  </div>
                )}
              </Card>

              {/* LA MATURITÉ — l'anneau de la maquette, mais il compte des objets valides et non des
                  points : Michel a écarté le score le 23/08/2026. */}
              <Card className="p-4">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">
                  Maturité de l'opportunité
                </p>
                <div className="grid grid-cols-1 items-center gap-5 pt-1.5 sm:grid-cols-[270px_minmax(0,1fr)]">
                  <div className="flex items-center gap-3.5">
                    <AnneauMaturite valides={listePrerequis.length - manquants.length} total={listePrerequis.length} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-bold leading-snug text-navy-800">
                        {manquants.length === 0 ? 'Prête à convertir' : `${manquants.length} objet${manquants.length > 1 ? 's' : ''} à réunir`}
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-navy-500">
                        La maturité se lit à la validité des objets, pas à un score.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 border-navy-50 sm:border-l sm:pl-5">
                    {listePrerequis.map((p) => (
                      <div key={p.cle} className="flex items-center gap-2">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            p.ok ? 'bg-kiwi-600' : 'bg-amber-400',
                          )}
                        />
                        <span className={cn('min-w-0 flex-1 text-[10.5px]', p.ok ? 'text-navy-600' : 'font-semibold text-navy-800')}>
                          {p.libelle}
                        </span>
                        <span className={cn('font-mono text-[10px] font-bold', p.ok ? 'text-kiwi-700' : 'text-amber-600')}>
                          {p.ok ? 'ok' : 'à faire'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {!opportunite.accord_client && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={async () => {
                      await majOpp({ accord_client: true })
                      signaler("✓ Accord du client noté")
                    }}
                  >
                    <Check className="h-3.5 w-3.5" /> Noter l'accord du client
                  </Button>
                )}
              </Card>

              {/* LA PROCHAINE ACTION — carte dédiée, avec l'échéance en pastille et les deux
                  boutons de la maquette. */}
              <Card className={cn('p-4', enRetard && 'border-red-200 bg-red-50/40')}>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                    <Check className="h-3 w-3" />
                  </span>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">Prochaine action</p>
                  <span className="flex-1" />
                  {opportunite.prochaine_action_echeance && (
                    <span
                      className={cn(
                        'rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold',
                        enRetard
                          ? 'border-red-200 bg-red-100 text-red-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700',
                      )}
                    >
                      échéance {new Date(opportunite.prochaine_action_echeance).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <LigneAction libelle="Action">
                    <InlineField
                      variant="text"
                      label=""
                      emptyLabel="aucune action prévue"
                      value={opportunite.prochaine_action ?? ''}
                      onCommit={(v) => majOpp({ prochaine_action: v.trim() || null, prochaine_action_faite_le: null })}
                      {...retourInline}
                    />
                  </LigneAction>
                  <LigneAction libelle="Échéance">
                    <InlineField
                      variant="date"
                      label=""
                      emptyLabel="sans échéance"
                      value={opportunite.prochaine_action_echeance?.slice(0, 10) ?? null}
                      onCommit={(v) => majOpp({ prochaine_action_echeance: v || null })}
                      {...retourInline}
                    />
                  </LigneAction>
                  <LigneAction libelle="Responsable">
                    <span className="text-xs text-navy-700">{opportunite.proprietaire_nom || '—'}</span>
                  </LigneAction>
                </div>
                {opportunite.prochaine_action && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-kw-border-faint pt-2.5">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await majOpp({ prochaine_action_faite_le: new Date().toISOString() })
                        signaler('✓ Action marquée faite')
                      }}
                    >
                      <Check className="h-3.5 w-3.5" /> Marquer fait
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        // Reprogrammer, c'est repousser d'une semaine : le geste le plus courant, et
                        // celui que la maquette met derrière ce bouton.
                        const base = opportunite.prochaine_action_echeance
                          ? new Date(opportunite.prochaine_action_echeance)
                          : new Date()
                        base.setDate(base.getDate() + 7)
                        await majOpp({ prochaine_action_echeance: base.toISOString().slice(0, 10), prochaine_action_faite_le: null })
                        signaler('✓ Reportée d’une semaine')
                      }}
                    >
                      ↻ Reprogrammer
                    </Button>
                  </div>
                )}
                {opportunite.prochaine_action_faite_le && (
                  <p className="mt-2 text-[10.5px] text-kiwi-700">
                    Faite le {new Date(opportunite.prochaine_action_faite_le).toLocaleDateString('fr-FR')}.
                  </p>
                )}
              </Card>

              {/* LES RECOMMANDATIONS LIÉES, ET LA RÈGLE DE CONVERSION */}
              <Card className="p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">
                    Recommandations liées
                  </p>
                  <Badge tone="neutral">{recosLiees.length}</Badge>
                </div>
                {recosLiees.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {recosLiees.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-kw-border-faint px-3 py-2">
                        <EntityLink to={`/recommandations/${r.id}`}>{r.titre || 'Recommandation'}</EntityLink>
                        <span className="text-[10.5px] text-navy-400">{r.etape}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-navy-500">
                    Une recommandation ne se crée qu'une fois l'opportunité qualifiée en{' '}
                    <strong className="font-semibold text-navy-700">Convertie</strong>.
                    {manquants.length > 0 && (
                      <> Il reste {manquants.length} élément{manquants.length > 1 ? 's' : ''} à rassembler.</>
                    )}
                  </p>
                )}
              </Card>

              <Card className="p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">Commentaire</p>
                <InlineField
                  variant="longtext"
                  label=""
                  emptyLabel="aucun"
                  value={opportunite.commentaire ?? ''}
                  onCommit={(v: string) => majOpp({ commentaire: v.trim() || null })}
                  {...retourInline}
                />
                {(opportunite.signal_libelle || opportunite.signal_id) && (
                  <p className="mt-3 border-t border-kw-border-faint pt-2 text-[11px] text-navy-500">
                    <span className="font-bold uppercase tracking-wide text-opp-500">Signal</span>{' '}
                    {opportunite.signal_libelle ?? 'signal enregistré'}
                  </p>
                )}
              </Card>
            </div>
          )}

          {onglet === 'historique' && (
            <div className="animate-kw-fade-slide">
              <Card className="p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">
                  Historique des modifications
                </p>
                <HistoriqueDiscret tableNom="opportunites" ligneId={opportunite.id} />
              </Card>
            </div>
          )}

          {onglet === 'fichiers' && (
            <div className="animate-kw-fade-slide">
              <Card className="p-4">
                <p className="text-xs text-navy-500">
                  Les fichiers d'une opportunité ne sont pas encore branchés : ils vivent aujourd'hui
                  sur le compte, le mandat et le contrat. L'onglet existe pour ne pas laisser croire
                  qu'il manque, et attend d'être relié.
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* ── COLONNE DROITE : le flux d'actualité ── */}
        <div className="hidden min-h-0 flex-col border-l border-kw-border bg-white lg:flex">
          <div className="flex flex-none items-center gap-2 px-4 pb-2 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">Flux d'actualité</p>
          </div>

          {/* L'ORIGINE ÉPINGLÉE, avec le halo magenta de la maquette. */}
          <div className="relative mx-3 mb-2.5 flex-none overflow-hidden rounded-xl border-[1.5px] border-opp-200 bg-gradient-to-br from-opp-50 to-white px-3 py-2.5">
            <span className="absolute -right-3.5 -top-3.5 h-[52px] w-[52px] rounded-full bg-[radial-gradient(circle,rgba(168,49,127,.13),transparent_70%)]" />
            <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.07em] text-opp-500">
              📌 Origine de l'opportunité
            </p>
            <div className="flex items-start gap-2">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-opp-600 to-opp-400 p-1 text-white">
                <Target className="h-3 w-3" />
              </span>
              <div className="min-w-0">
                <p className="text-[11.5px] font-bold leading-snug text-navy-800">
                  {opportunite.signal_libelle || origine?.libelle || 'Origine à préciser'}
                </p>
                <p className="mt-0.5 font-mono text-[9.5px] text-navy-400">
                  {new Date(opportunite.date_creation).toLocaleDateString('fr-FR')} ·{' '}
                  {new Date(opportunite.date_creation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <HistoriqueDiscret tableNom="opportunites" ligneId={opportunite.id} />
          </div>
        </div>
      </div>
      {clotureOuverte && (
        <DialogCloture
          opportunite={opportunite}
          statutClotureId={statuts?.find((s) => s.code === 'CLOTUREE')?.id ?? null}
          onFermer={() => setClotureOuverte(false)}
          onValide={(m) => { setClotureOuverte(false); signaler(m) }}
          majOpp={majOpp}
        />
      )}

      {/* L'ASSISTANT MANDAT, LANCÉ DEPUIS L'OPPORTUNITÉ. Pré-rempli avec le contact de
          l'opportunité et les compteurs du périmètre QUI NE SONT PAS COUVERTS : ce sont eux qui
          motivent la demande, et les ressaisir serait le moyen de se tromper. L'assistant crée le
          mandat puis ouvre le brouillon DocuSign pour vérification avant envoi. */}
      <Dialog
        open={mandatOuvert && Boolean(opportunite.compte_id)}
        onClose={() => setMandatOuvert(false)}
        title="Demande de mandat"
        description="Le mandat autorise KiWee à intervenir sur le périmètre de cette opportunité. Le contact et les compteurs non couverts sont déjà sélectionnés."
        className="max-w-2xl"
      >
        {/* MONTÉ SEULEMENT À L'OUVERTURE : l'assistant appelle six tables entières. Et enveloppé
            dans un Dialog, parce qu'il rend un simple div — monté nu, son contenu était bien dans
            le DOM mais invisible à l'écran (constaté sur kimatch.fr). La garde de connexion évite
            de remplir quatre étapes pour échouer sur DocuSign à la fin. */}
        {mandatOuvert && opportunite.compte_id && (
          <WizardConnectionGate required={['crm', 'docusign']} feature="demande de mandat">
            <MandatWizard
              compteId={opportunite.compte_id}
              contactInitialId={opportunite.contact_id ?? undefined}
              compteursInitiaux={couverture.manquants.length > 0 ? couverture.manquants : opportunite.compteur_ids}
              onClose={() => setMandatOuvert(false)}
              onCree={() => signaler('✓ Mandat créé — ouverture de DocuSign')}
            />
          </WizardConnectionGate>
        )}
      </Dialog>

      {ajoutOuvert && opportunite.compte_id && (
        <DialogAjoutPerimetre
          opportunite={opportunite}
          onFermer={() => setAjoutOuvert(false)}
          onAjoute={(m) => signaler(m)}
        />
      )}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * Un bloc de la colonne de gauche, au format de la maquette : pastille d'icône colorée à la teinte
 * de l'objet, intitulé en petites capitales espacées, puis à droite le compteur, le badge ou le lien
 * « ouvrir → ». C'est ce gabarit répété qui donne à la colonne son unité.
 */
function BlocLateral({ titre, icone, couleurIcone, lien, couleurLien, compteur, badge, badgeTon, children }: {
  titre: string
  icone: React.ReactNode
  couleurIcone: string
  lien?: string
  couleurLien?: string
  compteur?: number
  badge?: string
  badgeTon?: 'kiwi' | 'amber'
  children: React.ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="rounded-[11px] border border-kw-border bg-white px-3.5 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', couleurIcone)}>
          {icone}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">{titre}</span>
        <span className="flex-1" />
        {typeof compteur === 'number' && (
          <span className="rounded-[5px] bg-indigo-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-indigo-600">
            {compteur}
          </span>
        )}
        {badge && (
          <span
            className={cn(
              'rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-extrabold',
              badgeTon === 'kiwi' ? 'bg-kiwi-50 text-kiwi-700' : 'bg-amber-100 text-amber-700',
            )}
          >
            {badge}
          </span>
        )}
        {lien && (
          <button
            type="button"
            onClick={() => navigate(lien)}
            className={cn('text-[10.5px] font-semibold hover:underline', couleurLien ?? 'text-kiwi-700')}
          >
            ouvrir →
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

/** Un compteur du périmètre : son PDL en chiffres fixes, son énergie, et la croix pour l'en sortir. */
function LigneCompteur({ compteur, horsMandat, onRetirer }: {
  compteur: { id: string; numero_pdl: string; type_energie: string }
  horsMandat: boolean
  onRetirer: () => void
}) {
  const gaz = compteur.type_energie === 'gaz'
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span
        className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] text-[7px] font-extrabold',
          gaz ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700',
        )}
      >
        {gaz ? 'G' : 'E'}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] font-semibold">
        <EntityLink to={`/compteurs/${compteur.id}`}>{compteur.numero_pdl}</EntityLink>
      </span>
      {horsMandat && (
        <span className="shrink-0 rounded-[4px] bg-amber-100 px-1 text-[8.5px] font-extrabold text-amber-700">
          hors mandat
        </span>
      )}
      <button
        type="button"
        onClick={onRetirer}
        title="Retirer du périmètre"
        className="shrink-0 px-0.5 text-[11px] text-navy-300 hover:text-red-600"
      >
        ×
      </button>
    </div>
  )
}

/**
 * L'anneau de la maquette, mais il compte des OBJETS VALIDES et non des points.
 *
 * William dessinait un score sur 100 dans un anneau de 78 px. Michel a écarté le score le
 * 23/08/2026 ; l'anneau reste, parce qu'il donne d'un coup d'œil l'avancement, et il porte
 * maintenant « 3 / 6 objets ». Le tracé est un cercle SVG dont on découpe la circonférence : plus
 * lisible qu'un dégradé conique, et net à toutes les tailles.
 */
function AnneauMaturite({ valides, total }: { valides: number; total: number }) {
  const rayon = 33
  const circonference = 2 * Math.PI * rayon
  const part = total > 0 ? valides / total : 0
  const complet = valides === total && total > 0
  return (
    <div className="relative h-[78px] w-[78px] shrink-0">
      <svg viewBox="0 0 78 78" className="h-full w-full -rotate-90">
        <circle cx="39" cy="39" r={rayon} fill="none" stroke="#f0efec" strokeWidth="7" />
        <circle
          cx="39"
          cy="39"
          r={rayon}
          fill="none"
          stroke={complet ? '#0d7a5f' : '#a8317f'}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${circonference * part} ${circonference}`}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-mono text-[19px] font-extrabold leading-none', complet ? 'text-kiwi-700' : 'text-opp-500')}>
          {valides}
        </span>
        <span className="font-mono text-[10px] text-navy-400">/ {total}</span>
      </div>
    </div>
  )
}

/** Une ligne de la carte « prochaine action » : intitulé fixe à gauche, valeur modifiable à droite. */
function LigneAction({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-[74px] shrink-0 pt-1 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-navy-400">
        {libelle}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Les trois onglets de la maquette. */
const ONGLETS = [
  { cle: 'opportunite' as const, libelle: 'Opportunité' },
  { cle: 'fichiers' as const, libelle: 'Fichiers' },
  { cle: 'historique' as const, libelle: 'Historique' },
]

function DialogCloture({ opportunite, statutClotureId, onFermer, onValide, majOpp }: {
  opportunite: Opportunite
  statutClotureId: string | null
  onFermer: () => void
  onValide: (message: string) => void
  majOpp: (patch: PatchOpportunite) => Promise<void>
}) {
  const [qualification, setQualification] = useState('')
  const [motif, setMotif] = useState('')
  const [reactivation, setReactivation] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const choisie = QUALIFICATIONS_FIN.find((q) => q.code === qualification)

  async function valider() {
    if (!qualification) return
    setEnCours(true)
    setErreur(null)
    try {
      await majOpp({
        qualification_fin: qualification,
        motif_cloture: motif.trim() || null,
        date_cloture: new Date().toISOString(),
        date_reactivation: qualification === 'REPORTEE' && reactivation ? reactivation : null,
        ...(statutClotureId ? { statut_id: statutClotureId } : {}),
      })
      onValide(choisie?.convertie
        ? '★ Opportunité convertie — vous pouvez créer une recommandation'
        : `Opportunité clôturée : ${choisie?.libelle}`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Clôture impossible')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Dialog open onClose={onFermer} title="Qualifier la clôture" description={opportunite.compte_nom}>
      <div className="space-y-3">
        <FormField label="Quelle qualification finale retenez-vous ?">
          <Select value={qualification} onChange={(e) => setQualification(e.target.value)}>
            <option value="">Choisir…</option>
            {QUALIFICATIONS_FIN.map((q) => <option key={q.code} value={q.code}>{q.libelle}</option>)}
          </Select>
        </FormField>
        {choisie?.convertie && (
          <p className="rounded-lg border border-kiwi-200 bg-kiwi-50 px-3 py-2 text-xs text-kiwi-800">
            Convertie ouvre la création d'une recommandation sur cette opportunité. C'est la seule
            qualification qui le permette.
          </p>
        )}
        <FormField label="Motif">
          <Textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} placeholder="Ce qui a décidé de l'issue…" />
        </FormField>
        {qualification === 'REPORTEE' && (
          <FormField label="Réactivation">
            <input
              type="date"
              value={reactivation}
              onChange={(e) => setReactivation(e.target.value)}
              className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm outline-none focus:border-kiwi-500"
            />
          </FormField>
        )}
        {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button type="button" onClick={valider} disabled={!qualification || enCours}>
            {enCours ? 'Clôture…' : 'Valider la clôture'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** L'ajout au périmètre : les sites et compteurs du compte, en un clic. */
function DialogAjoutPerimetre({ opportunite, onFermer, onAjoute }: {
  opportunite: Opportunite
  onFermer: () => void
  onAjoute: (message: string) => void
}) {
  const { data: sites } = useSitesParCompte(opportunite.compte_id ?? undefined)
  const { data: compteurs } = useCompteurs()
  const majPerimetre = useMajPerimetreOpportunite()
  const [erreur, setErreur] = useState<string | null>(null)

  const sitesDisponibles = (sites ?? []).filter((s) => !opportunite.site_ids.includes(s.id))
  const siteIdsDuCompte = new Set((sites ?? []).map((s) => s.id))
  const compteursDisponibles = (compteurs ?? []).filter(
    (c) => siteIdsDuCompte.has(c.site_id) && !opportunite.compteur_ids.includes(c.id),
  )

  async function ajouter(table: 'sites' | 'compteurs', cibleId: string, libelle: string) {
    setErreur(null)
    try {
      await majPerimetre.mutateAsync({ action: 'ajouter', table, opportuniteId: opportunite.id, cibleId })
      onAjoute(`✓ ${libelle} ajouté au périmètre`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  return (
    <Dialog open onClose={onFermer} title="Ajouter au périmètre" description={opportunite.compte_nom}>
      <div className="space-y-3">
        {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}

        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-navy-400">Sites</p>
          {sitesDisponibles.length === 0 ? (
            <p className="text-xs text-navy-400">Tous les sites du compte sont déjà dans le périmètre.</p>
          ) : (
            <div className="max-h-[160px] space-y-1 overflow-y-auto pr-1">
              {sitesDisponibles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => ajouter('sites', s.id, s.nom)}
                  className="flex w-full items-center gap-2 rounded-lg border border-navy-200 px-3 py-2 text-left text-xs hover:border-kiwi-300 hover:bg-navy-50"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-navy-400" />
                  <span className="min-w-0 flex-1 truncate font-medium text-navy-800">{s.nom}</span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-kiwi-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-navy-400">Compteurs</p>
          {compteursDisponibles.length === 0 ? (
            <p className="text-xs text-navy-400">Aucun compteur à ajouter.</p>
          ) : (
            <div className="max-h-[200px] space-y-1 overflow-y-auto pr-1">
              {compteursDisponibles.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => ajouter('compteurs', c.id, c.numero_pdl || 'Compteur')}
                  className="flex w-full items-center gap-2 rounded-lg border border-navy-200 px-3 py-2 text-left text-xs hover:border-kiwi-300 hover:bg-navy-50"
                >
                  <Gauge className="h-3.5 w-3.5 shrink-0 text-navy-400" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono font-medium text-navy-800">{c.numero_pdl || 'Sans PDL'}</span>
                    {c.site_nom && <span className="text-navy-400"> — {c.site_nom}</span>}
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-kiwi-600" />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-navy-400">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          Un compteur ajouté hors du mandat actif est signalé dans le périmètre : c'est ce qui déclenche
          la création d'un nouveau mandat.
        </p>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={onFermer}>Terminer</Button>
        </div>
      </div>
    </Dialog>
  )
}
