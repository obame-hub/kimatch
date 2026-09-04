import { useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import { TableKit } from '@tiptap/extension-table'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Youtube } from '@tiptap/extension-youtube'
import { Placeholder } from '@tiptap/extensions'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Columns3,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
  Video,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { televerserFichierNouveaute } from '@/lib/data/publications'
import { cn } from '@/lib/utils'

/**
 * L'ÉDITEUR D'UNE NOUVEAUTÉ — « fonctionnalités similaires à du Word, du Pages » (William,
 * 05/09/2026).
 *
 * ══ POURQUOI TIPTAP ET PAS UN `contenteditable` À NOUS ══
 *
 * Un `contenteditable` nu paraît simple une heure : on écrit dedans, `document.execCommand('bold')`
 * met en gras, et tout va bien. Puis on colle du Word, et le navigateur insère quarante balises de
 * mise en forme propriétaires ; on appuie sur Entrée dans une cellule de tableau, et la structure
 * se casse ; on annule, et l'historique ne sait pas ce qu'il défait. Ces trois problèmes n'ont pas
 * de solution courte — ce sont eux que ProseMirror, sur lequel TipTap est bâti, résout en tenant un
 * modèle de document séparé du HTML affiché.
 *
 * ══ CE QUE LA BARRE D'OUTILS NE FAIT PAS ══
 *
 * Pas de choix « couleur du fond de la page », pas de colonnes, pas de saut de page : ce sont des
 * réglages de traitement de texte destinés à l'impression. Une nouveauté se lit dans une fenêtre de
 * l'application, sur la largeur qu'on lui donne.
 *
 * ══ LES FICHIERS PARTENT DANS L'ESPACE PRIVÉ ══
 *
 * Image comme pièce jointe : dépôt dans le bucket `nouveautes`, et c'est `data-chemin` qui est
 * conservé, pas l'adresse. Voir `src/lib/htmlPublication.ts` — une adresse signée périme, le chemin
 * non.
 */

const POLICES = [
  { valeur: '', libelle: 'Police du thème' },
  { valeur: 'Inter, sans-serif', libelle: 'Inter' },
  { valeur: 'Georgia, serif', libelle: 'Georgia' },
  { valeur: '"Times New Roman", serif', libelle: 'Times New Roman' },
  { valeur: 'Arial, sans-serif', libelle: 'Arial' },
  { valeur: 'Verdana, sans-serif', libelle: 'Verdana' },
  { valeur: '"Courier New", monospace', libelle: 'Courier New' },
]

const TAILLES = ['', '12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px']

const NIVEAUX = [
  { valeur: 'p', libelle: 'Paragraphe' },
  { valeur: '1', libelle: 'Titre 1' },
  { valeur: '2', libelle: 'Titre 2' },
  { valeur: '3', libelle: 'Titre 3' },
]

/** Un bouton de la barre. `actif` reflète l'état réel de la sélection, pas le dernier clic. */
function Outil({
  onClick,
  actif,
  titre,
  children,
  desactive,
}: {
  onClick: () => void
  actif?: boolean
  titre: string
  children: React.ReactNode
  desactive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      aria-pressed={actif}
      disabled={desactive}
      className={cn(
        'flex h-[28px] w-[28px] items-center justify-center rounded-km-sm transition-colors disabled:opacity-35',
        actif
          ? 'bg-km-green-soft text-km-green'
          : 'text-km-muted hover:bg-km-soft hover:text-km-text',
      )}
    >
      {children}
    </button>
  )
}

function Separateur() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-km-line" aria-hidden="true" />
}

/** Le menu déroulant compact de la barre — plus bas que le `Select` des formulaires (28 px). */
function ChoixBarre({
  valeur,
  onChange,
  options,
  ariaLabel,
  largeur,
}: {
  valeur: string
  onChange: (v: string) => void
  options: { valeur: string; libelle: string }[]
  ariaLabel: string
  largeur: string
}) {
  return (
    <select
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        'h-[28px] shrink-0 cursor-pointer rounded-km-sm border border-km-line bg-km-surface px-1.5 text-km-label text-km-muted',
        'focus:border-km-green focus:outline-none',
        largeur,
      )}
    >
      {options.map((o) => (
        <option key={o.valeur} value={o.valeur}>
          {o.libelle}
        </option>
      ))}
    </select>
  )
}

