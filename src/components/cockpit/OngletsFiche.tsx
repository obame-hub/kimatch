import { useMemo, useState } from 'react'
import {
  Building2, ChevronDown, FileText, Gauge, Mail, MailCheck, MailOpen, MailQuestion, MailX,
  NotebookPen, Phone, PhoneOff, Play,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { dureeLisible, LIBELLE_ISSUE, LIBELLE_QUALIFICATION } from '@/lib/data/appelEnCours'
import { jourLocalISO } from '@/lib/heureTache'
import {
  useEcrireNote,
  useFilActivite,
  usePoserValence,
  type EvenementFil,
  type FicheDetaillee,
  type LignePipe,
} from '@/lib/data/cockpit'
import type { Valence } from '@/lib/santeRelation'
import { HerosFil } from '@/components/cockpit/HerosFil'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE VOLET DE DROITE DU SPRINT — TROIS ONGLETS, TROIS QUESTIONS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « je veux qu'il affiche des détails de la fiche ouverte. Je veux une
 * articulation en 3 onglets. »
 *
 *   FIL D'ACTIVITÉ   ce qu'on s'est déjà dit — et ce qu'on écrit pendant qu'on parle
 *   PÉRIMÈTRE        ce qu'il y a à couvrir : des copropriétés sur une piste, des compteurs sur
 *                    une opportunité
 *   SOCIÉTÉ          l'identité administrative, qu'on ne retient pas et qu'on cherche toujours
 *
 * ══ POURQUOI DES ONGLETS ET NON UNE COLONNE QUI DÉROULE ══
 *
 * Le sprint se tient sur un écran de treize pouces, souvent en écran partagé. Empilées, ces trois
 * zones demanderaient de faire défiler pendant l'appel — c'est-à-dire de perdre des yeux ce qu'on
 * était en train de lire. Un onglet garde chaque réponse à une seule décision de clic.
 *
 * ══ L'ORDRE N'EST PAS ARBITRAIRE ══
 *
 * Le fil d'abord, parce que la première question avant de décrocher est « où en est-on ». Le
 * périmètre ensuite : c'est l'objet même de l'appel, obtenir une facture sur une piste, couvrir le
 * parc sur une opportunité. La société en dernier : on n'y va que lorsqu'on nous la demande.
 */
type Onglet = 'fil' | 'perimetre' | 'societe'

export function OngletsFiche({
  ligne,
  fiche,
}: {
  ligne: LignePipe
  fiche: FicheDetaillee | undefined
}) {
  const [onglet, setOnglet] = useState<Onglet>('fil')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* LA BARRE RESTE EN HAUT pendant qu'on fait défiler le fil : autrement, revenir au
          périmètre après avoir lu trois appels demanderait de remonter d'abord. */}
      <div
        role="tablist"
        aria-label="Détail de la fiche"
        /* ══ PAS DE MARGE NÉGATIVE DANS UN CONTENEUR QUI DÉFILE ══

           William, 22/09/2026 : « supprime la possibilité du scroll horizontal dans le volet de
           droite, il y en a un dans le fil d'activité ».

           C'ÉTAIT CE `-mx-4`. Il servait à faire saigner la barre jusqu'aux bords du volet — mais
           le conteneur qui défile n'a PAS la marge intérieure de l'`aside` : la barre y débordait
           donc de 32 px, et `overflow-y-auto` rend l'autre axe défilant dès qu'il déborde. Le filet
           s'arrête maintenant à la largeur du contenu, ce qui ne coûte rien à l'œil. */
        className="sticky top-0 z-10 mb-4 flex gap-6 border-b border-km-side-line bg-km-side-bas"
      >
        <Onglette actif={onglet === 'fil'} icone={NotebookPen} libelle="Fil d’activité" onClick={() => setOnglet('fil')} />
        <Onglette actif={onglet === 'perimetre'} icone={Gauge} libelle="Périmètre" onClick={() => setOnglet('perimetre')} />
        <Onglette actif={onglet === 'societe'} icone={Building2} libelle="Société" onClick={() => setOnglet('societe')} />
      </div>

      <div className="min-h-0 flex-1">
        {onglet === 'fil' ? <FilActivite ligne={ligne} fiche={fiche} /> : null}
        {onglet === 'perimetre' ? <Perimetre ligne={ligne} fiche={fiche} /> : null}
        {onglet === 'societe' ? <Societe fiche={fiche} /> : null}
      </div>
    </div>
  )
}

