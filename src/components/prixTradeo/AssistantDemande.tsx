import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Send } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Select } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import {
  appelerBanc,
  chargerDossierKimatch,
  chargerMandatsActifs,
  messageErreur,
  useVersionsPourTradeo,
  type MandatDuCompteur,
} from '@/lib/data/tradeo'
import { compteursPourTradeo, manquesDemande, responsablePourTradeo, type CompteurTradeo, type DossierKimatch, type ResponsableTradeo } from '@/lib/tradeo/dossier'
import { lireOffresTradeo, type OffreTradeo } from '@/lib/tradeo/prixUnitaires'
import { EnteteEtapes, Explication, Ligne, PiedAssistant } from './assistant'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * « DEMANDER DES PRIX À TRADEO », EN CINQ ÉTAPES
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 29/09/2026 : l'ancien banc montrait tout à la fois — onglets, JSON, formulaires — et
 * Michel « ne comprenait rien ». Le même chemin, une étape par écran :
 *
 *   1. le dossier       une recherche, pas une liste ;
 *   2. vérifier          un récapitulatif ; le formulaire ne s'ouvre que si l'on veut corriger ;
 *   3. envoyer           UN clic : la demande ET la validation (c'étaient deux boutons) ;
 *   4. l'accord          Tradeo accepte chaque compteur ; on peut fermer et revenir ;
 *   5. les prix          un fournisseur par ligne, son prix, sans réponse brute.
 *
 * Les réponses brutes et le journal restent disponibles dans « Outils techniques », en bas de page.
 */

const TITRES = ['Le dossier', 'Vérifier', 'Envoyer', 'Accord de Tradeo', 'Les prix']

export interface DepartDemande {
  demandeId: number
  siret: string
  energie: 'ELEC' | 'GAZ'
}

export function AssistantDemande({ onFermer, depart }: { onFermer: () => void; depart?: DepartDemande }) {
  const [etape, setEtape] = useState(depart ? 3 : 0)
  const { data: versions } = useVersionsPourTradeo(true)

  const [dossier, setDossier] = useState<DossierKimatch | null>(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [siret, setSiret] = useState(depart?.siret ?? '')
  const [responsable, setResponsable] = useState<ResponsableTradeo>({ sex: '', nom: '', prenom: '', email: '', tele: '', fonction: '' })
  const [compteurs, setCompteurs] = useState<CompteurTradeo[]>([])
  const [mandats, setMandats] = useState<Map<string, MandatDuCompteur>>(new Map())
  const [sansMandat, setSansMandat] = useState<string[]>([])
  const [corriger, setCorriger] = useState(false)

  const [demandeId, setDemandeId] = useState<number | null>(depart?.demandeId ?? null)
  const [energie, setEnergie] = useState<'ELEC' | 'GAZ'>(depart?.energie ?? 'ELEC')
  const [enCours, setEnCours] = useState(false)

  async function choisirVersion(id: string | null) {
    setDossier(null)
    setErreur(null)
    if (!id) return
    setChargement(true)
    try {
      const d = await chargerDossierKimatch(id)
      const couverture = await chargerMandatsActifs(d.compteurs.map((c) => c.id))
      const tous = compteursPourTradeo(d)
      setDossier(d)
      setSiret((d.siret ?? '').replace(/\s/g, ''))
      setResponsable(responsablePourTradeo(d))
      setMandats(couverture)
      setCompteurs(tous.filter((c) => couverture.has(c.num_compteur)))
      setSansMandat(tous.filter((c) => !couverture.has(c.num_compteur)).map((c) => c.num_compteur || '(sans numéro)'))
      setEnergie(tous.some((c) => c.type === 'GAZ') && !tous.some((c) => c.type === 'ELEC') ? 'GAZ' : 'ELEC')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setChargement(false)
    }
  }

  const manques = dossier ? manquesDemande(siret, responsable, compteurs) : []
  const acd = useMemo(() => {
    for (const c of compteurs) {
      const m = mandats.get(c.num_compteur)
      if (m?.document_id) return m
    }
    return null
  }, [compteurs, mandats])

  async function envoyer() {
    setEnCours(true)
    setErreur(null)
    const r = await appelerBanc('creer_demande', {
      compteurs: compteurs.map((c) => ({ ...c, site: c.site || undefined })),
      dataSociete: { siret },
      dataResponsable: responsable,
      ...(acd?.document_id ? { acd_document_id: acd.document_id } : {}),
    })
    const id = (r.reponse as { demande_id?: number } | undefined)?.demande_id
    if (!r.ok || !id) {
      setErreur(messageErreur(r))
      setEnCours(false)
      return
    }
    setDemandeId(id)
    // La validation suit d'elle-même : sans elle, l'équipe Tradeo n'est pas prévenue et la demande dort.
    const v = await appelerBanc('demander_validation', { id_demande: id })
    if (!v.ok) setErreur(`Demande n° ${id} créée, mais Tradeo n’a pas été prévenu : ${messageErreur(v)}. Réessayez depuis « Vos demandes ».`)
    setEnCours(false)
    setEtape(3)
  }

  return (
    <Dialog open onClose={onFermer} title="Demander des prix à Tradeo" className="max-w-2xl">
      <EnteteEtapes titres={TITRES} courante={etape} />

      {etape === 0 && (
        <>
          <Explication>
            Choisissez le dossier pour lequel vous voulez des prix. Kimatch reprend de lui-même la société, le signataire et
            les compteurs.
          </Explication>
          <Label>Dossier</Label>
          <ChoixParRecherche
            items={(versions ?? []).map((v) => ({ ...v, id: v.version_id }))}
            valeur={dossier?.version_id ?? ''}
            onChoisir={(v) => void choisirVersion(v?.id ?? null)}
            placeholder="Tapez le nom du client ou du dossier…"
            principal={(v) => v.compte_nom ?? v.recommandation_nom}
            secondaire={(v) => `${v.recommandation_nom}${v.reco_etape === 'A_REACTIVER' ? ' · à réactiver' : ''}`}
            filtre={(v, q) => `${v.compte_nom ?? ''} ${v.recommandation_nom}`.toLowerCase().includes(q)}
            totalLibelle={`${versions?.length ?? '…'} dossiers ouverts`}
          />
          {chargement && <p className="mt-3 flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Lecture du dossier…</p>}
          {erreur && <p className="mt-3 text-km-red">{erreur}</p>}
          <PiedAssistant>
            <Button variant="primary" disabled={!dossier || chargement} onClick={() => setEtape(1)}>Suivant</Button>
          </PiedAssistant>
        </>
      )}

      {etape === 1 && dossier && (
        <>
          <Explication>
            Tradeo a besoin de ces informations. Vérifiez-les : seuls les compteurs couverts par un <strong>mandat actif</strong>{' '}
            partent, car sans mandat on n’a pas le droit de demander des prix.
          </Explication>
          {!corriger ? (
            <div className="rounded-km border border-km-line px-3">
              <Ligne libelle="Société">{dossier.compte_nom ?? '—'} <span className="font-mono text-km-label text-km-muted">{siret || 'SIRET manquant'}</span></Ligne>
              <Ligne libelle="Responsable">{[responsable.sex, responsable.prenom, responsable.nom].filter(Boolean).join(' ') || '—'}{responsable.fonction ? `, ${responsable.fonction}` : ''}</Ligne>
              <Ligne libelle="Compteurs">
                {compteurs.length === 0 ? <span className="text-km-red">aucun compteur sous mandat actif</span> : (
                  <span className="flex flex-wrap gap-1.5">
                    {compteurs.map((c) => (
                      <Badge key={c.num_compteur} tone="green" className="font-mono">✓ {c.num_compteur}</Badge>
                    ))}
                  </span>
                )}
              </Ligne>
              {sansMandat.length > 0 && <Ligne libelle="Écartés"><span className="text-km-red">sans mandat actif : {sansMandat.join(', ')}</span></Ligne>}
              <Ligne libelle="Autorisation">{acd ? <>le mandat <strong>{acd.mandat_reference}</strong> sera joint</> : <span className="text-km-amber">aucun mandat signé en PDF dans Kimatch</span>}</Ligne>
              <Ligne libelle="Période">{compteurs[0] ? `à partir du ${fr(compteurs[0].dateDebut)}, jusqu’au ${fr(compteurs[0].dateFin)}` : '—'}</Ligne>
            </div>
          ) : (
            <FormulaireCorrection siret={siret} setSiret={setSiret} responsable={responsable} setResponsable={setResponsable} compteurs={compteurs} setCompteurs={setCompteurs} />
          )}
          {manques.length > 0 && (
            <div className="mt-3 rounded-km bg-km-amber-soft px-3 py-2 text-km-body text-km-amber">
              <p className="font-semibold">À compléter avant d’envoyer :</p>
              <ul className="mt-1 list-disc pl-5">{manques.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          <PiedAssistant onRetour={() => setEtape(0)}>
            <Button onClick={() => setCorriger(!corriger)}>{corriger ? 'Voir le récapitulatif' : 'Corriger'}</Button>
            <Button variant="primary" disabled={manques.length > 0 || compteurs.length === 0} onClick={() => setEtape(2)}>Suivant</Button>
          </PiedAssistant>
        </>
      )}

      {etape === 2 && dossier && (
        <>
          <Explication>
            En cliquant sur <strong>Envoyer</strong>, la demande part chez Tradeo et leur équipe est prévenue par mail. Elle
            vérifiera chaque compteur avant de donner des prix.
          </Explication>
          <p className="text-km-body text-km-text">
            <strong>{dossier.compte_nom}</strong> · {compteurs.length} compteur{compteurs.length > 1 ? 's' : ''}
            {acd && <> · mandat {acd.mandat_reference} joint</>}
          </p>
          <p className="mt-2 text-km-label text-km-muted">Environnement de test de Tradeo (pré-production) : aucun client ni fournisseur n’est engagé.</p>
          {erreur && <p className="mt-3 flex items-start gap-2 text-km-red"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erreur}</p>}
          <PiedAssistant onRetour={() => setEtape(1)}>
            <Button variant="primary" disabled={enCours} onClick={() => void envoyer()}>
              {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer
            </Button>
          </PiedAssistant>
        </>
      )}

      {etape === 3 && demandeId && (
        <EtapeAccord demandeId={demandeId} erreur={erreur} onFermer={onFermer} onPrix={(s, e) => { setSiret(s); setEnergie(e); setEtape(4) }} />
      )}

      {etape === 4 && <EtapePrix siret={siret} energie={energie} onRetour={() => setEtape(3)} onFermer={onFermer} />}
    </Dialog>
  )
}

/* ── Étape 4 : l'accord de Tradeo ─────────────────────────────────────────────────────────────── */

interface DemandeLue {
  id: number
  type?: string
  societe?: { siret?: string; raison?: string }
  compteurs?: { id: number; status?: number; objetConsommation?: { numCompteur?: string } }[]
}

const STATUT: Record<number, { libelle: string; tone: 'amber' | 'green' | 'red' | 'neutral' }> = {
  0: { libelle: 'en attente', tone: 'amber' },
  1: { libelle: 'accepté', tone: 'green' },
  2: { libelle: 'refusé', tone: 'red' },
  3: { libelle: 'ACD expiré', tone: 'red' },
  4: { libelle: 'annulé', tone: 'neutral' },
}

function EtapeAccord({ demandeId, erreur, onFermer, onPrix }: { demandeId: number; erreur: string | null; onFermer: () => void; onPrix: (siret: string, energie: 'ELEC' | 'GAZ') => void }) {
  const [demande, setDemande] = useState<DemandeLue | null>(null)
  const [lecture, setLecture] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function verifier() {
    setLecture(true)
    setMessage(null)
    const r = await appelerBanc('mes_demandes', {
      pageNumber: 1,
      dataTable: { statusFilter: '', sortBy: null, draw: 1, length: 20, search: '', column: 0, dir: 'desc' },
    })
    const trouvee = ((r.reponse as { demandesCotations?: DemandeLue[] } | undefined)?.demandesCotations ?? []).find((d) => d.id === demandeId)
    setDemande(trouvee ?? null)
    if (!r.ok) setMessage(messageErreur(r))
    else if (!trouvee) setMessage('Tradeo ne montre pas encore cette demande. Réessayez dans un instant.')
    setLecture(false)
  }

  const acceptes = (demande?.compteurs ?? []).filter((c) => c.status === 1).length

  return (
    <>
      <Explication>
        Demande <strong>n° {demandeId}</strong> envoyée. L’équipe Tradeo vérifie maintenant chaque compteur : cela peut prendre
        quelques heures. Vous pouvez fermer cette fenêtre ; la demande reste dans « Vos demandes ».
      </Explication>
      {erreur && <p className="mb-3 text-km-amber">{erreur}</p>}
      {demande ? (
        <div className="rounded-km border border-km-line px-3">
          <Ligne libelle="Société">{demande.societe?.raison ?? '—'}</Ligne>
          <Ligne libelle="Compteurs">
            <span className="flex flex-col gap-1">
              {(demande.compteurs ?? []).map((c) => {
                const s = c.status !== undefined ? STATUT[c.status] : undefined
                return (
                  <span key={c.id} className="flex items-center gap-2">
                    <span className="font-mono text-km-label">{c.objetConsommation?.numCompteur ?? `#${c.id}`}</span>
                    <Badge tone={s?.tone ?? 'neutral'}>{s?.libelle ?? 'statut inconnu'}</Badge>
                  </span>
                )
              })}
            </span>
          </Ligne>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-km-muted"><Clock className="h-4 w-4" /> Cliquez sur « Vérifier maintenant » pour voir où en est Tradeo.</p>
      )}
      {message && <p className="mt-2 text-km-label text-km-muted">{message}</p>}
      <PiedAssistant>
        <Button onClick={onFermer}>Fermer, je reviendrai</Button>
        <Button onClick={() => void verifier()} disabled={lecture}>
          {lecture ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Vérifier maintenant
        </Button>
        <Button variant="primary" disabled={acceptes === 0 || !demande?.societe?.siret}
          onClick={() => onPrix(demande!.societe!.siret!, demande!.type === 'GAZ' ? 'GAZ' : 'ELEC')}>
          Voir les prix
        </Button>
      </PiedAssistant>
    </>
  )
}

/* ── Étape 5 : les prix ───────────────────────────────────────────────────────────────────────── */

const MARGE_MINIMALE = 2

function EtapePrix({ siret, energie, onRetour, onFermer }: { siret: string; energie: 'ELEC' | 'GAZ'; onRetour: () => void; onFermer: () => void }) {
  const [offres, setOffres] = useState<OffreTradeo[] | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function chercher() {
    setEnCours(true)
    setErreur(null)
    setOffres(null)
    try {
      const l = await appelerBanc('compteurs_par_siret', { siret, energie })
      const liste = ((l.reponse as { listCompteur?: { id: number; numCompteur: string; type?: string; parametreCompteur?: string }[] } | undefined)?.listCompteur ?? []).slice(0, 10)
      if (!l.ok || liste.length === 0) throw new Error(l.ok ? 'Aucun compteur accepté pour l’instant.' : messageErreur(l) ?? '')
      const c = await appelerBanc('consommation', { compteurData: liste })
      const parNum = (c.reponse as { compteur?: Record<string, { id: number; objetConsommation?: Record<string, unknown>; autreFournisseur?: unknown[] }> } | undefined)?.compteur
      if (!c.ok || !parNum) throw new Error(messageErreur(c) ?? 'Consommation illisible.')
      const compteur: Record<string, unknown> = {}
      for (const [num, x] of Object.entries(parNum)) {
        compteur[num] = { id: x.id, marge: MARGE_MINIMALE, objetConsommation: periodeAVenir(x.objetConsommation ?? {}), autreFournisseur: x.autreFournisseur ?? [] }
      }
      const r = await appelerBanc('calculer', { compteur })
      const lu = lireOffresTradeo(r.reponse)
      if (!r.ok && lu.offres.length === 0) throw new Error(messageErreur(r) ?? 'Tradeo n’a pas calculé.')
      if (lu.erreurs.length > 0 && lu.offres.length === 0) throw new Error(lu.erreurs.map((e) => e.message).join(' · '))
      setOffres(lu.offres)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <Explication>
        Tradeo interroge ses fournisseurs pour les compteurs acceptés. Kimatch garde leurs <strong>prix unitaires</strong>, pas leurs
        budgets : le budget sera calculé dans Kimatch, sur la même consommation pour tous.
      </Explication>
      {!offres && !enCours && !erreur && <p className="text-km-muted">Cliquez sur « Obtenir les prix ».</p>}
      {enCours && <p className="flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Tradeo interroge les fournisseurs…</p>}
      {erreur && <p className="flex items-start gap-2 text-km-red"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erreur}</p>}
      {offres && (
        <ul className="divide-y divide-km-line rounded-km border border-km-line">
          {offres.map((o, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
              <span className="font-semibold text-km-text">{o.fournisseur}{o.actuel && <Badge tone="blue" className="ml-1.5">actuel</Badge>}</span>
              <span className="text-km-body">
                {!o.succes ? <span className="text-km-red">{o.message ?? 'refuse de coter'}</span>
                  : o.sansPrixUnitaire ? <span className="text-km-amber">budget seul, pas de prix</span>
                  : <PrixCourts offre={o} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {offres && <p className="mt-2 text-km-label text-km-muted">Prix de l’environnement de test, en unités Tradeo (€/MWh). Ils incluent peut-être une marge de {MARGE_MINIMALE} : à confirmer avant de les enregistrer.</p>}
      <PiedAssistant onRetour={onRetour}>
        {offres && <Button onClick={onFermer}>Terminer</Button>}
        <Button variant="primary" disabled={enCours} onClick={() => void chercher()}>
          {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {offres ? 'Relancer' : 'Obtenir les prix'}
        </Button>
      </PiedAssistant>
    </>
  )
}

function PrixCourts({ offre }: { offre: OffreTradeo }) {
  const prix = offre.prixMoyens ?? offre.periodes[0]?.prix ?? {}
  const affiches = Object.entries(prix).filter(([k]) => k !== 'abo' && k !== 'cee' && !/capa|coef/i.test(k))
  return (
    <span className="tabular-nums">
      {affiches.map(([k, v]) => `${k === 'prixMolecule' ? 'Molécule' : k.replace(/^prix/, '')} ${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`).join(' · ')}
    </span>
  )
}

/** Tradeo refuse une date de début passée : on décale la période au mois prochain, même durée. */
function periodeAVenir(o: Record<string, unknown>): Record<string, unknown> {
  const debut = typeof o.dateDebut === 'string' ? o.dateDebut : null
  const fin = typeof o.dateFin === 'string' ? o.dateFin : null
  const auj = new Date().toISOString().slice(0, 10)
  if (!debut || debut >= auj) return o
  const d = new Date()
  const nouveauDebut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  const duree = fin ? Date.parse(fin) - Date.parse(debut) : 365 * 86400000
  return { ...o, dateDebut: nouveauDebut.toISOString().slice(0, 10), dateFin: new Date(nouveauDebut.getTime() + duree).toISOString().slice(0, 10) }
}

function fr(dateIso: string) {
  return dateIso ? new Date(`${dateIso}T12:00:00`).toLocaleDateString('fr-FR') : '—'
}

/* ── Le formulaire, pour corriger seulement ───────────────────────────────────────────────────── */

function FormulaireCorrection({ siret, setSiret, responsable, setResponsable, compteurs, setCompteurs }: {
  siret: string; setSiret: (s: string) => void
  responsable: ResponsableTradeo; setResponsable: (r: ResponsableTradeo) => void
  compteurs: CompteurTradeo[]; setCompteurs: (c: CompteurTradeo[]) => void
}) {
  const maj = (i: number, patch: Partial<CompteurTradeo>) => setCompteurs(compteurs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="as-siret">SIRET</Label>
        <Input id="as-siret" value={siret} onChange={(e) => setSiret(e.target.value.replace(/\s/g, ''))} inputMode="numeric" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="as-sex">Civilité</Label>
          <Select id="as-sex" value={responsable.sex} onChange={(e) => setResponsable({ ...responsable, sex: e.target.value })}>
            <option value="">—</option><option value="M.">M.</option><option value="Mme">Mme</option>
          </Select>
        </div>
        {([['prenom', 'Prénom'], ['nom', 'Nom'], ['email', 'Email'], ['tele', 'Téléphone'], ['fonction', 'Fonction']] as const).map(([k, l]) => (
          <div key={k}>
            <Label htmlFor={`as-${k}`}>{l}</Label>
            <Input id={`as-${k}`} value={responsable[k]} onChange={(e) => setResponsable({ ...responsable, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      {compteurs.map((c, i) => (
        <div key={i} className="grid gap-2 rounded-km border border-km-line p-2 sm:grid-cols-3">
          <p className="self-center font-mono text-km-label sm:col-span-3">{c.num_compteur} · {c.type === 'GAZ' ? 'Gaz' : 'Élec'}</p>
          <div><Label htmlFor={`as-deb-${i}`}>Début</Label><Input id={`as-deb-${i}`} type="date" value={c.dateDebut} onChange={(e) => maj(i, { dateDebut: e.target.value })} /></div>
          <div><Label htmlFor={`as-fin-${i}`}>Fin</Label><Input id={`as-fin-${i}`} type="date" value={c.dateFin} onChange={(e) => maj(i, { dateFin: e.target.value })} /></div>
          <div className="self-end"><Button variant="ghost" onClick={() => setCompteurs(compteurs.filter((_, j) => j !== i))}>Retirer</Button></div>
        </div>
      ))}
    </div>
  )
}
