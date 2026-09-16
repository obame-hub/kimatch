import { useMemo, useState } from 'react'
import { Search, KeyRound, Link2, Shield, ShieldOff, Hash, AlertTriangle } from 'lucide-react'
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

function LigneChamp({ champ, surTable }: { champ: ChampCatalogue; surTable: (t: string) => void }) {
  return (
    <tr className="border-t border-km-line align-top">
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
            onClick={() => surTable(champ.reference!.table)}
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

function DetailTable({ table, surTable }: { table: TableCatalogue; surTable: (t: string) => void }) {
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
              <LigneChamp key={c.nom} champ={c} surTable={surTable} />
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
            onClick={() => setChoisie(t.nom)}
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
          {table ? <DetailTable table={table} surTable={setChoisie} /> : null}
        </div>
      </div>
    </div>
  )
}
