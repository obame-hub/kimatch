import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, Users, CheckSquare, FileText, Send, StickyNote, X } from 'lucide-react'
import { Textarea } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { ActivityCard, type ActivityStyleKey } from '@/components/ui/activity-card'
import { TachesOuvertes } from '@/components/site/TachesOuvertes'
import { FormulaireTache, type RattachementTache } from '@/components/tache/DialogNouvelleTache'
import { useCreateInteraction, useDeleteInteraction } from '@/lib/data/interactions'
import { useIsAdmin, useMonProfil } from '@/lib/data/roles'
import { Dialog } from '@/components/ui/dialog'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_INTERACTIONS } from '@/lib/referenceFallbacks'
import { InteractionSentence, classifyInteraction } from '@/lib/interactionSentence'
import { cn } from '@/lib/utils'
import type { Interaction, ActionItem, DocumentItem } from '@/types/domain'

interface ActivityItem {
  id: string
  date: string
  kind: 'interaction' | 'action' | 'document'
  /** Les deux sont facultatifs depuis le 07/09/2026 : une note n'a ni titre ni phrase de contexte,
   *  et c'est leur absence qui fait basculer `ActivityCard` en mode prose. */
  title?: string | null
  subtitle?: ReactNode
  /** Ce qui a été écrit — le corps de la note. Le sous-titre dit qui a fait quoi ; sans ce
   *  champ, le fil annonçait « Untel a ajouté une note » sans jamais montrer la note. */
  body?: string
  to?: string
  href?: string
  siteNom?: string
  contactNom?: string
  interaction?: Interaction
  /** Renseigné sur les notes seulement : leur signature va à côté de l'heure, pas dans une phrase. */
  auteur?: string
}

/* ══ LES SIGNAUX NE SONT PLUS DANS LE FIL ═══════════════════════════════════════════════════════

   Naoëlle, 02/09/2026 : « enlève toute trace de signal sur toute l'app, même dans le flux
   d'activité, car ça embrouille les commerciaux ». C'était la trace la plus insistante : le fil est
   présent sur la fiche compte, la fiche site, la fiche recommandation et le suivi de contrat, et
   les cartes rouges des signaux y côtoyaient les appels et les notes sans qu'on sache quoi en faire.

   La fonction `fromSignaux` est retirée avec la prop `signaux` du composant. Rien n'est supprimé en
   base : la table `signaux` garde ses lignes, et remettre le fil en état demande de rétablir cette
   fonction, la prop, et les quatre appelants — voir `cycleNavItems` (src/lib/navItems.tsx). */

function fromInteractions(interactions: Interaction[]): ActivityItem[] {
  return interactions.map((i) => {
    /**
     * UNE NOTE N'EST PAS UN ÉVÉNEMENT, C'EST UN TEXTE.
     *
     * William, 07/09/2026 : « pas besoin d'afficher "William Goupil a ajouté une note sur KIWEE
     * ENERGIE FRANCE", juste optimiser à fond le texte ».
     *
     * Les autres entrées du fil racontent un fait dont le détail est ailleurs — un appel qu'on
     * réécoute, un courriel qu'on rouvre — et la phrase « qui a fait quoi avec qui » les résume
     * utilement. Une note, elle, n'a rien d'autre qu'elle-même : la résumer, c'est la répéter en
     * moins bien. On lui retire donc son titre et sa phrase, et `ActivityCard` bascule alors seule
     * en mode prose.
     *
     * L'AUTEUR RESTE, mais réduit à son prénom, à côté de l'heure — choix de William. Vous êtes
     * treize sur les mêmes dossiers : savoir qui a écrit une consigne change la façon de la lire.
     */
    if (classifyInteraction(i) === 'note') {
      const texte = i.resume?.trim() || i.resultat?.trim() || ''
      // Une note vide n'existe pas en pratique, mais si elle arrivait, mieux vaut son objet qu'une
      // carte muette — c'est le seul cas où le titre reprend sa place.
      return {
        id: `int-${i.id}`,
        date: i.date_interaction,
        kind: 'interaction' as const,
        title: texte ? '' : i.objet,
        body: texte || undefined,
        to: `/interactions/${i.id}`,
        siteNom: i.site_nom || undefined,
        contactNom: i.contact_nom || undefined,
        interaction: i,
        auteur: i.auteur || undefined,
      }
    }

    return {
      id: `int-${i.id}`,
      date: i.date_interaction,
      kind: 'interaction' as const,
      title: i.objet || i.type_interaction,
      // Reproduit le fil d'activite Salesforce : "{auteur} a une prochaine tache avec {contact}
      // sur {related}", chaque entite cliquable -- demande explicite du 31/07/2026.
      subtitle: <InteractionSentence interaction={i} />,
      // Le compte rendu de l'échange, ou le texte de la note. `resultat` complète le `resume` sur
      // les interactions importées de Salesforce, qui remplissaient parfois l'un ou l'autre.
      body: i.resume?.trim() || i.resultat?.trim() || undefined,
      to: `/interactions/${i.id}`,
      siteNom: i.site_nom || undefined,
      contactNom: i.contact_nom || undefined,
      interaction: i,
    }
  })
}

