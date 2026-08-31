import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, MapPin, Plus, Repeat, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import type { Compte, Compteur, Contact, Site } from '@/types/domain'
import { useLierContactCompte, useDelierContactCompte, useChangerComptePrincipal } from '@/lib/data/contacts'

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
  compteurs,
  peutModifier,
  onToast,
}: {
  contact: Contact
  comptes: Compte[]
  /** Tous les sites : on en déduit ceux des comptes rattachés au contact. */
  sites: Site[]
  /** Tous les compteurs : servent à distinguer les sites où le contact est réellement responsable. */
  compteurs: Compteur[]
  peutModifier: boolean
  onToast: (message: string) => void
}) {
  const navigate = useNavigate()
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [aDelier, setADelier] = useState<{ id: string; nom: string } | null>(null)
  const lier = useLierContactCompte()
  const delier = useDelierContactCompte()
  /* Corriger le compte principal — voir `useChangerComptePrincipal`. */
  const changer = useChangerComptePrincipal()
  const [changementOuvert, setChangementOuvert] = useState(false)

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

    // Sites où le contact est responsable d'au moins un compteur. C'est l'information la plus
    // précise dont on dispose sur son intervention réelle : elle vient du compteur, seul endroit
    // où Salesforce porte ce lien. Comptée ici et non stockée — dupliquer dans contacts_sites
    // créerait une seconde source qui se désynchroniserait au premier changement de responsable.
    const compteursParSite = new Map<string, number>()
    for (const cp of compteurs) {
      if (cp.responsable_contact_id !== contact.id && cp.contact_conseil_syndical_id !== contact.id) continue
      compteursParSite.set(cp.site_id, (compteursParSite.get(cp.site_id) ?? 0) + 1)
    }

    const groupes = new Map<
      string,
      { compte: string; sites: { id: string; nom: string; fonction: string | null; explicite: boolean; nbCompteurs: number }[] }
    >()
    for (const site of sites) {
      if (!site.compte_id || !idsComptes.has(site.compte_id)) continue
      const nom = comptes.find((c) => c.id === site.compte_id)?.nom ?? ''
      const groupe = groupes.get(site.compte_id) ?? { compte: nom, sites: [] }
      groupe.sites.push({
        id: site.id,
        nom: site.nom,
        fonction: fonctionParSite.get(site.id) ?? null,
        explicite: fonctionParSite.has(site.id),
        nbCompteurs: compteursParSite.get(site.id) ?? 0,
      })
      groupes.set(site.compte_id, groupe)
    }
    // Les sites où il intervient d'abord : c'est ce qu'on cherche en ouvrant cet onglet.
    for (const groupe of groupes.values()) {
      groupe.sites.sort((a, b) => b.nbCompteurs - a.nbCompteurs || a.nom.localeCompare(b.nom))
    }
    // Le compte principal en tête, comme pour la liste des comptes.
    const principal = contact.comptes.find((c) => c.relation_directe)?.id
    return [...groupes.entries()].sort(
      ([a], [b]) => Number(b === principal) - Number(a === principal) || (groupes.get(a)!.compte).localeCompare(groupes.get(b)!.compte),
    )
  }, [contact, comptes, sites, compteurs])

  const nbSites = sitesParCompte.reduce((n, [, g]) => n + g.sites.length, 0)
  const nbSitesResponsable = sitesParCompte.reduce(
    (n, [, g]) => n + g.sites.filter((s) => s.nbCompteurs > 0).length,
    0,
  )

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
              className="flex items-center gap-3 rounded-xl border border-km-line bg-white p-3.5 transition-colors hover:bg-km-bg/60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#e9eff6] text-[#3b5f8a]">
                <Building2 className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={() => navigate(`/comptes/${lien.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-bold text-km-text">{lien.nom}</p>
                <p className="truncate text-[10.5px] text-km-faint">
                  {lien.relation_directe ? 'Compte de rattachement principal' : 'Intervient sur ce compte'}
                </p>
              </button>
              {lien.relation_directe ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded bg-[#eaf4f0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0d7a5f]">
                    Principal
                  </span>
                  {/* ══ LE COMPTE PRINCIPAL SE CORRIGE ICI ══
                      Michel, 31/08/2026 : « rattacher un compte à un contact ». On pouvait ajouter
                      des rattachements secondaires depuis le 13/08, mais un contact saisi sous le
                      mauvais compte restait dessus pour toujours.

                      « Changer » ET NON « Retirer » : le compte principal ne peut pas être absent —
                      `contacts.compte_id` est la source de tout le périmètre de visibilité du
                      contact. On le remplace, on ne le vide pas. */}
                  {peutModifier && (
                    <button
                      type="button"
                      onClick={() => setChangementOuvert(true)}
                      title="Changer le compte principal de ce contact"
                      className="rounded-md p-1.5 text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
                    >
                      <Repeat className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                peutModifier && (
                  <button
                    type="button"
                    onClick={() => setADelier({ id: lien.id, nom: lien.nom })}
                    title="Retirer ce rattachement"
                    className="shrink-0 rounded-md p-1.5 text-km-faint transition-colors hover:bg-km-red-soft hover:text-km-red"
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
            {nbSitesResponsable > 0 && ` · responsable sur ${nbSitesResponsable}`}
          </span>
        </div>

        {nbSites === 0 ? (
          <p className="text-sm text-km-faint">Aucun site sur les comptes de ce contact.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {sitesParCompte.map(([cle, groupe]) => (
              <div key={cle}>
                <div className="mb-1 text-[10.5px] font-semibold text-km-muted">{groupe.compte}</div>
                <div className="flex flex-col gap-1.5">
                  {groupe.sites.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => navigate(`/sites/${s.id}`)}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-white p-3 transition-colors hover:bg-km-bg/60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-km-green-soft text-km-green">
                        <MapPin className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-km-text">{s.nom}</p>
                        {s.fonction && <p className="truncate text-[10.5px] text-km-faint">{s.fonction}</p>}
                      </div>
                      {s.nbCompteurs > 0 && (
                        <span
                          title={`Responsable de ${s.nbCompteurs} compteur${s.nbCompteurs > 1 ? 's' : ''} sur ce site`}
                          className="shrink-0 rounded bg-[#eef0fa] px-1.5 py-px font-mono text-[9.5px] font-bold text-[#4f5aa8]"
                        >
                          {s.nbCompteurs} compteur{s.nbCompteurs > 1 ? 's' : ''}
                        </span>
                      )}
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

      <DialogChangerPrincipal
        ouvert={changementOuvert}
        onFermer={() => setChangementOuvert(false)}
        contact={contact}
        comptes={comptes}
        enCours={changer.isPending}
        onValider={async (compteId, conserver) => {
          try {
            await changer.mutateAsync({ contactId: contact.id, compteId, conserverAncienLien: conserver })
            onToast('✓ Compte principal changé')
            setChangementOuvert(false)
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

/**
 * CHANGER LE COMPTE PRINCIPAL — le dialogue.
 *
 * IL POSE LA QUESTION DE L'ANCIEN COMPTE, et c'est le seul point qui demande une décision. Un contact
 * saisi sous le mauvais compte : l'ancien lien est une erreur, il doit disparaître. Un contact qui
 * change d'employeur mais reste l'interlocuteur de l'ancien : le lien devient secondaire. Rien ne
 * distingue les deux de l'extérieur — deviner produirait un rattachement fantôme une fois sur deux.
 *
 * PAR DÉFAUT ON RETIRE : la correction d'une saisie est le cas courant, le changement d'employeur
 * l'exception. Une case cochée par défaut laisserait des liens que personne n'a demandés.
 */
function DialogChangerPrincipal({
  ouvert,
  onFermer,
  contact,
  comptes,
  enCours,
  onValider,
}: {
  ouvert: boolean
  onFermer: () => void
  contact: Contact
  comptes: Compte[]
  enCours: boolean
  onValider: (compteId: string, conserverAncienLien: boolean) => void
}) {
  const [compteId, setCompteId] = useState('')
  const [recherche, setRecherche] = useState('')
  const [conserver, setConserver] = useState(false)

  const actuel = contact.comptes.find((c) => c.relation_directe)
  // Même contrainte que pour le rattachement : 2 700 comptes ne tiennent pas dans une liste brute.
  const q = recherche.trim().toLowerCase()
  const candidats = comptes.filter((c) => c.id !== contact.compte_id)
  const filtres = q
    ? candidats.filter((c) => c.nom.toLowerCase().includes(q)).slice(0, 50)
    : candidats.slice(0, 50)

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Changer le compte principal"
      description={`${contact.prenom} ${contact.nom} est aujourd'hui rattaché à ${actuel?.nom ?? 'un compte'}. Le compte principal détermine où le contact apparaît et qui le voit.`}
    >
      <div className="flex flex-col gap-3">
        <FormField label="Rechercher un compte">
          <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom du compte…" />
        </FormField>
        <FormField label="Nouveau compte principal">
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
          <p className="text-[10.5px] text-km-faint">
            50 comptes sur {candidats.length} affichés — précisez la recherche pour trouver le bon.
          </p>
        )}
        <label className="flex items-start gap-2 rounded-km border border-km-line bg-km-soft px-2.5 py-2">
          <input
            type="checkbox"
            checked={conserver}
            onChange={(e) => setConserver(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-[11px] leading-snug text-km-muted">
            Garder <span className="font-bold text-km-text">{actuel?.nom ?? 'l’ancien compte'}</span> en
            rattachement secondaire.
            <br />
            À cocher si le contact reste l’interlocuteur de ce compte. À laisser vide si c’était une
            erreur de saisie.
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onFermer}>
            Annuler
          </Button>
          <Button type="button" disabled={!compteId || enCours} onClick={() => onValider(compteId, conserver)}>
            Changer le compte principal
          </Button>
        </div>
      </div>
    </Dialog>
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
          <p className="text-[10.5px] text-km-faint">
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
