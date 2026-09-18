import { useCallback, useEffect, useMemo, useState } from 'react'
import { Phone, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { appelerNumero } from '@/lib/telephonie'
import { useCreateAction } from '@/lib/data/actions'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { LIBELLE_SOURCE, type LignePipe } from '@/lib/data/cockpit'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE SPRINT — UNE FICHE, UN APPEL, UNE SUITE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 15/09/2026 : « je rentre alors dans un process très particulier, chronométré, qui
 * affiche les fiches du pool dans l'ordre les unes après les autres. La fiche doit être exhaustive
 * mais montrer absolument les infos pertinentes. Quand la fiche s'affiche, je dois l'appeler. À la
 * fin de l'appel, le call est enregistré, la prochaine action est à prévoir et je passe à la fiche
 * suivante. »
 *
 * ══ UN RECOUVREMENT PLEIN ÉCRAN, ET NON UNE ROUTE ══
 *
 * Le sprint est un `fixed inset-0` par-dessus l'application. C'est ce qui fait disparaître le rail
 * de gauche et la barre du haut sans toucher à `AppLayout` — donc sans risque pour les quarante
 * autres écrans. Et c'est fidèle à l'intention : on ne navigue pas vers le sprint, on y entre.
 *
 * ══ LES TONS SOMBRES SONT CEUX DU RAIL, PAS UNE PALETTE ÉTRANGÈRE ══
 *
 * `km-side`, `km-side-line`, `km-side-text`… existent déjà : ce sont les couleurs du rail de
 * gauche. Les réutiliser fait que le sprint appartient visiblement à Kimatch au lieu de ressembler
 * à un autre produit posé par-dessus. Aucune couleur nouvelle n'est introduite.
 *
 * ══ LA FICHE EST COUPÉE PAR UNE QUESTION, PAS PAR UN TYPE DE DONNÉE ══
 *
 * À gauche : QUI j'appelle et comment. À droite : CE QU'IL FAUT SAVOIR AVANT DE PARLER — périmètre,
 * échéance et sa nature, tâches ouvertes, note. C'est l'information qui évite d'ouvrir trois
 * onglets pendant que ça sonne.
 *
 * ══ CLORE L'APPEL REMPLACE LA COLONNE DE DROITE, PAS L'ÉCRAN ══
 *
 * La personne reste visible à gauche pendant qu'on qualifie. Une boîte de dialogue aurait effacé le
 * nom de celui à qui on vient de parler — au moment précis où l'on écrit son commentaire.
 *
 * ══ SANS PROCHAINE ACTION, LA FICHE NE PART PAS ══
 *
 * C'est le seul verrou de l'écran, et il a une raison chiffrable : une opportunité ouverte sans
 * aucune tâche est un dossier que personne ne pousse, et le pipe du jour doit aller les repêcher
 * (seau `OPPORTUNITE_DORMANTE`). Le sprint ferme la fuite à sa source plutôt que de la rattraper
 * tous les matins.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les issues d'un échange. Distinctes de la qualification technique d'Allo — humain, répondeur,
 *  serveur vocal, pas de réponse — qui arrive par le webhook et que personne ne ressaisit. */
const ISSUES = ['Intéressé', 'À rappeler', 'Pas de réponse', 'Pas le bon interlocuteur', 'Refus', 'Faux numéro'] as const

/** Les suites proposées. « Aucune » n'y figure pas : c'est tout l'objet du verrou. */
const SUITES: { libelle: string; jours: number; type: 'APPELER' | 'ENVOYER_EMAIL' }[] = [
  { libelle: 'Rappeler demain', jours: 1, type: 'APPELER' },
  { libelle: 'Dans 3 jours', jours: 3, type: 'APPELER' },
  { libelle: 'Dans 1 semaine', jours: 7, type: 'APPELER' },
  { libelle: 'Envoyer un mail', jours: 0, type: 'ENVOYER_EMAIL' },
]

function dansNJours(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  /* Minuit LOCAL : c'est ainsi que toute l'application dit « pas d'heure » (`heureTache.ts`).
     Une suite choisie d'un clic ne doit pas inventer un rendez-vous à 14 h 30. */
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function chrono(secondes: number): string {
  const h = Math.floor(secondes / 3600)
  const m = Math.floor(secondes / 60) % 60
  const s = secondes % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function SprintCockpit({
  lignes,
  onSortir,
  onFermer,
}: {
  lignes: LignePipe[]
  onSortir: (ligne: string, motif: 'APPELE' | 'REPORTE' | 'ECARTE') => void
  onFermer: () => void
}) {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<'appel' | 'clore'>('appel')
  const [issue, setIssue] = useState<string | null>(null)
  const [suite, setSuite] = useState<number | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [secondes, setSecondes] = useState(0)
  const [appels, setAppels] = useState(0)
  /* ABOUTI N'EST PAS APPELÉ. Trois messages sur répondeur font trois appels et zéro abouti, et
     c'est la seule des deux mesures qui dit si la journée a servi à quelque chose. */
  const [aboutis, setAboutis] = useState(0)

  const creerAction = useCreateAction()
  const { data: typesActions } = useReferenceTable('types_actions')
  const { data: statutsActions } = useReferenceTable('statuts_actions')

  /* Le chrono ne sert pas à surveiller : il rend le temps visible à celui qui prospecte, ce qui
     est la seule façon de tenir une cadence sans regarder une horloge. */
  useEffect(() => {
    const t = setInterval(() => setSecondes((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const fiche = lignes[index]
  const suivantes = useMemo(() => lignes.slice(index + 1, index + 4), [lignes, index])

  const avancer = useCallback(() => {
    setPhase('appel')
    setIssue(null)
    setSuite(null)
    setCommentaire('')
    setIndex((i) => i + 1)
  }, [])

  const clore = useCallback(() => {
    if (!fiche || suite === null) return
    const choix = SUITES[suite]
    const type = typesActions?.find((t) => t.code === choix.type)
    const aFaire = statutsActions?.find((s) => s.code === 'A_FAIRE')

    void creerAction.mutateAsync({
      titre: `${choix.type === 'APPELER' ? 'Rappeler' : 'Écrire à'} ${fiche.nom_complet ?? 'ce contact'}`,
      type_action_id: type?.id ?? null,
      type_action_libelle: type?.libelle ?? (choix.type === 'APPELER' ? 'Appel' : 'Mail'),
      site_id: null,
      site_nom: '',
      contact_id: fiche.contact_id,
      contact_nom: fiche.nom_complet ?? '',
      priorite: 2,
      echeance: dansNJours(choix.jours),
      commentaire: [issue, commentaire].filter(Boolean).join(' — ') || null,
      statut_id: aFaire?.id ?? null,
      opportunite_id: fiche.cible_type === 'OPPORTUNITE' ? fiche.cible_id : null,
      piste_id: fiche.cible_type === 'PISTE' ? fiche.cible_id : null,
    })

    onSortir(fiche.ligne_id, 'APPELE')
    avancer()
  }, [fiche, suite, issue, commentaire, typesActions, statutsActions, creerAction, onSortir, avancer])

  /* ══ LE SPRINT SE MÈNE À LA SOURIS (16/09/2026) ══
     Ce panneau était pensé clavier d'abord : F pour « appel terminé », P pour « pas joignable »,
     A pour composer, flèche droite pour passer, Entrée pour clore. William : « oublie les
     raccourcis clavier, même pour le Cockpit et pour tout le reste de l'app qui reste à coder. La
     navigation se fera au clic uniquement. »

     RIEN N'EST DEVENU INATTEIGNABLE, et c'est ce qui a rendu la décision applicable sans rien
     réécrire : chacune de ces cinq touches doublait un bouton déjà présent à l'écran. Les pastilles
     qui les annonçaient partent avec elles — une aide qui désigne une touche morte est pire que pas
     d'aide.

     ÉCHAP RESTE : sortir d'un panneau plein écran n'est pas un raccourci, c'est la porte. */
  useEffect(() => {
    function surEchap(e: KeyboardEvent) {
      if (e.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', surEchap)
    return () => window.removeEventListener('keydown', surEchap)
  }, [onFermer])

  if (!fiche) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-km-side px-6 text-center text-km-side-text">
        <p className="font-mono text-km-label uppercase tracking-[0.3em] text-km-side-muted">
          Sprint terminé · {chrono(secondes)}
        </p>
        <p className="text-km-title font-medium">
          {appels} appel{appels > 1 ? 's' : ''} passé{appels > 1 ? 's' : ''}, plus rien dans la pile.
        </p>
        <button
          onClick={onFermer}
          className="rounded-km bg-km-green px-6 py-3 text-km-body font-semibold text-white hover:bg-[#0a6650]"
        >
          Revenir au plan du jour
        </button>
      </div>
    )
  }

  const tag = fiche.cible_type === 'PISTE' ? 'Piste' : 'Opportunité'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-km-side text-km-side-text">
      {/* ── LE RAIL DE PROGRESSION : la seule trace de la journée entière ── */}
      <div className="flex h-[3px] gap-[2px]" aria-hidden="true">
        {lignes.map((l, i) => (
          <span
            key={l.ligne_id}
            className={cn('flex-1', i < index ? 'bg-km-green/60' : i === index ? 'bg-km-green' : 'bg-km-side-line')}
          />
        ))}
      </div>

      {/* ── LA BARRE DE SÉANCE ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-km-side-line bg-km-side-bas px-4 py-2.5 font-mono text-km-label uppercase tracking-[0.12em] text-km-side-muted sm:px-8">
        <span className="text-km-lead tracking-[0.06em] text-km-green tabular-nums">{chrono(secondes)}</span>
        <span>
          Fiche <b className="font-medium text-km-side-text">{index + 1}</b> sur {lignes.length}
        </span>
        <span>
          Appels <b className="font-medium text-km-side-text">{appels}</b>
        </span>
        <span>
          Aboutis <b className="font-medium text-km-side-text">{aboutis}</b>
        </span>
        <button
          onClick={onFermer}
          className="ml-auto inline-flex items-center gap-2 rounded-km border border-km-side-line px-3 py-1.5 uppercase tracking-[0.12em] hover:border-km-side-muted hover:text-km-side-text"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Quitter · Échap
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1.05fr_0.95fr]">
        {/* ══ GAUCHE · QUI J'APPELLE ══ */}
        <div className="flex flex-col gap-5 px-4 py-8 sm:px-8">
          <span className="self-start rounded-km bg-km-green/15 px-2.5 py-1 font-mono text-km-label uppercase tracking-[0.12em] text-km-green">
            {LIBELLE_SOURCE[fiche.source]}
            {fiche.heure ? ` · ${fiche.heure}` : ''}
            {fiche.en_retard ? ' · en retard' : ''}
          </span>

          <h2 className="text-km-title font-medium leading-tight tracking-tight text-balance">
            {fiche.nom_complet ?? 'Sans nom'}
          </h2>
          <p className="-mt-3 text-km-lead text-km-side-muted">
            {fiche.fonction ?? 'Fonction inconnue'} · <b className="font-medium text-km-side-text">{fiche.compte_nom ?? '—'}</b>
          </p>

          <div className="flex flex-wrap gap-2 font-mono text-km-label">
            <span className="rounded-km border border-km-green/40 px-2 py-0.5 text-km-green">{tag}</span>
            {fiche.segment ? (
              <span className="rounded-km border border-km-side-line px-2 py-0.5 text-km-side-muted">{fiche.segment}</span>
            ) : null}
            {fiche.taches_ouvertes > 0 ? (
              <span className="rounded-km border border-km-side-line px-2 py-0.5 text-km-side-muted">
                {fiche.taches_ouvertes} tâche{fiche.taches_ouvertes > 1 ? 's' : ''} ouverte{fiche.taches_ouvertes > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>

          {/* LE NUMÉRO EN TOUTES LETTRES : c'est l'extension Chrome d'Allo qui le détecte pour
              proposer l'appel. Caché dans une infobulle, elle n'a rien à voir et le conseiller
              conclut que ça ne marche pas (voir `telephonie.tsx`). */}
          {[fiche.telephone, fiche.telephone_mobile]
            .filter((n, i, tous) => n && tous.indexOf(n) === i)
            .map((numero, i) => (
              <div
                key={numero}
                className={cn(
                  'flex items-center justify-between gap-4 rounded-km border border-km-side-line px-4 py-3',
                  i === 0 ? 'border-l-[3px] border-l-km-green bg-km-green/5' : '',
                )}
              >
                <span>
                  <span className={cn('block font-mono tabular-nums tracking-wider', i === 0 ? 'text-km-metric' : 'text-km-lead text-km-side-muted')}>
                    {numero}
                  </span>
                  <span className="font-mono text-km-label uppercase tracking-[0.1em] text-km-side-muted">
                    {i === 0 ? 'Ligne principale' : 'Second numéro'}
                  </span>
                </span>
                <button
                  onClick={() => void appelerNumero(numero, { nom: fiche.nom_complet, societe: fiche.compte_nom, fonction: fiche.fonction })}
                  className="inline-flex items-center gap-2 rounded-km border border-km-green px-4 py-2 text-km-body font-medium text-km-green hover:bg-km-green/10"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Appeler
                </button>
              </div>
            ))}

          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            {phase === 'appel' ? (
              <>
                <button
                  onClick={() => { setPhase('clore'); setAppels((n) => n + 1); setAboutis((n) => n + 1) }}
                  className="inline-flex items-center gap-2 rounded-km bg-km-green px-5 py-3 text-km-body font-semibold text-white hover:bg-[#0a6650]"
                >
                  Appel terminé
                </button>
                <button
                  onClick={() => { setPhase('clore'); setAppels((n) => n + 1); setIssue('Pas de réponse') }}
                  className="inline-flex items-center gap-2 rounded-km border border-km-side-line px-5 py-3 text-km-body hover:border-km-side-muted"
                >
                  Pas joignable
                </button>
                <button
                  onClick={() => { onSortir(fiche.ligne_id, 'REPORTE'); setPhase('clore') }}
                  className="rounded-km border border-km-side-line px-5 py-3 text-km-body hover:border-km-side-muted"
                >
                  Reporter
                </button>
                <button
                  onClick={() => { onSortir(fiche.ligne_id, 'ECARTE'); avancer() }}
                  className="rounded-km border border-km-side-line px-5 py-3 text-km-body hover:border-km-side-muted"
                >
                  Écarter
                </button>
                <button
                  onClick={avancer}
                  className="rounded-km px-5 py-3 text-km-body text-km-side-muted hover:text-km-side-text"
                >
                  Passer
                </button>
              </>
            ) : (
              <button
                onClick={() => setPhase('appel')}
                className="rounded-km border border-km-side-line px-5 py-3 text-km-body hover:border-km-side-muted"
              >
                ← Revenir à l’appel
              </button>
            )}
          </div>
        </div>

        {/* ══ DROITE · CE QU'IL FAUT SAVOIR, PUIS CLORE ══ */}
        <aside className="flex flex-col gap-4 border-t border-km-side-line bg-km-side-bas px-4 py-7 sm:px-6 lg:border-l lg:border-t-0">
          {phase === 'appel' ? (
            <>
              <span className="font-mono text-km-label uppercase tracking-[0.16em] text-km-side-muted">
                Ce qu’il faut savoir avant de parler
              </span>
              <dl className="overflow-hidden rounded-km border border-km-side-line">
                <Fait libelle="Périmètre" valeur={fiche.compteurs > 0 ? `${fiche.compteurs} compteur${fiche.compteurs > 1 ? 's' : ''}${fiche.mwh_annuels ? ` · ${Math.round(fiche.mwh_annuels).toLocaleString('fr-FR')} MWh/an` : ''}` : 'vide — à qualifier'} alerte={fiche.compteurs === 0} />
                <Fait libelle="Échéance" valeur={fiche.echeance ?? 'inconnue'} alerte={!fiche.echeance} />
                <Fait libelle="Nature de l’échéance" valeur={fiche.nature_echeance ?? '—'} bien={fiche.nature_echeance === 'PROUVEE'} />
                <Fait libelle="Pourquoi cette fiche est là" valeur={LIBELLE_SOURCE[fiche.source]} />
                <Fait
                  libelle="Dernier échange"
                  valeur={
                    fiche.dernier_echange
                      ? new Date(fiche.dernier_echange).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
                      : 'jamais appelé'
                  }
                  alerte={!fiche.dernier_echange}
                />
              </dl>

              {fiche.dernier_resume ? (
                <div className="rounded-km border border-km-side-line bg-km-side px-3.5 py-3 text-km-body">
                  <span className="mb-1.5 block font-mono text-km-label uppercase tracking-[0.14em] text-km-side-muted">
                    Ce qui s’est dit la dernière fois
                  </span>
                  <q className="italic text-km-side-text">{fiche.dernier_resume}</q>
                  {fiche.dernier_echange ? (
                    <span className="mt-1.5 block font-mono text-km-micro text-km-side-muted">
                      {new Date(fiche.dernier_echange).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {fiche.commentaire ? (
                <div className="rounded-km border border-dashed border-km-green/40 bg-km-green/5 px-3.5 py-3 text-km-body">
                  <span className="mb-1 block font-mono text-km-label uppercase tracking-[0.14em] text-km-green">
                    Note importante
                  </span>
                  {fiche.commentaire}
                </div>
              ) : null}

              {suivantes.length > 0 ? (
                <div className="mt-auto">
                  <span className="mb-2 block font-mono text-km-label uppercase tracking-[0.16em] text-km-side-muted">
                    À suivre
                  </span>
                  <ol className="grid gap-1.5">
                    {suivantes.map((s) => (
                      <li key={s.ligne_id} className="rounded-km border border-km-side-line px-3 py-2 text-km-body">
                        {s.nom_complet ?? 'Sans nom'}
                        <span className="ml-2 font-mono text-km-label text-km-side-muted">
                          {LIBELLE_SOURCE[s.source]}
                          {s.heure ? ` · ${s.heure}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-mono text-km-label uppercase tracking-[0.16em] text-km-green">Clore l’appel</span>
              <h3 className="text-km-lg font-medium">{fiche.nom_complet ?? 'Sans nom'}</h3>

              {/* CE QU'ALLO SAIT, ON NE LE RESSAISIT PAS. La qualification technique, la durée et
                  l'enregistrement arrivent par le webhook (`api/allo/webhook.ts`) et se lisent dans
                  `appels_en_cours`. Ce qu'on demande ici, c'est ce qu'aucune machine ne connaît :
                  l'issue de l'échange, et la suite. */}
              <p className="rounded-km border border-km-green/25 bg-km-green/8 px-3 py-2.5 text-km-body text-km-side-muted">
                La qualification, la durée et l’enregistrement sont lus chez Allo — vous n’avez pas
                à les saisir.
              </p>

              <Champ libelle="Issue de l’échange">
                <div className="flex flex-wrap gap-1.5">
                  {ISSUES.map((o) => (
                    <button
                      key={o}
                      aria-pressed={issue === o}
                      onClick={() => setIssue(o)}
                      className={cn(
                        'rounded-km border px-3 py-2 text-km-body',
                        issue === o
                          ? 'border-km-green bg-km-green/15 font-medium text-km-green'
                          : 'border-km-side-line text-km-side-muted hover:text-km-side-text',
                      )}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </Champ>

              <Champ libelle="Prochaine action" obligatoire>
                <div className="flex flex-wrap gap-1.5">
                  {SUITES.map((s, i) => (
                    <button
                      key={s.libelle}
                      aria-pressed={suite === i}
                      onClick={() => setSuite(i)}
                      className={cn(
                        'rounded-km border px-3 py-2 text-km-body',
                        suite === i
                          ? 'border-km-green bg-km-green/15 font-medium text-km-green'
                          : 'border-km-side-line text-km-side-muted hover:text-km-side-text',
                      )}
                    >
                      {s.libelle}
                    </button>
                  ))}
                </div>
              </Champ>

              <Champ libelle="Commentaire">
                <textarea
                  id="cockpit-commentaire"
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Ce qui a été dit, et qui servira au prochain appel."
                  className="min-h-[70px] w-full resize-y rounded-km border border-km-side-line bg-km-side px-3 py-2 text-km-body text-km-side-text placeholder:text-km-side-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-green"
                />
              </Champ>

              <button
                onClick={clore}
                disabled={!issue || suite === null}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-km px-4 py-3 text-km-body font-semibold',
                  issue && suite !== null
                    ? 'bg-km-green text-white hover:bg-[#0a6650]'
                    : 'cursor-not-allowed bg-km-side-line text-km-side-muted',
                )}
              >
                <span>{issue && suite !== null ? 'Enregistrer et fiche suivante' : 'Choisissez une issue et une suite'}</span>
              </button>
              <p className="text-km-micro text-km-side-muted">
                Sans prochaine action, la fiche ne quitte pas l’écran. C’est ce qui empêche une
                opportunité de s’endormir sans que personne le sache.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function Fait({ libelle, valeur, alerte, bien }: { libelle: string; valeur: string; alerte?: boolean; bien?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-km-side-line px-3.5 py-2.5 text-km-body last:border-b-0">
      <dt className="text-km-side-muted">{libelle}</dt>
      <dd className={cn('text-right font-medium', alerte ? 'text-km-amber' : bien ? 'text-km-green' : '')}>{valeur}</dd>
    </div>
  )
}

function Champ({ libelle, obligatoire, children }: { libelle: string; obligatoire?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block font-mono text-km-label uppercase tracking-[0.16em] text-km-side-muted">
        {libelle}
        {obligatoire ? <span className="ml-1.5 normal-case tracking-normal text-km-green">— obligatoire</span> : null}
      </span>
      {children}
    </div>
  )
}
