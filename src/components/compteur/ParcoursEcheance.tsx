import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import {
  Champ, EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, SAISIE, SAISIE_MONO, Segments, useSortieParcours,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { datesRetenues, derniereFinConnue, dureeProposee } from '@/lib/contratsProspects'
import { echeanceDuCompteur } from '@/lib/echeance'
import { useEnregistrerContratProspect, useFournisseursChoix, useSupprimerContratProspect } from '@/lib/data/contratsProspects'
import { cn } from '@/lib/utils'
import type { Compteur, Contrat, ContratProspect } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ÉDITER L'ÉCHÉANCE — un contrat prospect créé ou corrigé
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « si un commercial souhaite modifier une échéance car il a une nouvelle
 * info, il devra cliquer sur un bouton "Éditer l'échéance". S'affiche alors une popup avec
 * plusieurs champs » — la nouvelle échéance, le nouveau fournisseur, la durée, chacun pouvant être
 * « Indéterminé ». Et : « Éditer une échéance doit proposer de créer un contrat ou d'en modifier
 * un existant. »
 *
 * ══ DEUX ÉTAPES, LA PREMIÈRE SEULEMENT S'IL Y A UN CHOIX ══
 *
 *   LE CONTRAT     un nouveau contrat prospect, ou l'un de ceux déjà saisis. Un clic avance
 *                  (« si tu peux faire économiser un clic inutile, fais-le »). Sans contrat prospect
 *                  sur le compteur, il n'y a rien à choisir : on arrive directement à l'échéance.
 *   L'ÉCHÉANCE     les trois réponses. La durée se PROPOSE dès que l'échéance est saisie : du
 *                  lendemain de la dernière fin connue à la nouvelle échéance. Le début s'en déduit.
 *
 * Les contrats CLIENTS ne se modifient jamais ici : ils sont la preuve, signée avec KiWee.
 */

const INDETERMINE = '__indetermine__'

export function ParcoursEcheance({ compteur, contratsClients, prospects, initial, onFermer, onToast }: {
  compteur: Compteur
  contratsClients: Contrat[]
  prospects: ContratProspect[]
  /** Ouvre directement la correction de ce contrat prospect (depuis la liste des contrats). */
  initial?: ContratProspect | null
  onFermer: () => void
  onToast: (m: string) => void
}) {
  const avecChoix = prospects.length > 0 && !initial
  const ETAPES: EtapeParcours[] = avecChoix
    ? [{ cle: 'contrat', libelle: 'Le contrat' }, { cle: 'echeance', libelle: 'L’échéance' }]
    : [{ cle: 'echeance', libelle: 'L’échéance' }]

  const [etape, setEtape] = useState<'contrat' | 'echeance'>(avecChoix ? 'contrat' : 'echeance')
  const [edite, setEdite] = useState<ContratProspect | null>(initial ?? null)

  const [finConnue, setFinConnue] = useState(true)
  const [fin, setFin] = useState('')
  const [fournisseurId, setFournisseurId] = useState('')
  const [dureeConnue, setDureeConnue] = useState(true)
  const [duree, setDuree] = useState('')
  const [dureeTouchee, setDureeTouchee] = useState(false)
  const [entame, setEntame] = useState(false)
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)

  const { data: fournisseurs } = useFournisseursChoix()
  const enregistrer = useEnregistrerContratProspect()
  const supprimer = useSupprimerContratProspect()
  const ecriture = enregistrer.isPending || supprimer.isPending

  /* Ce qu'on corrige se pré-remplit tel qu'il est en base, « Indéterminé » compris. */
  function partirDe(p: ContratProspect | null) {
    setEdite(p)
    setFinConnue(p ? Boolean(p.date_fin) : true)
    setFin(p?.date_fin?.slice(0, 10) ?? '')
    setFournisseurId(p ? (p.fournisseur_compte_id ?? INDETERMINE) : '')
    setDureeConnue(p ? p.duree_mois != null : true)
    setDuree(p?.duree_mois != null ? String(p.duree_mois) : '')
    setDureeTouchee(Boolean(p))
    setEtape('echeance')
  }
  useEffect(() => { if (initial) partirDe(initial) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* LES AUTRES CONTRATS DU COMPTEUR, client et prospect : c'est parmi eux que se trouve celui dont
     ce contrat prend la suite. */
  const autres = useMemo(
    () => [
      ...contratsClients.map((c) => ({ date_debut: c.date_debut, date_fin: c.date_fin })),
      ...prospects.filter((p) => p.id !== edite?.id).map((p) => ({ date_debut: p.date_debut, date_fin: p.date_fin })),
    ],
    [contratsClients, prospects, edite],
  )
  const finSaisie = finConnue && /^\d{4}-\d{2}-\d{2}$/.test(fin) ? fin : null
  const finPrecedente = derniereFinConnue(autres, finSaisie)
  const proposee = dureeProposee(finPrecedente, finSaisie)

  /* LA DURÉE SE PROPOSE TANT QU'ON NE L'A PAS TOUCHÉE — 24 mois dans le cas de William. */
  useEffect(() => {
    if (dureeTouchee || proposee == null) return
    setDuree(String(proposee))
    setDureeConnue(true)
  }, [proposee, dureeTouchee])

  const dureeNombre = dureeConnue && /^\d+$/.test(duree.trim()) ? Number(duree.trim()) : null
  const dureeInvalide = dureeConnue && duree.trim() !== '' && (dureeNombre == null || dureeNombre < 1 || dureeNombre > 240)
  const finManquante = finConnue && !finSaisie
  const dureeManquante = dureeConnue && duree.trim() === ''
  const dates = datesRetenues({ fin: finSaisie, duree: dureeNombre, finPrecedente })
  const chevauche = Boolean(dates.date_debut && finPrecedente && dates.date_debut <= finPrecedente)
  const pret = !finManquante && !dureeManquante && !dureeInvalide && fournisseurId !== ''

  /* CE QUE LE COMPTEUR AFFICHERA ENSUITE : la même règle que la fiche, sur la liste telle qu'elle
     sera. Un contrat plus ancien que le dernier connu ne change pas l'échéance — on le dit. */
  const apres = echeanceDuCompteur(
    compteur.date_echeance,
    contratsClients,
    [
      ...prospects.filter((p) => p.id !== edite?.id),
      { id: edite?.id ?? 'nouveau', date_debut: dates.date_debut, date_fin: dates.date_fin, date_creation: new Date().toISOString() },
    ],
  )
  const devientEcheance = apres.source === 'CONTRAT_PROSPECT' && apres.prospectId === (edite?.id ?? 'nouveau')

  const nomFournisseur = fournisseurId === INDETERMINE ? 'Indéterminé' : (fournisseurs ?? []).find((f) => f.id === fournisseurId)?.nom ?? null

  const sortie = useSortieParcours({
    entame: entame && !ecriture,
    bloque: ecriture,
    onFermer,
    titre: edite ? 'Fermer sans enregistrer la correction ?' : 'Fermer sans créer le contrat prospect ?',
    lignes: [{ perdu: true, texte: 'L’échéance, le fournisseur et la durée saisis seront perdus.' }],
    libelleFermer: 'Fermer sans enregistrer',
  })

  const toucher = <T,>(f: (v: T) => void) => (v: T) => { setEntame(true); f(v) }

  async function valider() {
    if (!pret) return
    try {
      await enregistrer.mutateAsync({
        id: edite?.id,
        compteur_id: compteur.id,
        fournisseur_compte_id: fournisseurId === INDETERMINE ? null : fournisseurId,
        date_debut: dates.date_debut,
        date_fin: dates.date_fin,
        duree_mois: dureeNombre,
      })
      onToast(edite ? '✓ Contrat prospect corrigé' : '✓ Contrat prospect créé')
      onFermer()
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function effacer() {
    if (!edite) return
    try {
      await supprimer.mutateAsync({ id: edite.id, compteur_id: compteur.id })
      setConfirmerSuppression(false)
      onToast('✓ Contrat prospect supprimé')
      onFermer()
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const resumes: Record<string, ResumeEtape | undefined> = {
    contrat: { lignes: etape === 'echeance' ? [edite ? `Correction · ${libelleProspect(edite)}` : 'Nouveau contrat prospect'] : [] },
    echeance: {
      lignes: [
        finConnue ? (finSaisie ? `Fin ${dateFr(finSaisie)}` : '') : 'Fin indéterminée',
        nomFournisseur ? `Fournisseur ${nomFournisseur}` : '',
        dureeConnue ? (dureeNombre ? `${dureeNombre} mois` : '') : 'Durée indéterminée',
      ].filter(Boolean),
    },
  }
  const numero = (cle: string) => ETAPES.findIndex((e) => e.cle === cle) + 1

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        titre="Éditer l’échéance"
        reference={compteur.numero_pdl}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'contrat' ? 'Créer ou corriger' : edite ? 'Correction d’un contrat prospect' : 'Nouveau contrat prospect'}
        resumes={resumes}
        note={{
          titre: 'Un contrat prospect, pas un contrat KiWee',
          texte: 'Il alimente la frise et l’échéance du compteur, et rien d’autre : ni suivi, ni commission, ni signature.',
        }}
        onFermer={sortie.demander}
      />

      <PanneauParcours>
        {etape === 'contrat' && (
          <>
            <EnTeteEtape numero={numero('contrat')} total={ETAPES.length} titre="Créer ou corriger un contrat ?" />
            <div className="grid min-h-0 content-start gap-[9px] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => partirDe(null)}
                className="flex items-center gap-3 rounded-[12px] border border-dashed border-km-green/50 bg-km-green-soft/40 px-4 py-[14px] text-left transition-colors hover:border-km-green hover:bg-km-green-soft"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-km-green text-white"><Plus className="h-4 w-4" /></span>
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[13.5px] font-semibold text-km-text">Nouveau contrat prospect</span>
                  <span className="text-[11.5px] text-km-muted">Le client a renouvelé, ou vous apprenez un contrat qui n’est pas encore dans la frise.</span>
                </span>
              </button>
              <span className="mt-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">Ou corriger un contrat prospect déjà saisi</span>
              {[...prospects].sort((a, b) => (b.date_fin ?? '9999').localeCompare(a.date_fin ?? '9999')).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => partirDe(p)}
                  className="flex items-center gap-3 rounded-[12px] border border-km-line bg-white px-4 py-[12px] text-left transition-colors hover:border-km-green hover:bg-km-bg"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#F2ECFB] text-[#5E3F94]"><CalendarClock className="h-4 w-4" /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="truncate text-[13.5px] font-semibold text-km-text">{p.fournisseur_nom ?? 'Fournisseur indéterminé'}</span>
                    <span className="font-mono text-[11.5px] text-km-muted">{libelleProspect(p)}</span>
                  </span>
                  {p.cree_par_nom && <span className="text-[11px] text-km-faint">Saisi par {p.cree_par_nom}</span>}
                </button>
              ))}
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">Choisir vous emmène à l’étape suivante.</span>
              <span className="flex-1" />
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
            </div>
          </>
        )}

        {etape === 'echeance' && (
          <>
            <EnTeteEtape numero={numero('echeance')} total={ETAPES.length} titre={edite ? 'Corriger le contrat prospect' : 'La nouvelle échéance'} />

            <div className="flex flex-col gap-[18px]">
              <Champ intitule="Nouvelle échéance" requis>
                <div className="flex items-center gap-[10px]">
                  <div className="w-[230px]">
                    <Segments
                      obligatoire
                      valeur={finConnue ? 'connue' : 'inconnue'}
                      options={[{ valeur: 'connue', libelle: 'Je la connais' }, { valeur: 'inconnue', libelle: 'Indéterminée' }]}
                      onChoisir={toucher((v: string) => setFinConnue(v === 'connue'))}
                    />
                  </div>
                  {finConnue && (
                    <input
                      type="date"
                      autoFocus
                      value={fin}
                      onChange={(e) => { setEntame(true); setFin(e.target.value) }}
                      className={cn(SAISIE_MONO, 'w-[170px]')}
                    />
                  )}
                </div>
              </Champ>

              <Champ intitule="Nouveau fournisseur" requis>
                <select
                  value={fournisseurId}
                  onChange={(e) => { setEntame(true); setFournisseurId(e.target.value) }}
                  className={cn(SAISIE, 'w-[414px]')}
                >
                  <option value="" disabled>Choisir…</option>
                  <option value={INDETERMINE}>Indéterminé</option>
                  {(fournisseurs ?? []).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </Champ>

              <Champ intitule="Durée" requis>
                <div className="flex items-center gap-[10px]">
                  <div className="w-[230px]">
                    <Segments
                      obligatoire
                      valeur={dureeConnue ? 'connue' : 'inconnue'}
                      options={[{ valeur: 'connue', libelle: 'Je la connais' }, { valeur: 'inconnue', libelle: 'Indéterminée' }]}
                      onChoisir={toucher((v: string) => { setDureeTouchee(true); setDureeConnue(v === 'connue') })}
                    />
                  </div>
                  {dureeConnue && (
                    <span className="flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        value={duree}
                        onChange={(e) => { setEntame(true); setDureeTouchee(true); setDuree(e.target.value) }}
                        className={cn(SAISIE_MONO, 'w-[80px] text-right', dureeInvalide && 'border-km-red')}
                      />
                      <span className="text-[12.5px] text-km-muted">mois</span>
                    </span>
                  )}
                </div>
                {dureeConnue && proposee != null && finPrecedente && (
                  <span className={cn('text-[11.5px]', String(proposee) === duree.trim() ? 'text-km-green' : 'text-km-muted')}>
                    {String(proposee) === duree.trim() ? 'Proposée' : 'Proposition'} : {proposee} mois, du lendemain de la dernière fin connue ({dateFr(finPrecedente)}) à la nouvelle échéance.
                    {String(proposee) !== duree.trim() && (
                      <button type="button" onClick={() => { setDuree(String(proposee)); setEntame(true) }} className="ml-1 font-semibold text-km-green hover:underline">
                        Reprendre {proposee} mois
                      </button>
                    )}
                  </span>
                )}
                {dureeInvalide && <span className="text-[11.5px] font-semibold text-km-red">Une durée en mois entiers, de 1 à 240.</span>}
              </Champ>
            </div>

            {/* LE RÉSULTAT, AVANT D'ENREGISTRER : la place du contrat dans la frise, et ce que le
                compteur affichera. */}
            <div className="mt-[22px] flex flex-col gap-[8px] rounded-[12px] border border-km-line bg-km-bg px-4 py-[13px]">
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="text-km-muted">Dans la frise :</span>
                <span className="font-mono font-semibold text-km-text">
                  {dates.date_debut ? dateFr(dates.date_debut) : 'début inconnu'} → {dates.date_fin ? dateFr(dates.date_fin) : 'Indéterminée'}
                </span>
                {dates.calculee && <span className="text-[11px] text-km-faint">({dates.calculee === 'debut' ? 'début' : 'fin'} calculé{dates.calculee === 'fin' ? 'e' : ''})</span>}
              </div>
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="text-km-muted">Échéance du compteur :</span>
                <span className="font-mono font-bold text-km-text">{apres.indeterminee ? 'Indéterminée' : apres.date ? dateFr(apres.date) : '—'}</span>
                {!devientEcheance && <span className="text-[11px] text-km-faint">— un contrat plus récent la porte déjà</span>}
              </div>
              {chevauche && (
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-km-amber">
                  <AlertTriangle className="h-3.5 w-3.5" /> Ce contrat commence avant la fin du précédent ({dateFr(finPrecedente!)}) : les deux se chevaucheront dans la frise.
                </span>
              )}
            </div>

            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              {edite && (
                <Button variant="danger" disabled={ecriture} onClick={() => setConfirmerSuppression(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer ce contrat
                </Button>
              )}
              <span className="flex-1" />
              {avecChoix && <Button variant="ghost" onClick={() => setEtape('contrat')}>Précédent</Button>}
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              <Button variant="primary" disabled={!pret || ecriture} onClick={() => void valider()}>
                {enregistrer.isPending ? 'Enregistrement…' : edite ? 'Enregistrer la correction' : 'Créer le contrat prospect'}
                {!enregistrer.isPending && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>

      {confirmerSuppression && edite && (
        <ConfirmerSuppression prospect={edite} enCours={supprimer.isPending} onAnnuler={() => setConfirmerSuppression(false)} onConfirmer={() => void effacer()} />
      )}
    </FenetreParcours>
  )
}

/** La suppression d'un contrat prospect se confirme : elle change l'échéance du compteur. */
export function ConfirmerSuppression({ prospect, enCours, onAnnuler, onConfirmer }: {
  prospect: ContratProspect
  enCours: boolean
  onAnnuler: () => void
  onConfirmer: () => void
}) {
  return (
    <Dialog
      open
      onClose={onAnnuler}
      title="Supprimer ce contrat prospect ?"
      description={`${prospect.fournisseur_nom ?? 'Fournisseur indéterminé'} · ${libelleProspect(prospect)}`}
      className="max-w-md"
    >
      <div className="space-y-3">
        <p className="text-km-body leading-snug text-km-text">
          Il disparaît de la frise, et l’échéance du compteur revient au contrat connu précédent.
        </p>
        <div className="flex justify-end gap-2 border-t border-km-line pt-3">
          <Button variant="ghost" onClick={onAnnuler} autoFocus>Garder</Button>
          <Button variant="danger" disabled={enCours} onClick={onConfirmer}>{enCours ? 'Suppression…' : 'Supprimer'}</Button>
        </div>
      </div>
    </Dialog>
  )
}

export function libelleProspect(p: Pick<ContratProspect, 'date_debut' | 'date_fin' | 'duree_mois'>): string {
  const periode = `${p.date_debut ? dateFr(p.date_debut) : '…'} → ${p.date_fin ? dateFr(p.date_fin) : 'Indéterminée'}`
  return p.duree_mois ? `${periode} · ${p.duree_mois} mois` : periode
}

function dateFr(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split('-')
  return `${j}/${m}/${a}`
}
