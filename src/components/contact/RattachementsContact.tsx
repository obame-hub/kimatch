import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Gauge, Plus, Repeat, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import type { Compte, Compteur, Contact } from '@/types/domain'
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
  compteurs,
  peutModifier,
  onToast,
}: {
  contact: Contact
  comptes: Compte[]
  /**
   * Tous les compteurs. C'est d'eux que vient le rattachement réel du contact —
   * `responsable_contact_id` et `contact_conseil_syndical_id` — depuis que ce bloc a cessé de
   * passer par les sites (10/09/2026). La prop `sites` a disparu avec ce détour.
   */
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
   * ══ CE BLOC LISTE DES COMPTEURS, PLUS DES SITES ══
   *
   * Naoëlle, 10/09/2026 : « si on met un responsable, du coup on le voit dans le bloc rattachement
   * du contact ? » Oui, mais à l'envers de ce qu'on attendait : le bloc listait TOUS LES SITES des
   * comptes du contact — y compris ceux où il ne fait rien — et posait une pastille « 3 compteurs »
   * sur ceux où il était responsable. Il disait « ce contact intervient sur ce site » là où la
   * vérité est « ce contact est responsable de ces trois compteurs ».
   *
   * Le lien VENAIT DÉJÀ du compteur — `responsable_contact_id` et `contact_conseil_syndical_id` —
   * il était juste regroupé par site pour l'affichage. On enlève ce détour, qui était aussi l'un
   * des derniers endroits où l'objet site restait visible.
   *
   * ── ON NE MONTRE QUE CE QUI EST VRAI ──
   *
   * Avant : tous les sites des comptes rattachés, soit des dizaines de lignes pour un contact lié à
   * dix comptes, dont l'immense majorité sans rapport avec lui. Maintenant : les compteurs dont il
   * est RESPONSABLE ou CONTACT DU CONSEIL SYNDICAL, et rien d'autre. C'est plus court et c'est
   * exact — 2 455 contacts sont dans ce cas, 2,7 compteurs en moyenne.
   *
   * ── DEUX MESURES QUI ONT DÉCIDÉ DE LA FORME ──
   *
   * LE PIRE CAS EST 294 COMPTEURS (Olivier Michau ; 37 contacts dépassent 20). D'où la coupe à huit
   * par compte, avec le reste annoncé et non tu — la carte « Documents » d'une recommandation fait
   * de même depuis le 25/08.
   *
   * ET 389 COMPTEURS PORTENT LA MÊME PERSONNE aux deux rôles. Une seule pastille par ligne aurait
   * donc menti sur un cas sur vingt : les deux rôles s'affichent quand les deux sont vrais.
   */
  const compteursParCompte = useMemo(() => {
    const groupes = new Map<
      string,
      {
        compte: string
        lignes: { id: string; lieu: string; adresse: string | null; pdl: string; responsable: boolean; conseil: boolean }[]
      }
    >()

    for (const cp of compteurs) {
      const responsable = cp.responsable_contact_id === contact.id
      const conseil = cp.contact_conseil_syndical_id === contact.id
      if (!responsable && !conseil) continue

      /* LE COMPTE VIENT DU COMPTEUR. Un compteur dont le compte n'est pas dans les rattachements du
         contact s'affiche quand même, sous un intitulé neutre : le taire cacherait une intervention
         réelle, et c'est précisément le genre d'asymétrie qu'on vient de corriger. */
      const compteId = cp.compte_id ?? ''
      const nom = comptes.find((c) => c.id === compteId)?.nom ?? 'Compte non rattaché à ce contact'
      const groupe = groupes.get(compteId) ?? { compte: nom, lignes: [] }
      groupe.lignes.push({
        id: cp.id,
        lieu: cp.libelle_site || cp.site_nom || 'Lieu non renseigné',
        adresse: cp.adresse_site ?? null,
        pdl: cp.numero_pdl,
        responsable,
        conseil,
      })
      groupes.set(compteId, groupe)
    }

    for (const groupe of groupes.values()) {
      groupe.lignes.sort((a, b) => a.lieu.localeCompare(b.lieu) || a.pdl.localeCompare(b.pdl))
    }
    // Le compte principal en tête, comme pour la liste des comptes juste au-dessus.
    const principal = contact.comptes.find((c) => c.relation_directe)?.id
    return [...groupes.entries()].sort(
      ([a], [b]) =>
        Number(b === principal) - Number(a === principal) ||
        groupes.get(a)!.compte.localeCompare(groupes.get(b)!.compte),
    )
  }, [contact, comptes, compteurs])

  const nbCompteurs = compteursParCompte.reduce((n, [, g]) => n + g.lignes.length, 0)
  const nbResponsable = compteursParCompte.reduce(
    (n, [, g]) => n + g.lignes.filter((l) => l.responsable).length,
    0,
  )
  const nbConseil = compteursParCompte.reduce((n, [, g]) => n + g.lignes.filter((l) => l.conseil).length, 0)

  const dejaLies = new Set(contact.comptes.map((c) => c.id))
  const candidats = comptes.filter((c) => !dejaLies.has(c.id)).sort((a, b) => a.nom.localeCompare(b.nom))

  return (
    <div className="flex flex-col gap-4">
      {/* ── Comptes ─────────────────────────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-km-xs font-bold uppercase tracking-[.08em] text-[#a3a5a0]">
            Comptes rattachés
          </span>
          <span className="text-km-xs text-[#a3a5a0]">
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
                <p className="truncate text-km-xs text-km-faint">
                  {lien.relation_directe ? 'Compte de rattachement principal' : 'Intervient sur ce compte'}
                </p>
              </button>
              {lien.relation_directe ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded bg-[#eaf4f0] px-2 py-0.5 text-km-xs font-bold uppercase tracking-wide text-[#0d7a5f]">
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

      {/* ── Compteurs dont ce contact est responsable, regroupés par compte ──────────────── */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-km-xs font-bold uppercase tracking-[.08em] text-[#a3a5a0]">
            Compteurs rattaches
          </span>
          <span className="text-km-xs text-[#a3a5a0]">
            {'\u00b7'} {nbCompteurs} compteur{nbCompteurs > 1 ? 's' : ''}
            {nbResponsable > 0 && ` ${'\u00b7'} responsable de ${nbResponsable}`}
            {nbConseil > 0 && ` ${'\u00b7'} conseil syndical sur ${nbConseil}`}
          </span>
        </div>

        {nbCompteurs === 0 ? (
          /* ON DIT CE QUI MANQUE, ET OÙ LE POSER. « Aucun compteur » seul laisserait croire à un
             écran incomplet ; c'est en réalité une donnée à renseigner, et elle se saisit sur le
             compteur, pas ici. */
          <p className="text-sm text-km-faint">
            Ce contact n{'\u2019'}est responsable d{'\u2019'}aucun compteur. Le rôle se désigne sur la fiche
            d{'\u2019'}un compteur, champs « Responsable » et « Contact conseil syndical ».
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {compteursParCompte.map(([cle, groupe]) => {
              /* HUIT LIGNES, PUIS LE RESTE ANNONCÉ. Voir l'en-tête du calcul : un contact peut en
                 porter 294, et une liste de 294 cartes rendrait l'onglet illisible. */
              const visibles = groupe.lignes.slice(0, 8)
              const reste = groupe.lignes.length - visibles.length
              return (
                <div key={cle}>
                  <div className="mb-1 text-km-xs font-semibold text-km-muted">{groupe.compte}</div>
                  <div className="flex flex-col gap-1.5">
                    {visibles.map((l) => (
                      <div
                        key={l.id}
                        onClick={() => navigate(`/compteurs/${l.id}`)}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-km-line bg-white p-3 transition-colors hover:bg-km-bg/60"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-km-green-soft text-km-green">
                          <Gauge className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-km-text">{l.lieu}</p>
                          <p className="truncate text-km-xs text-km-faint">
                            <span className="font-mono">{l.pdl}</span>
                            {l.adresse && ` ${'\u00b7'} ${l.adresse}`}
                          </p>
                        </div>
                        {/* LES DEUX RÔLES QUAND LES DEUX SONT VRAIS : 389 compteurs portent la
                            même personne comme responsable ET comme conseil syndical. */}
                        {l.responsable && (
                          <span
                            title="Responsable de ce compteur"
                            className="shrink-0 rounded bg-[#eef0fa] px-1.5 py-px text-km-tiny font-bold uppercase tracking-wide text-[#4f5aa8]"
                          >
                            Responsable
                          </span>
                        )}
                        {l.conseil && (
                          <span
                            title="Contact du conseil syndical pour ce compteur"
                            className="shrink-0 rounded bg-[#f1ecf8] px-1.5 py-px text-km-tiny font-bold uppercase tracking-wide text-[#7c5bb0]"
                          >
                            Conseil syndical
                          </span>
                        )}
                      </div>
                    ))}
                    {reste > 0 && (
                      <button
                        type="button"
                        onClick={() => navigate(`/comptes/${cle}`)}
                        className="px-1 text-left text-km-xs text-km-faint hover:underline"
                      >
                        et {reste} autre{reste > 1 ? 's' : ''} sur ce compte {'\u2192'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
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
  const [conserver, setConserver] = useState(false)

  const actuel = contact.comptes.find((c) => c.relation_directe)
  const candidats = comptes.filter((c) => c.id !== contact.compte_id)

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Changer le compte principal"
      description={`${contact.prenom} ${contact.nom} est aujourd'hui rattaché à ${actuel?.nom ?? 'un compte'}. Le compte principal détermine où le contact apparaît et qui le voit.`}
    >
      <div className="flex flex-col gap-3">
        {/* ══ UNE SEULE COMMANDE, PAS DEUX ═════════════════════════════════════════════════════
            Il y avait un champ de recherche PUIS une liste déroulante des cinquante premiers
            résultats — donc deux gestes, et une liste qui restait longue. Naoëlle, 08/09/2026 :
            « il faudrait que ce soit de l'autocomplétion, et que ça s'affine au fur et à mesure de
            l'écriture. » `ChoixParRecherche` fait les deux en un champ, et la recherche porte aussi
            sur le SIRET et le SIREN — ce qui distingue deux comptes d'un même groupe. */}
        <FormField label="Nouveau compte principal">
          <ChoixParRecherche<Compte>
            items={candidats}
            valeur={compteId}
            onChoisir={(c) => setCompteId(c?.id ?? '')}
            placeholder="Chercher un compte…"
            principal={(c) => c.nom}
            secondaire={(c) => [c.ville, c.siret ? `SIRET ${c.siret}` : null].filter(Boolean).join(' · ') || null}
            filtre={(c, q) => c.nom.toLowerCase().includes(q) || (c.siret ?? '').includes(q) || (c.siren ?? '').includes(q)}
            totalLibelle={`${candidats.length} comptes`}
          />
        </FormField>
        <label className="flex items-start gap-2 rounded-km border border-km-line bg-km-soft px-2.5 py-2">
          <input
            type="checkbox"
            checked={conserver}
            onChange={(e) => setConserver(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-km-label leading-snug text-km-muted">
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

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title="Rattacher à un compte"
      description="Le contact apparaîtra dans les contacts de ce compte, sans changer son compte principal."
    >
      <div className="flex flex-col gap-3">
        {/* Une seule commande ici aussi — voir le dialogue du compte principal juste au-dessus. */}
        <FormField label="Compte">
          <ChoixParRecherche<Compte>
            items={candidats}
            valeur={compteId}
            onChoisir={(c) => setCompteId(c?.id ?? '')}
            placeholder="Chercher un compte…"
            principal={(c) => c.nom}
            secondaire={(c) => [c.ville, c.siret ? `SIRET ${c.siret}` : null].filter(Boolean).join(' · ') || null}
            filtre={(c, q) => c.nom.toLowerCase().includes(q) || (c.siret ?? '').includes(q) || (c.siren ?? '').includes(q)}
            totalLibelle={`${candidats.length} comptes`}
          />
        </FormField>
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
