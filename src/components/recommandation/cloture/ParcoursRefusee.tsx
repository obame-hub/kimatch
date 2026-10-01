import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import {
  Champ, EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, SAISIE_MONO, Segments, useSortieParcours,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { datesRetenues, derniereFinConnue, dureeProposee } from '@/lib/contratsProspects'
import { useFournisseursChoix } from '@/lib/data/contratsProspects'
import { useCloturerRecommandationParcours, useContratsConnusDesCompteurs, type ProspectApresRefus } from '@/lib/data/clotureRecommandation'
import { echeanceDansLAnnee } from '@/lib/data/recommandations'
import { cn } from '@/lib/utils'
import type { Compteur, Recommandation } from '@/types/domain'
import { EtapeMotif, aujourdhui, dateFr, dateValide } from './commun'
import { phraseVersions } from './versionsOuvertes'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CLÔTURER EN « REFUSÉE » — la nouvelle échéance, puis le motif
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « Étape 1 : informations sur la nouvelle échéance + fournisseur + durée
 * (même process que la création d'un contrat prospect, car ça doit justement créer un contrat
 * prospect). Étape 2 : motif — pourquoi j'ai perdu la recommandation ? »
 *
 * ══ LES MÊMES TROIS RÉPONSES QUE « ÉDITER L'ÉCHÉANCE » ══
 *
 * Échéance, fournisseur, durée, chacune pouvant rester « Indéterminée », et la durée qui se
 * PROPOSE du lendemain de la dernière fin connue à la nouvelle échéance (`ParcoursEcheance`).
 *
 * UNE SAISIE, UN CONTRAT PROSPECT PAR COMPTEUR (décision de William, 01/10/2026) : une
 * recommandation couvre souvent plusieurs compteurs, et le client parti chez un concurrent l'est
 * pour tout le périmètre. Les dates se calculent compteur par compteur — chacun prend la suite de
 * SON dernier contrat — et la fenêtre les montre avant qu'on enregistre.
 *
 * L'OPPORTUNITÉ DE SUIVI DE MICHEL RESTE (20/09/2026) : une échéance dans les douze mois, ou
 * inconnue, en ouvre une. La fenêtre le dit avant le clic, pas après.
 *
 * LES CHAMPS `date_echeance` ET `fournisseur_actuel_*` DES COMPTEURS NE SONT PLUS RÉÉCRITS : c'est
 * le contrat prospect qui porte désormais l'information (règle du 01/10/2026).
 */

const ETAPES: EtapeParcours[] = [
  { cle: 'echeance', libelle: 'La nouvelle échéance' },
  { cle: 'motif', libelle: 'Le motif' },
]
const INDETERMINE = '__indetermine__'

export function ParcoursRefusee({ reco, compteurs, onFermer, onToast }: {
  reco: Recommandation
  compteurs: Compteur[]
  onFermer: () => void
  onToast: (m: string) => void
}) {
  const { data: fournisseurs } = useFournisseursChoix()
  const ids = useMemo(() => compteurs.map((c) => c.id), [compteurs])
  const { data: connus, isLoading: chargement } = useContratsConnusDesCompteurs(ids)
  const cloturer = useCloturerRecommandationParcours()

  const [etape, setEtape] = useState<'echeance' | 'motif'>('echeance')
  const [finConnue, setFinConnue] = useState(true)
  const [fin, setFin] = useState('')
  const [fournisseurId, setFournisseurId] = useState('')
  const [dureeConnue, setDureeConnue] = useState(true)
  const [duree, setDuree] = useState('')
  const [dureeTouchee, setDureeTouchee] = useState(false)
  const [motif, setMotif] = useState('')
  const [date, setDate] = useState(aujourdhui())
  const [entame, setEntame] = useState(false)

  const finSaisie = finConnue && dateValide(fin) ? fin : null
  const dureeNombre = dureeConnue && /^\d+$/.test(duree.trim()) ? Number(duree.trim()) : null

  /* COMPTEUR PAR COMPTEUR : la fin dont il prend la suite, et la durée qu'elle propose. */
  const parCompteur = useMemo(() => compteurs.map((k) => {
    const finPrecedente = derniereFinConnue(connus?.[k.id] ?? [], finSaisie)
    return {
      compteur: k,
      finPrecedente,
      proposee: dureeProposee(finPrecedente, finSaisie),
      dates: datesRetenues({ fin: finSaisie, duree: dureeNombre, finPrecedente }),
    }
  }), [compteurs, connus, finSaisie, dureeNombre])

  /* UNE DURÉE NE SE PROPOSE QUE SI TOUS LES COMPTEURS S'ACCORDENT : proposer celle du premier
     ferait commencer les autres au mauvais jour, sans que rien ne le signale. */
  const propositions = [...new Set(parCompteur.map((p) => p.proposee))]
  const proposee = propositions.length === 1 ? propositions[0] : null
  const propositionsDivergent = propositions.filter((p) => p != null).length > 1

  useEffect(() => {
    if (dureeTouchee || proposee == null) return
    setDuree(String(proposee))
    setDureeConnue(true)
  }, [proposee, dureeTouchee])

  const dureeInvalide = dureeConnue && duree.trim() !== '' && (dureeNombre == null || dureeNombre < 1 || dureeNombre > 240)
  const finManquante = finConnue && !finSaisie
  const dureeManquante = dureeConnue && duree.trim() === ''
  const fournisseurManquant = fournisseurId === ''
  const echeancePrete = !finManquante && !dureeManquante && !dureeInvalide && !fournisseurManquant && !(ids.length > 0 && chargement)
  const pret = echeancePrete && motif.trim() !== '' && dateValide(date)

  const opportunite = !finSaisie || echeanceDansLAnnee(finSaisie)
  const nomFournisseur = fournisseurId === INDETERMINE ? 'Indéterminé' : (fournisseurs ?? []).find((f) => f.id === fournisseurId)?.nom ?? null

  const sortie = useSortieParcours({
    entame: entame && !cloturer.isPending,
    bloque: cloturer.isPending,
    onFermer,
    titre: 'Fermer sans clôturer la recommandation ?',
    lignes: [
      { perdu: true, texte: 'L’échéance, le fournisseur, la durée et le motif saisis seront perdus.' },
      { texte: 'La recommandation reste ouverte, telle qu’elle était.' },
    ],
    libelleFermer: 'Fermer sans clôturer',
  })
  const toucher = <T,>(f: (v: T) => void) => (v: T) => { setEntame(true); f(v) }

  async function valider() {
    if (!pret) return
    const prospects: ProspectApresRefus[] = parCompteur.map((p) => ({
      compteur_id: p.compteur.id,
      fournisseur_compte_id: fournisseurId === INDETERMINE ? null : fournisseurId,
      date_debut: p.dates.date_debut,
      date_fin: p.dates.date_fin,
      duree_mois: dureeNombre,
    }))
    try {
      const bilan = await cloturer.mutateAsync({
        id: reco.id,
        dateCloture: date,
        issue: { finalite: 'REFUSEE', motif, prospects, echeance: finSaisie },
      })
      const fait = [
        bilan.prospectsCrees ? `${bilan.prospectsCrees} contrat${bilan.prospectsCrees > 1 ? 's' : ''} prospect${bilan.prospectsCrees > 1 ? 's' : ''}` : null,
        bilan.opportuniteId ? 'opportunité de suivi créée' : null,
      ].filter(Boolean).join(' · ')
      onToast(`✗ Recommandation refusée${fait ? ` — ${fait}` : ''}${bilan.erreurs.length ? ` — ${bilan.erreurs.join(' · ')}` : ''}`)
      onFermer()
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const resumes: Record<string, ResumeEtape | undefined> = {
    echeance: {
      lignes: [
        finConnue ? (finSaisie ? `Fin ${dateFr(finSaisie)}` : '') : 'Fin indéterminée',
        nomFournisseur ? `Fournisseur ${nomFournisseur}` : '',
        dureeConnue ? (dureeNombre ? `${dureeNombre} mois` : '') : 'Durée indéterminée',
      ].filter(Boolean),
    },
    motif: { lignes: [] },
  }
  const versions = phraseVersions(reco.versions, 'Refusée')

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        surtitre="Clôture"
        titre="Recommandation refusée"
        reference={reco.titre}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'echeance' ? 'Où le client est parti, et jusqu’à quand' : 'Pourquoi nous l’avons perdue'}
        resumes={resumes}
        note={versions ? { titre: 'Les versions se ferment avec elle', texte: versions } : undefined}
        onFermer={sortie.demander}
      />

      <PanneauParcours>
        {etape === 'echeance' && (
          <>
            <EnTeteEtape numero={1} total={2} titre="La nouvelle échéance du client" />
            <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto pr-1">
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
                    <input type="date" autoFocus value={fin} onChange={(e) => { setEntame(true); setFin(e.target.value) }} className={cn(SAISIE_MONO, 'w-[170px]')} />
                  )}
                </div>
              </Champ>

              <Champ intitule="Nouveau fournisseur" requis>
                <div className="flex items-start gap-[10px]">
                  <div className="w-[230px] shrink-0">
                    <Segments
                      obligatoire
                      valeur={fournisseurId === INDETERMINE ? 'inconnu' : 'connu'}
                      options={[{ valeur: 'connu', libelle: 'Je le connais' }, { valeur: 'inconnu', libelle: 'Indéterminé' }]}
                      onChoisir={toucher((v: string) => setFournisseurId((avant) => (v === 'inconnu' ? INDETERMINE : avant === INDETERMINE ? '' : avant)))}
                    />
                  </div>
                  {/* PAS DE LISTE DÉROULANTE pour 53 fournisseurs (Naoëlle, 20/09/2026) : la
                      recherche, comme partout ailleurs. */}
                  {fournisseurId !== INDETERMINE && (
                    <div className="min-w-0 flex-1">
                      <ChoixParRecherche
                        items={fournisseurs ?? []}
                        valeur={fournisseurId}
                        onChoisir={(f) => { setEntame(true); setFournisseurId(f?.id ?? '') }}
                        placeholder="Chercher un fournisseur…"
                        principal={(f) => f.nom}
                        filtre={(f, q) => f.nom.toLowerCase().includes(q)}
                        aucun="Aucun fournisseur à ce nom."
                        totalLibelle={`${(fournisseurs ?? []).length} fournisseurs`}
                      />
                    </div>
                  )}
                </div>
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
                {dureeConnue && proposee != null && (
                  <span className={cn('text-[11.5px]', String(proposee) === duree.trim() ? 'text-km-green' : 'text-km-muted')}>
                    {String(proposee) === duree.trim() ? 'Proposée' : 'Proposition'} : {proposee} mois, du lendemain de la dernière fin connue à la nouvelle échéance.
                    {String(proposee) !== duree.trim() && (
                      <button type="button" onClick={() => { setDuree(String(proposee)); setEntame(true) }} className="ml-1 font-semibold text-km-green hover:underline">
                        Reprendre {proposee} mois
                      </button>
                    )}
                  </span>
                )}
                {dureeConnue && propositionsDivergent && (
                  <span className="text-[11.5px] text-km-muted">Les compteurs ne finissent pas leur dernier contrat le même jour : aucune durée commune à proposer.</span>
                )}
                {dureeInvalide && <span className="text-[11.5px] font-semibold text-km-red">Une durée en mois entiers, de 1 à 240.</span>}
              </Champ>

              {/* LE RÉSULTAT, AVANT D'ENREGISTRER : un contrat prospect par compteur, et le sort de
                  l'opportunité de suivi. */}
              <div className="flex flex-col gap-[8px] rounded-[12px] border border-km-line bg-km-bg px-4 py-[13px]">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
                  {compteurs.length === 0
                    ? 'Aucun compteur dans le périmètre'
                    : `${compteurs.length} contrat${compteurs.length > 1 ? 's' : ''} prospect${compteurs.length > 1 ? 's' : ''} ser${compteurs.length > 1 ? 'ont' : 'a'} créé${compteurs.length > 1 ? 's' : ''}`}
                </span>
                {compteurs.length === 0 && (
                  <span className="text-[12.5px] text-km-muted">Cette recommandation ne couvre aucun compteur : aucun contrat prospect ne peut être créé.</span>
                )}
                <div className="flex max-h-[150px] flex-col gap-[4px] overflow-y-auto">
                  {parCompteur.map((p) => (
                    <div key={p.compteur.id} className="flex items-center gap-2 text-[12.5px]">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#5E3F94]" />
                      <span className="w-[150px] shrink-0 truncate font-mono text-km-text">{p.compteur.numero_pdl}</span>
                      <span className="font-mono text-km-muted">
                        {chargement ? '…' : `${p.dates.date_debut ? dateFr(p.dates.date_debut) : 'début inconnu'} → ${p.dates.date_fin ? dateFr(p.dates.date_fin) : 'Indéterminée'}`}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="border-t border-km-line-soft pt-[8px] text-[12px] text-km-muted">
                  {opportunite
                    ? (finSaisie ? 'L’échéance tombe dans les douze mois : une opportunité de suivi sera créée.' : 'Échéance inconnue : une opportunité de suivi sera créée pour ne pas perdre le client de vue.')
                    : 'L’échéance dépasse un an : pas d’opportunité de suivi pour le moment.'}
                </span>
              </div>
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              <Button variant="primary" disabled={!echeancePrete} onClick={() => setEtape('motif')}>
                Suivant <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}

        {etape === 'motif' && (
          <>
            <EnTeteEtape numero={2} total={2} titre="Pourquoi avons-nous perdu ?" />
            <EtapeMotif
              question="Motif"
              aide="Le client est resté chez son fournisseur, un concurrent a proposé moins cher…"
              motif={motif}
              onMotif={toucher(setMotif)}
              date={date}
              onDate={toucher(setDate)}
            />
            <p className="mt-3 text-[11.5px] text-km-faint">Le motif s’affichera en rouge en haut de la recommandation.</p>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setEtape('echeance')}>Précédent</Button>
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              <Button variant="danger" disabled={!pret || cloturer.isPending} onClick={() => void valider()}>
                {cloturer.isPending ? 'Clôture…' : 'Clôturer en Refusée'}
                {!cloturer.isPending && <X className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}