function Onglette({
  actif, icone: Icone, libelle, onClick,
}: {
  actif: boolean
  icone: typeof Gauge
  libelle: string
  onClick: () => void
}) {
  return (
    <button
      role="tab"
      aria-selected={actif}
      onClick={onClick}
      className={cn(
        /* `min-w-0` SUR LE BOUTON, pas seulement sur son libellé : un enfant de flex refuse par
           défaut de descendre sous la largeur de son contenu, et `truncate` à l'intérieur n'y
           change rien. Sans lui, les trois onglets débordaient sur un volet étroit. */
        'flex min-w-0 items-center gap-1.5 border-b-2 px-1 py-2.5 text-km-body font-semibold transition-colors',
        actif
          ? 'border-km-side-green text-km-side-green'
          : 'border-transparent text-km-side-muted hover:text-km-side-text',
      )}
    >
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{libelle}</span>
    </button>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONGLET 1 · LE FIL D'ACTIVITÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function FilActivite({ ligne, fiche }: { ligne: LignePipe; fiche: FicheDetaillee | undefined }) {
  const { data: evenements, isLoading } = useFilActivite(ligne)
  const ecrire = useEcrireNote()
  const [note, setNote] = useState('')
  const [ecriture, setEcriture] = useState(false)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ══ LES TROIS HÉROS EN TÊTE ══
          Ils répondent aux trois questions qu'on se pose AVANT de lire le détail : est-ce que ce
          numéro sert, où en est la relation, et qu'est-ce que je fais aujourd'hui. Les mettre en
          bas reviendrait à demander de lire trente lignes pour obtenir le résumé. */}
      <HerosFil ligne={ligne} fiche={fiche} evenements={evenements ?? []} />

      {/* ══ ÉCRIRE TIENT DANS UN BOUTON ══

          William, 22/09/2026 : « écrire une note doit simplement être un clic bouton, pas besoin de
          faire une grosse zone qui prend de la place ».

          IL A RAISON SUR LA FRÉQUENCE : on lit le fil à chaque fiche, on y écrit une fois sur cinq.
          La zone de saisie occupait donc en permanence la place de trois échanges pour un geste
          occasionnel. Elle n'apparaît plus qu'au clic — et le focus y va tout seul, pour que le clic
          reste le seul geste. */}
      {!ecriture ? (
        <button
          onClick={() => setEcriture(true)}
          className="flex w-full items-center justify-center gap-2 rounded-km border border-dashed border-km-side-green/45 px-3 py-2 text-km-body font-semibold text-km-side-green transition-colors hover:bg-km-side-green/10"
        >
          <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
          Écrire une note
        </button>
      ) : (
        <div className="rounded-km border border-km-side-green/45 bg-km-side-green/8 p-2.5">
          <textarea
            id="fil-note"
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              /* ÉCHAP REFERME SANS ENREGISTRER, et `stopPropagation` l'empêche de remonter jusqu'au
                 sprint, qui l'interprèterait comme « fermer la séance ». */
              if (e.key === 'Escape') { e.stopPropagation(); setEcriture(false); setNote('') }
            }}
            placeholder="Ce qui vient d’être dit, et qui servira au prochain appel."
            className="min-h-[56px] w-full resize-y rounded-km border border-km-side-line bg-km-side px-3 py-2 text-km-body text-km-side-text placeholder:text-km-side-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-km-side-green"
          />
          <div className="mt-1.5 flex items-center justify-end gap-2">
            {ecrire.isError ? (
              <span className="mr-auto text-km-micro text-km-side-red">{(ecrire.error as Error).message}</span>
            ) : null}
            <button
              onClick={() => { setEcriture(false); setNote('') }}
              className="rounded-km px-2.5 py-1.5 text-km-micro font-semibold text-km-side-muted hover:text-km-side-text"
            >
              Annuler
            </button>
            <button
              onClick={() => { void ecrire.mutateAsync({ ligne, texte: note }).then(() => { setNote(''); setEcriture(false) }) }}
              disabled={!note.trim() || ecrire.isPending}
              className={cn(
                'rounded-km px-3 py-1.5 text-km-body font-semibold',
                note.trim() && !ecrire.isPending
                  ? 'bg-km-side-green text-[#0B241C] hover:brightness-110'
                  : 'cursor-not-allowed bg-km-side-line text-km-side-muted',
              )}
            >
              {ecrire.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-km-body text-km-side-muted">Lecture de l’historique…</p>
      ) : (evenements ?? []).length === 0 ? (
        <Vide
          titre="Aucun échange enregistré"
          texte="Personne ne lui a encore parlé — ou l’échange n’a pas été tracé. L’appel qui vient sera le premier du fil."
        />
      ) : (
        <ol className="grid gap-2.5">
          {grouperParJour(evenements ?? []).map(({ jour, libelle, lignes }) => (
            <li key={jour}>
              {/* ══ UNE SÉPARATION PAR JOUR ══

                  William, 22/09/2026 : « il doit y avoir dans le fil avec toutes les activités des
                  séparations par date ».

                  UN FIL QUI COURT SUR CINQ MOIS n'a pas de repère : trois appels à la suite peuvent
                  être du même après-midi ou de deux trimestres différents, et la nuance change tout
                  — trois relances en un jour et trois en six mois ne racontent pas la même histoire.
                  La date était sur chaque ligne, en petit, à droite : il fallait la lire pour
                  comprendre, au lieu de la voir.

                  ELLE COLLE EN HAUT PENDANT LE DÉFILEMENT : en arrivant au milieu d'une journée
                  chargée, on garde sous les yeux de quel jour on parle. */}
              <h4 className="sticky top-9 z-[5] mb-1.5 bg-km-side-bas py-1">
                <span className="flex items-center gap-2 font-mono text-km-body font-semibold uppercase tracking-[0.14em] text-km-side-faint">
                  {libelle}
                  <span className="h-px flex-1 bg-km-side-line" aria-hidden="true" />
                  <span className="tabular-nums text-km-side-line">{lignes.length}</span>
                </span>
              </h4>
              <ol className="grid gap-2.5">
                {lignes.map((e) => <Evenement key={e.id} e={e} />)}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * Regroupe le fil par journée locale, en gardant l'ordre décroissant.
 *
 * LA JOURNÉE SE CALCULE EN HEURE DE PARIS, jamais sur la chaîne ISO : un échange de 23 h 40 est
 * daté du lendemain en UTC, et se retrouverait sous le mauvais intertitre. C'est le même piège que
 * les échéances de tâches, qui a déjà coûté des dates à J-1 à toute l'équipe.
 */
function grouperParJour(evenements: EvenementFil[]): { jour: string; libelle: string; lignes: EvenementFil[] }[] {
  const aujourdhui = jourLocalISO(new Date().toISOString())
  const hier = jourLocalISO(new Date(Date.now() - 86_400_000).toISOString())
  const anneeEnCours = new Date().getFullYear()

  const groupes = new Map<string, EvenementFil[]>()
  for (const e of evenements) {
    /* `jourLocalISO` rend `null` sur une date illisible ; une telle ligne existe quand même et doit
       s'afficher — on la range sous « Date inconnue » plutôt que de la faire disparaître. */
    const jour = jourLocalISO(e.quand) ?? 'inconnu'
    const deja = groupes.get(jour)
    if (deja) deja.push(e)
    else groupes.set(jour, [e])
  }

  return [...groupes.entries()].map(([jour, lignes]) => {
    if (jour === 'inconnu') return { jour, libelle: 'Date inconnue', lignes }
    const d = new Date(`${jour}T12:00:00`)
    const libelle =
      jour === aujourdhui ? 'Aujourd’hui'
      : jour === hier ? 'Hier'
      : d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        ...(d.getFullYear() === anneeEnCours ? {} : { year: 'numeric' }),
      })
    return { jour, libelle, lignes }
  })
}

/** Les trois natures se lisent d'un coup d'œil : un filet de couleur, une icône, une densité. */
function Evenement({ e }: { e: EvenementFil }) {
  const [deplie, setDeplie] = useState(false)
  /* SEULE L'HEURE RESTE SUR LA LIGNE : le jour est dans l'intertitre juste au-dessus, et le
     répéter quinze fois par journée chargée mangeait la largeur du résumé. */
  const heure = new Date(e.quand).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  if (e.nature === 'APPEL') {
    /* ABOUTI OU NON : c'est la première chose qu'on cherche dans un fil d'appels, et la seule qui
       mérite la couleur. Un appel manqué reste au gris — il compte, il ne raconte rien. */
    const abouti = !e.manque && !e.messagerie && (e.qualification == null || e.qualification === 'HUMAIN')
    return (
      /* ══ UNE COULEUR PAR NATURE, ET ELLE TIENT TOUT LE BLOC ══

         William, 22/09/2026 : « les mails doivent avoir un code couleur très différenciant, et les
         notes également ; c'est trop fade et indifférencié ».

         TROIS SIGNAUX PLUTÔT QU'UN : un filet de 3 px à gauche, un fond teinté, et le mot de la
         nature dans la même teinte. Un seul des trois — la bordure — se perdait dès qu'on faisait
         défiler : on voyait une pile de rectangles gris. Trois, et la nature se lit avant le texte.

         L'APPEL GARDE LE VERT, qui est déjà la couleur de l'action dans tout le sprint. Un appel
         qui n'a joint personne perd la teinte, pas le filet : il compte dans la colonne, il ne
         raconte rien. */
      <li className={cn(
        'rounded-km border border-l-[3px] px-3 py-2.5',
        abouti
          ? 'border-km-side-green/25 border-l-km-side-green bg-km-side-green/[0.07]'
          : 'border-km-side-line border-l-km-side-line bg-km-side',
      )}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {abouti
            ? <Phone className="h-3.5 w-3.5 shrink-0 text-km-side-green" aria-hidden="true" />
            : <PhoneOff className="h-3.5 w-3.5 shrink-0 text-km-side-faint" aria-hidden="true" />}
          <span className={cn('text-km-body font-semibold', abouti ? 'text-km-side-green' : 'text-km-side-muted')}>
            {e.sens === 'ENTRANT' ? 'Appel reçu' : 'Appel passé'}
          </span>
          {e.duree_secondes ? (
            <span className="font-mono text-km-micro text-km-side-muted">{dureeLisible(e.duree_secondes)}</span>
          ) : null}
          <span className="ml-auto font-mono text-km-micro text-km-side-faint">{heure}</span>
        </div>

        <p className="mt-1 text-km-micro text-km-side-muted">
          {/* QUI A DÉCROCHÉ, PUIS LEQUEL. `qualification` répond à la première question,
              `interlocuteur` à la seconde — et elle ne se pose que si c'était un humain. */}
          {e.qualification === 'HUMAIN'
            ? (e.interlocuteur === 'AUTRE'
              ? `Parlé à ${e.interlocuteur_nom ?? 'quelqu’un d’autre'}`
              : 'Parlé au contact')
            : e.qualification
              ? LIBELLE_QUALIFICATION[e.qualification]
              : e.manque ? 'Sans réponse' : e.messagerie ? 'Messagerie' : 'Joint'}
          {e.aura ? <span className="ml-2 text-km-side-green">aura {e.aura}/5</span> : null}
          {e.issue ? <span className="ml-2 text-km-side-text">· {LIBELLE_ISSUE[e.issue]}</span> : null}
          {e.auteur ? <span className="ml-2">· {e.auteur}</span> : null}
        </p>

        {e.resume ? <p className="mt-1.5 break-words text-km-body italic text-km-side-text">{e.resume}</p> : null}

        {e.etiquettes.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {e.etiquettes.map((t) => (
              <span key={t} className="whitespace-nowrap rounded-km border border-km-side-line px-1.5 py-0.5 font-mono text-km-micro text-km-side-muted">
                {LIBELLE_ETIQUETTE[t] ?? t}
              </span>
            ))}
          </div>
        ) : null}

        {e.enregistrement_url ? (
          <a
            href={e.enregistrement_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-km-micro font-semibold text-km-side-green hover:underline"
          >
            <Play className="h-3 w-3" aria-hidden="true" />
            Écouter l’enregistrement
          </a>
        ) : null}

        {abouti ? <Valencer e={e} /> : null}
      </li>
    )
  }

  if (e.nature === 'MAIL') {
    const recu = e.sens === 'ENTRANT'
    return (
      /* LE MAIL EST BLEU, franchement — c'est l'autre moitié du fil, et rien ne doit obliger à lire
         l'intitulé pour savoir si l'on regarde un appel ou un écrit.

         REÇU CONTRE ENVOYÉ se joue sur l'INTENSITÉ, pas sur la teinte : ce sont deux états d'une
         même famille. Un mail parti ne prouve rien, un mail reçu prouve qu'on intéresse — d'où le
         filet plein d'un côté, à demi effacé de l'autre. */
      <li className={cn(
        'rounded-km border border-l-[3px] px-3 py-2.5',
        recu
          ? 'border-km-side-blue/30 border-l-km-side-blue bg-km-side-blue/[0.10]'
          : 'border-km-side-blue/15 border-l-km-side-blue/40 bg-km-side-blue/[0.04]',
      )}>
        {/* ══ LE MAIL SE DÉROULE ══

            William, 22/09/2026 : « dans le fil d'activité, les mails doivent être cliquables,
            déroulables pour me faire voir le contenu ».

            LE CORPS COMPLET EST DÉJÀ EN BASE — `interactions.resume` porte jusqu'à 4 000 caractères
            pour un envoi et 8 000 pour une réponse rapatriée. Il était simplement coupé à quatre
            lignes, ce qui suffit à savoir DE QUOI ça parle et jamais à savoir CE QUI A ÉTÉ DIT. Or
            c'est précisément ce qu'on cherche avant de rappeler quelqu'un.

            TOUT L'EN-TÊTE EST LE BOUTON, pas un chevron de douze pixels : la cible doit se viser
            sans effort pendant qu'on tient un combiné. */}
        <button
          type="button"
          onClick={() => setDeplie((d) => !d)}
          aria-expanded={deplie}
          className="w-full text-left"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {recu
              ? <MailOpen className="h-3.5 w-3.5 shrink-0 text-km-side-blue" aria-hidden="true" />
              : <Mail className="h-3.5 w-3.5 shrink-0 text-km-side-blue/70" aria-hidden="true" />}
            <span className={cn('text-km-body font-semibold', recu ? 'text-km-side-blue' : 'text-km-side-blue/75')}>
              {recu ? 'Réponse reçue' : 'Mail envoyé'}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="font-mono text-km-micro text-km-side-faint">{heure}</span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-km-side-faint transition-transform duration-200',
                  deplie && 'rotate-180',
                )}
                aria-hidden="true"
              />
            </span>
          </div>
          {e.objet ? <p className="mt-1 break-words text-km-body font-medium text-km-side-text">{e.objet}</p> : null}
        </button>

        {e.resume ? (
          deplie
            ? (
              /* LES RETOURS À LA LIGNE DU MESSAGE SONT CONSERVÉS (`whitespace-pre-line`) : un mail
                 remis en un seul pavé n'est pas le même mail. La hauteur est bornée et le contenu
                 défile — une conversation rapatriée avec ses citations fait parfois deux mille
                 mots, et elle ne doit pas chasser le reste du fil de l'écran. */
              <div className="mt-1.5 max-h-72 overflow-y-auto rounded-km border border-km-side-blue/20 bg-km-side/60 px-2.5 py-2">
                {/* DÉPLIÉ, LE MESSAGE SE LIT — donc pas en 8,5 px. Le repli garde la taille dense
                    du fil parce qu'il ne sert qu'à reconnaître le sujet ; une fois ouvert, c'est le
                    texte qu'on est venu chercher. */}
                <p className="whitespace-pre-line break-words text-km-body leading-relaxed text-km-side-text">
                  {e.resume}
                </p>
              </div>
            )
            : <p className="mt-1 line-clamp-2 break-words text-km-micro text-km-side-muted">{e.resume}</p>
        ) : null}
        {e.auteur ? <p className="mt-1 font-mono text-km-micro text-km-side-faint">{e.auteur}</p> : null}

        {!recu ? <Ouverture e={e} /> : null}

        {/* SEULE UNE RÉPONSE SE VALENCE. Un mail que nous avons envoyé ne dit rien du contact —
            c'est notre activité, pas la sienne, et le score l'ignore (voir `santeRelation.ts`). */}
        {recu ? <Valencer e={e} /> : null}
      </li>
    )
  }

  return (
    /* LA NOTE EST AMBRE, et c'est la seule des trois à garder un filet EN POINTILLÉS : elle n'a pas
       eu lieu au dehors. Personne ne l'a dite ni reçue — c'est nous qui nous écrivons à nous-mêmes,
       et la trame le dit sans qu'on ait à le lire. */
    <li className="rounded-km border border-dashed border-km-side-amber/30 border-l-[3px] border-l-km-side-amber bg-km-side-amber/[0.07] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FileText className="h-3.5 w-3.5 shrink-0 text-km-side-amber" aria-hidden="true" />
        <span className="text-km-body font-semibold text-km-side-amber">Note interne</span>
        <span className="ml-auto font-mono text-km-micro text-km-side-faint">{heure}</span>
      </div>
      {e.resume ? <p className="mt-1 whitespace-pre-line break-words text-km-body text-km-side-text">{e.resume}</p> : null}
      {e.auteur ? <p className="mt-1 font-mono text-km-micro text-km-side-faint">{e.auteur}</p> : null}
    </li>
  )
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LU OU NON LU — ET « ON NE SAIT PAS », QUI EST UNE TROISIÈME RÉPONSE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : « j'aimerais que chaque mail envoyé soit tracké et que du coup une mention
 * lu ou non lu apparaisse sur chaque mail dans le fil d'actualité ».
 *
 * ══ TROIS ÉTATS, PAS DEUX ══
 *
 * Un mail sans jeton n'est pas un mail non lu : c'est un mail dont l'ouverture n'a jamais pu être
 * mesurée — parti avant le suivi, importé de Salesforce, ou envoyé en texte brut. Ils sont 42 144
 * dans ce cas contre 15 suivis ; les afficher « non lu » serait un mensonge à grande échelle, et
 * surtout un mensonge qui pousse à relancer quelqu'un qui a peut-être répondu.
 *
 * ══ CE QUE LE PIXEL SAIT, ET CE QU'IL NE SAIT PAS ══
 *
 * Il dit qu'une image a été chargée. Il ne dit pas que le message a été lu, et il se tait quand le
 * client bloque les images — ce que font Gmail en cache, Outlook en entreprise et la plupart des
 * messageries mobiles. « Non lu » veut donc dire « aucune ouverture détectée », et l'infobulle le
 * précise plutôt que de laisser croire à une certitude.
 */
function Ouverture({ e }: { e: EvenementFil }) {
  if (!e.jeton_ouverture) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-km-micro text-km-side-faint" title="Ce mail est parti sans pixel de suivi : envoyé avant la mise en place, importé, ou en texte brut.">
        <MailQuestion className="h-3 w-3 shrink-0" aria-hidden="true" />
        Ouverture non mesurée
      </p>
    )
  }

  if (!e.premiere_ouverture_le) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-km-micro text-km-side-muted" title="Aucune ouverture détectée. Le pixel se tait aussi quand la messagerie bloque les images.">
        <MailX className="h-3 w-3 shrink-0" aria-hidden="true" />
        Pas encore ouvert
      </p>
    )
  }

  const premiere = new Date(e.premiere_ouverture_le)
  const quand = premiere.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    + ' à ' + premiere.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-km-micro font-semibold text-km-side-green">
      <MailCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
      Ouvert le {quand}
      {e.nb_ouvertures > 1 ? (
        <span className="font-normal text-km-side-muted" title={`Dernière ouverture : ${e.derniere_ouverture_le ? new Date(e.derniere_ouverture_le).toLocaleString('fr-FR') : '—'}`}>
          · {e.nb_ouvertures} fois
        </span>
      ) : null}
    </p>
  )
}

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE SENS D'UN ÉCHANGE — AFFICHÉ, ET CORRIGIBLE D'UN CLIC
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « c'est l'analyse des réponses et des conversations qui doivent être
 * positifs ou négatifs et faire évoluer le score en ce sens ».
 *
 * C'est donc ici que se joue le score de santé : chaque ligne porte son sens, la phrase qui le
 * justifie, et trois boutons pour le contredire. Un score dont on ne voit pas les briques ne se
 * conteste pas ; un score qu'on ne peut pas corriger finit par être ignoré.
 *
 * TANT QUE RIEN N'A LU L'ÉCHANGE, on l'écrit « à analyser » — jamais « neutre ». Faire passer
 * l'ignorance pour de la neutralité fausserait le score dans le sens le plus flatteur.
 */
