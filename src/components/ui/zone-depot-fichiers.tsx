import { useRef, useState } from 'react'
import { Upload, Loader2, FileText, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Glisser-deposer de fichiers, avec categorisation.
 *
 * Demande du brief de William : « le glisser-deposer de fichiers est IMPERATIF, sur toutes les
 * fiches, avec categorisation (contrat, facture, avenant, mail, photo…) ». L'ajout passait
 * jusqu'ici par une modale, sur chaque fiche.
 *
 * Le composant ne sait rien du stockage : il collecte les fichiers, laisse choisir leur type, et
 * appelle `onDeposer`. Chaque fiche branche ce qu'elle veut derriere — c'est ce qui permet de le
 * poser sur compte, site, compteur, contrat, mandat et recommandation sans le dupliquer.
 *
 * Le clic reste possible : le glisser-deposer n'existe pas sur mobile, et certains preferent
 * l'explorateur de fichiers.
 */

/**
 * Traduit l'échec d'un dépôt en phrase qui dit quoi faire.
 *
 * Agathe, le 21/08/2026, s'est vu répondre `new row for relation "documents" violates check
 * constraint "documents_entite_type_check"` en essayant de joindre une facture à un compteur. Le
 * message était exact et parfaitement inutilisable : rien n'y indiquait que le refus venait de la
 * BASE et non du fichier, ni qu'une migration restait à appliquer.
 *
 * On garde le texte d'origine entre parenthèses : c'est lui qui nomme la contrainte, et c'est de ce
 * nom qu'on repart pour corriger.
 */
function messageDeDepot(e: unknown): string {
  const brut = e instanceof Error ? e.message : String(e)
  if (!brut) return 'Le dépôt a échoué.'
  if (/violates check constraint|23514/i.test(brut)) {
    return `Dépôt refusé : la base n'accepte pas encore de fichier sur ce type d'objet. Une migration reste à appliquer. (${brut})`
  }
  if (/column .* does not exist|PGRST204|42703|schema cache/i.test(brut)) {
    return `Dépôt refusé : la base n'a pas la colonne attendue. Une migration reste à appliquer. (${brut})`
  }
  if (/violates row-level security|42501/i.test(brut)) {
    return `Dépôt refusé : vos droits ne couvrent pas cet objet. (${brut})`
  }
  return `Le dépôt a échoué : ${brut}`
}

/** Le poids, dans l'unité qui se lit. */
function poids(octets: number): string {
  if (octets > 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1)} Mo`
  return `${Math.max(1, Math.round(octets / 1024))} Ko`
}

/** L'extension, en majuscules, pour reconnaître la nature du fichier d'un coup d'œil. */
function extension(nom: string): string {
  const point = nom.lastIndexOf('.')
  if (point <= 0 || point === nom.length - 1) return 'fichier'
  return nom.slice(point + 1).toUpperCase()
}

/** Deux fichiers sont le même si le nom, le poids et la date de modification concordent. */
function cle(f: File): string {
  return `${f.name}|${f.size}|${f.lastModified}`
}

export function ZoneDepotFichiers({
  types,
  onDeposer,
  accept,
  className,
}: {
  /** Categories proposees, telles que la table types_documents les nomme. */
  types: { id: string; libelle: string }[]
  /** Depot effectif. Recoit les fichiers et la categorie retenue. */
  onDeposer: (fichiers: File[], typeDocumentId: string | null) => Promise<void>
  accept?: string
  className?: string
}) {
  const [survol, setSurvol] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enAttente, setEnAttente] = useState<File[]>([])
  const [typeId, setTypeId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function recevoir(liste: FileList | null) {
    setErreur(null)
    const arrivants = Array.from(liste ?? [])
    if (arrivants.length === 0) return
    // ON AJOUTE, ON NE REMPLACE PAS. Déposer un second fichier effaçait le premier : testé le
    // 21/08/2026 en déposant « premier.pdf » puis « second.pdf », seul le second restait. Or on
    // dépose volontiers ses pièces une par une, et rien n'annonçait la perte.
    //
    // Le même fichier déposé deux fois n'apparaît qu'une fois : nom, poids et date de modification
    // identiques, c'est le même.
    setEnAttente((avant) => {
      const vues = new Set(avant.map(cle))
      return [...avant, ...arrivants.filter((f) => !vues.has(cle(f)))]
    })
    // On ne dépose pas tout de suite : la catégorie se choisit d'abord, sinon les fichiers arrivent
    // tous en « Autre » et le classement est à refaire à la main.
  }

  function retirer(f: File) {
    setEnAttente((avant) => avant.filter((x) => cle(x) !== cle(f)))
    setErreur(null)
  }

  async function confirmer() {
    if (enCours || enAttente.length === 0) return
    setEnCours(true)
    setErreur(null)
    try {
      await onDeposer(enAttente, typeId || null)
      setEnAttente([])
      setTypeId('')
    } catch (e) {
      setErreur(messageDeDepot(e))
    } finally {
      setEnCours(false)
    }
  }

  const enAttenteDe = enAttente.length
  const pluriel = enAttenteDe > 1 ? 's' : ''

  return (
    <div className={className}>
      <div
        onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={(e) => {
          // ON NE QUITTE LA ZONE QUE SI ON EN SORT VRAIMENT. `dragleave` remonte depuis les enfants :
          // passer au-dessus de l'icône ou du texte, à l'intérieur du cadre, éteignait le
          // surlignage. Testé le 21/08/2026 — un `dragleave` émis par le paragraphe intérieur
          // ramenait la zone à son état de repos alors que le fichier était toujours au-dessus.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          setSurvol(false)
        }}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); recevoir(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          survol || enAttenteDe > 0
            ? 'border-kiwi-500 bg-kiwi-50'
            : 'border-navy-200 hover:border-kiwi-400 hover:bg-navy-50',
        )}
      >
        {/* LA ZONE ACCUSE RÉCEPTION. Naoëlle, 21/08/2026 : « je trouve qu'on ne capte pas assez qu'un
            fichier a été glissé-déposé ou choisi. » La zone continuait d'inviter à déposer comme si
            rien n'était arrivé, et le seul signe était une ligne grise de 12 px en dessous. C'est
            ici que l'œil se trouve au moment du dépôt : c'est donc ici qu'il faut le dire. */}
        {enAttenteDe > 0 ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-kiwi-600" />
            <p className="text-sm font-semibold text-kiwi-800">
              {enAttenteDe} fichier{pluriel} prêt{pluriel} à être déposé{pluriel}
            </p>
            <p className="text-xs text-kiwi-700">
              Choisissez une catégorie ci-dessous — ou glissez-en d'autres
            </p>
          </>
        ) : (
          <>
            <Upload className={cn('h-5 w-5', survol ? 'text-kiwi-600' : 'text-navy-400')} />
            <p className="text-sm font-medium text-navy-700">
              {survol ? 'Déposez vos fichiers ici' : 'Glissez des fichiers, ou cliquez pour parcourir'}
            </p>
            <p className="text-xs text-navy-400">Contrat, facture, avenant, mail, photo…</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => { recevoir(e.target.files); e.target.value = '' }}
        />
      </div>

      {enAttenteDe > 0 && (
        <div className="mt-2.5 overflow-hidden rounded-xl border border-kiwi-200 bg-white">
          {/* Une vignette par fichier : le carré à icône donne au fichier une présence que la ligne
              de texte n'avait pas, et l'extension dit sa nature sans avoir à lire tout le nom. */}
          <ul className="divide-y divide-navy-100">
            {enAttente.map((f) => (
              <li key={cle(f)} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kiwi-50 ring-1 ring-kiwi-200">
                  <FileText className="h-4 w-4 text-kiwi-600" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-navy-800">{f.name}</span>
                  <span className="block text-xs text-navy-400">
                    {extension(f.name)} · {poids(f.size)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => retirer(f)}
                  title="Retirer ce fichier"
                  className="shrink-0 rounded-lg p-1.5 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 border-t border-navy-100 bg-navy-50/50 px-3 py-2.5">
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="flex-1 rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-xs text-navy-700 outline-none focus:border-kiwi-500"
            >
              <option value="">Catégorie…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { setEnAttente([]); setErreur(null) }}
              className="rounded-lg px-2.5 py-1.5 text-xs text-navy-500 hover:bg-navy-100"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={confirmer}
              disabled={enCours}
              className="flex items-center gap-1.5 rounded-lg bg-kiwi-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {enCours && <Loader2 className="h-3 w-3 animate-spin" />}
              {enCours ? 'Dépôt…' : `Déposer ${enAttenteDe > 1 ? `(${enAttenteDe})` : ''}`}
            </button>
          </div>

          {erreur && (
            <p className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>
          )}
        </div>
      )}
    </div>
  )
}
