import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Un type d'activité = un fond teinté + une ligne de couleur à gauche (référence : fil
// d'activité de la fiche Site). Toute liste d'activités/tâches dans l'app doit réutiliser
// ce composant pour rester visuellement cohérente.
export type ActivityStyleKey = 'action' | 'note' | 'appel' | 'email' | 'signal' | 'document'

export const ACTIVITY_STYLE: Record<ActivityStyleKey, { bg: string; border: string; accent: string; plate: string; fg: string }> = {
  action: { bg: '#fdf9f0', border: '#f0e4cd', accent: '#b57a24', plate: '#f3e3c8', fg: '#8a6420' },
  /**
   * LA NOTE QUITTE LA FAMILLE DES BRUNS CHAUDS.
   *
   * William, 07/09/2026 : « bien différencier les couleurs car ça se rapproche trop du design des
   * tâches terminées ». Il avait raison, et le calcul le confirme : la note était en `#fbf8f3` sur
   * accent `#8a6d3b`, la tâche en `#fdf9f0` sur `#b57a24` — deux beiges à deux points d'écart et
   * deux bruns de même teinte. Rien ne les séparait qu'un pictogramme de 14 px.
   *
   * LE VIOLET EST LA SEULE TEINTE ENCORE LIBRE de la palette : le vert dit l'appel, le bleu le
   * courriel, l'ambre la tâche, le rouge le signal, le gris le document. Il vient du jeton
   * `--km-violet` (#7C5BB0), déjà dans la feuille de style — ce n'est pas une couleur inventée
   * pour l'occasion.
   */
  note: { bg: '#fbf9fe', border: '#e8e0f4', accent: '#7C5BB0', plate: '#f2ecfb', fg: '#6a4d9a' },
  appel: { bg: '#f7fbf9', border: '#dcece5', accent: '#0d7a5f', plate: '#eaf4f0', fg: '#0d7a5f' },
  email: { bg: '#ffffff', border: '#e7e6e2', accent: '#3b5f8a', plate: '#eef0f4', fg: '#3b5f8a' },
  signal: { bg: '#fdf2ef', border: '#f5d9d0', accent: '#c2452d', plate: '#fbeae5', fg: '#c2452d' },
  document: { bg: '#f6f6f4', border: '#e7e6e2', accent: '#5c5f66', plate: '#f0efec', fg: '#5c5f66' },
}

