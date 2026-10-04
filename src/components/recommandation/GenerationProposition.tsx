import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useChiffrage } from '@/lib/data/chiffrage'
import { chargerContexteOffre, chargerRessourcesOffre, imprimerOffrePdf } from '@/lib/data/offrePdf'
import { construireOffrePdf, raisonIndisponible, ttcParDefaut } from '@/lib/offrePdf/construction'
import { htmlOffre } from '@/lib/offrePdf/document'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * GÉNÉRER LA PROPOSITION COMMERCIALE — depuis la version, une fois le comparatif publié
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « quand le pricer est prêt et publié, les commerciaux devront avoir la
 * possibilité de l'éditer depuis la recommandation, dans la version en question. » Et : « Au moment
 * d'éditer l'offre en PDF, il faudra une popup indiquant plusieurs options […] la durée de validité
 * de l'offre (date + heure) ainsi que le mode de présentation HTVA ou TTC. »
 *
 *   · LA VALIDITÉ part de la plus proche validité saisie par le pricing sur les offres présentées
 *     (à 18 h), à défaut du lendemain ; le commercial la règle avant d'éditer.
 *   · HTVA OU TTC suit le segment du client : TTC pour un syndic, HTVA pour une entreprise.
 *   · L'APERÇU est le document même qui sera imprimé : ce qu'on voit est ce que le client recevra.
 *   · Le PDF se télécharge ET se range sur la version, en « Appel d'offres » : c'est lui que
 *     « Envoyer au client » joindra ensuite.
 */

const LARGEUR_PAGE = 794 // 210 mm à 96 px/pouce
const HAUTEUR_PAGE = 1123 // 297 mm
const ESPACE = 16
const ECHELLE = 0.6

