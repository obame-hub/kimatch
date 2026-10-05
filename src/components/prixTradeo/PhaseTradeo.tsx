import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { appelerBanc, chargerDossierKimatch, chargerMandatsActifs, messageErreur, type MandatDuCompteur } from '@/lib/data/tradeo'
import { compteursPourTradeo, manquesDemande, responsablePourTradeo, type CompteurTradeo, type DossierKimatch, type ResponsableTradeo } from '@/lib/tradeo/dossier'
import { noterSurLesMandats } from '@/lib/tradeo/pricer'
import { EnteteEtapes, Explication, Ligne, PiedAssistant } from './assistant'
import { EtapePrix, FormulaireCorrection } from './ElementsTradeo'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PHASE TRADEO D'UN DOSSIER : KIMATCH REGARDE D'ABORD OÙ IL EN EST
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 29/09/2026 : avec deux assistants séparés, « on ne sait pas si on doit cliquer à
 * l'étape 1 ou à l'étape 2 dès la première fois », et il fallait « revenir tout en arrière » pour
 * passer de l'un à l'autre.
 *
 * L'ACCORD DE TRADEO PORTE SUR LES COMPTEURS, pas sur une version : une fois un compteur accepté,
 * il l'est pour toutes les versions qui suivent. On lit donc, pour CHAQUE compteur du dossier, ce
 * que Tradeo en sait, et l'écran propose la seule action utile :
 *
 *   · aucun compteur envoyé    → vérifier et envoyer ;
 *   · envoyés, en attente      → attendre, ou relancer l'équipe Tradeo ;
 *   · acceptés                 → continuer, directement.
 *
 * Dans tous les cas on peut CONTINUER vers la version : les fournisseurs qui ne passent pas par
 * Tradeo n'ont pas à attendre qu'il réponde.
 */

/** Les étapes de `ParcoursVersion`, pour que la frise montre le chemin entier dès le début. */
const ETAPES_SUIVANTES = ['La version', 'Les offres', 'Calculer', 'Valider']

type EtatCompteur = 'NON_ENVOYE' | 'EN_ATTENTE' | 'ACCEPTE' | 'REFUSE'

interface DemandeLue {
  id: number
  type?: string
  societe?: { siret?: string }
  compteurs?: { status?: number; numCompteur?: string; objetConsommation?: { numCompteur?: string } | null }[]
}

const ETIQUETTE: Record<EtatCompteur, { libelle: string; tone: 'neutral' | 'amber' | 'green' | 'red' }> = {
  NON_ENVOYE: { libelle: 'pas encore envoyé', tone: 'neutral' },
  EN_ATTENTE: { libelle: 'en attente de Tradeo', tone: 'amber' },
  ACCEPTE: { libelle: 'accepté par Tradeo', tone: 'green' },
  REFUSE: { libelle: 'refusé par Tradeo', tone: 'red' },
}