/**
 * SEULES LES TÂCHES TERMINÉES ENTRENT DANS LE FIL.
 *
 * Les tâches ouvertes y figuraient aussi, datées de leur échéance. Deux défauts en découlaient, et
 * le second est le pire : une tâche à échéance future remontait tout en haut du fil au milieu des
 * échanges passés, et une tâche EN RETARD s'enfonçait dans le passé, d'autant plus bas qu'elle
 * traînait depuis longtemps.
 *
 * Elles vivent maintenant dans `TachesOuvertes`, épinglé au-dessus — « ce qui reste à faire » n'est
 * pas un événement du passé, et aucun tri chronologique ne peut le ranger correctement. Le fil
 * garde ce qui lui revient : la trace du moment où la tâche a été faite.
 */
function fromActions(actions: ActionItem[]): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const a of actions) {
    const tag = { contactNom: a.contact_nom || undefined }
    if (a.date_realisation) {
      items.push({ id: `act-done-${a.id}`, date: a.date_realisation, kind: 'action', title: `Terminée : ${a.titre}`, subtitle: a.type_action, to: '/taches', ...tag })
    }
  }
  return items
}

function fromDocuments(documents: DocumentItem[]): ActivityItem[] {
  return documents.map((d) => ({
    id: `doc-${d.id}`,
    date: d.date_creation,
    kind: 'document',
    title: d.nom,
    subtitle: `${d.type_document} · ${d.auteur}`,
    href: d.url,
  }))
}

const KIND_ICON: Record<ActivityItem['kind'], typeof Phone> = {
  interaction: Mail,
  action: CheckSquare,
  document: FileText,
}

// classifyInteraction() regarde le type ET l'objet (les titres importes de Salesforce sont
// parfois en anglais/sans accent, ex. "Missed Call from...", "REUNION - ...") -- plus fiable
// que l'ancienne heuristique basee sur le seul titre.
function styleKeyFor(item: ActivityItem): ActivityStyleKey {
  if (item.kind === 'interaction') {
    if (!item.interaction) return 'email'
    const cat = classifyInteraction(item.interaction)
    return cat === 'appel' || cat === 'note' ? cat : 'email'
  }
  if (item.kind === 'action') return 'action'
  return item.kind
}

/**
 * L'ICÔNE D'UNE INTERACTION, ET LE CAS QUI MANQUAIT : LA NOTE.
 *
 * William, 07/09/2026 : « l'icône de la note doit être différente car beaucoup trop proche de celle
 * du mail ». Elle n'en était pas proche : c'était LA MÊME. Cette fonction n'avait pas de branche
 * pour la note, qui retombait donc sur le `return Mail` final — une enveloppe pour un texte écrit à
 * la main, à côté des vraies enveloppes du fil.
 *
 * `StickyNote` EST DÉJÀ CELLE DU BOUTON « Nouvelle note », quelques lignes plus bas dans ce même
 * fichier. Le geste qui crée et l'objet créé portent maintenant le même symbole — c'est ce qui fait
 * qu'on relie les deux sans y penser.
 */