/** La saisie d'une adresse, sous la barre — un lien ou une vidéo. Remplace un `prompt()`. */
function SaisieAdresse({
  libelle,
  espace,
  onValider,
  onAnnuler,
}: {
  libelle: string
  espace: string
  onValider: (url: string) => void
  onAnnuler: () => void
}) {
  const [url, setUrl] = useState('')
  return (
    <div className="flex items-center gap-2 border-b border-km-line bg-km-soft px-2 py-1.5">
      <span className="shrink-0 text-km-label font-semibold text-km-muted">{libelle}</span>
      <Input
        autoFocus
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={espace}
        className="h-[28px] flex-1"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (url.trim()) onValider(url.trim())
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onAnnuler()
          }
        }}
      />
      <Button type="button" size="sm" variant="primary" onClick={() => url.trim() && onValider(url.trim())}>
        Insérer
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onAnnuler}>
        Annuler
      </Button>
    </div>
  )
}

/**
 * L'image garde le chemin de son fichier privé.
 *
 * Sans cette extension, TipTap ne conserve que `src`, `alt` et `title` : le `data-chemin` posé à
 * l'insertion disparaîtrait au premier enregistrement, et l'image cesserait de s'afficher une heure
 * plus tard, quand son adresse signée expire — sans qu'on puisse la retrouver.
 */
const ImagePrivee = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-chemin': {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-chemin'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['data-chemin'] ? { 'data-chemin': attributes['data-chemin'] } : {},
      },
    }
  },
})

/** Même raison pour la pièce jointe, qui est un lien vers un fichier privé. */
const LienFichier = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-chemin': {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-chemin'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes['data-chemin'] ? { 'data-chemin': attributes['data-chemin'] } : {},
      },
    }
  },
})

