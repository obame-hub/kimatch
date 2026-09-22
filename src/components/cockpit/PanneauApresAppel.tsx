import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { instantTache } from '@/lib/heureTache'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES GESTES D'APRÈS-APPEL — ILS REMPLACENT LA FENÊTRE, ILS NE S'EMPILENT PAS DESSUS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « envoyer un mail (ouverture d'un éditeur mail À LA PLACE de la fenêtre de
 * call) ». La consigne vaut pour les quatre : le sprint est déjà un recouvrement plein écran, une
 * boîte de dialogue par-dessus ferait un troisième étage et cacherait le nom de celui à qui l'on
 * vient de parler — au moment précis où l'on écrit sur lui.
 *
 * Chaque geste occupe donc la fenêtre, avec un retour explicite. Le chrono et l'état restent
 * au-dessus : on ne perd jamais de vue qu'un appel est en cours.
 */
/* `mail` reste dans la liste, mais il est rendu par `EditeurMailSprint` et non ici : cet éditeur
   a sa propre mécanique — mise en forme, pièces jointes, envoi Gmail — et elle n'a rien à voir avec
   les trois petits formulaires de ce panneau. */
export type GesteApresAppel = 'mail' | 'relance' | 'disqualifier' | 'convertir' | 'echeance' | 'clore'

const TITRES: Record<GesteApresAppel, string> = {
  mail: 'Écrire à ce contact',
  /* « Nouvelle tâche » ET NON « relance » (William, 22/09/2026, liste des actions rapides) : on y
     programme aussi bien un rappel qu'un envoi de document ou une relance du conseil syndical. Le
     mot « relance » décrivait un seul de ces cas et faisait chercher ailleurs pour les autres. */
  relance: 'Nouvelle tâche',
  disqualifier: 'Disqualifier la piste',
  convertir: 'Convertir en opportunité',
  echeance: 'Échéance du contrat en place',
  clore: 'Clore l’opportunité',
}

/** Les trois délais qui couvrent l'immense majorité des rappels. Le quatrième, c'est le calendrier. */
const DELAIS: { libelle: string; jours: number }[] = [
  { libelle: 'Demain', jours: 1 },
  { libelle: 'Dans 3 jours', jours: 3 },
  { libelle: 'La semaine prochaine', jours: 7 },
]

function dansNJoursISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PanneauApresAppel({
  geste,
  nom,
  motifsDisqualification,
  qualificationsFin,
  statutPiste,
  onFermer,
  onRelancer,
  onDisqualifier,
  onConvertir,
  onEcheance,
  onClore,
}: {
  geste: GesteApresAppel
  nom: string
  motifsDisqualification: readonly string[]
  /** Les mêmes qu'à la fiche d'une opportunité : `QUALIFICATIONS_FIN`, jamais une seconde liste. */
  qualificationsFin: readonly { code: string; libelle: string }[]
  /** Le code du statut de la piste : c'est lui qui autorise, ou non, la conversion. */
  statutPiste: string | null
  onFermer: () => void
  /** Titre, et l'instant complet — `instantTache` a déjà fait la conversion depuis l'heure locale. */
  onRelancer: (titre: string, instant: string) => void
  onDisqualifier: (motif: string) => void
  onConvertir: () => void
  onEcheance: (jour: string) => void
  onClore: (qualification: string, motif: string) => void
}) {
  const [titre, setTitre] = useState(`Rappeler ${nom}`.trim())
  const [jour, setJour] = useState(dansNJoursISO(1))
  const [heure, setHeure] = useState('')
  const [motif, setMotif] = useState('')
  const [echeance, setEcheance] = useState('')
  const [qualification, setQualification] = useState('')
  const [motifCloture, setMotifCloture] = useState('')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onFermer}
          className="inline-flex items-center gap-1.5 rounded-km border border-km-side-line px-2.5 py-1 text-km-label font-semibold text-km-side-muted transition-colors hover:border-km-side-muted hover:text-km-side-text"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Retour
        </button>
        <span className="font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-side-faint">
          {TITRES[geste]}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {geste === 'relance' ? (
          <div className="flex flex-col gap-3">
            <Champ libelle="Ce qu’il faudra faire">
              <input
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                placeholder="Rappeler, envoyer la proposition…"
                className={champStyle}
              />
            </Champ>
            <div className="flex flex-wrap gap-2">
              {DELAIS.map((d) => (
                <button
                  key={d.libelle}
                  type="button"
                  onClick={() => setJour(dansNJoursISO(d.jours))}
                  className={cn(
                    'rounded-km border px-3 py-1.5 text-km-body font-semibold transition-colors',
                    jour === dansNJoursISO(d.jours)
                      ? 'border-km-side-green bg-km-side-green/15 text-km-side-green'
                      : 'border-km-side-line text-km-side-muted hover:border-km-side-muted hover:text-km-side-text',
                  )}
                >
                  {d.libelle}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Champ libelle="Date">
                <input type="date" value={jour} onChange={(e) => setJour(e.target.value)} className={champStyle} />
              </Champ>
              <Champ libelle="Heure (facultative)">
                <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={champStyle} />
              </Champ>
            </div>
            {/* SANS HEURE, L'ÉCHÉANCE VAUT MINUIT LOCAL : c'est ainsi que toute l'application dit
                « pas d'heure ». `instantTache` fait la conversion depuis l'heure LOCALE — c'est ce
                qui évite la famille de bogues « J-1 ». */}
            <Action
              libelle="Créer la relance"
              actif={Boolean(titre.trim() && jour)}
              onClick={() => {
                const instant = instantTache(jour, heure || null)
                if (instant) onRelancer(titre.trim(), instant)
              }}
            />
          </div>
        ) : null}

        {geste === 'disqualifier' ? (
          <div className="flex flex-col gap-3">
            <p className="text-km-body text-km-side-muted">
              La piste sort du plan du jour et ne reviendra plus. Le motif est obligatoire : c’est
              lui qu’on relira pour savoir s’il faut la rouvrir un jour.
            </p>
            <div className="flex flex-wrap gap-2">
              {motifsDisqualification.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotif(m)}
                  className={cn(
                    'rounded-km border px-3 py-1.5 text-km-body font-semibold transition-colors',
                    motif === m
                      ? 'border-km-side-red bg-km-side-red/15 text-km-side-red'
                      : 'border-km-side-line text-km-side-muted hover:border-km-side-muted hover:text-km-side-text',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <Champ libelle="Ou un motif à vous">
              <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Pourquoi on arrête" className={champStyle} />
            </Champ>
            <Action libelle="Disqualifier" danger actif={Boolean(motif.trim())} onClick={() => onDisqualifier(motif.trim())} />
          </div>
        ) : null}

        {geste === 'convertir' ? (
          <div className="flex flex-col gap-3">
            {/* ══ LA CONVERSION SE FAIT SUR LA FICHE, ET C'EST VOULU ══

                Elle crée un contact, un compte et une opportunité d'un seul geste, et elle exige de
                choisir le contact retenu — un prérequis posé par Michel, qui ne peut pas être nul.
                Ce choix ne se devine pas depuis le sprint : une piste en porte parfois deux, parfois
                aucun. Le bouton ouvre donc la fiche, où la boîte de conversion existe déjà et pose
                les bonnes questions. Le sprint reste ouvert dans son onglet.

                UNE CONVERSION BÂCLÉE COÛTE PLUS QU'UNE CONVERSION REPORTÉE : elle salit le
                portefeuille de comptes vides qu'il faut ensuite retrouver un par un. */}
            {/* ══ ON NE CONVERTIT PAS SANS FACTURE ══

                William, 22/09/2026 : « la conversion se fait lors du clic sur le bouton et n'est
                possible que lorsque j'ai reçu une facture ».

                LA FACTURE N'A PAS DE TRACE EN BASE — il n'existe aujourd'hui aucun champ qui dise
                « elle est arrivée », et une seule piste sur 4 700 porte un document. Le seul témoin
                disponible est donc le PARCOURS : on ne l'a demandée qu'en passant par « Demander les
                factures », qui pose « En attente de facture ». Une piste qui n'y est jamais passée
                n'a rien à convertir. Ce n'est pas une preuve, c'est le meilleur garde-fou que les
                données permettent aujourd'hui — et il est dit en toutes lettres plutôt que d'être
                présenté comme une vérification. */}
            {statutPiste === 'EN_ATTENTE_FACTURE' ? (
              <>
                <p className="text-km-body text-km-side-muted">
                  La piste devient un <b className="font-semibold text-km-side-text">contact</b>, un
                  <b className="font-semibold text-km-side-text"> compte</b> et une
                  <b className="font-semibold text-km-side-text"> opportunité</b>. Celle-ci naîtra
                  directement en <b className="font-semibold text-km-side-text">Couverture mandat</b>,
                  avec une tâche <b className="font-semibold text-km-side-text">« Relance mandat »</b>
                  {' '}au lendemain : elle reviendra donc d’elle-même dans le plan de demain.
                </p>
                <p className="text-km-body text-km-side-muted">
                  Le périmètre se construit à partir de la facture reçue : la conversion s’ouvre sur
                  la fiche de la piste, dans un nouvel onglet. Le sprint reste ici.
                </p>
                <Action libelle="Ouvrir la fiche pour convertir" actif onClick={onConvertir} />
              </>
            ) : (
              <>
                <p className="text-km-body text-km-side-muted">
                  On ne convertit pas une piste dont on n’a pas reçu de facture : sans elle, il n’y a
                  ni périmètre ni rien à couvrir, et l’opportunité naîtrait vide.
                </p>
                <p className="rounded-km border border-km-side-line bg-km-side px-3 py-2.5 text-km-body text-km-side-muted">
                  Passez d’abord par <b className="font-semibold text-km-side-text">Demander les
                  factures</b>. La piste entrera en <b className="font-semibold text-km-side-text">En
                  attente de facture</b>, et la conversion s’ouvrira ici.
                </p>
                <Action libelle="Conversion indisponible" actif={false} onClick={() => {}} />
              </>
            )}
          </div>
        ) : null}

        {geste === 'clore' ? (
          <div className="flex flex-col gap-3">
            {/* ══ LA MÊME CLÔTURE QUE SUR LA FICHE, PAS UNE VERSION ALLÉGÉE ══
                Les qualifications viennent de `QUALIFICATIONS_FIN`, celles-là mêmes qu'emploie
                `OpportuniteDetail`. Une opportunité close depuis le sprint doit être indiscernable
                d'une opportunité close depuis sa fiche — sinon les états du portefeuille dépendent
                de l'écran par lequel on est passé. */}
            <p className="text-km-body text-km-side-muted">
              L’opportunité quitte le pipe et le portefeuille actif. La qualification dit
              <b className="font-semibold text-km-side-text"> pourquoi</b>, et c’est elle qu’on
              relira pour savoir s’il faut la rouvrir.
            </p>
            <div className="flex flex-wrap gap-2">
              {qualificationsFin.map((q) => (
                <button
                  key={q.code}
                  type="button"
                  onClick={() => setQualification(q.code)}
                  className={cn(
                    'rounded-km border px-3 py-1.5 text-km-body font-semibold transition-colors',
                    qualification === q.code
                      ? 'border-km-side-green bg-km-side-green/15 text-km-side-green'
                      : 'border-km-side-line text-km-side-muted hover:border-km-side-muted hover:text-km-side-text',
                  )}
                >
                  {q.libelle}
                </button>
              ))}
            </div>
            <Champ libelle="Motif (facultatif)">
              <input
                value={motifCloture}
                onChange={(e) => setMotifCloture(e.target.value)}
                placeholder="Ce qu’il faudra savoir si on la rouvre"
                className={champStyle}
              />
            </Champ>
            <Action
              libelle="Clore l’opportunité"
              danger
              actif={Boolean(qualification)}
              onClick={() => onClore(qualification, motifCloture.trim())}
            />
          </div>
        ) : null}

        {geste === 'echeance' ? (
          <div className="flex flex-col gap-3">
            <p className="text-km-body text-km-side-muted">
              Il a déjà renégocié : c’est la date de fin de son contrat qui dit quand revenir. Sans
              elle, la piste ressortira au hasard.
            </p>
            <Champ libelle="Fin du contrat en place">
              <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} className={champStyle} />
            </Champ>
            <Action libelle="Enregistrer l’échéance" actif={Boolean(echeance)} onClick={() => onEcheance(echeance)} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

const champStyle =
  'w-full rounded-km border border-km-side-line bg-km-side px-3 py-2 text-km-body text-km-side-text placeholder:text-km-side-faint focus-visible:border-km-side-green focus-visible:outline-none'

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-[9rem] flex-1">
      <span className="mb-1 block font-mono text-km-label font-semibold uppercase tracking-[0.14em] text-km-side-faint">
        {libelle}
      </span>
      {children}
    </label>
  )
}

function Action({
  libelle, onClick, actif, danger,
}: { libelle: string; onClick: () => void; actif: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={!actif}
      onClick={onClick}
      className={cn(
        'inline-flex h-10 w-fit items-center justify-center rounded-km px-5 text-km-name font-bold transition-[filter]',
        !actif
          ? 'cursor-not-allowed bg-km-side-line text-km-side-faint'
          : danger
            ? 'bg-km-side-red text-[#2A0F0C] hover:brightness-110'
            : 'bg-km-side-green text-[#0B241C] hover:brightness-110',
      )}
    >
      {libelle}
    </button>
  )
}