function interactionIcon(interaction: Interaction) {
  const cat = classifyInteraction(interaction)
  if (cat === 'appel') return Phone
  if (cat === 'note') return StickyNote
  if (cat === 'reunion' || cat === 'visite') return Users
  return Mail
}

/**
 * L'HEURE DE L'ÉVÉNEMENT, PAS SA DATE — et c'est ce qui rend sa colonne à peu près gratuite.
 *
 * Chaque carte affichait la date complète, « 07/05/2026 », à sa droite. Or le fil pose DÉJÀ un
 * séparateur de journée au-dessus de chaque groupe : la date y était donc écrite deux fois, et la
 * seconde coûtait 66 px de large à toutes les cartes du groupe, sur toute leur hauteur.
 *
 * L'heure, elle, n'est écrite nulle part ailleurs, tient en 35 px, et répond à une question qu'on se
 * pose vraiment quand on relit une journée chargée : dans quel ordre ça s'est passé.
 *
 * MINUIT PILE NE S'AFFICHE PAS. Une échéance de tâche ou une date de document importée n'a pas
 * d'heure réelle : elle vaut 00:00, et l'écrire ferait croire à un événement nocturne. Dans ce cas la
 * colonne disparaît complètement, et le corps du message récupère tout.
 */
function heureEvenement(dateStr: string): string | null {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  if (d.getHours() === 0 && d.getMinutes() === 0) return null
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * CE QUI S'ÉCRIT EN HAUT À DROITE D'UNE CARTE : l'heure, et le prénom de l'auteur sur une note.
 *
 * La note n'a plus de phrase « Untel a ajouté une note sur… » ; sa signature se replie donc ici,
 * dans la place que la carte réserve déjà à l'heure. Le prénom seul suffit à treize : « William »
 * se lit, « William Goupil » pousse l'heure à la ligne dans un volet de 320 px.
 */
function libelleTrailing(item: ActivityItem): string | null {
  const heure = heureEvenement(item.date)
  if (!item.auteur) return heure
  const prenom = item.auteur.trim().split(/\s+/)[0]
  return heure ? `${prenom} · ${heure}` : prenom
}

// Regroupe par date relative comme chez William : Demain / Aujourd'hui / Hier, puis dates absolues.
function relativeGroupLabel(dateStr: string): { label: string; diffDays: number } {
  const d = new Date(dateStr)
  const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000)
  if (diffDays === 0) return { label: "Aujourd'hui", diffDays }
  if (diffDays === 1) return { label: 'Demain', diffDays }
  if (diffDays === -1) return { label: 'Hier', diffDays }
  if (diffDays > 1 && diffDays <= 6) return { label: d.toLocaleDateString('fr-FR', { weekday: 'long' }), diffDays }
  return { label: d.toLocaleDateString('fr-FR'), diffDays }
}

// Pastille pleine par séparateur de date (mesuré pixel pour pixel dans la référence William :
// #0d7a5f aujourd'hui, #b57a24 à venir, #16181d passé) -- remplace l'ancien "text-km-xs
// text-km-faint" explicitement signalé trop discret dans le prompt de handoff.
function groupBadgeClass(diffDays: number): string {
  if (diffDays === 0) return 'bg-km-green'
  if (diffDays > 0) return 'bg-km-amber'
  return 'bg-km-text'
}

