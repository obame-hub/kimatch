import { Cog } from 'lucide-react'
import type { HistoriqueEntry } from '@/lib/data/historique'
import { TitreSection } from '@/components/compte/OngletsCompte'

/**
 * Onglet « Historique des modifications » — maquette « Fiche Compte » de William (12/08/2026).
 *
 * Tableau à quatre colonnes fixes (150 / 160 / 170 / reste), avatar à initiales sur l'auteur,
 * pastille grise sur le nom du champ, et l'ancienne valeur barrée suivie d'une flèche.
 */

/** Initiales pour l'avatar : « Marie Thonnard » donne « MT ». */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('')
}

export function OngletHistorique({ entrees }: { entrees: HistoriqueEntry[] | undefined }) {
  const lignes = entrees ?? []
  // La maquette verrouille la page à min-width 1280px et peut donc se permettre quatre colonnes
  // fixes en permanence. Kimatch descend jusqu'au mobile : on replie sur deux colonnes, en gardant
  // celles qui portent l'information indispensable (quand, et quoi).
  const grille = 'grid-cols-[130px_1fr] gap-3.5 md:grid-cols-[150px_160px_170px_1fr]'

  return (
    <div className="animate-kw-fade-slide flex flex-col gap-3">
      <TitreSection
        precision={`· ${lignes.length} changement${lignes.length > 1 ? 's' : ''} tracé${lignes.length > 1 ? 's' : ''} · tous horodatés`}
      >
        Historique des modifications
      </TitreSection>

      <div className="overflow-hidden rounded-xl border border-[#e7e6e2] bg-white">
        <div
          className={`grid ${grille} border-b border-[#f0efec] px-[18px] py-[11px] text-[10px] font-bold uppercase tracking-[.05em] text-[#a3a5a0]`}
        >
          <span>Quand</span>
          <span className="hidden md:block">Par</span>
          <span className="hidden md:block">Champ</span>
          <span>Modification</span>
        </div>

        {lignes.map((h) => (
          <div
            key={h.id}
            className={`grid ${grille} items-center border-b border-[#f5f4f1] px-[18px] py-3 transition-colors last:border-b-0 hover:bg-[#fbfbfa]`}
          >
            <span className="font-mono text-[10.5px] text-[#83868f]">
              {new Date(h.date_modification).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="hidden items-center gap-[7px] md:flex">
              {/* UNE PERSONNE A DES INITIALES, UN TRAITEMENT A UN ENGRENAGE. Les confondre revenait
                  a faire passer un import pour quelqu'un : « Kimatch a modifie » se lisait comme un
                  nom propre, et on ne pouvait pas savoir lequel des dix collegues avait touche a
                  quoi. La forme dit maintenant la nature avant meme qu'on lise l'etiquette. */}
              {h.estUnePersonne ? (
                <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#e4ded2] text-[8.5px] font-bold text-[#6b6355]">
                  {initiales(h.auteur)}
                </span>
              ) : (
                <span
                  title="Modification faite par un import ou une migration, pas par une personne"
                  className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-[6px] bg-kw-muted text-kw-meta"
                >
                  <Cog className="h-3 w-3" />
                </span>
              )}
              <span
                className={`truncate text-[11.5px] ${h.estUnePersonne ? 'font-semibold' : 'italic text-kw-meta'}`}
              >
                {h.auteur}
              </span>
            </span>
            <span className="hidden md:block">
              <span className="rounded-[5px] bg-[#f2f1ee] px-[7px] py-[3px] font-mono text-[10px] font-semibold text-[#5c5f66]">
                {h.champ}
              </span>
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-[9px]">
              {h.ancienne_valeur && (
                <>
                  <span className="text-[11.5px] text-[#a3a5a0] line-through">{h.ancienne_valeur}</span>
                  <span className="text-[11px] text-[#c9cbc6]">→</span>
                </>
              )}
              <span className="text-[11.5px] font-bold text-[#0d7a5f]">{h.nouvelle_valeur ?? '—'}</span>
            </span>
          </div>
        ))}

        {lignes.length === 0 ? (
          <p className="p-4 text-xs text-[#83868f]">Aucune modification enregistrée.</p>
        ) : (
          <div className="px-[18px] py-2.5 text-[10.5px] text-[#a3a5a0]">
            Chaque modification de champ est tracée automatiquement — champ, auteur, horodatage,
            ancienne et nouvelle valeur.
          </div>
        )}
      </div>
    </div>
  )
}
