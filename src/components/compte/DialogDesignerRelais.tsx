import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, UserPlus, Users } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { useCreateContact } from '@/lib/data/contacts'
import { useAssignCompteurContact } from '@/lib/data/compteurs'
import type { Contact } from '@/types/domain'
import { cn } from '@/lib/utils'
import { toTitleCaseFR, toUpperFR } from '@/lib/textFormat'
import type { CompteurRelais } from '@/lib/data/relaisConseilSyndical'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉSIGNER LE RELAIS DE CONSEIL SYNDICAL D'UN COMPTEUR
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 13/09/2026 : « le membre CS sera notre seul moyen de suivre le contrat de la résidence
 * et de connaître leur nouveau cabinet de syndic » si le cabinet perd la résidence.
 *
 * ══ ON DÉSIGNE, ON NE CRÉE PAS UN « MEMBRE CS » ══
 *
 * Le mot du bouton suit le modèle : un membre de conseil syndical n'existe pas dans l'absolu, il est
 * le relais DE CE COMPTEUR. C'est la colonne `compteurs.contact_conseil_syndical_id` qui porte le
 * lien, et le rôle du contact en découle — pas l'inverse.
 *
 * ══ DEUX CHEMINS, PARCE QUE LA BASE EST QUASI VIDE ══
 *
 * 46 relais pour 1 033 compteurs sous contrat au 13/09/2026 : neuf fois sur dix, la personne n'est
 * pas encore dans Kimatch. N'offrir que « choisir un contact existant » obligerait à sortir de
 * l'écran, créer un contact ailleurs, puis revenir — c'est le genre de détour qui fait qu'on ne le
 * fait pas. La création est donc ici, réduite au strict nécessaire : un nom, et de quoi rappeler.
 *
 * ══ LE RESPONSABLE DU COMPTEUR EST ÉCARTÉ DE LA LISTE ══
 *
 * La contrainte posée en base le 13/09/2026 interdit qu'une même personne occupe les deux fentes du
 * même compteur — c'est ce qui empêche le retour des 389 recopies. Le proposer puis échouer à
 * l'enregistrement serait une façon compliquée de dire non : il n'apparaît pas.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export function DialogDesignerRelais({
  compteur,
  compteurs,
  onChangerCompteur,
  compteId,
  compteNom,
  contacts,
  onClose,
  onFait,
}: {
  /** Le compteur à couvrir. `null` ferme la fenêtre. */
  compteur: CompteurRelais | null
  /**
   * Tous les compteurs du compte.
   *
   * LE CHOIX DU COMPTEUR EST ENTRÉ DANS LA FENÊTRE le 14/09/2026, quand la liste de couverture est
   * sortie de la zone. Il se faisait jusque-là en cliquant « Désigner » sur la bonne ligne ; sans
   * liste, il n'y avait plus d'endroit pour le faire — et une fenêtre ouverte sur un compteur qu'on
   * ne peut pas changer aurait couvert le mauvais PDL une fois sur deux.
   */
  compteurs: CompteurRelais[]
  onChangerCompteur: (c: CompteurRelais) => void
  compteId: string
  compteNom: string
  /** Les contacts du compte, pour le choix parmi l'existant. */
  contacts: Contact[]
  onClose: () => void
  onFait: (message: string) => void
}) {
  const [mode, setMode] = useState<'existant' | 'nouveau'>('existant')
  const [choisi, setChoisi] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const creer = useCreateContact()
  const assigner = useAssignCompteurContact()
  const enCours = creer.isPending || assigner.isPending

  /** Les découverts en tête : c'est ce qu'on vient couvrir. */
  const compteursTries = useMemo(
    () => [...compteurs].sort((a, b) => Number(!!a.relais_contact_id) - Number(!!b.relais_contact_id)),
    [compteurs],
  )

  // Le responsable du compteur ne peut pas être son propre relais — voir l'en-tête.
  const candidats = useMemo(
    () => contacts.filter((c) => c.id !== compteur?.responsable_contact_id),
    [contacts, compteur],
  )

  function fermer() {
    setMode('existant'); setChoisi(''); setPrenom(''); setNom(''); setTelephone(''); setEmail(''); setErreur(null)
    onClose()
  }

  async function valider() {
    if (!compteur) return
    setErreur(null)
    try {
      let contactId = choisi
      let libelle = candidats.find((c) => c.id === choisi)
        ? `${candidats.find((c) => c.id === choisi)!.prenom} ${candidats.find((c) => c.id === choisi)!.nom}`
        : ''

      if (mode === 'nouveau') {
        const resultat = await creer.mutateAsync({
          compte_id: compteId,
          compte_nom: compteNom,
          civilite: null,
          prenom: toTitleCaseFR(prenom),
          nom: toUpperFR(nom),
          fonction: 'Membre du conseil syndical',
          telephone: null,
          telephone_mobile: telephone || null,
          email: email || null,
          // LE RÔLE ACCOMPAGNE LE LIEN. Un contact créé depuis cette fenêtre est un relais par
          // construction : le laisser sans rôle le ferait tomber dans « À qualifier » alors qu'on
          // vient précisément de dire ce qu'il est.
          roles: ['CONSEIL_SYNDICAL'],
          site_ids: [],
          sites: [],
        })
        if (!resultat.persisted) {
          setErreur('Le contact n’a pas pu être enregistré. Rien n’a été rattaché au compteur.')
          return
        }
        contactId = resultat.contact.id
        libelle = `${resultat.contact.prenom} ${resultat.contact.nom}`
      } else {
        const contact = candidats.find((c) => c.id === choisi)
        if (!contact) return
        // LE RÔLE N'EST PLUS POSÉ ICI. Depuis la migration du 14/09/2026, « Conseil syndical » se
        // déduit du lien compteur : le déclencheur `trg_roles_depuis_compteurs` l'ajoute au moment
        // où la désignation est écrite. L'écrire aussi depuis le navigateur ferait deux écritures
        // concurrentes pour le même résultat, et la seconde pourrait partir d'un état périmé.
      }

      await assigner.mutateAsync({
        compteurIds: [compteur.id],
        contactId,
        field: 'contact_conseil_syndical_id',
      })
      // LA COUVERTURE A SA PROPRE CLÉ. `useAssignCompteurContact` n'invalide que `['compteurs']` :
      // sans cette ligne, le taux et le tableau resteraient à leur valeur d'avant jusqu'au prochain
      // rechargement de la page, et on croirait la désignation perdue.
      await queryClient.invalidateQueries({ queryKey: ['couverture-cs'] })
      onFait(`✓ ${libelle} est le relais de ${compteur.libelle || compteur.numero_pdl}`)
      fermer()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.')
    }
  }

  const peutValider =
    mode === 'existant' ? !!choisi : nom.trim().length > 0 && (telephone.trim().length > 0 || email.trim().length > 0)

  return (
    <Dialog
      open={!!compteur}
      onClose={fermer}
      title="Désigner le relais"
      description={compteur ? `${compteur.libelle || 'Compteur'} · ${compteur.numero_pdl}` : undefined}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        {/* LES DÉCOUVERTS D'ABORD, ET LE COMPTE LE DIT. On vient ici pour couvrir ce qui ne l'est
            pas ; les compteurs déjà pourvus restent accessibles, en fin de liste, pour changer un
            relais. */}
        <label className="flex flex-col gap-1">
          <span className="text-km-label font-semibold text-km-faint">Compteur à couvrir</span>
          <ChoixParRecherche
            items={compteursTries}
            valeur={compteur?.id ?? ''}
            onChoisir={(c) => c && onChangerCompteur(c)}
            placeholder="Rechercher un compteur…"
            principal={(c) => `${c.libelle || c.adresse || 'Sans libellé'} — ${c.numero_pdl}`}
            secondaire={(c) => (c.relais_contact_id ? 'déjà couvert' : c.sous_contrat ? 'sous contrat' : null)}
            filtre={(c, q) => `${c.libelle ?? ''} ${c.adresse ?? ''} ${c.numero_pdl}`.toLowerCase().includes(q)}
            totalLibelle={`${compteursTries.length} compteur${compteursTries.length > 1 ? 's' : ''}`}
          />
        </label>

        <div className="flex gap-1.5">
          {([
            { cle: 'existant' as const, icone: Users, libelle: 'Un contact existant' },
            { cle: 'nouveau' as const, icone: UserPlus, libelle: 'Créer le relais' },
          ]).map(({ cle, icone: Icone, libelle }) => (
            <button
              key={cle}
              type="button"
              onClick={() => { setMode(cle); setErreur(null) }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-km border py-1.5 text-km-body font-semibold transition-colors',
                mode === cle ? 'border-km-piste bg-km-piste-soft text-km-piste' : 'border-km-line bg-km-surface text-km-muted hover:bg-km-soft',
              )}
            >
              <Icone className="h-3.5 w-3.5" /> {libelle}
            </button>
          ))}
        </div>

        {mode === 'existant' ? (
          candidats.length === 0 ? (
            <p className="rounded-km border border-km-line bg-km-soft px-3 py-4 text-center text-km-body text-km-muted">
              Aucun contact disponible sur ce compte. Crée le relais dans l’autre onglet.
            </p>
          ) : (
            <ChoixParRecherche
              items={candidats}
              valeur={choisi}
              onChoisir={(c) => setChoisi(c?.id ?? '')}
              placeholder="Rechercher un contact…"
              principal={(c) => `${c.prenom} ${c.nom}`}
              secondaire={(c) => c.fonction || null}
              filtre={(c, q) => `${c.prenom} ${c.nom} ${c.fonction ?? ''}`.toLowerCase().includes(q)}
              totalLibelle={`${candidats.length} contact${candidats.length > 1 ? 's' : ''}`}
            />
          )
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" />
            <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" />
            <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" />
            {/* UN RELAIS SANS MOYEN DE LE JOINDRE NE SERT À RIEN. C'est toute sa raison d'être :
                pouvoir l'appeler le jour où le cabinet a perdu la résidence. D'où l'un des deux
                exigé, plutôt qu'un nom seul qui gonflerait la couverture sans rien couvrir. */}
            <p className="col-span-2 text-km-label text-km-faint">
              Un téléphone ou un e-mail au minimum — sans quoi le relais ne relaie rien.
            </p>
          </div>
        )}

        {erreur && (
          <p className="flex items-start gap-1.5 rounded-km border border-km-red-line bg-km-red-soft px-2.5 py-2 text-km-label text-km-red">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {erreur}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-km-line pt-3">
          <Button type="button" variant="ghost" onClick={fermer} disabled={enCours}>Annuler</Button>
          <Button type="button" onClick={() => void valider()} disabled={!peutValider || enCours}>
            {enCours ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</> : 'Désigner'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