export function ActivityFeed({
  siteId,
  siteNom,
  compteId,
  compteNom,
  interactions,
  actions,
  documents,
  recommandationId,
  recommandationNom,
  suiviContratId,
  opportuniteId,
  pisteId,
  requeteId,
  rattachementTache,
}: {
  siteId?: string | null
  siteNom?: string
  compteId: string
  compteNom: string
  interactions: Interaction[]
  actions: ActionItem[]
  documents: DocumentItem[]
  /** Rattache les notes écrites ici à une recommandation. Sans cela, une note saisie sur la fiche
   *  recommandation partirait au niveau du compte et ne reviendrait jamais dans ce fil. */
  recommandationId?: string | null
  recommandationNom?: string
  /** Même rôle pour un suivi de contrat : une note écrite sur sa fiche doit y rester (31/08/2026). */
  suiviContratId?: string | null
  /** Idem pour les trois derniers objets du cycle, depuis le 07/09/2026. Sans ces identifiants, une
   *  note écrite sur une opportunité, une piste ou une requête partirait au niveau du compte et ne
   *  reviendrait jamais dans le fil où elle a été saisie. */
  opportuniteId?: string | null
  pisteId?: string | null
  requeteId?: string | null
  /**
   * LE DOSSIER AUQUEL RATTACHER CE QU'ON CRÉE ICI — et, par sa seule présence, ce qui active la
   * barre « Nouvelle tâche / Nouvelle note » et son panneau coulissant.
   *
   * Sans lui, le fil garde son champ de note toujours ouvert sous la liste : c'est le cas des
   * fiches Compte, Site et Contact, dont le comportement ne change pas d'un pixel.
   *
   * POURQUOI LE FIL PORTE MAINTENANT LE FORMULAIRE DE TÂCHE. Il recevait avant un simple rappel
   * `onNouvelleTache`, et la fiche ouvrait sa propre fenêtre modale. Le panneau demandé par William
   * le 07/09/2026 monte du bas DU VOLET et le recouvre : il doit donc être dessiné à l'intérieur de
   * ce volet, donc ici. La fiche n'a plus qu'à dire à quoi rattacher.
   */
  rattachementTache?: RattachementTache
}) {
  const navigate = useNavigate()
  const createInteraction = useCreateInteraction()
  const supprimerInteraction = useDeleteInteraction()
  const { data: monProfil } = useMonProfil()
  const estAdmin = useIsAdmin()
  /** La note dont on a demandé la suppression, le temps de la confirmer. */
  const [noteASupprimer, setNoteASupprimer] = useState<{ id: string; texte: string } | null>(null)

  /**
   * SEULES LES NOTES SE SUPPRIMENT, ET SEULEMENT PAR LEUR AUTEUR OU UN ADMINISTRATEUR.
   *
   * Un appel ou un courriel n'est pas une saisie : il remonte d'Allo ou de la messagerie et atteste
   * d'un échange qui a réellement eu lieu. L'effacer depuis Kimatch ferait disparaître la trace d'un
   * fait, là où une note est un texte qu'on peut légitimement avoir raté.
   *
   * La règle est aussi posée en base (migration 20260907330000) : ceci n'est que sa traduction à
   * l'écran, pour ne pas afficher un bouton qui serait refusé.
   */
  function noteSupprimable(item: ActivityItem): boolean {
    if (item.kind !== 'interaction' || !item.interaction) return false
    if (classifyInteraction(item.interaction) !== 'note') return false
    return estAdmin || (Boolean(monProfil?.id) && item.interaction.auteur_profil_id === monProfil?.id)
  }
  const { data: typesRef } = useReferenceTable('types_interactions')
  const types = typesRef && typesRef.length > 0 ? typesRef : FALLBACK_TYPES_INTERACTIONS
  const [note, setNote] = useState('')
  /** `null` = rien d'ouvert. Un seul panneau à la fois : deux formulaires empilés n'auraient pas
   *  de place, et l'on ne crée pas une tâche et une note du même geste. */
  const [panneau, setPanneau] = useState<'tache' | 'note' | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const items = useMemo(
    () =>
      [
        ...fromInteractions(interactions),
        ...fromActions(actions),
        ...fromDocuments(documents),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [interactions, actions, documents],
  )

  /* ══ LES FILTRES DU FIL SONT RETIRÉS ══
     William, 07/09/2026 : « vu que ça ne fonctionne pas, masque les filtres des activités (type
     "Tous" ou un nom de contact ou de site). On y reviendra quand ce sera fonctionnel. »

     Rien n'est perdu : c'était un bandeau « Par site / Par contact » et une rangée de pastilles qui
     réduisaient `items`. La logique tenait en quatre variables — `mode`, `filterValue`,
     `chipOptions`, `filteredItems` — et se retrouve d'un `git log -S"chipOptions"`. En attendant,
     le fil montre tout, et le volet récupère les deux lignes qu'elles occupaient en permanence. */
  const filteredItems = items

  // Insère un en-tête à chaque changement de libellé de date relative (les items sont déjà triés du plus récent au plus ancien).
  const rows: Array<{ type: 'header'; label: string; diffDays: number } | { type: 'item'; item: ActivityItem }> = []
  let lastLabel: string | null = null
  for (const item of filteredItems) {
    const { label, diffDays } = relativeGroupLabel(item.date)
    if (label !== lastLabel) {
      rows.push({ type: 'header', label, diffDays })
      lastLabel = label
    }
    rows.push({ type: 'item', item })
  }

  async function envoyerNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    const typeAutre = types.find((t) => t.code === 'AUTRE')
    const result = await createInteraction.mutateAsync({
      type_interaction_id: typeAutre?.id ?? null,
      type_interaction_libelle: typeAutre?.libelle ?? 'Note',
      date_interaction: new Date().toISOString(),
      sens: null,
      objet: 'Note rapide',
      resume: note.trim(),
      resultat: null,
      compte_id: compteId || null,
      compte_nom: compteNom,
      site_id: siteId || null,
      site_nom: siteNom ?? '',
      contact_id: null,
      contact_nom: '',
      issue_interaction_id: null,
      recommandation_id: recommandationId ?? null,
      recommandation_nom: recommandationNom ?? null,
      suivi_contrat_id: suiviContratId ?? null,
      opportunite_id: opportuniteId ?? null,
      piste_id: pisteId ?? null,
      requete_id: requeteId ?? null,
    })
    setNote('')
    // Le panneau se referme une fois la note partie : le laisser ouvert sur un champ vide ferait
    // croire qu'il reste quelque chose à écrire.
    setPanneau(null)
    setFeedback(result.persisted ? 'Note ajoutée.' : 'Note ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => setFeedback(null), 2000)
  }

  /**
   * ══ LES DEUX GESTES DE CRÉATION, EN HAUT DU VOLET ══
   *
   * William, 07/09/2026 : « les boutons s'affichent mal en bas de page, remonte-les pour qu'ils
   * soient toujours visibles ».
   *
   * ILS ÉTAIENT SOUS LE FIL, et deux choses s'y liguaient contre eux. D'abord un décalage de 28 px
   * de toute l'application en développement local — le bandeau rouge est rendu hors du conteneur en
   * `h-screen`, si bien que le bas de chaque écran passe sous la fenêtre. Ensuite, même sans ce
   * décalage, une barre posée en pied de colonne dépend d'une arithmétique flex qui se vérifie mal :
   * il suffit d'un bloc de plus au-dessus pour la repousser.
   *
   * EN HAUT, LA QUESTION NE SE POSE PLUS. Ils sont visibles par construction, avant tout calcul de
   * hauteur, et ils se lisent d'abord — c'est aussi l'ordre naturel : on vient dans ce volet pour
   * ajouter quelque chose, ou pour lire ce qui s'y trouve, et l'action précède la lecture.
   */
  const avecPanneau = Boolean(rattachementTache)

  // Échap referme le panneau, comme toute surface temporaire de l'application.
  useEffect(() => {
    if (!panneau) return
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanneau(null) }
    document.addEventListener('keydown', auClavier)
    return () => document.removeEventListener('keydown', auClavier)
  }, [panneau])

  /**
   * ══ LA BARRE DE CRÉATION ══
   *
   * DEUX BOUTONS DE MÊME LARGEUR, qui en remplacent trois portant chacun leur couleur — ambre pour
   * « Rappel », indigo pour « Tâche », vert pour « Loguer un appel ». Soit l'arc-en-ciel dont la
   * refonte du 31/08/2026 a débarrassé le reste de l'application, sur 200 px de large.
   *
   * ILS RESTENT VISIBLES QUAND LE PANNEAU EST OUVERT, et servent alors de titre : celui qu'on a
   * choisi reste allumé, l'autre s'éteint. C'est ce qui dit d'où le panneau sort et comment le
   * refermer, sans ajouter de barre de titre au-dessus de lui.
   */
  const barreCreation = avecPanneau && (
    <div className="flex shrink-0 flex-wrap gap-2 border-b border-km-line pb-2.5">
      <Button
        type="button"
        variant={panneau === 'tache' ? 'primary' : 'default'}
        aria-expanded={panneau === 'tache'}
        onClick={() => setPanneau((v) => (v === 'tache' ? null : 'tache'))}
        className="min-w-[132px] flex-1 transition-all duration-150 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] active:scale-[0.97]"
      >
        {panneau === 'tache' ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
        Nouvelle tâche
      </Button>
      <Button
        type="button"
        aria-expanded={panneau === 'note'}
        onClick={() => setPanneau((v) => (v === 'note' ? null : 'note'))}
        className={cn(
          'min-w-[132px] flex-1 transition-all duration-150 active:scale-[0.97]',
          panneau === 'note' && 'border-km-green bg-km-green-soft text-km-green',
        )}
      >
        {panneau === 'note' ? <X className="h-3.5 w-3.5" /> : <StickyNote className="h-3.5 w-3.5" />}
        Nouvelle note
      </Button>
    </div>
  )

  /* PLUS DE CHAMP DE NOTE PERMANENT SOUS LE FIL.
     William, 07/09/2026, sur les fiches Compte, Contact et Site : « tu masques les 2 boutons et par
     conséquent la fonctionnalité des formulaires ne doit pas être opérante sur ces fiches ».

     Écrire n'y est donc plus possible : le volet y devient une lecture, et la création se fait sur
     les objets du cycle — recommandation, opportunité, piste, requête, suivi de contrat — où elle a
     un dossier auquel se rattacher. Le champ qui vivait ici écrivait au niveau du compte, ce qui
     revenait souvent à ranger une note là où personne ne la relirait. */

  const messageRetour = feedback && <p className="shrink-0 text-xs text-km-muted">{feedback}</p>

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {barreCreation}

      {/* ══ LA ZONE QUE LE PANNEAU RECOUVRE ══
          Tout ce qui vit sous les boutons. `relative` en fait le référentiel du panneau — c'est ce
          qui le fait monter du bas DU VOLET et non du bas de la fenêtre — et `overflow-hidden` le
          garde dans cette boîte pendant sa montée, au lieu de le laisser dépasser sous la fiche. */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {/* CE QUI RESTE À FAIRE, AVANT CE QUI S'EST PASSÉ. La section se masque d'elle-même quand
            il n'y a aucune tâche ouverte : un intitulé « À faire » suivi du vide occuperait deux
            lignes pour annoncer une absence. */}
        <TachesOuvertes actions={actions} />



        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {rows.length === 0 && <p className="text-sm text-km-faint">Aucune activité pour le moment.</p>}
          {rows.map((row, idx) =>
            row.type === 'header' ? (
              <div key={`h-${idx}`} className="flex items-center gap-2.5 pt-2.5 first:pt-0">
                {/* 12px et non plus 10 : « les separateurs de date sont trop discrets, "A venir" /
                    "Aujourd'hui" / "Hier" doivent se lire au premier coup d'oeil » (brief de
                    William). Le trait qui suit passe en teinte de la pastille plutot qu'en gris
                    neutre, pour que l'oeil suive la ligne. */}
                <span className={cn('rounded-md px-2 py-0.5 text-km-xs font-semibold text-white', groupBadgeClass(row.diffDays))}>
                  {row.label}
                </span>
                <div className={cn('h-0.5 flex-1 rounded-full opacity-25', groupBadgeClass(row.diffDays))} />
              </div>
            ) : (
              <ActivityCard
                key={row.item.id}
                styleKey={styleKeyFor(row.item)}
                icon={row.item.kind === 'interaction' && row.item.interaction ? interactionIcon(row.item.interaction) : KIND_ICON[row.item.kind]}
                title={row.item.title}
                subtitle={row.item.subtitle}
                body={row.item.body}
                trailing={libelleTrailing(row.item)}
                to={row.item.to}
                onClick={row.item.to ? () => navigate(row.item.to!) : undefined}
                href={row.item.href}
                onSupprimer={
                  noteSupprimable(row.item)
                    ? () => setNoteASupprimer({ id: row.item.interaction!.id, texte: row.item.body ?? '' })
                    : undefined
                }
              />
            ),
          )}
        </div>

        {!avecPanneau && messageRetour}

        {/* ══ LE PANNEAU QUI MONTE ══
            Opaque, et c'est délibéré : un fond translucide laisserait les cartes du fil transparaître
            derrière les champs, où elles se liraient comme des erreurs de saisie. Il recouvre, il ne
            se superpose pas — c'est ce que William a décrit. */}
        {/* PAS DE COINS ARRONDIS, ET C'EST UNE CORRECTION. William, 07/09/2026 : « il reste un petit
            reliquat de couleur correspondant à la cartouche Aujourd'hui en arrière-plan, ce n'est pas
            pixel perfect ». C'étaient les quatre angles : le panneau couvre la zone bord à bord, donc
            chaque arrondi ouvrait un triangle par lequel le fil transparaissait — ici le vert de la
            pastille de journée. Un rectangle plein ne laisse aucun angle mort.

            L'ombre part vers le HAUT (décalage négatif) : c'est le seul côté qui donne sur autre
            chose, et c'est elle qui dit que le panneau est posé par-dessus, pas encastré. */}
        {panneau && (
          <div className="animate-km-monte absolute inset-0 z-20 flex flex-col bg-km-surface shadow-[0_-8px_20px_-10px_rgba(25,40,33,0.22)]">
            <div className="min-h-0 flex-1 p-3">
              {panneau === 'tache' ? (
                <FormulaireTache
                  compact
                  rattachement={rattachementTache}
                  signaler={(m) => {
                    setFeedback(m)
                    setTimeout(() => setFeedback(null), 2500)
                  }}
                  onFini={() => setPanneau(null)}
                />
              ) : (
                /* LA NOTE GAGNE DE LA PLACE À ÊTRE ICI. Son champ faisait deux lignes coincées sous
                   le fil ; il occupe maintenant la hauteur du volet, ce qui change ce qu'on y écrit —
                   un compte rendu d'appel plutôt qu'un pense-bête. */
                <form onSubmit={envoyerNote} className="flex h-full flex-col gap-3">
                  <Textarea
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ce qu'il faut retenir de cet échange…"
                    className="min-h-[180px] flex-1 resize-none"
                  />
                  <div className="flex shrink-0 justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => { setNote(''); setPanneau(null) }}>
                      Annuler
                    </Button>
                    <Button type="submit" variant="primary" disabled={createInteraction.isPending || !note.trim()}>
                      <Send className="h-3.5 w-3.5" />
                      Enregistrer la note
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      {avecPanneau && messageRetour}

      <Dialog
        open={noteASupprimer !== null}
        onClose={() => setNoteASupprimer(null)}
        title="Supprimer cette note ?"
        description="Elle disparaîtra du fil. Un administrateur pourra la restaurer depuis la corbeille."
      >
        {noteASupprimer && (
          <div className="space-y-3">
            <p className="line-clamp-4 whitespace-pre-line rounded-km bg-km-soft px-3 py-2 text-km-label text-km-muted">
              {noteASupprimer.texte || '(note sans texte)'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNoteASupprimer(null)}>Annuler</Button>
              <Button
                variant="danger"
                disabled={supprimerInteraction.isPending}
                onClick={() => {
                  supprimerInteraction.mutate(noteASupprimer.id)
                  setNoteASupprimer(null)
                }}
              >
                Supprimer
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
