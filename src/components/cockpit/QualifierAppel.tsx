import { useState } from 'react'
import { Mail, CalendarClock, UserX, ArrowRightLeft, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LIBELLE_ISSUE } from '@/lib/data/appelEnCours'
import type { AppelEnCours, Interlocuteur, IssueAppel, Qualification } from '@/lib/data/appelEnCours'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * QUALIFIER L'APPEL, DANS LA FENÊTRE OÙ IL SE PASSE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026, en quatre temps : qui a décroché, à qui on a parlé, ce que ça valait, ce que
 * ça donne. Puis les gestes qui suivent.
 *
 * ══ CE QUI SE DÉCLENCHE TOUT SEUL, ET CE QU'IL FAUT DEMANDER ══
 *
 * « Ça doit se déclencher dès qu'Allô détecte que ça a répondu (fin de la tonalité). Dis-moi si
 * c'est faisable. » Réponse, vérifiée sur leurs données et non supposée :
 *
 *   · LE DÉCROCHÉ, OUI. `call.answered` arrive en direct et remplit `decroche_le`. C'est ce qui
 *     fait apparaître la première question, au moment exact où la tonalité s'arrête.
 *
 *   · HUMAIN OU RÉPONDEUR, NON — PAS EN DIRECT. Allô sait distinguer : sur 405 appels sortants de
 *     la base, 321 sont `ANSWERED` et 66 `VOICEMAIL`. Mais ce verdict voyage avec `call.completed`,
 *     qui arrive une trentaine de secondes APRÈS le raccrochage. Au moment où la tonalité cesse,
 *     seul l'humain sait ce qu'il entend. On lui pose donc la question — une question, trois
 *     boutons, moins d'une seconde.
 *
 *   · LE « PERSONNE NE RÉPOND », OUI, ET SANS RIEN DEMANDER. Si la tonalité n'a jamais cessé —
 *     `decroche_le` reste vide — il n'y a rien à qualifier : l'appel est un NRP, et l'écran passe
 *     directement à la relance. C'est exactement la règle de William, et elle se déduit.
 *
 * DÉTAIL QUI COMPTE : un répondeur DÉCROCHE. 38 des 66 appels `VOICEMAIL` portent un `decroche_le`.
 * « Ça a répondu » ne veut donc pas dire « quelqu'un a répondu » — d'où la question, et d'où le
 * fait qu'on ne peut pas la deviner.
 *
 * ══ L'AURA NE S'AFFICHE QUE SI QUELQU'UN A PARLÉ ══
 *
 * « Uniquement si j'ai reach un humain au téléphone, autrement c'est inutile. » Noter la chaleur
 * d'un répondeur n'a aucun sens, et un champ qui n'a pas de sens finit par être rempli au hasard —
 * ce qui pollue la mesure qu'il devait servir.
 *
 * ══ CHAQUE RÉPONSE PART SEULE ══
 *
 * Le parcours s'interrompt tout le temps : le téléphone resonne, la fiche suivante s'ouvre. Chaque
 * clic écrit immédiatement. Attendre la fin perdrait les trois premiers quand le quatrième
 * n'arrive pas — et c'est le cas fréquent, pas le cas rare.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const QUI: { valeur: Qualification; libelle: string; detail: string }[] = [
  { valeur: 'HUMAIN', libelle: 'Quelqu’un', detail: 'une personne a répondu' },
  { valeur: 'REPONDEUR', libelle: 'Répondeur', detail: 'messagerie vocale' },
  { valeur: 'SERVEUR_VOCAL', libelle: 'Serveur vocal', detail: 'standard automatique' },
]

/* Du plus positif au plus négatif : la main va toujours au même endroit chercher la même réponse. */
const ISSUES: { valeur: IssueAppel; libelle: string; ton: 'tres-positif' | 'positif' | 'neutre' | 'negatif' | 'tres-negatif' }[] = [
  { valeur: 'FACTURES', libelle: LIBELLE_ISSUE.FACTURES, ton: 'tres-positif' },
  { valeur: 'INTERESSE', libelle: LIBELLE_ISSUE.INTERESSE, ton: 'positif' },
  { valeur: 'INDIFFERENT', libelle: LIBELLE_ISSUE.INDIFFERENT, ton: 'neutre' },
  { valeur: 'PAS_LE_BON_MOMENT', libelle: LIBELLE_ISSUE.PAS_LE_BON_MOMENT, ton: 'neutre' },
  { valeur: 'DEJA_RENEGOCIE', libelle: LIBELLE_ISSUE.DEJA_RENEGOCIE, ton: 'negatif' },
  { valeur: 'REFUS', libelle: LIBELLE_ISSUE.REFUS, ton: 'tres-negatif' },
]

const TON_ISSUE = {
  'tres-positif': 'border-km-side-green bg-km-side-green/20 text-km-side-green',
  positif: 'border-km-side-green/60 bg-km-side-green/10 text-km-side-green',
  neutre: 'border-km-side-line bg-km-side-bas text-km-side-text',
  negatif: 'border-km-amber/50 bg-km-amber/10 text-km-amber',
  'tres-negatif': 'border-km-side-red/60 bg-km-side-red/10 text-km-side-red',
} as const