export function PhaseTradeo({ versionId, avant, onContinuer }: {
  versionId: string
  avant: { titres: string[]; onRetour: () => void }
  onContinuer: () => void
}) {
  const [dossier, setDossier] = useState<DossierKimatch | null>(null)
  const [mandats, setMandats] = useState<Map<string, MandatDuCompteur>>(new Map())
  const [siret, setSiret] = useState('')
  const [responsable, setResponsable] = useState<ResponsableTradeo>({ sex: '', nom: '', prenom: '', email: '', tele: '', fonction: '' })
  const [aEnvoyer, setAEnvoyer] = useState<CompteurTradeo[]>([])
  const [tous, setTous] = useState<CompteurTradeo[]>([])
  /* LES COMPTEURS QUI NE PARTENT PAS, ET POURQUOI. Naoëlle, 29/09/2026 : « faudra l'écrire, comme ça
     les commerciaux savent pourquoi ça s'affiche pas ». Un mandat KiWee seul n'est pas refusé en
     silence : il est nommé, avec ce qu'il faut faire. */
  const [exclus, setExclus] = useState<{ num: string; raison: 'KIWEE_SEUL' | 'AUCUN' }[]>([])
  const [etatParNum, setEtatParNum] = useState<Map<string, { etat: EtatCompteur; demandeId: number | null }>>(new Map())
  const [lecture, setLecture] = useState(true)
  const [action, setAction] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [corriger, setCorriger] = useState(false)
  const [voirPrix, setVoirPrix] = useState(false)

  /** Ce que Tradeo sait de chaque compteur, lu dans les demandes déposées sur ce SIRET. */
  const lireTradeo = useCallback(async (s: string, liste: CompteurTradeo[]) => {
    const r = await appelerBanc('mes_demandes', { pageNumber: 1, dataTable: { statusFilter: '', sortBy: null, draw: 1, length: 20, search: s, column: 0, dir: 'desc' } })
    if (!r.ok) throw new Error(messageErreur(r) ?? 'Tradeo n’a pas répondu.')
    const demandes = ((r.reponse as { demandesCotations?: DemandeLue[] } | undefined)?.demandesCotations ?? []).filter((d) => d.societe?.siret === s)
    const carte = new Map<string, { etat: EtatCompteur; demandeId: number | null }>()
    for (const c of liste) carte.set(c.num_compteur, { etat: 'NON_ENVOYE', demandeId: null })
    // Les plus anciennes d'abord : la demande la plus récente a le dernier mot sur un compteur.
    for (const d of [...demandes].sort((a, b) => a.id - b.id)) {
      for (const c of d.compteurs ?? []) {
        /* LE NUMÉRO EST SUR LE COMPTEUR, pas dans `objetConsommation` comme l'écrit la documentation
           v1.4 : mesuré sur la demande n° 3099 le 29/09/2026, `objetConsommation` vaut `null` tant
           que Tradeo n'a pas accepté le compteur. On lit les deux. */
        const num = (c.numCompteur ?? c.objetConsommation?.numCompteur ?? '').replace(/\s/g, '')
        if (!carte.has(num)) continue
        const etat: EtatCompteur = c.status === 1 ? 'ACCEPTE' : c.status === 0 || c.status === undefined ? 'EN_ATTENTE' : 'REFUSE'
        carte.set(num, { etat, demandeId: d.id })
      }
    }
    setEtatParNum(carte)
    setAEnvoyer(liste.filter((c) => carte.get(c.num_compteur)?.etat === 'NON_ENVOYE'))
  }, [])

  useEffect(() => {
    let annule = false
    ;(async () => {
      setLecture(true)
      setErreur(null)
      try {
        const d = await chargerDossierKimatch(versionId)
        const couverture = await chargerMandatsActifs(d.compteurs.map((c) => c.id))
        const candidats = compteursPourTradeo(d)
        const liste = candidats.filter((c) => couverture.get(c.num_compteur)?.energix)
        const horsTradeo = candidats
          .filter((c) => !couverture.get(c.num_compteur)?.energix)
          .map((c) => ({ num: c.num_compteur || '(sans numéro)', raison: couverture.has(c.num_compteur) ? 'KIWEE_SEUL' as const : 'AUCUN' as const }))
        const s = (d.siret ?? '').replace(/\s/g, '')
        if (annule) return
        setDossier(d); setMandats(couverture); setSiret(s); setResponsable(responsablePourTradeo(d)); setTous(liste); setExclus(horsTradeo)
        if (liste.length > 0 && /^\d{14}$/.test(s)) await lireTradeo(s, liste)
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : String(e))
      } finally {
        if (!annule) setLecture(false)
      }
    })()
    return () => { annule = true }
  }, [versionId, lireTradeo])

  const etats = [...etatParNum.values()].map((e) => e.etat)
  const acceptes = etats.filter((e) => e === 'ACCEPTE').length
  const enAttente = etats.filter((e) => e === 'EN_ATTENTE').length
  const manques = manquesDemande(siret, responsable, aEnvoyer)
  const acd = useMemo(() => aEnvoyer.map((c) => mandats.get(c.num_compteur)).find((m) => m?.document_id) ?? null, [aEnvoyer, mandats])
  const energie: 'ELEC' | 'GAZ' = tous.some((c) => c.type === 'GAZ') && !tous.some((c) => c.type === 'ELEC') ? 'GAZ' : 'ELEC'

  async function envoyer() {
    setAction(true); setErreur(null); setMessage(null)
    const r = await appelerBanc('creer_demande', {
      compteurs: aEnvoyer.map((c) => ({ ...c, site: c.site || undefined })),
      dataSociete: { siret }, dataResponsable: responsable,
      ...(acd?.document_id ? { acd_document_id: acd.document_id } : {}),
    })
    if (!r.ok) { setErreur(messageErreur(r) ?? 'Tradeo a refusé la demande.'); setAction(false); return }
    /* La pré-production ne rend pas `demande_id`, contrairement à la documentation (29/09/2026) :
       on relit l'état, qui retrouve la demande, puis on prévient Tradeo pour chacune en attente. */
    await lireTradeo(siret, tous)
    await prevenir(true)
    /* L'HOMOLOGATION EST TENUE PAR LE MANDAT (05/10/2026) : une demande partie du banc se note
       comme une demande partie du Pricer. */
    const ids = aEnvoyer.map((c) => mandats.get(c.num_compteur)?.mandat_id).filter((x): x is string => !!x)
    await noterSurLesMandats(ids, 'DEMANDEE', null).catch((e: Error) => setErreur(`Demande partie, mais non notée sur le mandat : ${e.message}`))
    setAction(false)
  }

  async function prevenir(silencieux = false) {
    setAction(true)
    const r = await appelerBanc('mes_demandes', { pageNumber: 1, dataTable: { statusFilter: '', sortBy: null, draw: 1, length: 20, search: siret, column: 0, dir: 'desc' } })
    const ids = ((r.reponse as { demandesCotations?: DemandeLue[] } | undefined)?.demandesCotations ?? [])
      .filter((d) => d.societe?.siret === siret && (d.compteurs ?? []).some((c) => c.status === 0 || c.status === undefined))
      .map((d) => d.id)
    const resultats = await Promise.all(ids.map((id) => appelerBanc('demander_validation', { id_demande: id })))
    const ko = resultats.filter((x) => !x.ok)
    setMessage(ids.length === 0 ? (silencieux ? null : 'Rien à relancer.') : ko.length === 0 ? '✓ L’équipe Tradeo a été prévenue par mail.' : `Tradeo n’a pas pu être prévenu : ${messageErreur(ko[0])}`)
    setAction(false)
  }

  async function actualiser() {
    setAction(true); setMessage(null)
    try { await lireTradeo(siret, tous) } catch (e) { setErreur(e instanceof Error ? e.message : String(e)) }
    setAction(false)
  }

  if (voirPrix) {
    return (
      <>
        <EnteteEtapes titres={[...avant.titres, 'Tradeo', ...ETAPES_SUIVANTES]} courante={avant.titres.length} />
        <EtapePrix siret={siret} energie={energie} onRetour={() => setVoirPrix(false)} onFermer={() => setVoirPrix(false)} />
      </>
    )
  }

  return (
    <>
      <EnteteEtapes titres={[...avant.titres, 'Tradeo', ...ETAPES_SUIVANTES]} courante={avant.titres.length} />

      {lecture && <p className="flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Kimatch regarde où en est ce dossier chez Tradeo…</p>}

      {!lecture && tous.length === 0 && (
        <Explication>
          {exclus.some((e) => e.raison === 'KIWEE_SEUL')
            ? <>Ce dossier n’a qu’un <strong>mandat KiWee</strong>. Tradeo exige <strong>son propre mandat, le mandat Energix</strong> : sans lui, il refuse de donner des prix. Faites signer un mandat Energix au client (case « Mandat Energix » de l’assistant mandat), puis revenez. En attendant, vous pouvez continuer avec les autres fournisseurs.</>
            : <>Aucun compteur de ce dossier n’est couvert par un <strong>mandat actif</strong> : sans mandat, on ne peut pas demander de prix. Vous pouvez continuer avec les autres fournisseurs.</>}
        </Explication>
      )}

      {!lecture && tous.length > 0 && (
        <>
          <Explication>
            {aEnvoyer.length > 0
              ? <>Tradeo ne connaît pas encore {aEnvoyer.length === tous.length ? 'ce dossier' : `${aEnvoyer.length} compteur${aEnvoyer.length > 1 ? 's' : ''}`}. Vérifiez les informations, puis <strong>envoyez</strong> : leur équipe acceptera les compteurs, et les prix arriveront ensuite.</>
              : enAttente > 0
                ? <>Le dossier est chez Tradeo, <strong>en attente de leur accord</strong>. Vous pouvez continuer dès maintenant avec les autres fournisseurs, et revenir plus tard pour les prix Tradeo.</>
                : <>Tradeo a <strong>accepté</strong> les compteurs : ses prix seront récupérés au moment du calcul. Continuez.</>}
          </Explication>

          <div className="rounded-km border border-km-line px-3">
            <Ligne libelle="Compteurs">
              <span className="flex flex-col gap-1">
                {tous.map((c) => {
                  const e = etatParNum.get(c.num_compteur)?.etat ?? 'NON_ENVOYE'
                  return (
                    <span key={c.num_compteur} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-km-label">{c.num_compteur}</span>
                      <Badge tone={ETIQUETTE[e].tone}>{ETIQUETTE[e].libelle}</Badge>
                    </span>
                  )
                })}
              </span>
            </Ligne>
            {exclus.length > 0 && (
              <Ligne libelle="Ne partent pas">
                <span className="flex flex-col gap-1">
                  {exclus.map((e) => (
                    <span key={e.num} className="text-km-label">
                      <span className="font-mono">{e.num}</span>{' '}
                      <span className="text-km-red">{e.raison === 'KIWEE_SEUL' ? '— mandat KiWee seulement : Tradeo exige un mandat Energix' : '— aucun mandat actif'}</span>
                    </span>
                  ))}
                </span>
              </Ligne>
            )}
            {aEnvoyer.length > 0 && !corriger && (
              <>
                <Ligne libelle="Société">{dossier?.compte_nom ?? '—'} <span className="font-mono text-km-label text-km-muted">{siret || 'SIRET manquant'}</span></Ligne>
                <Ligne libelle="Responsable">{[responsable.sex, responsable.prenom, responsable.nom].filter(Boolean).join(' ') || '—'}{responsable.fonction ? `, ${responsable.fonction}` : ''}</Ligne>
                <Ligne libelle="Autorisation">{acd ? <>le mandat Energix <strong>{acd.mandat_reference}</strong> sera joint</> : <span className="text-km-amber">pas de PDF du mandat Energix dans Kimatch : Tradeo risque de refuser</span>}</Ligne>
                <Ligne libelle="Période">{aEnvoyer[0] ? `du ${fr(aEnvoyer[0].dateDebut)} au ${fr(aEnvoyer[0].dateFin)}` : '—'}</Ligne>
              </>
            )}
          </div>

          {aEnvoyer.length > 0 && corriger && (
            <div className="mt-3">
              <FormulaireCorrection siret={siret} setSiret={setSiret} responsable={responsable} setResponsable={setResponsable} compteurs={aEnvoyer} setCompteurs={setAEnvoyer} />
            </div>
          )}
          {aEnvoyer.length > 0 && manques.length > 0 && (
            <div className="mt-3 rounded-km bg-km-amber-soft px-3 py-2 text-km-body text-km-amber">
              <p className="font-semibold">À compléter avant d’envoyer :</p>
              <ul className="mt-1 list-disc pl-5">{manques.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
        </>
      )}

      {erreur && <p className="mt-3 flex items-start gap-2 text-km-red"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erreur}</p>}
      {message && <p className="mt-3 text-km-body text-km-green">{message}</p>}

      <PiedAssistant onRetour={avant.onRetour}>
        {aEnvoyer.length > 0 && (
          <>
            <Button onClick={() => setCorriger(!corriger)}>{corriger ? 'Voir le récapitulatif' : 'Corriger'}</Button>
            <Button onClick={onContinuer}>Plus tard</Button>
            <Button variant="primary" disabled={action || manques.length > 0} onClick={() => void envoyer()}>
              {action ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer à Tradeo
            </Button>
          </>
        )}
        {/* PENDANT LA LECTURE, AUCUNE ACTION : « Continuer » affiché avant de savoir où en est le
            dossier invitait à passer l'étape sans l'avoir vue (constaté au test du 29/09/2026). */}
        {!lecture && aEnvoyer.length === 0 && (
          <>
            {enAttente > 0 && <Button disabled={action} onClick={() => void prevenir()}>Relancer Tradeo</Button>}
            {tous.length > 0 && <Button variant="ghost" disabled={action} onClick={() => void actualiser()} aria-label="Actualiser"><RefreshCw className="h-4 w-4" /></Button>}
            {acceptes > 0 && <Button onClick={() => setVoirPrix(true)}>Voir les prix Tradeo</Button>}
            <Button variant="primary" onClick={onContinuer}>Continuer</Button>
          </>
        )}
      </PiedAssistant>
    </>
  )
}

function fr(dateIso: string) {
  return dateIso ? new Date(`${dateIso}T12:00:00`).toLocaleDateString('fr-FR') : '—'
}
