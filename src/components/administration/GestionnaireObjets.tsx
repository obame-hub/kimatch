import { useMemo, useState } from 'react'
import { Search, KeyRound, Link2, Shield, ShieldOff, Hash, AlertTriangle, X, Copy, Check } from 'lucide-react'
import { useCatalogue, OBJETS_PRINCIPAUX, estTechnique, type TableCatalogue, type ChampCatalogue } from '@/lib/data/catalogue'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE GESTIONNAIRE D'OBJETS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 16/09/2026 : « un gestionnaire d'objets comme ce qui existe déjà dans Salesforce, du
 * côté administration […] toutes les tables, toutes les colonnes, tout ce qui est utile, les ID ».
 *
 * ══ CE QU'ON VIENT VRAIMENT Y CHERCHER ══
 *
 * Trois questions, et l'écran est construit autour d'elles :
 *
 *   « OÙ EST STOCKÉ CE CHAMP ? » — la recherche du haut cherche dans les noms de COLONNES autant
 *   que de tables. Taper « telephone » montre les onze tables qui en portent un.
 *
 *   « À QUOI CETTE COLONNE EST-ELLE RELIÉE ? » — chaque clé étrangère est affichée avec sa cible
 *   ET ce qui arrive à la suppression : cascade, mise à null, ou refus. C'est la différence entre
 *   supprimer un compte et perdre ses contacts sans le savoir.
 *
 *   « QU'EST-CE QUE JE CASSE EN SUPPRIMANT ÇA ? » — le sens inverse, « référencée par », qui n'a
 *   jamais été lisible nulle part dans Kimatch.
 *
 * ══ POURQUOI ON NE MODIFIE RIEN ICI ══
 *
 * Salesforce laisse créer et supprimer des champs parce que son modèle est fait pour : les colonnes
 * y sont des métadonnées, pas des colonnes SQL. Kimatch est une base PostgreSQL dont le code nomme
 * les colonnes en dur. Renommer `societe` depuis cet écran casserait la page Pistes à la seconde
 * suivante ; supprimer une colonne emporterait ses données sans corbeille ni retour arrière ; et
 * l'`ALTER TABLE` s'appliquerait aux treize personnes en train de travailler, sans relecture et
 * sans trace dans le dépôt.
 *
 * Les champs réellement nouveaux viendront donc d'un magasin dédié, qui s'ajoute sans toucher aux
 * tables existantes — c'est le chantier suivant. Cet écran-ci reste une LECTURE, incapable
 * d'abîmer quoi que ce soit, et c'est ce qui le rend consultable par un administrateur pressé.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

function Etiquette({ children, ton = 'neutre' }: { children: React.ReactNode; ton?: 'neutre' | 'vert' | 'ambre' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-km-tiny font-semibold',
        ton === 'neutre' && 'bg-km-soft text-km-muted',
        ton === 'vert' && 'bg-km-green-soft text-km-green',
        ton === 'ambre' && 'bg-km-amber-soft text-km-amber',
      )}
    >
      {children}
    </span>
  )
}

