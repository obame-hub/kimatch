import { FormField, Select } from '@/components/ui/form'
import { useComptes } from '@/lib/data/comptes'
import { useSitesParCompte } from '@/lib/data/sites'
import { useCompteursParSites } from '@/lib/data/compteurs'
import { useContactsParCompte } from '@/lib/data/contacts'
import { cn } from '@/lib/utils'

/**
 * ══ À QUOI UNE REQUÊTE EST RATTACHÉE ══
 *
 * Naoëlle, 01/09/2026 : « il faut aussi les rattachements des requêtes, que ce soit un compte, un
 * contact, etc. — faut savoir quoi concerne cette requête, à quoi elle est rattachée ».
 *
 * Quatre niveaux, du plus large au plus précis :
 *
 *     COMPTE      chez qui le problème se pose. C'est le seul qui compte vraiment : sans lui, une
 *                 réclamation flotte sans destinataire.
 *     SITE        lequel de ses sites, quand le compte en a plusieurs
 *     COMPTEUR    lequel de ses points de livraison — le niveau où se lisent les factures
 *     CONTACT     qui, chez le client, a soulevé le problème ou pourra le confirmer
 *
 * LES TROIS DERNIERS SONT FACULTATIFS ET LE DISENT. Une réclamation arrive rarement avec son numéro
 * de compteur : la préciser plus tard est le cas normal, pas l'exception.
 *
 * ══ UN SEUL ENDROIT POUR LA CASCADE ══
 *
 * Ce composant vivait à l'intérieur de l'écran de liste, en composant local. La fiche requête en
 * avait besoin à son tour, et j'avais d'abord affiché les rattachements en LECTURE SEULE là-bas, avec
 * une phrase renvoyant à la liste — pour ne pas écrire deux fois la même cascade. Naoëlle a tranché :
 * il faut pouvoir les poser depuis la fiche. Le composant sort donc de l'écran, et les deux endroits
 * l'appellent.
 *
 * LA CASCADE EST UNE RÈGLE, PAS UNE COMMODITÉ, et c'est pourquoi elle ne doit exister qu'ici :
 *
 *   · changer de COMPTE vide le site, le compteur et le contact — ils appartenaient à l'ancien
 *   · changer de SITE vide le compteur — un compteur d'un autre site formerait une paire incohérente
 *
 * Recopiée, la première divergence serait passée inaperçue : une version libérant le compteur,
 * l'autre le gardant, et une requête finirait rattachée à un compteur qui n'est pas sur son site.
 */
export function RattachementsRequete({
  compteId,
  setCompteId,
  siteId,
  setSiteId,
  compteurId,
  setCompteurId,
  contactId,
  setContactId,
  className,
}: {
  compteId: string
  /**
   * Absent, le compte n'est pas modifiable ici : c'est le cas de l'écran de liste, où la carte
   * appartient déjà à un compte, et du formulaire de création, qui le demande à l'étape d'avant.
   */
  setCompteId?: (v: string) => void
  siteId: string
  setSiteId: (v: string) => void
  compteurId: string
  setCompteurId: (v: string) => void
  contactId: string
  setContactId: (v: string) => void
  className?: string
}) {
  const { data: comptes } = useComptes()
  const { data: sites } = useSitesParCompte(compteId || undefined)
  const { data: contacts } = useContactsParCompte(compteId || undefined)
  // Les compteurs du site choisi, ou de tout le compte à défaut.
  const idsSites = siteId ? [siteId] : (sites ?? []).map((x) => x.id)
  const { data: compteurs } = useCompteursParSites(compteId ? idsSites : undefined)

  const choixCompte = setCompteId && (
    <FormField label="Compte">
      <Select
        value={compteId}
        onChange={(e) => {
          setCompteId(e.target.value)
          // Les trois précisions appartenaient au compte précédent : les garder rattacherait la
          // requête à un site et un compteur qui ne sont pas chez le nouveau client.
          setSiteId('')
          setCompteurId('')
          setContactId('')
        }}
      >
        <option value="">Non rattaché</option>
        {[...(comptes ?? [])]
          .sort((a, b) => a.nom.localeCompare(b.nom))
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.nom}
            </option>
          ))}
      </Select>
    </FormField>
  )

  if (!compteId) {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {choixCompte}
        <p className="rounded-km border border-dashed border-km-line bg-km-soft px-3 py-2 text-km-label leading-relaxed text-km-muted">
          Choisissez un compte pour pouvoir préciser le site, le compteur ou le contact concerné. Ces
          trois précisions restent facultatives, et peuvent être ajoutées plus tard.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3',
        setCompteId ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3',
        className,
      )}
    >
      {choixCompte}

      <FormField label="Site (facultatif)">
        <Select
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value)
            // Le compteur choisi peut ne pas appartenir au nouveau site : on le libère plutôt que
            // de laisser une paire incohérente s'enregistrer.
            setCompteurId('')
          }}
        >
          <option value="">Non précisé</option>
          {[...(sites ?? [])]
            .sort((a, b) => a.nom.localeCompare(b.nom))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
        </Select>
      </FormField>

      <FormField label="Compteur (facultatif)">
        <Select value={compteurId} onChange={(e) => setCompteurId(e.target.value)}>
          <option value="">Non précisé</option>
          {[...(compteurs ?? [])]
            .sort((a, b) => (a.numero_pdl ?? '').localeCompare(b.numero_pdl ?? ''))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.numero_pdl}
                {/* LE SITE À CÔTÉ DU PDL : un numéro à quatorze chiffres ne se reconnaît pas, le nom
                    du site oui. Détail de l'original que j'avais laissé tomber en déplaçant le
                    composant — c'est le genre de perte qu'un déplacement fait sans le dire. */}
                {x.site_nom ? ` — ${x.site_nom}` : ''}
              </option>
            ))}
        </Select>
      </FormField>

      <FormField label="Contact (facultatif)">
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Non précisé</option>
          {[...(contacts ?? [])]
            .sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? ''))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {[x.prenom, x.nom].filter(Boolean).join(' ')}
                {/* La fonction distingue deux homonymes, et dit surtout si on parle au bon
                    interlocuteur — un gardien et un gestionnaire ne règlent pas les mêmes requêtes. */}
                {x.fonction ? ` — ${x.fonction}` : ''}
              </option>
            ))}
        </Select>
      </FormField>
    </div>
  )
}
