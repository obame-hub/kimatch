import { useEffect, useState } from 'react'
import { ArrowRight, Loader2, RefreshCw, Sparkle } from 'lucide-react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { appelerBanc, messageErreur, useEtatTradeo, useOuvreBancTradeo, type ReponseBanc } from '@/lib/data/tradeo'
import { AssistantPrix } from '@/components/prixTradeo/AssistantPrix'
import { EtapeCalculer } from '@/components/prixTradeo/EtapeCalculer'
import { Journal } from '@/components/prixTradeo/Journal'
import PageIntrouvable from '@/pages/PageIntrouvable'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * PRIX TRADEO
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 29/09/2026 : « il y a trop d'informations, c'est illisible. Quand on ne sait pas ce qu'il
 * faut faire, on ne comprend pas » — Michel « ne comprenait rien », et elle-même ne pouvait pas le
 * lui expliquer. La page avait cinq onglets, des formulaires ouverts et des réponses brutes.
 *
 * ELLE DIT MAINTENANT DEUX CHOSES, ET UNE LISTE :
 *   · « Demander des prix à Tradeo » — un assistant en cinq étapes, dans une fenêtre ;
 *   · « Préparer une version » — le parcours de Michel, en quatre étapes, dans une fenêtre ;
 *   · vos demandes chez Tradeo, avec la seule action utile sur chacune.
 * Les réponses brutes et le journal restent là pour William et Naoëlle, repliés sous « Outils
 * techniques » : ils servent à intégrer, pas à travailler.
 *
 * RÉSERVÉE à `testeurs_tradeo` : le rail cache l'entrée, `api/tradeo` refuse l'appel, et une adresse
 * tapée à la main tombe sur la page introuvable.
 */
export default function PrixTradeo() {
  const { data: ouvre, isLoading } = useOuvreBancTradeo()
  /* UN SEUL ASSISTANT (29/09/2026) : `undefined` fermé, `''` ouvert sans dossier, un SIRET ouvert
     depuis « Vos demandes » sur les dossiers de cette société. */
  const [assistant, setAssistant] = useState<string | undefined>()

  if (isLoading) return <div className="p-6 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>
  if (!ouvre) return <PageIntrouvable />

  return (
    <div>
      <TitreOnglet title="Prix Tradeo" />
      <div className="p-4 sm:p-6">
        <PageHeader title="Prix Tradeo" badge="Test" description="Obtenir les prix des fournisseurs qui passent par Tradeo, puis préparer une version." />
        <EtatConnexion />
        <CommentCaMarche />

        <CarteAction
          icone={<Sparkle className="h-5 w-5" />}
          titre="Préparer les prix d’un dossier"
          texte="Choisissez un dossier : Kimatch regarde où il en est chez Tradeo, vous guide pour demander les prix, puis pour en faire la proposition au client."
          onClick={() => setAssistant('')}
        />

        <VosDemandes onOuvrir={(siret) => setAssistant(siret)} />

        <details className="mt-6 rounded-km border border-km-line bg-km-surface">
          <summary className="cursor-pointer select-none px-4 py-3 text-km-body font-semibold text-km-muted">
            Outils techniques <span className="font-normal">— réponses brutes de Tradeo et journal des appels, pour l’intégration</span>
          </summary>
          <div className="space-y-6 border-t border-km-line p-4">
            <EtapeCalculer siretInitial="" energieInitiale="ELEC" />
            <div className="border-t border-km-line pt-4"><Journal /></div>
          </div>
        </details>
      </div>

      {assistant !== undefined && <AssistantPrix siretInitial={assistant || undefined} onFermer={() => setAssistant(undefined)} />}
    </div>
  )
}

/**
 * COMMENT ÇA MARCHE — Naoëlle, 29/09/2026 : « mettre une information pour expliquer à quoi servent
 * les deux assistants […] pour que moi aussi je comprenne, pour que je puisse expliquer ». Les deux
 * boutons ne sont pas deux outils au choix : ce sont les deux temps d'un même travail, et l'ordre
 * compte. On le dit en trois temps, avant les boutons, et chaque bouton porte son numéro.
 */
