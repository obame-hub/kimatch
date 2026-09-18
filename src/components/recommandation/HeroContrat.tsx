import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileSignature } from 'lucide-react'
import { etatSignature } from '@/components/docusign/BlocSuiviDocusign'
import { etatEnveloppeContrat } from '@/lib/data/docusign'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CONTRAT, TROISIÈME CELLULE DU HERO — ET SEULEMENT S'IL EXISTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « la place laissée par le hero de la proposition commerciale doit être
 * attribuée à un autre hero, celui du contrat. […] Il ne doit s'afficher qu'à partir du moment où
 * une demande de contrat a été faite et il doit afficher le statut de signature de ce contrat en
 * live. Si aucune demande de contrat n'a été faite, ce hero ne s'affiche juste pas. »
 *
 * ══ POURQUOI « JUSTE PAS » EST LA BONNE RÈGLE, ET PAS UNE CELLULE VIDE ══
 *
 * Une cellule « aucun contrat » occuperait un tiers du premier regard pour annoncer un fait qu'on
 * connaît déjà en lisant l'étape du dossier — et elle le ferait sur la grande majorité des fiches :
 * 693 recommandations sur 1 781 ont un contrat, les autres n'en auront peut-être jamais. Un hero
 * dit ce qui EST, pas ce qui manque. Quand il n'y a rien à dire, les deux autres cellules reprennent
 * la largeur : c'est la grille qui s'adapte, pas le contenu qui se dilue.
 *
 * ══ « EN LIVE » VEUT DIRE : ON DEMANDE À DOCUSIGN ══
 *
 * `contrats.statut_signature` n'est à jour que si la notification DocuSign est arrivée — et elle a
 * lâché deux fois, ce qui a fait lire « l'enveloppe n'a pas encore été envoyée » à Michel sur un
 * contrat que Marie avait signé (31/08/2026). Afficher cette colonne telle quelle serait donc
 * afficher une vérité parfois périmée, à l'endroit le plus visible de la fiche.
 *
 * La cellule interroge donc DocuSign à l'ouverture, exactement comme `BlocSuiviDocusign`, et affiche
 * ce qui revient. L'appel est ÉVITÉ sur un état arrêté — signé, refusé, annulé : redemander l'état
 * d'une enveloppe signée est un appel pour rien, et c'est le cas de 15 des 17 enveloppes existantes.
 *
 * ET L'ÉCHEC NE FAIT PAS DE BRUIT : si DocuSign ne répond pas, ou si le compte n'est pas connecté,
 * la cellule garde ce que dit la base. Un statut légèrement en retard vaut mieux qu'un message
 * d'erreur au visage de quelqu'un qui ouvre une fiche pour autre chose.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les couleurs des six états, du plus ouvert au plus fermé. */
const TONS: Record<string, string> = {
  BROUILLON: 'border-km-line bg-km-soft text-km-muted',
  ENVOYE: 'border-km-blue/30 bg-km-blue-soft text-km-blue',
  CONSULTE: 'border-km-amber/40 bg-km-amber-soft text-km-amber',
  SIGNE: 'border-km-green-line bg-km-green-soft text-km-green',
  REFUSE: 'border-km-red-line bg-km-red-soft text-km-red',
  ANNULE: 'border-km-line bg-km-soft text-km-faint',
}

export interface ContratDuHero {
  id: string
  fournisseur_nom: string
  reference_fournisseur: string | null
  statut_signature: string | null
  date_envoi_signature: string | null
  date_signature: string | null
  docusign_envelope_id: string | null
  date_creation: string | null
}

export function HeroContrat({ contrats }: { contrats: ContratDuHero[] }) {
  /* LE PLUS RÉCENT FAIT FOI. Un dossier peut produire plusieurs contrats — 693 en ont un, quelques-uns
     en ont deux — et c'est le dernier demandé qu'on suit ; les autres sont de l'historique, et le
     bloc « Ce que cette recommandation a produit » les liste tous, plus bas dans la fiche. */
  const contrat = [...contrats].sort((a, b) => (b.date_creation ?? '').localeCompare(a.date_creation ?? ''))[0] ?? null

  const [statutVivant, setStatutVivant] = useState<string | null>(null)
  const [signeLeVivant, setSigneLeVivant] = useState<string | null>(null)

  const statutBase = contrat?.statut_signature ?? null
  const enveloppe = contrat?.docusign_envelope_id ?? null
  const fige = ['SIGNE', 'REFUSE', 'ANNULE'].includes(statutBase ?? '')

  useEffect(() => {
    if (!contrat || !enveloppe || fige) return
    let vivant = true
    void etatEnveloppeContrat(contrat.id)
      .then((r) => {
        if (!vivant) return
        setStatutVivant(r.statut)
        setSigneLeVivant(r.signeLe)
      })
      /* Silencieux : voir l'en-tête. La cellule retombe sur ce que dit la base. */
      .catch(() => {})
    return () => { vivant = false }
  }, [contrat, enveloppe, fige])

  if (!contrat) return null

  const statut = statutVivant ?? statutBase
  const e = etatSignature(statut, contrat.date_envoi_signature, signeLeVivant ?? contrat.date_signature)

  return (
    <Link
      to={`/contrats/${contrat.id}`}
      className="flex min-h-[132px] flex-col justify-center gap-2 rounded-km-lg border border-km-line bg-white px-[18px] py-[15px] transition-colors hover:border-km-green-line hover:bg-km-green-tint/40"
    >
      <div className="flex items-center gap-2">
        <FileSignature className="h-[18px] w-[18px] shrink-0 text-km-muted" />
        <span className="text-km-body font-extrabold text-km-text">Contrat</span>
        <span
          className={cn(
            'ml-auto shrink-0 rounded-km-pill border px-2 py-[2px] text-km-label font-bold',
            TONS[statut ?? ''] ?? TONS.BROUILLON,
          )}
        >
          {e.libelle}
        </span>
      </div>

      <div className="min-w-0">
        <span className="block truncate text-km-name font-bold text-km-text">
          {contrat.fournisseur_nom || 'Fournisseur non renseigné'}
        </span>
        <span className="block truncate text-km-label text-km-faint">
          {contrat.reference_fournisseur || 'Référence non renseignée'}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-km-label text-km-muted">
          {/* LA PHRASE D'ÉTAT DIT DEPUIS QUAND, pas seulement quoi : « Envoyé le 16/09 » décide s'il
              faut relancer, « Envoyé à signer » ne décide rien. */}
          {e.detail || 'Demande de contrat enregistrée.'}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-km-faint" />
      </div>

      {contrats.length > 1 && (
        <span className="text-km-label text-km-faint">
          {contrats.length} contrats issus de ce dossier — le plus récent est affiché.
        </span>
      )}
    </Link>
  )
}