function LigneChamp({
  champ, surTable, surChamp, choisi,
}: {
  champ: ChampCatalogue
  surTable: (t: string) => void
  surChamp: (c: ChampCatalogue) => void
  choisi: boolean
}) {
  return (
    /* TOUTE LA LIGNE OUVRE LA FICHE, sauf les liens qu'elle contient : viser un nom de champ haut
       de huit pixels pour ouvrir un panneau serait une cible ridicule. */
    <tr
      onClick={() => surChamp(champ)}
      className={cn(
        'cursor-pointer border-t border-km-line align-top transition-colors',
        choisi ? 'bg-km-green-soft' : 'hover:bg-km-soft',
      )}
    >
      <td className="py-2 pr-3">
        <div className="flex items-center gap-1.5">
          {champ.cle_primaire && <KeyRound className="h-3 w-3 shrink-0 text-km-green" aria-label="Clé primaire" />}
          <span className="font-mono text-km-label font-semibold text-km-text">{champ.nom}</span>
        </div>
        {champ.commentaire && (
          <p className="mt-0.5 max-w-[42ch] text-km-tiny leading-snug text-km-faint">{champ.commentaire}</p>
        )}
      </td>
      <td className="py-2 pr-3 font-mono text-km-tiny text-km-muted">{champ.type}</td>
      <td className="py-2 pr-3">
        {champ.obligatoire ? <Etiquette ton="ambre">obligatoire</Etiquette> : <span className="text-km-faint">—</span>}
      </td>
      <td className="py-2 pr-3 font-mono text-km-tiny text-km-faint">
        {/* LA VALEUR PAR DÉFAUT EST TRONQUÉE, PAS MASQUÉE : certaines sont des expressions longues,
            et les cacher ferait croire qu'il n'y en a pas. */}
        {champ.defaut ? (
          <span title={champ.defaut}>{champ.defaut.length > 28 ? `${champ.defaut.slice(0, 28)}…` : champ.defaut}</span>
        ) : (
          '—'
        )}
      </td>
      <td className="py-2 pr-3">
        {champ.reference ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); surTable(champ.reference!.table) }}
            className="inline-flex items-center gap-1 text-km-label font-semibold text-km-green hover:underline"
          >
            <Link2 className="h-3 w-3" />
            {champ.reference.table}.{champ.reference.colonne}
          </button>
        ) : (
          <span className="text-km-faint">—</span>
        )}
        {champ.reference?.a_la_suppression && (
          <p className="mt-0.5 text-km-tiny text-km-faint">à la suppression : {champ.reference.a_la_suppression}</p>
        )}
      </td>
      <td className="py-2">
        <div className="flex flex-wrap gap-1">
          {champ.unique && <Etiquette ton="vert">unique</Etiquette>}
          {champ.indexee && !champ.cle_primaire && <Etiquette>indexée</Etiquette>}
          {champ.genere && <Etiquette>générée</Etiquette>}
        </div>
      </td>
    </tr>
  )
}

/**
 * ══ LA FICHE D'UN CHAMP ══
 *
 * Naoëlle, 16/09/2026 : « on ne peut pas cliquer sur un champ et le gérer ».
 *
 * Ce panneau répond d'abord à ce qu'elle demandait au départ : « leurs liens de colonne Supabase
 * […] les ID ». Le nom qualifié complet — `public.comptes.telephone` — se copie d'un clic, parce
 * que c'est exactement ce qu'on colle dans une requête, un script, ou un message à Michel.
 *
 * CE QU'ON NE PEUT PAS FAIRE Y EST ÉCRIT, au lieu d'être laissé à deviner devant des boutons
 * absents. Un écran d'administration qui tait ses limites se fait accuser d'être cassé, et on
 * cherche le bouton pendant dix minutes.
 */