export function ActivityCard({
  styleKey,
  icon: Icon,
  leading,
  title,
  subtitle,
  body,
  trailing,
  onClick,
  to,
  href,
  className,
  onSupprimer,
}: {
  styleKey: ActivityStyleKey
  icon?: LucideIcon
  leading?: ReactNode
  /**
   * FACULTATIF DEPUIS LE 07/09/2026, et c'est ce qui rend la note lisible.
   *
   * Une note affichait « Note rapide » en titre, puis « William Goupil a ajouté une note sur KIWEE
   * ENERGIE FRANCE » en sous-titre, et le texte écrit venait en troisième, dans un encadré gris.
   * Trois lignes de contexte pour un contenu d'une ligne — William, 07/09/2026 : « pas besoin
   * d'afficher ça, juste optimiser à fond le texte ».
   *
   * Sans titre NI sous-titre, la carte bascule en mode prose : le texte devient le contenu
   * principal, plus grand, sans encadré, sur le lavis de la carte. Le comportement suit le contenu,
   * il n'y a pas de variante à choisir.
   */
  title?: ReactNode
  subtitle?: ReactNode
  /** Le texte de l'activité elle-même — le contenu d'une note, par exemple. Le `subtitle` dit qui a
   *  fait quoi, `body` dit ce qui a été écrit. Ajouté le 16/08/2026 : le fil annonçait « Untel a
   *  ajouté une note » sans jamais montrer la note. */
  body?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  /**
   * LA DESTINATION, QUAND LA CARTE EN A UNE — et c'est le TITRE qui devient un vrai lien, pas la
   * carte entière.
   *
   * William, 08/09/2026 : « quand je clique droit, on ne me propose pas d'ouvrir dans un nouvel
   * onglet ». Envelopper toute la carte dans un `<a>` l'aurait réglé, mais son sous-titre contient
   * déjà des `EntityLink` — un `<a>` dans un `<a>` est invalide, et le navigateur casse alors la
   * structure de lui-même.
   *
   * Le titre porte donc le lien, la carte garde son clic de commodité. C'est le patron habituel des
   * listes : on clique n'importe où pour ouvrir, on clique droit sur le nom pour choisir comment.
   */
  to?: string
  href?: string
  className?: string
  /**
   * LA CORBEILLE N'APPARAÎT QU'AU SURVOL, et seulement si l'appelant la fournit.
   *
   * Le fil mêle des notes écrites à la main et des appels remontés d'Allo : les premières se
   * corrigent, les seconds sont la trace d'un fait. C'est donc à l'appelant de décider, carte par
   * carte — la carte, elle, ne sait pas ce qu'elle représente.
   */
  onSupprimer?: () => void
}) {
  const style = ACTIVITY_STYLE[styleKey]
  /** Sans titre NI sous-titre, le corps EST la carte — voir le commentaire de `title`. */
  const prose = !title && !subtitle && Boolean(body)
  /**
   * Depliage du corps de l'activite — « chaque activite est cliquable et dépliable : résumé IA
   * d'appel, corps du mail, commentaires de tâche » (brief de William).
   *
   * Le clic sur « Voir tout le message » arrete la propagation : sans cela il declencherait aussi
   * la navigation vers la fiche de l'interaction, et l'on n'aurait jamais le temps de lire.
   */
  const [deplie, setDeplie] = useState(false)
  /**
   * ══ LE CORPS DU MESSAGE PREND TOUTE LA LARGEUR DE LA CARTE ══
   *
   * William, 07/09/2026 : « pour les mails, la fenêtre est trop étroite et on se retrouve avec
   * énormément de lignes lorsqu'on clique sur "Voir tout le message". Repense l'endroit où s'affiche
   * la date, car cela bloque toute une colonne à droite. »
   *
   * IL AVAIT RAISON, ET LA CAUSE EST STRUCTURELLE. La carte était UNE seule rangée de trois
   * colonnes : pastille d'icône, contenu, date. Le corps du message vivait dans la colonne du
   * milieu, donc il payait la pastille (28 px) ET la date (~66 px) sur TOUTE sa hauteur — y compris
   * déplié, là où il n'y a plus rien à droite de lui. Dans un volet de 324 px, le texte d'un mail
   * disposait de 166 px : de quoi écrire quatre mots par ligne.
   *
   * La carte devient donc DEUX rangées empilées : l'en-tête garde ses trois colonnes — c'est là que
   * la date se lit d'un coup d'œil, et c'est aussi ce qui laisse la page Tâches intacte, elle qui
   * empile une pastille de statut et une échéance dans cette colonne — puis le corps s'étale sous
   * elles, sur la largeur pleine. 166 px deviennent 280, soit 69 % de gain.
   *
   * LA DATE NE BOUGE PAS DE PLACE POUR AUTANT : elle ne coûte plus que la ligne du titre, qui est
   * tronquée de toute façon. La déplacer sous le sous-titre aurait libéré ces 66 px sur une ligne
   * qui n'en avait pas besoin, et perdu le repère chronologique que l'œil vient chercher en haut à
   * droite de chaque carte.
   */
  const content = (
    <div
      className={cn('group/carte rounded-km-md px-2.5 py-3 transition-colors', (onClick || href) && 'cursor-pointer', className)}
      style={{ background: style.bg, border: `1px solid ${style.border}`, borderLeft: `3px solid ${style.accent}` }}
    >
      <div className="flex items-start gap-2.5">
        {leading ?? (Icon && (
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ background: style.plate, color: style.fg }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        ))}
        <div className="min-w-0 flex-1">
          {/* Couleurs fixes (pas les classes text-navy-*) : le fond de la carte est un lavis
              pastel toujours clair, quel que soit le thème — le texte doit rester sombre dessus
              même en mode sombre (où text-km-text/500 basculeraient en clair et deviendraient illisibles). */}
          {title && (
            <p className="truncate text-km-label font-semibold" style={{ color: '#16181d' }}>
              {to ? (
                // `stopPropagation` seul empêcherait le clic d'atteindre le gestionnaire de la carte
                // MAIS laisserait le navigateur suivre le `href` en rechargeant toute la page.
                // `preventDefault` est donc indispensable ici, et la navigation est faite à la main.
                <Link to={to} className="hover:underline" style={{ color: 'inherit' }}>
                  {title}
                </Link>
              ) : (
                title
              )}
            </p>
          )}
          {subtitle && <p className={cn('line-clamp-2 text-km-label', title && 'mt-0.5')} style={{ color: '#83868f' }}>{subtitle}</p>}
          {/* EN MODE PROSE, LE TEXTE MONTE DANS L'EN-TÊTE, à côté de l'icône : sans titre au-dessus
              de lui, le laisser en bas de carte l'aurait posé sous une ligne vide. */}
          {prose && (
            <p
              className={cn('whitespace-pre-line break-words text-km-body leading-relaxed', !deplie && 'line-clamp-4')}
              style={{ color: '#16181d' }}
            >
              {body}
            </p>
          )}
        </div>
        {trailing && <span className="shrink-0 text-km-xs font-medium" style={{ color: style.accent }}>{trailing}</span>}
        {onSupprimer && (
          <button
            type="button"
            // La carte entière est cliquable : sans cet arrêt, supprimer naviguerait aussi vers la
            // fiche de l'interaction, et l'on quitterait l'écran avant d'avoir vu la confirmation.
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSupprimer() }}
            aria-label="Supprimer"
            title="Supprimer"
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-km-sm text-km-faint opacity-0 transition-all hover:bg-km-red-soft hover:text-km-red focus:opacity-100 group-hover/carte:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {body && !prose && (
        <p
          className={cn(
            'mt-1.5 whitespace-pre-line break-words rounded-md px-2 py-1.5 text-km-label',
            // Deplie : tout le texte. Replie : trois lignes, et on n'annonce « voir plus » que
            // s'il y a vraiment quelque chose de cache — un compte rendu de deux lignes ne doit
            // pas proposer un depliage qui ne montrerait rien.
            !deplie && 'line-clamp-3',
          )}
          style={{ background: style.plate, color: '#16181d' }}
        >
          {body}
        </p>
      )}
      {body && typeof body === 'string' && body.length > 180 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setDeplie((v) => !v) }}
          className="mt-0.5 text-km-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: style.fg }}
        >
          {deplie ? 'Réduire' : prose ? 'Voir toute la note' : 'Voir tout le message'}
        </button>
      )}
    </div>
  )
  if (href) return <a href={href} target="_blank" rel="noreferrer">{content}</a>
  if (onClick) return <div role="button" tabIndex={0} onClick={onClick}>{content}</div>
  return content
}
