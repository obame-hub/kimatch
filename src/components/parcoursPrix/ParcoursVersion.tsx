import { useMemo, useState } from 'react'
import { Calculator, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Select } from '@/components/ui/form'
import { PrixParCompteur } from '@/components/recommandation/PrixParCompteur'
import { DocumentComparatif } from '@/components/recommandation/DocumentComparatif'
import { EnteteEtapes, Explication, Ligne, PiedAssistant } from '@/components/prixTradeo/assistant'
import { useCompte } from '@/lib/data/comptes'
import {
  offresDeLaVersion,
  useCalculerVersion,
  useCircuitsFournisseurs,
  useMajDateDebutFourniture,
  useSiretCompte,
  useValiderVersion,
  type CompteRenduCalcul,
} from '@/lib/data/parcoursPrix'
import { etatDOffre, versionPrete, type CircuitFournisseur, type EtatDOffre } from '@/lib/parcoursPrix/etatOffres'
import { calculerOffre, margeCiblee } from '@/lib/parcoursPrix/calcul'
import { cn } from '@/lib/utils'
import type { Compteur, Recommandation, VersionRecommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARCOURS DE PRIX D'UNE VERSION, ÉTAPE PAR ÉTAPE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le parcours de Michel du 28/09/2026 — version, offres, calcul, validation — en quatre écrans.
 * La première forme montrait tout d'un bloc ; Naoëlle, 29/09 : « trop d'informations, c'est
 * illisible », et Michel « ne comprenait rien ». Chaque étape dit maintenant ce qu'elle fait, en une
 * phrase, et n'a qu'un bouton principal.
 *
 * POUR L'INTÉGRER À LA FICHE (William) : dans une fenêtre, derrière un bouton « Préparer les prix » :
 *   <Dialog open title="Préparer les prix" className="max-w-2xl" onClose={…}>
 *     <ParcoursVersion reco={reco} version={version} compteurs={compteursDuPerimetre} peutModifier={canManage} />
 *   </Dialog>
 */

const TITRES = ['La version', 'Les offres', 'Calculer', 'Valider']

export function ParcoursVersion({
  reco,
  version,
  compteurs,
  peutModifier,
  signaler,
  avant,
}: {
  reco: Recommandation
  version: VersionRecommandation
  /** Les compteurs de la recommandation (au moins ceux de la version). */
  compteurs: Compteur[]
  peutModifier: boolean
  signaler?: (message: string) => void
  /**
   * Les étapes qui précèdent, quand le parcours suit un autre assistant (le dossier, puis Tradeo) :
   * la frise les montre faites, et « Retour » depuis la première étape y ramène.
   */
  avant?: { titres: string[]; onRetour: () => void }
}) {
  const [etape, setEtape] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const dire = signaler ?? setMessage
  const parId = useMemo(() => new Map(compteurs.map((c) => [c.id, c])), [compteurs])
  const offres = useMemo(() => offresDeLaVersion(version), [version])
  const { data: circuits } = useCircuitsFournisseurs(offres.map((o) => o.fournisseurCompteId).filter((x): x is string => Boolean(x)))
  const etats = useMemo(
    () => new Map(offres.map((o) => [o.offre.id, etatDOffre(o.offre, version, parId, o.fournisseurCompteId ? circuits?.get(o.fournisseurCompteId) : undefined)])),
    [offres, version, parId, circuits],
  )
  const liste = [...etats.values()]
  /* UNE VERSION CLÔTURÉE N'ATTEND PLUS RIEN. Naoëlle, 29/09/2026, sur DIMOTRANS : « explique-moi le
     en retard ici ». Version close, dossier à réactiver : « en retard » invitait à relancer Primeo
     sur une demande que plus personne n'attend. Il faut une nouvelle version, et l'écran le dit. */
  const close = version.statut === 'CLOTUREE'
  const compter = (e: EtatDOffre['etat']) => liste.filter((x) => x.etat === e).length

  return (
    <div>
      {!peutModifier && (
        <p className="mb-3 rounded-km bg-km-amber-soft px-3 py-2 text-km-label text-km-amber">Lecture seule : vous pouvez tout regarder, rien ne sera enregistré.</p>
      )}
      <EnteteEtapes titres={[...(avant?.titres ?? []), ...TITRES]} courante={(avant?.titres.length ?? 0) + etape} />
      {message && !signaler && <p className="mb-3 rounded-km bg-km-green-soft px-3 py-2 text-km-body text-km-green">{message}</p>}

      {etape === 0 && <EtapeVersion version={version} parId={parId} peutModifier={peutModifier} dire={dire} onRetour={avant?.onRetour} onSuivant={() => setEtape(1)} />}

      {etape === 1 && (
        <>
          {close ? (
            <Explication>
              Cette version est <strong>clôturée</strong> : les offres qui n’ont pas répondu ne sont plus attendues. Pour redemander des
              prix, créez une nouvelle version.
            </Explication>
          ) : (
            <Explication>
              Chaque fournisseur consulté répond par une offre. Quand il a donné son prix pour tous les compteurs, l’offre passe
              <strong> « Prix reçu »</strong>. Sinon, Kimatch dit quand on l’attend.
            </Explication>
          )}
          <p className="mb-2 flex flex-wrap gap-1.5">
            <Badge tone="green">{compter('DISPONIBLE')} prix reçu{compter('DISPONIBLE') > 1 ? 's' : ''}</Badge>
            <Badge tone={close ? 'neutral' : 'amber'}>{compter('EN_ATTENTE')} {close ? 'sans réponse' : 'en attente'}</Badge>
            {compter('INDISPONIBLE') > 0 && <Badge tone="red">{compter('INDISPONIBLE')} refusée{compter('INDISPONIBLE') > 1 ? 's' : ''}</Badge>}
          </p>
          {offres.length === 0 ? (
            <p className="text-km-muted">Aucun fournisseur n’a été consulté sur cette version.</p>
          ) : (
            <ul className="divide-y divide-km-line rounded-km border border-km-line">
              {offres.map(({ offre }) => (
                <li key={offre.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-km-text">{offre.fournisseur_nom}</p>
                    <p className="text-km-label text-km-muted">{offre.duree_mois ? `${offre.duree_mois} mois` : 'durée ?'}{offre.type_prix ? ` · ${offre.type_prix}` : ''}{offre.nature_offre === 'EN_COURS' ? ' · offre en cours' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Etat etat={etats.get(offre.id)!} close={close} />
                    {peutModifier && <PrixParCompteur offre={offre} version={version} compteurs={compteurs} peutModifier signaler={dire} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <PiedAssistant onRetour={() => setEtape(0)}>
            <Button variant="primary" onClick={() => setEtape(2)}>Suivant</Button>
          </PiedAssistant>
        </>
      )}

      {etape === 2 && (
        <EtapeCalcul
          reco={reco} version={version} compteurs={compteurs} parId={parId} offres={offres}
          circuits={circuits} peutModifier={peutModifier} dire={dire}
          onRetour={() => setEtape(1)} onSuivant={() => setEtape(3)}
        />
      )}

      {etape === 3 && (
        <EtapeValidation reco={reco} version={version} compteurs={compteurs} prete={versionPrete(liste)} enAttente={compter('EN_ATTENTE')} disponibles={compter('DISPONIBLE')} peutModifier={peutModifier} dire={dire} onRetour={() => setEtape(2)} />
      )}
    </div>
  )
}

/* ── 1. La version ───────────────────────────────────────────────────────────────────────────── */

function EtapeVersion({ version, parId, peutModifier, dire, onRetour, onSuivant }: { version: VersionRecommandation; parId: Map<string, Compteur>; peutModifier: boolean; dire: (m: string) => void; onRetour?: () => void; onSuivant: () => void }) {
  const maj = useMajDateDebutFourniture()
  const echeances = version.compteurs.map((l) => parId.get(l.compteur_id)?.date_echeance).filter((d): d is string => Boolean(d)).sort()
  const proposee = echeances[0] ? lendemain(echeances[0]) : null
  const enregistrer = (date: string | null) =>
    maj.mutate({ versionId: version.id, date }, { onSuccess: () => dire('✓ Date de début enregistrée'), onError: (e) => dire(`Erreur : ${e.message}`) })

  return (
    <>
      <Explication>
        Une version, c’est la demande faite aux fournisseurs : <strong>quels compteurs</strong>, <strong>à partir de quand</strong>, et{' '}
        <strong>pour combien de temps</strong>.
      </Explication>
      <div className="rounded-km border border-km-line px-3">
        <Ligne libelle="Compteurs">
          <span className="flex flex-wrap gap-1.5">
            {version.compteurs.map((l) => {
              const c = parId.get(l.compteur_id)
              return <Badge key={l.lien_id} className="font-mono">{c?.type_energie === 'gaz' ? 'Gaz' : 'Élec'} {c?.numero_pdl || l.label}</Badge>
            })}
          </span>
        </Ligne>
        <Ligne libelle="Durée">{version.durees.length ? version.durees.map((d) => `${d} mois`).join(', ') : '—'}{version.types_prix.length ? ` · prix ${version.types_prix.join(', ')}` : ''}</Ligne>
        <Ligne libelle="Offres attendues">{version.date_souhaitee ? `le ${fr(version.date_souhaitee)}` : '—'}</Ligne>
        <Ligne libelle="Début de fourniture">
          {peutModifier ? (
            <span className="flex flex-wrap items-center gap-2">
              <Input type="date" className="w-[170px]" disabled={maj.isPending} defaultValue={version.date_debut_fourniture ?? ''} key={version.date_debut_fourniture ?? 'vide'}
                onBlur={(e) => { const v = e.target.value || null; if (v !== (version.date_debut_fourniture ?? null)) enregistrer(v) }} />
              {!version.date_debut_fourniture && proposee && (
                <button type="button" className="text-km-label text-km-green underline" onClick={() => enregistrer(proposee)}>
                  mettre le {fr(proposee)} (lendemain de l’échéance)
                </button>
              )}
            </span>
          ) : (version.date_debut_fourniture ? fr(version.date_debut_fourniture) : <span className="text-km-muted">non renseigné</span>)}
        </Ligne>
      </div>
      <PiedAssistant onRetour={onRetour}>
        <Button variant="primary" onClick={onSuivant}>Suivant</Button>
      </PiedAssistant>
    </>
  )
}

/* ── 3. Calculer ─────────────────────────────────────────────────────────────────────────────── */

type ModeMarge = 'garder' | 'unique' | 'ciblee'

const MODES: { valeur: ModeMarge; titre: string; aide: string }[] = [
  { valeur: 'garder', titre: 'Garder les marges', aide: 'Chaque offre garde la marge déjà saisie.' },
  { valeur: 'unique', titre: 'Une marge pour toutes', aide: 'La même marge sur toutes les offres.' },
  { valeur: 'ciblee', titre: 'Mettre une offre en avant', aide: 'Elle reçoit votre marge ; les autres sont ajustées pour qu’elle soit la moins chère.' },
]

function EtapeCalcul({ reco, version, compteurs, parId, offres, circuits, peutModifier, dire, onRetour, onSuivant }: {
  reco: Recommandation; version: VersionRecommandation; compteurs: Compteur[]; parId: Map<string, Compteur>
  offres: ReturnType<typeof offresDeLaVersion>; circuits: Map<string, CircuitFournisseur> | undefined
  peutModifier: boolean; dire: (m: string) => void; onRetour: () => void; onSuivant: () => void
}) {
  const [mode, setMode] = useState<ModeMarge>('garder')
  const [marge, setMarge] = useState(3)
  const [cibleId, setCibleId] = useState('')
  const { data: siret } = useSiretCompte(reco.compte_id)
  const calculer = useCalculerVersion()
  const [compteRendu, setCompteRendu] = useState<CompteRenduCalcul | null>(null)

  const apercu = useMemo(() => {
    const avant = new Map(offres.map((o) => [o.offre.id, calculerOffre(o.offre, version, parId)]))
    let margeParOffre: Map<string, number> | undefined
    if (mode === 'ciblee' && cibleId) {
      const aj = margeCiblee(offres.map((o) => ({ offre: o.offre, calcul: avant.get(o.offre.id)! })), cibleId, marge)
      margeParOffre = new Map(aj.filter((a) => a.margeApres != null && !a.impossible).map((a) => [a.offreId, a.margeApres as number]))
    }
    const apres = new Map(offres.map((o) => {
      const m = mode === 'unique' ? marge : margeParOffre?.get(o.offre.id)
      return [o.offre.id, m === undefined ? avant.get(o.offre.id)! : calculerOffre(o.offre, version, parId, m)]
    }))
    return { avant, apres, margeParOffre }
  }, [offres, version, parId, mode, marge, cibleId])

  async function lancer() {
    try {
      const r = await calculer.mutateAsync({
        recommandationId: reco.id, versionId: version.id, compteurs, siret: siret ?? null, circuits: circuits ?? new Map(),
        margeParOffre: apercu.margeParOffre, margeUnique: mode === 'unique' ? marge : null,
      })
      setCompteRendu(r)
      setMode('garder')
      dire(`✓ Budgets calculés : ${r.offresDisponibles} offre${r.offresDisponibles > 1 ? 's' : ''} au prix reçu.`)
    } catch (e) {
      dire(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const chiffrees = offres.filter((o) => apercu.avant.get(o.offre.id)?.complete)
  /* ON NE MET EN AVANT QU'UNE OFFRE QUI A SON PRIX : sans lui, aucune marge ne se calcule. Naoëlle,
     29/09/2026, devant une liste vide : « pourquoi y a rien là ? ». L'option se grise et dit pourquoi. */
  const candidates = chiffrees.filter((o) => o.offre.nature_offre !== 'EN_COURS')

  return (
    <>
      <Explication>
        <strong>Calculer</strong> va chercher les prix Tradeo, puis calcule le budget de chaque offre avec votre marge. On peut le
        relancer autant de fois qu’on veut.
      </Explication>

      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Marge</legend>
        {MODES.map((m) => {
          const bloque = m.valeur === 'ciblee' && candidates.length === 0
          return (
            <label key={m.valeur} className={cn('rounded-km border p-2.5', bloque ? 'cursor-not-allowed opacity-55' : 'cursor-pointer', mode === m.valeur ? 'border-km-green bg-km-green-soft/50' : 'border-km-line')}>
              <input type="radio" name="mode-marge" className="sr-only" disabled={bloque} checked={mode === m.valeur} onChange={() => setMode(m.valeur)} />
              <span className="block text-km-body font-semibold text-km-text">{m.titre}</span>
              <span className="block text-km-label text-km-muted">{bloque ? 'Possible dès qu’une offre a reçu son prix.' : m.aide}</span>
            </label>
          )
        })}
      </fieldset>

      {mode !== 'garder' && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="pv-marge">Marge (€/MWh)</Label>
            <Input id="pv-marge" type="number" step={0.5} min={0} className="w-[110px]" value={marge} onChange={(e) => setMarge(Number(e.target.value))} />
          </div>
          {mode === 'ciblee' && (
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="pv-cible">Offre à mettre en avant</Label>
              <Select id="pv-cible" value={cibleId} onChange={(e) => setCibleId(e.target.value)}>
                <option value="">Choisir…</option>
                {candidates.map(({ offre }) => (
                  <option key={offre.id} value={offre.id}>{offre.fournisseur_nom} · {offre.duree_mois ?? '?'} mois</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {chiffrees.length > 0 ? (
        <ul className="mt-4 divide-y divide-km-line rounded-km border border-km-line">
          {chiffrees.map(({ offre }) => {
            const a = apercu.avant.get(offre.id)!
            const b = apercu.apres.get(offre.id)!
            const change = a.total != null && b.total != null && Math.abs(a.total - b.total) > 0.005
            return (
              <li key={offre.id} className={cn('flex flex-wrap items-baseline justify-between gap-2 px-3 py-2', offre.id === cibleId && mode === 'ciblee' && 'bg-km-green-soft/50')}>
                <span className="text-km-text"><strong>{offre.fournisseur_nom}</strong> <span className="text-km-label text-km-muted">{offre.duree_mois} mois</span></span>
                <span className="tabular-nums text-km-body">
                  {change && <span className="mr-1.5 text-km-muted line-through">{euros(a.total)}</span>}
                  <strong>{euros(b.total)}</strong><span className="text-km-label text-km-muted"> /an</span>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 text-km-muted">Aucune offre n’a encore son prix : rien à calculer pour l’instant, sauf les prix Tradeo à aller chercher.</p>
      )}

      {compteRendu && (
        <p className="mt-3 text-km-label text-km-muted">
          {compteRendu.lignesEcrites} ligne{compteRendu.lignesEcrites > 1 ? 's' : ''} recalculée{compteRendu.lignesEcrites > 1 ? 's' : ''}.
          {compteRendu.tradeo && (compteRendu.tradeo.joignable
            ? ` Tradeo : ${compteRendu.prixTradeoEcrits} prix enregistré${compteRendu.prixTradeoEcrits > 1 ? 's' : ''}.`
            : ` Tradeo non joignable : ${compteRendu.tradeo.message}.`)}
          {compteRendu.erreurs.length > 0 && <span className="block text-km-red">{compteRendu.erreurs.join(' · ')}</span>}
        </p>
      )}

      <PiedAssistant onRetour={onRetour}>
        <Button variant="primary" disabled={!peutModifier || calculer.isPending || offres.length === 0 || (mode === 'ciblee' && !cibleId)} onClick={() => void lancer()}>
          {calculer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Calculer
        </Button>
        <Button onClick={onSuivant}>Suivant</Button>
      </PiedAssistant>
    </>
  )
}

/* ── 4. Valider ──────────────────────────────────────────────────────────────────────────────── */

function EtapeValidation({ reco, version, compteurs, prete, enAttente, disponibles, peutModifier, dire, onRetour }: {
  reco: Recommandation; version: VersionRecommandation; compteurs: Compteur[]; prete: boolean; enAttente: number; disponibles: number
  peutModifier: boolean; dire: (m: string) => void; onRetour: () => void
}) {
  const valider = useValiderVersion()
  const [document, setDocument] = useState(false)
  const { data: compte } = useCompte(reco.compte_id)
  const disponible = version.statut === 'DISPONIBLE'

  return (
    <>
      <Explication>
        Quand toutes les offres ont répondu, <strong>validez la version</strong> : elle passe « Disponible ». Vous pouvez ensuite
        générer le document à présenter au client.
      </Explication>
      <p className="flex items-center gap-2 text-km-body">
        {disponible
          ? <><CheckCircle2 className="h-4 w-4 text-km-green" /> La version est déjà « Disponible ».</>
          : prete
            ? <><CheckCircle2 className="h-4 w-4 text-km-green" /> Toutes les offres ont répondu : la version peut être validée.</>
            : <>Encore <strong>{enAttente}</strong> offre{enAttente > 1 ? 's' : ''} en attente : revenez quand elles auront répondu.</>}
      </p>
      <PiedAssistant onRetour={onRetour}>
        <Button disabled={disponibles === 0} onClick={() => setDocument(true)}><FileText className="h-4 w-4" /> Générer le document</Button>
        <Button variant="primary" disabled={!peutModifier || !prete || disponible || valider.isPending}
          onClick={() => valider.mutate(version.id, { onSuccess: () => dire('✓ Version validée : elle est « Disponible »'), onError: (e) => dire(`Erreur : ${e.message}`) })}>
          <CheckCircle2 className="h-4 w-4" /> Valider la version
        </Button>
      </PiedAssistant>
      {document && (
        <DocumentComparatif ouvert onFermer={() => setDocument(false)} reco={reco} version={version} compte={compte} compteurs={compteurs}
          contactClient={null} conseiller={reco.conseiller ? { nom: reco.conseiller } : null} />
      )}
    </>
  )
}

function Etat({ etat, close }: { etat: EtatDOffre; close: boolean }) {
  if (etat.etat === 'DISPONIBLE') return <Badge tone="green">Prix reçu</Badge>
  if (etat.etat === 'INDISPONIBLE') return <Badge tone="red">Refusée</Badge>
  if (close) return <Badge>Pas de réponse · version clôturée</Badge>
  const d = etat.prevision?.date
  return (
    <Badge tone={etat.enRetard ? 'red' : 'amber'} title={etat.prevision?.raison}>
      {d ? (etat.enRetard ? `En retard (attendue le ${fr(d)})` : `Attendue le ${fr(d)}`) : 'En attente'}
    </Badge>
  )
}

function lendemain(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fr(dateIso: string) {
  return new Date(`${dateIso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR')
}
function euros(n: number | null | undefined) {
  return n == null ? '—' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
}
