import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImageUp, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { majConditionsFournisseur } from '@/lib/data/comptes'
import { initialesFournisseur, logoFournisseur } from '@/lib/logosFournisseurs'

/**
 * LE LOGO DU FOURNISSEUR DANS LA PROPOSITION COMMERCIALE — William, 04/10/2026 : « Ajoute le champ
 * logo et je déposerai au fur et à mesure. »
 *
 * Le logo est imprimé en 26 px dans le comparatif et en page 3 : un PNG d'au moins 200 px de côté, ou
 * un SVG, reste net à l'impression. Faute de logo déposé, la proposition reprend celui que Kimatch
 * connaît déjà, sinon une pastille d'initiales.
 */
export function LogoFournisseur({ compteId, nom, logoUrl, modifiable, signaler }: {
  compteId: string
  nom: string
  logoUrl: string | null | undefined
  modifiable: boolean
  signaler: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const champ = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)
  const affiche = logoUrl || logoFournisseur(nom)

  async function deposer(fichier: File | undefined) {
    if (!fichier) return
    setEnCours(true)
    try {
      const ext = (fichier.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
      const chemin = `fournisseurs/${compteId}-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('logos').upload(chemin, fichier, { contentType: fichier.type || undefined, upsert: false })
      if (error) throw new Error(error.message)
      const url = supabase.storage.from('logos').getPublicUrl(chemin).data.publicUrl
      await majConditionsFournisseur(compteId, { logo_url: url })
      await queryClient.invalidateQueries({ queryKey: ['comptes'] })
      signaler('✓ Logo enregistré — il figurera dans les prochaines propositions')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnCours(false)
      if (champ.current) champ.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-km-faint">Logo :</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-km-line bg-[#f5f6f2]">
        {affiche
          ? <img src={affiche} alt="" className="h-[26px] w-[26px] object-contain" />
          : <span className="text-km-tiny font-bold text-km-muted">{initialesFournisseur(nom)}</span>}
      </span>
      <span className="min-w-0 text-km-label text-km-faint">
        {logoUrl ? 'déposé' : affiche ? 'celui de Kimatch (basse définition)' : 'aucun — initiales'}
      </span>
      {modifiable && (
        <button
          type="button"
          onClick={() => champ.current?.click()}
          disabled={enCours}
          className="inline-flex items-center gap-1 rounded-km-sm border border-dashed border-km-line px-2 py-[3px] text-km-label font-semibold text-km-faint hover:border-km-green hover:text-km-green disabled:opacity-60"
        >
          {enCours ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageUp className="h-3 w-3" />}
          {logoUrl ? 'remplacer' : 'déposer'}
        </button>
      )}
      <input ref={champ} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={(e) => void deposer(e.target.files?.[0])} />
    </div>
  )
}