function CommentCaMarche() {
  const temps = [
    { n: '1', titre: 'On demande les prix', texte: 'Kimatch envoie le dossier du client à Tradeo, qui consulte ses fournisseurs. Seulement la première fois.' },
    { n: '2', titre: 'Tradeo accepte', texte: 'Son équipe vérifie les compteurs. Ensuite, les prix arrivent quand on veut.' },
    { n: '3', titre: 'On prépare la proposition', texte: 'Kimatch calcule le budget de chaque offre avec notre marge ; on valide la version pour le client.' },
  ]
  return (
    <section className="mb-4 rounded-km border border-km-line bg-km-surface p-4">
      <h3 className="text-km-body font-semibold text-km-text">Comment ça marche</h3>
      <p className="mt-0.5 text-km-label text-km-muted">Un seul bouton pour tout : on choisit le dossier, Kimatch dit à quelle étape il en est.</p>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {temps.map((t) => (
          <li key={t.titre} className="flex gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-km-green-soft text-km-label font-bold text-km-green">{t.n}</span>
            <span className="min-w-0">
              <span className="block text-km-body font-semibold text-km-text">{t.titre}</span>
              <span className="block text-km-label text-km-muted">{t.texte}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function CarteAction({ icone, titre, texte, onClick }: { icone: React.ReactNode; titre: string; texte: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group text-left">
      <Card className="flex h-full items-start gap-3 p-4 transition-colors group-hover:border-km-green">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-km bg-km-green-soft text-km-green">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-km-name font-semibold text-km-text">{titre}</span>
          <span className="mt-1 block text-km-body text-km-muted">{texte}</span>
        </span>
        <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-km-faint group-hover:text-km-green" />
      </Card>
    </button>
  )
}

interface DemandeLue {
  id: number
  type?: string
  date_ajout?: string
  societe?: { siret?: string; raison?: string }
  compteurs?: { id: number; status?: number }[]
}

/**
 * VOS DEMANDES : une ligne par demande, son état en clair, et la seule action utile. On ne relit pas
 * Tradeo en boucle : une lecture à l'ouverture, puis à la demande — chaque lecture est un appel.
 */
function VosDemandes({ onOuvrir }: { onOuvrir: (siret: string) => void }) {
  const [reponse, setReponse] = useState<ReponseBanc | null>(null)
  const [lecture, setLecture] = useState(false)
  async function lire() {
    setLecture(true)
    setReponse(await appelerBanc('mes_demandes', { pageNumber: 1, dataTable: { statusFilter: '', sortBy: null, draw: 1, length: 20, search: '', column: 0, dir: 'desc' } }))
    setLecture(false)
  }
  useEffect(() => { void lire() }, [])
  const demandes = ((reponse?.reponse as { demandesCotations?: DemandeLue[] } | undefined)?.demandesCotations ?? [])

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-km-name font-semibold text-km-text">Vos demandes chez Tradeo</h3>
        <Button size="sm" variant="ghost" onClick={() => void lire()} disabled={lecture} aria-label="Actualiser">
          {lecture ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {reponse && !reponse.ok && <p className="text-km-red">{messageErreur(reponse)}</p>}
      {reponse?.ok && demandes.length === 0 && (
        <p className="rounded-km border border-dashed border-km-line px-4 py-6 text-center text-km-muted">
          Aucune demande pour l’instant. Commencez par « Demander des prix à Tradeo ».
        </p>
      )}
      {demandes.length > 0 && (
        <ul className="divide-y divide-km-line rounded-km border border-km-line bg-km-surface">
          {demandes.map((d) => {
            const total = d.compteurs?.length ?? 0
            const acceptes = (d.compteurs ?? []).filter((c) => c.status === 1).length
            const refuses = (d.compteurs ?? []).filter((c) => c.status === 2 || c.status === 3 || c.status === 4).length
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-km-text">{d.societe?.raison ?? '—'}</p>
                  <p className="text-km-label text-km-muted">n° {d.id}{d.date_ajout ? ` · envoyée le ${new Date(d.date_ajout).toLocaleDateString('fr-FR')}` : ''} · {d.type === 'GAZ' ? 'Gaz' : 'Électricité'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {acceptes > 0
                    ? <Badge tone="green">{acceptes}/{total} accepté{acceptes > 1 ? 's' : ''}</Badge>
                    : refuses === total && total > 0 ? <Badge tone="red">refusée</Badge> : <Badge tone="amber">en attente de Tradeo</Badge>}
                  <Button size="sm" variant={acceptes > 0 ? 'primary' : 'default'}
                    onClick={() => onOuvrir(d.societe?.siret ?? '')}>
                    {acceptes > 0 ? 'Continuer' : 'Suivre'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function EtatConnexion() {
  const { data, isLoading } = useEtatTradeo(true)
  if (isLoading) return <p className="mb-4 flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Connexion à Tradeo…</p>
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 text-km-body">
      {data?.ok ? <Badge tone="green">Connecté à Tradeo</Badge> : <><Badge tone="red">Tradeo injoignable</Badge><span className="text-km-red">{data?.message}</span></>}
      {data?.url && <span className="text-km-label text-km-muted">{data.url.includes('pre-prod') ? 'environnement de test (pré-production)' : 'PRODUCTION'}</span>}
    </p>
  )
}