function FicheChamp({
  table, champ, surTable, fermer,
}: {
  table: TableCatalogue
  champ: ChampCatalogue
  surTable: (t: string) => void
  fermer: () => void
}) {
  const [copie, setCopie] = useState(false)
  const qualifie = `public.${table.nom}.${champ.nom}`

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(qualifie)
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    } catch {
      /* Presse-papier refusé : le nom reste affiché et sélectionnable à la main. */
    }
  }

  const Ligne = ({ cle, children }: { cle: string; children: React.ReactNode }) => (
    <div className="flex gap-2 border-t border-km-line py-1.5 first:border-t-0">
      <span className="w-[108px] shrink-0 text-km-label text-km-faint">{cle}</span>
      <span className="min-w-0 flex-1 text-km-label text-km-text">{children}</span>
    </div>
  )

  return (
    <aside className="w-[330px] shrink-0 overflow-y-auto rounded-km border border-km-line bg-white p-3.5">
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-km-name font-semibold text-km-text">{champ.nom}</p>
          <p className="truncate font-mono text-km-tiny text-km-faint">{table.nom}</p>
        </div>
        <button
          type="button"
          onClick={fermer}
          title="Fermer"
          className="shrink-0 rounded p-1 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={copier}
        className="mb-3 flex w-full items-center justify-between gap-2 rounded-km border border-km-line px-2 py-1.5 text-left transition-colors hover:border-km-green hover:bg-km-green-soft"
      >
        <span className="min-w-0 truncate font-mono text-km-tiny text-km-text">{qualifie}</span>
        {copie
          ? <Check className="h-3.5 w-3.5 shrink-0 text-km-green" />
          : <Copy className="h-3.5 w-3.5 shrink-0 text-km-faint" />}
      </button>

      {champ.commentaire && (
        <p className="mb-3 rounded-km bg-km-soft px-2 py-1.5 text-km-label leading-snug text-km-muted">
          {champ.commentaire}
        </p>
      )}

      <Ligne cle="Type"><span className="font-mono">{champ.type}</span></Ligne>
      <Ligne cle="Saisie">{champ.obligatoire ? 'Obligatoire' : 'Facultative'}</Ligne>
      <Ligne cle="Par défaut">
        {champ.defaut ? <span className="break-all font-mono text-km-tiny">{champ.defaut}</span> : 'aucune'}
      </Ligne>
      <Ligne cle="Clés & index">
        <div className="flex flex-wrap gap-1">
          {champ.cle_primaire && <Etiquette ton="vert">clé primaire</Etiquette>}
          {champ.unique && <Etiquette ton="vert">unique</Etiquette>}
          {champ.indexee && <Etiquette>indexée</Etiquette>}
          {champ.genere && <Etiquette>calculée</Etiquette>}
          {!champ.cle_primaire && !champ.unique && !champ.indexee && !champ.genere && (
            <span className="text-km-faint">aucun</span>
          )}
        </div>
      </Ligne>

      {champ.reference && (
        <Ligne cle="Pointe vers">
          <button
            type="button"
            onClick={() => surTable(champ.reference!.table)}
            className="font-mono font-semibold text-km-green hover:underline"
          >
            {champ.reference.table}.{champ.reference.colonne}
          </button>
          {champ.reference.a_la_suppression && (
            <p className="mt-0.5 text-km-tiny text-km-faint">
              Si la ligne visée est supprimée : {champ.reference.a_la_suppression}.
            </p>
          )}
        </Ligne>
      )}

      {champ.cle_primaire && table.referencee_par.length > 0 && (
        <Ligne cle="Référencée par">
          <div className="flex flex-wrap gap-1">
            {table.referencee_par.map((r) => (
              <button
                key={`${r.table}.${r.colonne}`}
                type="button"
                onClick={() => surTable(r.table)}
                className="rounded-km border border-km-line px-1.5 py-0.5 font-mono text-km-tiny text-km-text hover:border-km-green"
              >
                {r.table}.{r.colonne}
              </button>
            ))}
          </div>
        </Ligne>
      )}

      {/* ══ POURQUOI IL N'Y A PAS DE BOUTON « MODIFIER » ══
          Dit ici, à l'endroit exact où l'on s'attend à en trouver un. */}
      <div className="mt-3 rounded-km border border-km-line bg-km-soft px-2 py-2">
        <p className="text-km-label font-semibold text-km-text">Ce champ ne se modifie pas d’ici</p>
        <p className="mt-1 text-km-tiny leading-snug text-km-muted">
          C’est une vraie colonne PostgreSQL, que le code de Kimatch nomme en toutes lettres. La
          renommer casserait les écrans qui s’en servent à la seconde suivante, et la supprimer
          emporterait ses données sans corbeille. Ces changements passent par une migration, relue
          et tracée.
        </p>
        <p className="mt-1.5 text-km-tiny leading-snug text-km-muted">
          Les champs <strong>ajoutés</strong>, eux, se créeront bien ici : ils vivront à part et ne
          pourront rien casser.
        </p>
      </div>
    </aside>
  )
}

