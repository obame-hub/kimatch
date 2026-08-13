import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, MapPin, Plus, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import type { Compte, Contact, Site } from '@/types/domain'
import { useLierContactCompte, useDelierContactCompte } from '@/lib/data/contacts'

/**
 * Onglet « Rattachements » de la fiche contact — appel du 13/08/2026 : « la section rattachement
 * doit afficher la liste des comptes et la liste des sites avec compte pour chaque contact ».
 *
 * C'est le pendant de ce qui a été fait côté compte : là-bas on voit les contacts rattachés, ici
 * on voit les comptes auxquels le contact est rattaché. Sans cet écran, un contact lié à dix
 * comptes reste illisible — on ne peut le constater qu'en ouvrant les dix fiches.
 */
export function RattachementsContact({
  contact,
  comptes,
  sites,
  peutModifier,
  onToast,
}: {
  contact: Contact
  comptes: Compte[]
  /** Tous les sites : on en déduit ceux des comptes rattachés au contact. */
  sites: Site[]
  peutModifier: boolean
  onToast: (message: string) => void
}) {
  const navigate = useNavigate()
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [aDelier, setADelier] = useState<{ id: string; nom: string } | null>(null)
  const lier = useLierContactCompte()
  const delier = useDelierContactCompte()

  // Le compte principal d'abord, les autres par ordre alphabétique : c'est celui qui porte
  // l'appartenance réelle du contact, les autres sont des interventions.
  const rattachements = useMemo(
    () =>
      [...contact.comptes].sort(
        (a, b) => Number(b.relation_directe) - Number(a.relation_directe) || a.nom.localeCompare(b.nom),
      ),
    [contact.comptes],
  )

  /**
   * « La liste de comptes et la liste de sites avec compte » (William, 13/08/2026) : les sites
   * affichés sont ceux des comptes auxquels le contact est rattaché, et non les seuls sites que
   * `contacts_sites` lui associe explicitement. La distinction est décisive : Romain HEBRARD n'a
   * aucune ligne dans contacts_sites, alors qu'il intervient sur les sites de ses 10 comptes.
   *
   * Les sites explicitement rattachés sont signalés, car ils portent une information de plus —
   * la fonction du contact sur ce site.
   */
  const sitesParCompte = useMemo(() => {
    const fonctionParSite = new Map(contact.sites.map((s) => [s.id, s.fonction_sur_site]))
    const idsComptes = new Set(contact.comptes.map((c) => c.id))

    const groupes = new Map<string, { compte: string; sites: { id: string; nom: string; fonction: string | null; explicite: boolean }[] }>()
    for (const site of sites) {
      if (!site.compte_id || !idsComptes.has(site.compte_id)) continue
      const nom = comptes.find((c) => c.id === site.compte_id)?.nom ?? ''
      const groupe = groupes.get(site.compte_id) ?? { compte: nom, sites: [] }
      groupe.sites.push({
        id: site.id,
        nom: site.nom,
        fonction: fonctionParSite.get(site.id) ?? null,
        explicite: fonctionParSite.has(site.id),
      })
      groupes.set(site.compte_id, groupe)
    }
    // Le compte principal en tête, comme pour la liste des comptes.
    const principal = contact.comptes.find((c) => c.relation_directe)?.id
    return [...groupes.entries()].sort(
      ([a], [b]) => Number(b === principal) - Number(a === principal) || (groupes.get(a)!.compte).localeCompare(groupes.get(b)!.compte),
    )
  }, [contact, comptes, sites])

  const nbSites = sitesParCompte.reduce((n, [, g]) => n + g.sites.length, 0)

  const dejaLies = new Set(contact.comptes.map((c) => c.id))
  const candidats = comptes.filter((c) => !dejaLies.has(c.id)).sort((a, b) => a.nom.localeCompare(b.nom))

  return (
    <div className="flex flex-col gap-4">
      {/* ── Comptes ─────────────────────────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[.08em] text-[#a3a5a0]">
            Comptes rattachés
          </span>
          <span className="text-[10.5px] text-[#a3a5a0]">
            · {rattachements.length} compte{rattachements.length > 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          {peutModifier && (
            <Button variant="outline" size="sm" onClick={() => setAjoutOuvert(true)}>
              <Plus className="h-3.5 w-3.5" /> Rattacher à un compte
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {rattachements.map((lien) => (
            <div
              key={lien.id}
              className="flex items-center gap-3 rounded-xl border border-navy-100 bg-white p-3.5 transition-colors hover:bg-navy-50/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#e9eff6] text-[#3b5f8a]">
                <Building2 className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={() => navigate(`/comptes/${lien.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-bold text-navy-800">{lien.nom}</p>
                <p className="truncate text-[10.5px] text-navy-400">
                  {lien.relation_directe ? 'Compte de rattachement principal' : 'Intervient sur ce compte'}
                </p>
              </button>
              {lien.relation_directe ? (
                <span className="shrink-0 rounded bg-[#eaf4f0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0d7a5f]">
                  Principal
                </span>
              ) : (
                peutModifier && (
                  <button
                    type="button"
                    onClick={() => setADelier({ id: lien.id, nom: lien.nom })}
                    title="Retirer ce rattachement"
                    className="shrink-0 rounded-md p-1.5 text-navy-300 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Sites, regroupés par compte ──────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[.08em] text-[#a3a5a0]">Sites rattachés</span>
          <span className="text-[10.5px] text-[#a3a5a0]">
            · {nbSites} site{nbSites > 1 ? 's' : ''} sur {sitesParCompte.length} compte{sitesParCompte.length > 1 ? 's' : ''}
          </span>
        </div>

        {nbSites === 0 ? (
          <p className="text-sm text-navy-400">Aucun site sur les comptes de ce contact.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sitesParCompte.map(([cle, groupe]) => (
              <div key={cle}>
                <div className="mb-1 text-[10.5px] font-semibold text-navy-500">{groupe.compte}</div>
                <div className="flex flex-col gap-1.5">
                  {groupe.sites.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => navigate(`/sites/${s.id}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 bg-white p-3 transition-colors hover:bg-navy-50/60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-kiwi-100 text-kiwi-600">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-navy-800">{s.nom}</p>
                        {s.fonction && <p className="truncate text-[10.5px] text-navy-400">{s.fonction}</p>}
                      </div>
                      {s.explicite && (
                        <span
                          title="Contact explicitement rattaché à ce site"
                          className="shrink-0 rounded bg-[#f1ecf8] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-[#7c5bb0]"
                        >
                          Rattaché
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogRattacher
        ouvert={ajoutOuvert}
        onFermer={() => setAjoutOuvert(false)}
        candidats={candidats}
        enCours={lier.isPending}
        onValider={async (compteId, fonction) => {
          try {
            await lier.mutateAsync({ contactId: contact.id, compteId, fonction })
            onToast('✓ Contact rattaché au compte')
            setAjoutOuvert(false)
          } catch (err) {
            onToast(`Erreur : ${(err as Error).message}`)
          }
        }}
      />

      <Dialog
        open={!!aDelier}
        onClose={() => setADelier(null)}
        title="Retirer ce rattachement ?"
        description={
          aDelier
            ? `${contact.prenom} ${contact.nom} n'apparaîtra plus dans les contacts de ${aDelier.nom}. Le contact lui-même n'est pas supprimé.`
            : ''
        }
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setADelier(null)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={delier.isPending}
            onClick={async () => {
              if (!aDelier) return
              try {
                await delier.mutateAsync({ contactId: contact.id, compteId: aDelier.id })
                onToast('✓ Rattachement retiré')
                setADelier(null)
              } catch (err) {
                onToast(`Erreur : ${(err as Error).message}`)
              }
            }}
          >
            Retirer le rattachement
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function DialogRattacher({
  ouvert,
  onFermer,
  candidats,
  enCours,
  onValider,
}: {
  ouvert: boolean
  onFermer: () => void
  candidats: Compte[]
  enCours: boolean
  onValider: (compteId: string, fonction: string | null) => void
}) {
  const [compteId, setCompteId] = useState('')
  const [fonction, setFonction] = useState('')
  const [recherche, setRecherche] = useState('')

  // Le parc dépasse 2700 comptes : une liste déroulante brute est inutilisable, on filtre d'abord.
  const q = recherche.trim().toLowerCase()
  const filtres = q ? candidats.filter((c) => c.nom.toLowerCase().includes(q)).slice(0, 50) : candidats.slice(0, 50)

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Rattacher à un compte"
      description="Le contact apparaîtra dans les contacts de ce compte, sans changer son compte principal."
    >
      <div className="flex flex-col gap-3">
        <FormField label="Rechercher un compte">
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom du compte…" />
        </FormField>
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => setCompteId(e.target.value)}>
            <option value="">Sélectionner…</option>
            {filtres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </FormField>
        {!q && candidats.length > 50 && (
          <p className="text-[10.5px] text-navy-400">
            50 comptes sur {candidats.length} affichés — précisez la recherche pour trouver le bon.
          </p>
        )}
        <FormField label="Fonction sur ce compte (facultatif)">
          <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Signataire" />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onFermer}>
            Annuler
          </Button>
          <Button type="button" disabled={!compteId || enCours} onClick={() => onValider(compteId, fonction || null)}>
            Rattacher
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