function BarreOutils({ editor }: { editor: Editor }) {
  const [saisie, setSaisie] = useState<'lien' | 'video' | null>(null)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const champImage = useRef<HTMLInputElement>(null)
  const champFichier = useRef<HTMLInputElement>(null)

  const dansTableau = editor.isActive('table')

  async function deposer(fichier: File, genre: 'image' | 'fichier') {
    setErreur(null)
    setEnvoi(fichier.name)
    try {
      const depose = await televerserFichierNouveaute(fichier)
      if (genre === 'image') {
        editor
          .chain()
          .focus()
          .setImage({ src: depose.url, alt: depose.nom })
          .updateAttributes('image', { 'data-chemin': depose.chemin })
          .run()
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: depose.nom,
            marks: [
              {
                type: 'link',
                attrs: { href: depose.url, target: '_blank', 'data-chemin': depose.chemin },
              },
            ],
          })
          .run()
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le dépôt du fichier a échoué")
    } finally {
      setEnvoi(null)
    }
  }

  const niveauCourant = editor.isActive('heading', { level: 1 })
    ? '1'
    : editor.isActive('heading', { level: 2 })
      ? '2'
      : editor.isActive('heading', { level: 3 })
        ? '3'
        : 'p'

  return (
    <>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-km-line bg-km-surface px-2 py-1.5">
        <Outil titre="Annuler" onClick={() => editor.chain().focus().undo().run()} desactive={!editor.can().undo()}>
          <Undo2 className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Rétablir" onClick={() => editor.chain().focus().redo().run()} desactive={!editor.can().redo()}>
          <Redo2 className="h-3.5 w-3.5" />
        </Outil>

        <Separateur />

        <ChoixBarre
          ariaLabel="Niveau de titre"
          largeur="w-[104px]"
          valeur={niveauCourant}
          options={NIVEAUX}
          onChange={(v) => {
            if (v === 'p') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run()
          }}
        />
        <ChoixBarre
          ariaLabel="Police"
          largeur="w-[116px]"
          valeur={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
          options={POLICES}
          onChange={(v) => {
            if (v) editor.chain().focus().setFontFamily(v).run()
            else editor.chain().focus().unsetFontFamily().run()
          }}
        />
        <ChoixBarre
          ariaLabel="Taille du texte"
          largeur="w-[66px]"
          valeur={(editor.getAttributes('textStyle').fontSize as string) ?? ''}
          options={TAILLES.map((t) => ({ valeur: t, libelle: t || 'Taille' }))}
          onChange={(v) => {
            if (v) editor.chain().focus().setFontSize(v).run()
            else editor.chain().focus().unsetFontSize().run()
          }}
        />

        <Separateur />

        <Outil titre="Gras" actif={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Italique" actif={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Souligné" actif={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Barré" actif={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Code" actif={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-3.5 w-3.5" />
        </Outil>

        {/* Le sélecteur de couleur natif : son panneau est celui du système, mais c'est le seul qui
            donne la pipette et les couleurs récentes sans écrire un nuancier à la main. */}
        <label
          className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-km-sm text-km-muted hover:bg-km-soft hover:text-km-text"
          title="Couleur du texte"
        >
          <span
            className="h-3.5 w-3.5 rounded-[3px] border border-km-line"
            style={{ background: (editor.getAttributes('textStyle').color as string) ?? '#1f2937' }}
          />
          <input
            type="color"
            className="sr-only"
            value={(editor.getAttributes('textStyle').color as string) ?? '#1f2937'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <label
          className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-km-sm text-km-muted hover:bg-km-soft hover:text-km-text"
          title="Couleur de surlignage"
        >
          <Highlighter className="h-3.5 w-3.5" />
          <input
            type="color"
            className="sr-only"
            value={(editor.getAttributes('textStyle').backgroundColor as string) ?? '#fde68a'}
            onChange={(e) => editor.chain().focus().setBackgroundColor(e.target.value).run()}
          />
        </label>

        <Separateur />

        <Outil titre="Aligner à gauche" actif={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Centrer" actif={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Aligner à droite" actif={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Justifier" actif={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <AlignJustify className="h-3.5 w-3.5" />
        </Outil>

        <Separateur />

        <Outil titre="Liste à puces" actif={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Liste numérotée" actif={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Citation" actif={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Trait de séparation" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </Outil>

        <Separateur />

        <Outil titre="Lien" actif={editor.isActive('link')} onClick={() => setSaisie(saisie === 'lien' ? null : 'lien')}>
          <Link2 className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Retirer le lien" desactive={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()}>
          <Link2Off className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Image" onClick={() => champImage.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Pièce jointe" onClick={() => champFichier.current?.click()}>
          <Paperclip className="h-3.5 w-3.5" />
        </Outil>
        <Outil titre="Vidéo YouTube" onClick={() => setSaisie(saisie === 'video' ? null : 'video')}>
          <Video className="h-3.5 w-3.5" />
        </Outil>

        <Separateur />

        <Outil
          titre="Insérer un tableau"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon className="h-3.5 w-3.5" />
        </Outil>
        {/* Les commandes de tableau n'apparaissent QUE dans un tableau : hors de lui elles sont
            inertes, et une barre pleine de boutons morts se lit mal. */}
        {dansTableau && (
          <>
            <Outil titre="Ajouter une ligne" onClick={() => editor.chain().focus().addRowAfter().run()}>
              <Rows3 className="h-3.5 w-3.5" />
            </Outil>
            <Outil titre="Ajouter une colonne" onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <Columns3 className="h-3.5 w-3.5" />
            </Outil>
            <Outil titre="Supprimer le tableau" onClick={() => editor.chain().focus().deleteTable().run()}>
              <Trash2 className="h-3.5 w-3.5" />
            </Outil>
          </>
        )}
      </div>

      {saisie === 'lien' && (
        <SaisieAdresse
          libelle="Lien"
          espace="https://…"
          onAnnuler={() => setSaisie(null)}
          onValider={(url) => {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
            setSaisie(null)
          }}
        />
      )}
      {saisie === 'video' && (
        <SaisieAdresse
          libelle="Vidéo"
          espace="https://www.youtube.com/watch?v=…"
          onAnnuler={() => setSaisie(null)}
          onValider={(url) => {
            editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 })
            setSaisie(null)
          }}
        />
      )}

      {envoi && (
        <p className="border-b border-km-line bg-km-soft px-3 py-1.5 text-km-label text-km-muted">
          Dépôt de « {envoi} » en cours…
        </p>
      )}
      {erreur && (
        <p className="border-b border-km-line bg-km-red-soft px-3 py-1.5 text-km-label text-km-red">{erreur}</p>
      )}

      <input
        ref={champImage}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void deposer(f, 'image')
          e.target.value = ''
        }}
      />
      <input
        ref={champFichier}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void deposer(f, 'fichier')
          e.target.value = ''
        }}
      />
    </>
  )
}

export function EditeurRiche({
  valeur,
  onChange,
}: {
  valeur: string
  onChange: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [
      // `link: false` : StarterKit embarque son propre lien depuis la version 3, et il faut le
      // laisser la place à celui qui garde `data-chemin` des pièces jointes.
      StarterKit.configure({ link: false }),
      LienFichier.configure({ openOnClick: false, autolink: true }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ImagePrivee.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: true } }),
      Youtube.configure({ controls: true, nocookie: true }),
      Placeholder.configure({ placeholder: 'Expliquez ce qui change, et ce que l’équipe doit en faire…' }),
    ],
    content: valeur,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: 'contenu-riche min-h-[260px] px-4 py-3 focus:outline-none',
      },
    },
  })

  if (!editor) return null

  return (
    <div className="overflow-hidden rounded-km border border-km-line bg-km-surface">
      <BarreOutils editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