function DetailTable({
  table, surTable, surChamp, champChoisi,
}: {
  table: TableCatalogue
  surTable: (t: string) => void
  surChamp: (c: ChampCatalogue) => void
  champChoisi: string | null
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-mono text-km-h3 font-semibold text-km-text">{table.nom}</h3>
          <Etiquette>{table.colonnes.length} champs</Etiquette>
          <Etiquette>
            <Hash className="h-3 w-3" />~{table.lignes_estimees.toLocaleString('fr-FR')} lignes
          </Etiquette>
          {table.rls_active ? (
            <Etiquette ton={table.nb_politiques > 0 ? 'vert' : 'ambre'}>
              <Shield className="h-3 w-3" />
              RLS · {table.nb_politiques} politique{table.nb_politiques > 1 ? 's' : ''}
            </Etiquette>
          ) : (
            <Etiquette ton="ambre">
              <ShieldOff className="h-3 w-3" />sans RLS
            </Etiquette>
          )}
        </div>
        {table.commentaire && <p className="mt-1 text-km-body text-km-muted">{table.commentaire}</p>}
        {/* UNE TABLE AVEC RLS ET ZÉRO POLITIQUE NE LAISSE PASSER PERSONNE. C'est arrivé en juillet
            sur 44 tables d'un coup : l'application semblait vide sans qu'aucune erreur ne s'affiche.
            Autant que ça saute aux yeux ici. */}
        {table.rls_active && table.nb_politiques === 0 && (
          <p className="mt-2 flex items-start gap-1.5 rounded-km border border-km-amber-line bg-km-amber-soft px-2 py-1.5 text-km-label leading-snug text-km-text">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-amber" />
            RLS activé sans aucune politique : personne ne peut lire cette table depuis
            l’application, et aucune erreur ne s’affiche — elle paraît simplement vide.
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="text-km-tiny font-bold uppercase tracking-[0.06em] text-km-faint">
              <th className="pb-1.5 pr-3">Champ</th>
              <th className="pb-1.5 pr-3">Type</th>
              <th className="pb-1.5 pr-3">Saisie</th>
              <th className="pb-1.5 pr-3">Par défaut</th>
              <th className="pb-1.5 pr-3">Pointe vers</th>
              <th className="pb-1.5">Index</th>
            </tr>
          </thead>
          <tbody>
            {table.colonnes.map((c) => (
              <LigneChamp
                key={c.nom}
                champ={c}
                surTable={surTable}
                surChamp={surChamp}
                choisi={champChoisi === c.nom}
              />
            ))}
          </tbody>
        </table>
      </div>

      {table.referencee_par.length > 0 && (
        <div className="mt-5">
          <p className="text-km-tiny font-bold uppercase tracking-[0.06em] text-km-faint">
            Ce qui pointe vers {table.nom}
          </p>
          <p className="mt-0.5 text-km-label text-km-muted">
            Autrement dit, ce qui est concerné quand on supprime une ligne d’ici.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {table.referencee_par.map((r) => (
              <button
                key={`${r.table}.${r.colonne}`}
                type="button"
                onClick={() => surTable(r.table)}
                className="rounded-km border border-km-line px-2 py-1 font-mono text-km-tiny text-km-text transition-colors hover:border-km-green hover:bg-km-green-soft"
              >
                {r.table}.{r.colonne}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function GestionnaireObjets() {
  const { data, isLoading, error } = useCatalogue()
  const [recherche, setRecherche] = useState('')
  const [choisie, setChoisie] = useState<string | null>(null)
  /* LE CHAMP CHOISI SE PERD QUAND ON CHANGE DE TABLE : garder « telephone » sélectionné en passant
     de comptes à contrats ouvrirait la fiche d'un champ qui n'existe pas là. */
  const [champChoisi, setChampChoisi] = useState<string | null>(null)
  const choisirTable = (t: string) => { setChoisie(t); setChampChoisi(null) }

  const tables = data?.tables ?? []

  /* LA RECHERCHE PORTE SUR LES COLONNES AUTANT QUE SUR LES TABLES. C'est la question la plus
     fréquente — « où est stocké le téléphone ? » — et elle n'a de réponse nulle part ailleurs. */
  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return tables
    return tables.filter(
      (t) => t.nom.includes(q) || t.colonnes.some((c) => c.nom.toLowerCase().includes(q)),
    )
  }, [tables, recherche])

  const principales = resultats.filter((t) => OBJETS_PRINCIPAUX.includes(t.nom))
  const autres = resultats.filter((t) => !OBJETS_PRINCIPAUX.includes(t.nom) && !estTechnique(t.nom))
  const techniques = resultats.filter((t) => !OBJETS_PRINCIPAUX.includes(t.nom) && estTechnique(t.nom))

  const table = tables.find((t) => t.nom === choisie) ?? principales[0] ?? resultats[0] ?? null

  if (isLoading) return <p className="text-km-body text-km-muted">Lecture du schéma…</p>
  if (error) {
    return (
      <p className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2 text-km-body text-km-text">
        {error instanceof Error ? error.message : 'Lecture du schéma impossible.'}
      </p>
    )
  }

  const Groupe = ({ titre, liste }: { titre: string; liste: TableCatalogue[] }) =>
    liste.length === 0 ? null : (
      <div className="mb-3">
        <p className="mb-1 px-1 text-km-tiny font-bold uppercase tracking-[0.06em] text-km-faint">{titre}</p>
        {liste.map((t) => (
          <button
            key={t.nom}
            type="button"
            onClick={() => choisirTable(t.nom)}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-km px-2 py-1.5 text-left font-mono text-km-label transition-colors',
              table?.nom === t.nom ? 'bg-km-green-soft text-km-green' : 'text-km-text hover:bg-km-soft',
            )}
          >
            <span className="truncate">{t.nom}</span>
            <span className="shrink-0 text-km-tiny text-km-faint">{t.colonnes.length}</span>
          </button>
        ))}
      </div>
    )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-km-faint" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher une table ou un champ — « telephone », « pistes », « source_externe_id »…"
            className="w-full rounded-km border border-km-line bg-white py-1.5 pl-8 pr-3 text-km-body text-km-text placeholder:text-km-faint focus:border-km-green focus:outline-none"
          />
        </div>
        <p className="text-km-label text-km-faint">
          {resultats.length} table{resultats.length > 1 ? 's' : ''} sur {tables.length}
        </p>
      </div>

      <div className="flex min-h-0 gap-4">
        <div className="max-h-[70vh] w-[230px] shrink-0 overflow-y-auto rounded-km border border-km-line bg-white p-2">
          <Groupe titre="Objets" liste={principales} />
          <Groupe titre="Autres tables" liste={autres} />
          <Groupe titre="Technique" liste={techniques} />
          {resultats.length === 0 && <p className="px-1 text-km-label text-km-faint">Aucune correspondance.</p>}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto rounded-km border border-km-line bg-white p-4">
          {table ? (
            <DetailTable
              table={table}
              surTable={choisirTable}
              surChamp={(c) => setChampChoisi(c.nom)}
              champChoisi={champChoisi}
            />
          ) : null}
        </div>

        {/* LA FICHE S'OUVRE À CÔTÉ, PAS PAR-DESSUS : on compare presque toujours un champ à ses
            voisins — « lequel des deux porte la référence ? » — et une fenêtre modale masquerait
            justement la liste qu'on est en train de lire. */}
        {table && champChoisi && (() => {
          const champ = table.colonnes.find((c) => c.nom === champChoisi)
          return champ ? (
            <FicheChamp
              table={table}
              champ={champ}
              surTable={choisirTable}
              fermer={() => setChampChoisi(null)}
            />
          ) : null
        })()}
      </div>
    </div>
  )
}
