import { AlertTriangle, CheckCircle2, Cloud, ExternalLink, FileSignature, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGmailConnection, connectGmail } from '@/lib/data/gmail'
import { useDocusignStatus, useDocusignConnexion, connectDocusign } from '@/lib/data/docusign'

export type RequiredConnection = 'crm' | 'gmail' | 'docusign'

/** Écran « Connexion requise » affiché AVANT de faire remplir un wizard entier -- transposition
 * fidèle du `WizardConnectionGate` de Tools (`src/components/WizardConnectionGate.tsx`) :
 * mêmes textes, même mise en page, **même blocage dur** (aucune sortie possible tant qu'un outil
 * requis manque), et on laisse passer pendant la toute première vérification pour éviter un flash
 * de l'écran de blocage.
 *
 * Seule adaptation : la ligne « Salesforce » de Tools devient « Base Kimatch » — Kimatch EST le CRM
 * qui remplace Salesforce, la connexion équivalente est celle à sa propre base. La description est
 * conservée mot pour mot. */
const META: Record<RequiredConnection, { label: string; icon: typeof Cloud; description: string }> = {
  crm: {
    label: 'Base Kimatch',
    icon: Cloud,
    description: 'Nécessaire pour lire et écrire les données du CRM.',
  },
  gmail: {
    label: 'Gmail',
    icon: Mail,
    description: 'Nécessaire pour envoyer les notifications email depuis votre adresse.',
  },
  docusign: {
    label: 'DocuSign',
    icon: FileSignature,
    // Depuis le 13/08/2026 la connexion est personnelle : le mandat part du compte du conseiller,
    // pas d'un compte central. La description le dit, sinon on ne comprend pas pourquoi il faut
    // autoriser quelque chose qui « marchait » pour quelqu'un d'autre.
    description: 'Nécessaire pour envoyer le mandat à la signature depuis votre compte DocuSign.',
  },
}

export function WizardConnectionGate({
  required,
  feature,
  children,
}: {
  required: RequiredConnection[]
  /** Libellé du wizard, complète « Pour démarrer la {feature}, … » (ex. « création de cotation »). */
  feature: string
  children: React.ReactNode
}) {
  const gmail = useGmailConnection()
  const docusign = useDocusignStatus()
  const docusignConnexion = useDocusignConnexion()

  // DocuSign demande DEUX choses : l'application configurée côté serveur, et l'autorisation
  // personnelle de l'utilisateur. Les deux manquent pour des raisons différentes et ne se règlent
  // pas de la même façon — d'où le message distinct plus bas.
  const docusignPret = !!docusign.data?.configured && !!docusignConnexion.data
  const docusignEnCours = docusign.isLoading || docusignConnexion.isLoading

  // `null` = pas encore vérifié (react-query refait la vérification au focus de la fenêtre, ce qui
  // remplace le `window.addEventListener("focus")` de Tools).
  const statut: Record<RequiredConnection, boolean | null> = {
    crm: required.includes('crm') ? isSupabaseConfigured : null,
    gmail: required.includes('gmail') ? (gmail.isLoading ? null : !!gmail.data) : null,
    docusign: required.includes('docusign') ? (docusignEnCours ? null : docusignPret) : null,
  }

  const manquantes = required.filter((k) => statut[k] === false)
  const verificationEnCours = required.some((k) => statut[k] === null)

  // Tout est OK → on laisse passer. Pendant la toute première vérification aussi, pour éviter un
  // flash de l'écran de blocage (même comportement que Tools).
  if (manquantes.length === 0 || verificationEnCours) return <>{children}</>

  // Une connexion que l'utilisateur peut établir lui-même ; les autres se règlent côté serveur.
  const actions: Partial<Record<RequiredConnection, () => void>> = {
    gmail: () => { connectGmail().catch(() => {}) },
    // Le bouton n'a de sens que si l'application est configurée : sinon l'écran d'autorisation
    // DocuSign refuserait le client_id, et l'utilisateur ne pourrait rien y faire.
    ...(docusign.data?.configured ? { docusign: () => { connectDocusign().catch(() => {}) } } : {}),
  }
  const indices: Partial<Record<RequiredConnection, string>> = {
    crm: "Identifiants VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absents : l'application tourne sur des données de démonstration.",
    // Une variable presente mais invalide est plus trompeuse qu'une variable absente : elle fait
    // croire que tout est en place. On dit donc laquelle, et pourquoi elle ne convient pas.
    docusign: docusign.data?.invalides?.length
      ? docusign.data.invalides.map((i) => `${i.variable} — ${i.raison}`).join(' ')
      : docusign.data?.manquants?.length
        ? `Variables serveur manquantes : ${docusign.data.manquants.join(', ')}.`
        : 'À configurer côté serveur.',
  }

  return (
    <Card className="border-amber-200 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-km-amber-soft text-amber-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-km-text">Connexion requise</h3>
          <p className="text-sm text-km-muted">
            Pour démarrer la <span className="font-medium text-km-text">{feature}</span>, connectez les outils suivants.
            Les connexions déjà actives restent valides.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {required.map((key) => {
          const meta = META[key]
          const Icon = meta.icon
          const ok = statut[key]
          const onConnect = actions[key]
          return (
            <div key={key} className="flex items-center justify-between gap-4 rounded-xl border border-km-line bg-white p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kiwi-50 text-km-green">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-km-text">{meta.label}</p>
                    {ok ? (
                      <Badge tone="kiwi" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connecté</Badge>
                    ) : (
                      <Badge tone="amber">Non connecté</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-km-muted">{meta.description}</p>
                  {!ok && !onConnect && indices[key] && (
                    <p className="mt-1 text-km-label text-amber-700">{indices[key]}</p>
                  )}
                </div>
              </div>
              {!ok && onConnect && (
                <Button type="button" size="sm" onClick={onConnect} className="shrink-0 gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> Se connecter
                </Button>
              )}
            </div>
          )
        })}
        <p className="pt-2 text-xs text-km-faint">
          Une fois connecté(e), revenez sur cet onglet : la page se mettra à jour automatiquement.
        </p>
      </div>
    </Card>
  )
}