/** Les cinq degrés, dits en mots : « 3 » seul ne veut rien dire deux semaines plus tard. */
const AURAS = ['Très négatif', 'Négatif', 'Neutre', 'Positif', 'Très positif']

export interface GestesApresAppel {
  /** Faux quand la fiche n'a pas d'adresse : le bouton se désactive au lieu d'ouvrir un vide. */
  aEmail: boolean
  onEcrire: () => void
  onRelancer: () => void
  onDisqualifier: () => void
  onConvertir: () => void
  onEcheance: () => void
}

export function QualifierAppel({
  appel,
  nomContact,
  estPiste,
  onPatch,
  gestes,
}: {
  appel: AppelEnCours
  nomContact: string
  estPiste: boolean
  onPatch: (patch: {
    qualification?: Qualification
    interlocuteur?: Interlocuteur | null
    interlocuteur_nom?: string | null
    aura?: number | null
    issue?: IssueAppel | null
  }) => void
  gestes: GestesApresAppel
}) {
  const [autreNom, setAutreNom] = useState(appel.interlocuteur_nom ?? '')

  const aDecroche = appel.decroche_le != null
  const humain = appel.qualification === 'HUMAIN'
  /* PERSONNE N'A DÉCROCHÉ ET L'APPEL EST FINI : c'est un NRP, il n'y a rien à demander. */
  const nrp = !aDecroche && appel.termine_le != null

  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      {nrp ? (
        <Bloc titre="Personne n’a répondu">
          <p className="text-km-body text-km-side-muted">
            La tonalité n’a jamais cessé : l’appel est classé <b className="font-semibold text-km-side-text">NRP</b>,
            sans rien à saisir. Il ne reste qu’à décider quand rappeler.
          </p>
          <Relance gestes={gestes} />
        </Bloc>
      ) : !aDecroche ? (
        <Bloc titre="La ligne sonne">
          <p className="text-km-body text-km-side-muted">
            Les questions apparaîtront dès qu’Allô signalera que ça a décroché.
          </p>
        </Bloc>
      ) : (
        <>
          <Bloc titre="Qui avez-vous eu ?">
            <div className="grid gap-2 sm:grid-cols-3">
              {QUI.map((q) => (
                <Choix
                  key={q.valeur}
                  actif={appel.qualification === q.valeur}
                  onClick={() => onPatch({ qualification: q.valeur })}
                  libelle={q.libelle}
                  detail={q.detail}
                />
              ))}
            </div>
          </Bloc>

          {/* ── PERSONNE AU BOUT DU FIL : on ne demande rien d'autre, on propose de rappeler ── */}
          {appel.qualification === 'REPONDEUR' || appel.qualification === 'SERVEUR_VOCAL' ? (
            <Bloc titre="Rappeler quand ?">
              <Relance gestes={gestes} />
            </Bloc>
          ) : null}

          {humain ? (
            <>
              <Bloc titre="À qui avez-vous parlé ?">
                <div className="flex flex-wrap items-center gap-2">
                  <Choix
                    compact
                    actif={appel.interlocuteur === 'CONTACT'}
                    onClick={() => onPatch({ interlocuteur: 'CONTACT', interlocuteur_nom: null })}
                    libelle={nomContact || 'Le contact de la fiche'}
                  />
                  <Choix
                    compact
                    actif={appel.interlocuteur === 'AUTRE'}
                    onClick={() => onPatch({ interlocuteur: 'AUTRE' })}
                    libelle="Quelqu’un d’autre"
                  />
                </div>
                {appel.interlocuteur === 'AUTRE' ? (
                  <div className="mt-2.5 flex items-center gap-2">
                    <input
                      value={autreNom}
                      autoFocus
                      onChange={(e) => setAutreNom(e.target.value)}
                      onBlur={() => onPatch({ interlocuteur_nom: autreNom.trim() || null })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); onPatch({ interlocuteur_nom: autreNom.trim() || null }) }
                      }}
                      placeholder="Son nom, sa fonction — ce qu’on en sait"
                      aria-label="Qui était au bout du fil"
                      className="min-w-0 flex-1 rounded-km border border-km-side-line bg-km-side px-3 py-2 text-km-body text-km-side-text placeholder:text-km-side-faint focus-visible:border-km-side-green focus-visible:outline-none"
                    />
                    {appel.interlocuteur_nom ? <Check className="h-4 w-4 shrink-0 text-km-side-green" aria-hidden="true" /> : null}
                  </div>
                ) : null}
              </Bloc>

              {/* ══ L'AURA — CINQ DEGRÉS, DITS EN MOTS ══
                  Un chiffre nu se relit mal : « 3 » ne veut rien dire deux semaines plus tard. Le
                  mot est sous le chiffre, et c'est lui qu'on lira dans l'historique. */}
              <Bloc titre="Aura de l’appel">
                <div className="grid grid-cols-5 gap-1.5">
                  {AURAS.map((mot, i) => {
                    const note = i + 1
                    const actif = appel.aura === note
                    return (
                      <button
                        key={mot}
                        type="button"
                        aria-pressed={actif}
                        onClick={() => onPatch({ aura: note })}
                        className={cn(
                          'flex flex-col items-center gap-0.5 rounded-km border px-1 py-2 transition-colors',
                          actif
                            ? note <= 2
                              ? 'border-km-side-red bg-km-side-red/15 text-km-side-red'
                              : note === 3
                                ? 'border-km-side-line bg-km-side-line/40 text-km-side-text'
                                : 'border-km-side-green bg-km-side-green/15 text-km-side-green'
                            : 'border-km-side-line text-km-side-muted hover:border-km-side-muted hover:text-km-side-text',
                        )}
                      >
                        <span className="font-mono text-km-lead font-bold tabular-nums">{note}</span>
                        <span className="text-center text-km-micro leading-tight">{mot}</span>
                      </button>
                    )
                  })}
                </div>
              </Bloc>

              <Bloc titre="Ce que l’appel donne">
                <div className="flex flex-wrap gap-2">
                  {ISSUES.map((o) => (
                    <button
                      key={o.valeur}
                      type="button"
                      aria-pressed={appel.issue === o.valeur}
                      onClick={() => {
                        onPatch({ issue: o.valeur })
                        /* « A déjà renégocié » réclame la date de fin du contrat en place : sans
                           elle, on ne saura pas quand revenir, et la piste ressortira au hasard. */
                        if (o.valeur === 'DEJA_RENEGOCIE') gestes.onEcheance()
                      }}
                      className={cn(
                        'rounded-km border px-3 py-2 text-km-body font-medium transition-colors',
                        appel.issue === o.valeur
                          ? TON_ISSUE[o.ton]
                          : 'border-km-side-line text-km-side-muted hover:border-km-side-muted hover:text-km-side-text',
                      )}
                    >
                      {o.libelle}
                    </button>
                  ))}
                </div>
              </Bloc>

              {/* ══ LES GESTES RAPIDES, APRÈS L'ISSUE ET PAS AVANT ══
                  Ils n'ont de sens qu'une fois qu'on sait ce que l'appel a donné : proposer
                  « disqualifier » avant d'avoir demandé l'issue reviendrait à demander deux fois la
                  même chose, dans le désordre. */}
              {appel.issue ? (
                <Bloc titre="Et maintenant">
                  <div className="flex flex-wrap gap-2">
                    <Geste
                      icone={Mail}
                      libelle="Envoyer un mail"
                      onClick={gestes.onEcrire}
                      inactif={!gestes.aEmail}
                      titre={gestes.aEmail
                        ? 'Ouvre l’éditeur de Kimatch, par-dessus le sprint'
                        : 'Aucune adresse sur cette fiche — ajoutez-la sur la carte « Contacter »'}
                    />
                    <Geste icone={CalendarClock} libelle="Programmer une relance" onClick={gestes.onRelancer} />
                    {estPiste ? (
                      <>
                        <Geste icone={ArrowRightLeft} libelle="Convertir la piste" onClick={gestes.onConvertir} />
                        <Geste icone={UserX} libelle="Disqualifier" onClick={gestes.onDisqualifier} danger />
                      </>
                    ) : null}
                  </div>
                </Bloc>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-2 block font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-side-faint">
        {titre}
      </span>
      {children}
    </div>
  )
}

function Choix({
  actif, onClick, libelle, detail, compact,
}: { actif: boolean; onClick: () => void; libelle: string; detail?: string; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={cn(
        'rounded-km border text-left transition-colors',
        compact ? 'px-3 py-2' : 'px-3 py-2.5',
        actif
          ? 'border-km-side-green bg-km-side-green/15 text-km-side-green'
          : 'border-km-side-line text-km-side-muted hover:border-km-side-muted hover:text-km-side-text',
      )}
    >
      <span className="block truncate text-km-body font-semibold">{libelle}</span>
      {detail ? <span className="mt-0.5 block truncate text-km-micro opacity-80">{detail}</span> : null}
    </button>
  )
}

function Geste({
  icone: Icone, libelle, onClick, danger, inactif, titre,
}: { icone: typeof Mail; libelle: string; onClick: () => void; danger?: boolean; inactif?: boolean; titre?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inactif}
      title={titre}
      className={cn(
        'inline-flex items-center gap-2 rounded-km border px-3 py-2 text-km-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        danger
          ? 'border-km-side-red/50 text-km-side-red hover:bg-km-side-red/10'
          : 'border-km-side-line text-km-side-text hover:border-km-side-muted hover:bg-km-side-bas',
      )}
    >
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {libelle}
    </button>
  )
}

/** Les trois délais qui couvrent l'immense majorité des rappels, plus la date précise. */
function Relance({ gestes }: { gestes: GestesApresAppel }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Geste icone={CalendarClock} libelle="Programmer une relance" onClick={gestes.onRelancer} />
    </div>
  )
}
