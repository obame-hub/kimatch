import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select } from '@/components/ui/form'
import { EditeurRiche } from '@/components/nouveautes/EditeurRiche'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useEnregistrerPublication, type Publication } from '@/lib/data/publications'

/**
 * RÉDIGER OU CORRIGER UNE NOUVEAUTÉ.
 *
 * ══ DEUX BOUTONS, DEUX GESTES DIFFÉRENTS ══
 *
 * « Enregistrer le brouillon » garde le texte sans prévenir personne ; « Publier » pose la date et
 * allume la pastille des treize personnes. Un seul bouton aurait obligé à choisir entre publier ce
 * qui n'est pas prêt et perdre ce qui est écrit.
 *
 * ══ CORRIGER UNE PUBLIÉE NE LA REPUBLIE PAS ══
 *
 * Sa date ne bouge pas — voir `useEnregistrerPublication`. Corriger une faute de frappe rallumerait
 * sinon la pastille de toute l'équipe pour une virgule, et la troisième fois plus personne ne la
 * regarderait.
 */
export function DialogPublication({
  open,
  onClose,
  publication,
}: {
  open: boolean
  onClose: () => void
  /** Absente en création. */
  publication?: Publication | null
}) {
  const { data: categories } = useReferenceTable('types_publications')
  const enregistrer = useEnregistrerPublication()

  const [titre, setTitre] = useState('')
  const [categorie, setCategorie] = useState('')
  const [contenu, setContenu] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const modification = Boolean(publication)
  const dejaPubliee = Boolean(publication?.date_publication)

  // Le formulaire se recharge à chaque ouverture : sans cela, rouvrir en création après une
  // modification réafficherait le texte de la publication précédente.
  useEffect(() => {
    if (!open) return
    setTitre(publication?.titre ?? '')
    setCategorie(publication?.type_publication_id ?? '')
    setContenu(publication?.contenu_html ?? '')
    setErreur(null)
  }, [open, publication])

  // À la création, la première catégorie du référentiel évite un champ vide qui bloque
  // l'enregistrement sans dire pourquoi.
  useEffect(() => {
    if (!open || categorie || !categories?.length || publication) return
    setCategorie(categories[0].id)
  }, [open, categorie, categories, publication])

  async function soumettre(publier: boolean) {
    setErreur(null)
    if (!titre.trim()) {
      setErreur('Le titre est obligatoire.')
      return
    }
    if (!categorie) {
      setErreur('Choisissez une catégorie.')
      return
    }
    try {
      await enregistrer.mutateAsync({
        id: publication?.id,
        titre,
        type_publication_id: categorie,
        contenu_html: contenu,
        publier,
      })
      onClose()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'enregistrement a échoué")
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={modification ? 'Modifier la publication' : 'Nouvelle publication'}
      description={
        dejaPubliee
          ? 'Cette publication est déjà parue : la corriger ne renotifiera pas l’équipe.'
          : 'Elle reste un brouillon, invisible de l’équipe, jusqu’à sa publication.'
      }
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <FormField label="Titre" required>
            <Input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ce qui change, en quelques mots"
            />
          </FormField>
          <FormField label="Catégorie" required>
            <Select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div>
          <p className="mb-1.5 block text-km-label font-semibold text-km-muted">Contenu</p>
          <EditeurRiche valeur={contenu} onChange={setContenu} />
        </div>

        {erreur && (
          <p className="rounded-km bg-km-red-soft px-3 py-2 text-km-label text-km-red">{erreur}</p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-km-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={enregistrer.isPending}>
            Annuler
          </Button>
          {!dejaPubliee && (
            <Button type="button" onClick={() => void soumettre(false)} disabled={enregistrer.isPending}>
              Enregistrer le brouillon
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={() => void soumettre(!dejaPubliee)}
            disabled={enregistrer.isPending}
          >
            {enregistrer.isPending
              ? 'Enregistrement…'
              : dejaPubliee
                ? 'Enregistrer les corrections'
                : 'Publier'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