function Valencer({ e }: { e: EvenementFil }) {
  const poser = usePoserValence()
  const [ouvert, setOuvert] = useState(false)

  const choix: { v: Valence; libelle: string; classe: string }[] = [
    { v: 'POSITIF', libelle: 'Positif', classe: 'border-km-side-green/45 bg-km-side-green/12 text-km-side-green' },
    { v: 'NEUTRE', libelle: 'Neutre', classe: 'border-km-side-line text-km-side-muted' },
    { v: 'NEGATIF', libelle: 'Négatif', classe: 'border-km-side-red/45 bg-km-side-red/12 text-km-side-red' },
  ]
  const actuel = choix.find((c) => c.v === e.sentiment)

  return (
    <div className="mt-2 border-t border-km-side-line pt-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          onClick={() => setOuvert((o) => !o)}
          aria-expanded={ouvert}
          className={cn(
            'rounded-km border px-1.5 py-0.5 font-mono text-km-micro font-semibold transition-colors',
            actuel ? actuel.classe : 'border-dashed border-km-side-line text-km-side-faint hover:text-km-side-muted',
          )}
        >
          {actuel ? actuel.libelle.toLowerCase() : 'à analyser'}
        </button>
        {e.sentiment_source ? (
          <span className="font-mono text-km-micro text-km-side-faint">
            {e.sentiment_source === 'HUMAIN' ? 'corrigé à la main' : 'lu par Kimatch'}
          </span>
        ) : null}
        {e.sentiment_motif ? (
          <span className="min-w-0 flex-1 truncate text-km-micro italic text-km-side-muted">{e.sentiment_motif}</span>
        ) : null}
      </div>

      {ouvert ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {choix.map((c) => (
            <button
              key={c.v}
              onClick={() => { poser.mutate({ interaction: e.id, valence: c.v }); setOuvert(false) }}
              className={cn('rounded-km border px-2 py-1 text-km-micro font-semibold', c.classe)}
            >
              {c.libelle}
            </button>
          ))}
          {e.sentiment ? (
            <button
              onClick={() => { poser.mutate({ interaction: e.id, valence: null }); setOuvert(false) }}
              className="rounded-km px-2 py-1 text-km-micro text-km-side-faint hover:text-km-side-muted"
            >
              Effacer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Ce qu'Allô a compris de l'appel, dit en français.
 *
 * Les clés sont celles d'Allô : elles arrivent par le webhook et par le rattrapage
 * (`scripts/rattraper-etiquettes-allo.cjs`). Une clé inconnue s'affiche telle quelle plutôt que de
 * disparaître — on préfère un mot anglais à un silence.
 */
const LIBELLE_ETIQUETTE: Record<string, string> = {
  interested: 'intéressé',
  not_interested: 'pas intéressé',
  follow_up_later: 'à relancer',
  to_call_back: 'à rappeler',
  meeting_booked: 'rendez-vous pris',
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONGLET 2 · LE PÉRIMÈTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * William, 22/09/2026 : sur une piste, « le nombre de copropriétés, le nombre de lots, le ratio, et
 * la liste des copropriétés en bas » ; sur une opportunité, « des cards pour chaque compteur ».
 *
 * ══ LE VIDE N'EST PAS UNE ERREUR, C'EST LE TRAVAIL ══
 *
 * 99 opportunités sur 132 n'ont aucun compteur. Écrire « aucun compteur » les présenterait comme
 * cassées alors qu'elles sont simplement au début : « le but étant de recevoir une facture, créer
 * un périmètre et lancer une opportunité » (William). L'écran le dit dans ces termes-là.
 */
function Perimetre({ ligne, fiche }: { ligne: LignePipe; fiche: FicheDetaillee | undefined }) {
  const copros = fiche?.nombre_coproprietes ?? null
  const lots = fiche?.nombre_de_lots ?? null
  const ratio = copros && lots && copros > 0 ? Math.round(lots / copros) : null

  const listeCopros = useMemo(
    () => (fiche?.liste_coproprietes ?? '')
      .split(/[\n;]+/)
      .map((c) => c.trim())
      .filter(Boolean),
    [fiche?.liste_coproprietes],
  )

  if (ligne.cible_type === 'PISTE') {
    const rien = !copros && !lots && listeCopros.length === 0
    return (
      <div className="grid gap-4">
        {rien ? (
          <Vide
            titre="Parc inconnu"
            texte="C’est précisément l’objet de l’appel : obtenir une facture pour savoir ce qu’il y a à couvrir, et pouvoir convertir."
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Chiffre valeur={copros} libelle={copros === 1 ? 'copropriété' : 'copropriétés'} />
              <Chiffre valeur={lots} libelle={lots === 1 ? 'lot' : 'lots'} />
              <Chiffre valeur={ratio} libelle="lots / copro" />
            </div>
            {listeCopros.length > 0 ? (
              <div>
                <span className="mb-2 block font-mono text-km-label font-semibold uppercase tracking-[0.16em] text-km-side-faint">
                  Les copropriétés annoncées
                </span>
                <ol className="grid gap-1">
                  {listeCopros.map((c, i) => (
                    <li key={`${c}-${i}`} className="rounded-km border border-km-side-line px-3 py-1.5 text-km-body text-km-side-text">
                      {c}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}
      </div>
    )
  }

  const compteurs = fiche?.compteurs ?? []
  if (compteurs.length === 0) {
    return (
      <Vide
        titre="Périmètre vide"
        texte="Cette opportunité n’a encore aucun point de livraison. Obtenir une facture est la première étape : sans périmètre, il n’y a rien à couvrir ni à mettre en consultation."
      />
    )
  }

  const total = compteurs.reduce((n, c) => n + (c.consommation ?? 0), 0)
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Chiffre valeur={compteurs.length} libelle={compteurs.length === 1 ? 'compteur' : 'compteurs'} />
        <Chiffre valeur={total > 0 ? Math.round(total) : null} libelle="MWh / an" />
        <Chiffre valeur={compteurs.filter((c) => c.est_client).length} libelle="déjà clients" />
      </div>

      <ol className="grid gap-2">
        {compteurs.map((c) => (
          <li key={c.id} className="rounded-km-lg border border-km-side-line bg-km-side p-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-km-body font-semibold text-km-side-text">{c.libelle ?? 'Site sans nom'}</span>
              {/* CLIENT OU PROSPECT change complètement la conversation : on ne prospecte pas
                  quelqu'un qu'on fournit déjà, on le renouvelle. */}
              <span className={cn(
                'rounded-km border px-1.5 py-0.5 font-mono text-km-micro font-semibold',
                c.est_client
                  ? 'border-km-side-green/40 bg-km-side-green/10 text-km-side-green'
                  : 'border-km-side-line text-km-side-muted',
              )}>
                {c.est_client ? 'client' : 'prospect'}
              </span>
              {c.energie ? (
                <span className="font-mono text-km-micro uppercase tracking-[0.12em] text-km-side-faint">{c.energie}</span>
              ) : null}
            </div>
            <p className="mt-0.5 font-mono text-km-micro text-km-side-muted">{c.numero_point}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-km-micro sm:grid-cols-3">
              <Paire libelle="Conso" valeur={c.consommation != null ? `${Math.round(c.consommation).toLocaleString('fr-FR')} MWh` : '—'} />
              <Paire
                libelle="Échéance"
                valeur={c.date_echeance
                  ? new Date(c.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : 'inconnue'}
                alerte={!c.date_echeance}
              />
              <Paire libelle="Fournisseur" valeur={c.fournisseur ?? '—'} />
            </dl>
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONGLET 3 · LA SOCIÉTÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * William, 22/09/2026 : « Société, SIREN, SIRET, Code NAF, Libellé, Site internet, Adresse. »
 *
 * TOUT EST MODIFIABLE, comme partout ailleurs dans le sprint — sauf quand la fiche n'a pas encore
 * de compte : la piste porte alors ces valeurs en propre et l'écriture irait au mauvais endroit.
 * On les affiche en lecture plutôt que de proposer un champ qui ne s'enregistrerait pas.
 */
function Societe({ fiche }: { fiche: FicheDetaillee | undefined }) {
  const c = fiche?.compte
  if (!c) {
    return (
      <Vide
        titre="Aucune société identifiée"
        texte="Ni compte rattaché, ni SIREN sur la fiche. Le nom de la société et son identité administrative se saisissent en haut de l’écran, sur la ligne du contact."
      />
    )
  }

  const adresse = [c.rue, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return (
    <dl className="overflow-hidden rounded-km border border-km-side-line">
      <Ligne libelle="Société" valeur={c.nom} />
      <Ligne libelle="SIREN" valeur={c.siren} mono />
      <Ligne libelle="SIRET" valeur={c.siret} mono />
      <Ligne libelle="Code NAF" valeur={c.code_naf} mono />
      <Ligne libelle="Libellé" valeur={c.libelle_ape} />
      <Ligne libelle="Site internet" valeur={c.site_web} lien />
      <Ligne libelle="Adresse" valeur={adresse || null} />
      <Ligne libelle="Segment" valeur={fiche?.segment ?? c.segment} />
    </dl>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LES PETITES PIÈCES
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function Ligne({ libelle, valeur, mono, lien }: { libelle: string; valeur: string | null; mono?: boolean; lien?: boolean }) {
  const url = lien && valeur ? (valeur.startsWith('http') ? valeur : `https://${valeur}`) : null
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-km-side-line px-3.5 py-2.5 text-km-body last:border-b-0">
      <dt className="shrink-0 text-km-side-muted">{libelle}</dt>
      <dd className={cn('min-w-0 break-words text-right font-semibold text-km-side-text', mono ? 'font-mono' : '')}>
        {url
          ? <a href={url} target="_blank" rel="noreferrer" className="text-km-side-green hover:underline">{valeur}</a>
          : valeur || <span className="font-normal text-km-side-faint">—</span>}
      </dd>
    </div>
  )
}

function Chiffre({ valeur, libelle }: { valeur: number | null; libelle: string }) {
  return (
    <div className="rounded-km border border-km-side-line bg-km-side px-3 py-2.5 text-center">
      <span className="block text-km-sprint font-bold leading-none text-km-side-text">
        {valeur != null ? valeur.toLocaleString('fr-FR') : '—'}
      </span>
      <span className="mt-1 block font-mono text-km-micro uppercase tracking-[0.1em] text-km-side-faint">{libelle}</span>
    </div>
  )
}

function Paire({ libelle, valeur, alerte }: { libelle: string; valeur: string; alerte?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono uppercase tracking-[0.1em] text-km-side-faint">{libelle}</dt>
      <dd className={cn('truncate font-semibold', alerte ? 'text-km-side-amber' : 'text-km-side-text')}>{valeur}</dd>
    </div>
  )
}

/** Un vide qui explique ce qu'il reste à faire, plutôt qu'un vide qui constate. */
function Vide({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="rounded-km-lg border border-dashed border-km-side-line px-4 py-5">
      <p className="text-km-body font-semibold text-km-side-text">{titre}</p>
      <p className="mt-1 text-km-micro leading-relaxed text-km-side-muted">{texte}</p>
    </div>
  )
}