const deux = (n: number) => String(n).padStart(2, '0')
const localIso = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`

export function GenerationProposition({
  versionId,
  open,
  onClose,
  onGeneree,
}: {
  versionId: string
  open: boolean
  onClose: () => void
  /** Le PDF imprimé, à ranger sur la version. */
  onGeneree: (fichier: File) => Promise<void>
}) {
  const { data: chiffrage } = useChiffrage(open ? versionId : null)
  const raison = chiffrage ? raisonIndisponible(chiffrage) : null
  const compteur = chiffrage?.compteurs[0]
  const fournisseurIds = useMemo(() => [...new Set((chiffrage?.offres ?? []).map((o) => o.fournisseurId))].sort(), [chiffrage])

  const contexte = useQuery({
    queryKey: ['proposition-pdf', versionId, fournisseurIds],
    queryFn: () => chargerContexteOffre(versionId, fournisseurIds, compteur!.compteurId),
    enabled: open && !!compteur && !raison,
    staleTime: 60_000,
  })
  const ressources = useQuery({ queryKey: ['proposition-pdf-ressources'], queryFn: chargerRessourcesOffre, enabled: open, staleTime: Infinity })

  /* Les réglages du commercial ; tant qu'il n'y a pas touché, les valeurs par défaut s'appliquent. */
  const [validiteChoisie, setValidite] = useState<string | null>(null)
  const [ttcChoisi, setTtc] = useState<boolean | null>(null)
  const validiteDefaut = useMemo(() => {
    const dates = (chiffrage?.offres ?? []).filter((o) => o.statut === 'DISPONIBLE' && o.validite).map((o) => o.validite!.slice(0, 10)).sort()
    if (dates[0]) return `${dates[0]}T18:00`
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)
    demain.setHours(18, 0, 0, 0)
    return localIso(demain)
  }, [chiffrage])
  const validite = validiteChoisie ?? validiteDefaut
  const ttc = ttcChoisi ?? ttcParDefaut(contexte.data?.clientSegment)

  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const construit = useMemo(() => {
    if (!chiffrage || raison || !contexte.data || !ressources.data || !validite) return { html: null, erreur: null }
    try {
      return { html: htmlOffre(construireOffrePdf(chiffrage, contexte.data, { validite, ttc }), ressources.data), erreur: null }
    } catch (e) {
      return { html: null, erreur: e instanceof Error ? e.message : String(e) }
    }
  }, [chiffrage, raison, contexte.data, ressources.data, validite, ttc])
  const html = construit.html
  const pages = html ? (html.match(/<section class="page"/g) ?? []).length || 1 : 3
  const hauteur = pages * (HAUTEUR_PAGE + ESPACE) + ESPACE
  /* L'aperçu seul espace les pages et les détache du fond ; le document imprimé n'a pas ces règles. */
  const apercu = html?.replace('</head>', `<style>body{padding:${ESPACE}px 0 0}section.page{margin:0 auto ${ESPACE}px;box-shadow:0 1px 6px rgba(20,24,20,.18)}</style></head>`)

  async function generer() {
    if (!html || !contexte.data) return
    setEnCours(true)
    setErreur(null)
    try {
      const nom = `Proposition commerciale ${contexte.data.clientNom} ${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`
      const blob = await imprimerOffrePdf(html, nom)
      const fichier = new File([blob], nom, { type: 'application/pdf' })
      const lien = document.createElement('a')
      lien.href = URL.createObjectURL(fichier)
      lien.download = nom
      lien.click()
      setTimeout(() => URL.revokeObjectURL(lien.href), 10_000)
      await onGeneree(fichier)
      onClose()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  const chargement = !chiffrage || (!raison && (contexte.isLoading || ressources.isLoading))

  return (
    <Dialog open={open} onClose={enCours ? () => undefined : onClose} title="Générer la proposition commerciale" className="max-w-[860px]">
      {raison ? (
        <p className="text-km-body text-km-muted">{raison}</p>
      ) : (
        <div className="flex flex-col gap-5 md:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-4 md:w-[250px]">
            <label className="flex flex-col gap-1.5">
              <span className="text-km-label font-semibold uppercase tracking-[0.04em] text-km-faint">Offre valable jusqu’au</span>
              <input
                type="datetime-local"
                value={validite}
                onChange={(e) => setValidite(e.target.value)}
                className="h-9 rounded-km border border-km-line bg-white px-2.5 text-km-body text-km-text focus:border-km-green focus:outline-none"
              />
              <span className="text-km-label text-km-faint">Imprimée en page 1, avec l’heure.</span>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-km-label font-semibold uppercase tracking-[0.04em] text-km-faint">Présentation des budgets</span>
              <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-km border border-km-line bg-km-soft p-1">
                {([[false, 'HTVA'], [true, 'TTC']] as const).map(([v, libelle]) => (
                  <button
                    key={libelle}
                    type="button"
                    role="radio"
                    aria-checked={ttc === v}
                    onClick={() => setTtc(v)}
                    className={cn('h-8 rounded-[6px] text-km-body font-semibold transition', ttc === v ? 'bg-white text-km-text shadow-sm' : 'text-km-muted hover:text-km-text')}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
              <span className="text-km-label text-km-faint">
                {contexte.data?.clientSegment ? `${contexte.data.clientSegment} : ${ttcParDefaut(contexte.data.clientSegment) ? 'TTC' : 'HTVA'} par défaut.` : 'TTC pour un syndic, HTVA pour une entreprise.'}
              </span>
            </div>

            {(erreur ?? construit.erreur ?? (contexte.error ? String((contexte.error as Error).message) : null)) && <p className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2 text-km-label text-km-red">{erreur ?? construit.erreur ?? (contexte.error as Error | null)?.message}</p>}

            <div className="mt-auto flex flex-col gap-2">
              <Button variant="primary" size="lg" onClick={() => void generer()} disabled={!html || enCours}>
                {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {enCours ? 'Impression…' : 'Générer le PDF'}
              </Button>
              <span className="text-km-label text-km-faint">Téléchargé et rangé sur la version, prêt pour « Envoyer au client ».</span>
            </div>
          </div>

          <div className="h-[68vh] min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-km border border-km-line bg-[#f2f3ee]">
            {chargement || !apercu ? (
              <div className="flex h-full items-center justify-center gap-2 text-km-body text-km-faint">
                <Loader2 className="h-4 w-4 animate-spin" /> Préparation de l’aperçu…
              </div>
            ) : (
              <div style={{ width: LARGEUR_PAGE * ECHELLE, height: hauteur * ECHELLE }} className="mx-auto">
                <iframe
                  title="Aperçu de la proposition"
                  srcDoc={apercu}
                  sandbox=""
                  scrolling="no"
                  style={{ width: LARGEUR_PAGE + 32, height: hauteur, transform: `scale(${ECHELLE})`, transformOrigin: '0 0', marginLeft: -16 * ECHELLE, border: 0 }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
