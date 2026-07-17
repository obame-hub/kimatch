import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Gauge, Loader2, UserPlus, Check } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useEllisphereSearch, useEllisphereScore, type EllisphereCompany } from '@/lib/data/ellisphere'
import { useComptes, useCreateCompteFromEllisphere } from '@/lib/data/comptes'
import type { TypeCompte } from '@/types/domain'

const typeOptions: { value: TypeCompte; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'fournisseur', label: 'Fournisseur' },
  { value: 'partenaire', label: 'Partenaire' },
]

function ResultCard({ company }: { company: EllisphereCompany }) {
  const score = useEllisphereScore()
  const createCompte = useCreateCompteFromEllisphere()
  const { data: comptes } = useComptes()
  const navigate = useNavigate()
  const [typeCompte, setTypeCompte] = useState<TypeCompte>('client')

  const existing = comptes?.find((c) => c.siren && company.siren && c.siren === company.siren)

  return (
    <div className="rounded-lg border border-navy-100 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-navy-800">{company.raisonSociale ?? company.nomCommercial ?? 'Entreprise'}</p>
          {company.adresse && <p className="mt-1 text-xs text-navy-500">{company.adresse}</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-navy-500">
            {company.siren && <Badge tone="neutral">SIREN {company.siren}</Badge>}
            {company.siret && <Badge tone="neutral">SIRET {company.siret}</Badge>}
            {company.codeNAF && <Badge tone="neutral">NAF {company.codeNAF}</Badge>}
          </div>
          {company.libelleAPE && <p className="mt-2 text-xs text-navy-400">{company.libelleAPE}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {company.siren && (
            <Button type="button" variant="outline" size="sm" onClick={() => score.mutate(company.siren as string)} disabled={score.isPending}>
              <Gauge className="h-4 w-4" />
              {score.isPending ? 'Chargement…' : 'Voir le score'}
            </Button>
          )}

          {existing ? (
            <Button type="button" variant="subtle" size="sm" disabled>
              <Check className="h-4 w-4" />
              Déjà dans vos comptes
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <select
                value={typeCompte}
                onChange={(e) => setTypeCompte(e.target.value as TypeCompte)}
                className="rounded-lg border border-navy-200 px-2 py-1.5 text-xs focus:border-kiwi-500 focus:outline-none"
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  createCompte.mutate(
                    { company, typeCompte },
                    { onSuccess: (result) => navigate(`/comptes/${result.compte.id}`) },
                  )
                }
                disabled={createCompte.isPending}
              >
                <UserPlus className="h-4 w-4" />
                {createCompte.isPending ? 'Ajout…' : 'Ajouter comme compte'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {score.isError && <p className="mt-3 text-xs text-red-600">{(score.error as Error).message}</p>}
      {createCompte.isError && <p className="mt-3 text-xs text-red-600">{(createCompte.error as Error).message}</p>}

      {score.isSuccess && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-kiwi-50 px-3 py-2">
          <Gauge className="h-4 w-4 text-kiwi-700" />
          <p className="text-sm text-kiwi-800">
            {score.data.score
              ? <>Score de solvabilité : <span className="font-semibold">{score.data.score}</span>{score.data.scale && ` / ${score.data.scale}`}</>
              : 'Aucun score disponible pour cette entreprise pour le moment.'}
          </p>
        </div>
      )}
    </div>
  )
}

export function EllisphereSearch() {
  const [query, setQuery] = useState('')
  const search = useEllisphereSearch()

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim().length < 2) return
    search.mutate(query.trim())
  }

  const results = search.data ?? []

  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-navy-400" />
        <p className="font-display text-sm font-semibold text-navy-800">Rechercher une entreprise (Ellisphere)</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom d'entreprise, SIREN ou SIRET…"
          className="flex-1 rounded-lg border border-navy-200 px-3 py-2 text-sm focus:border-kiwi-500 focus:outline-none"
        />
        <Button type="submit" disabled={search.isPending}>
          {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rechercher'}
        </Button>
      </form>

      {search.isError && (
        <p className="mt-3 text-xs text-red-600">{(search.error as Error).message}</p>
      )}

      {search.isSuccess && results.length === 0 && (
        <p className="mt-3 text-sm text-navy-400">Aucune entreprise trouvée.</p>
      )}

      {results.length > 0 && (
        <div className="mt-4 space-y-3">
          {results.map((company, i) => (
            <ResultCard key={company.siret ?? company.siren ?? i} company={company} />
          ))}
        </div>
      )}
    </Card>
  )
}
