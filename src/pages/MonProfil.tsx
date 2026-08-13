import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Mail, CheckCircle2, Camera, FileSignature } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmailLink } from '@/components/ui/contact-link'
import { useAuth } from '@/lib/auth'
import { useMonProfil, useCurrentAccess, useUploadMaPhoto } from '@/lib/data/roles'
import { useGmailConnection, useDisconnectGmail, connectGmail } from '@/lib/data/gmail'
import { useDocusignConnexion, useDocusignStatus, useDisconnectDocusign, connectDocusign } from '@/lib/data/docusign'

function GmailCard() {
  const { data: connection, isLoading } = useGmailConnection()
  const disconnect = useDisconnectGmail()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gmailStatus = params.get('gmail')
    if (gmailStatus === 'connected') {
      setFeedback('Compte Gmail connecté ✓')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (gmailStatus === 'error') {
      setFeedback(`Échec de la connexion Gmail (${params.get('reason') ?? 'inconnu'})`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setFeedback(null)
    try {
      await connectGmail()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
      setConnecting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-kiwi-600" />
          Envoi d'emails (Gmail)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-navy-500">
          Connectez votre propre compte Gmail — les emails envoyés depuis Kimatch partiront de votre adresse.
        </p>
        {isLoading ? (
          <p className="text-sm text-navy-400">Chargement…</p>
        ) : connection ? (
          <div className="flex items-center justify-between rounded-lg border border-navy-100 p-4">
            <div className="flex items-center gap-2 text-sm text-navy-700">
              <CheckCircle2 className="h-4 w-4 text-kiwi-600" />
              Connecté en tant que <span className="font-medium">{connection.email_gmail}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              Déconnecter
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-navy-100 p-4">
            <Button size="sm" onClick={handleConnect} disabled={connecting}>
              Connecter mon compte Gmail
            </Button>
          </div>
        )}
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
      </CardContent>
    </Card>
  )
}

/** Connexion DocuSign personnelle. Même forme que la carte Gmail, pour la même raison : depuis le
 *  13/08/2026 (demande de William) le mandat part du compte DocuSign du conseiller, il faut donc
 *  qu'il l'autorise lui-même — une seule fois. */
function DocusignCard() {
  const { data: connexion, isLoading } = useDocusignConnexion()
  const { data: statut } = useDocusignStatus()
  const disconnect = useDisconnectDocusign()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const etat = params.get('docusign')
    if (etat === 'connected') {
      setFeedback('Compte DocuSign connecté ✓')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (etat === 'error') {
      setFeedback(`Échec de la connexion DocuSign (${params.get('reason') ?? 'inconnu'})`)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setFeedback(null)
    try {
      await connectDocusign()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
      setConnecting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-kiwi-600" />
          Signature électronique (DocuSign)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-navy-500">
          Connectez votre propre compte DocuSign — les mandats envoyés depuis Kimatch partiront de votre compte,
          apparaîtront dans votre espace DocuSign, et la piste d'audit portera votre nom. À autoriser une seule fois.
        </p>
        {/* Une signature émise depuis l'environnement de démonstration n'a aucune valeur juridique et
            le client reçoit un e-mail marqué DEMO : mieux vaut le voir ici qu'après l'envoi. */}
        {statut?.environnement === 'demonstration' && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Environnement de démonstration : les signatures n'ont pas de valeur juridique et les e-mails portent la
            mention DEMO. À basculer en production avant tout envoi client.
          </p>
        )}
        {statut && !statut.configured ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            L'application DocuSign n'est pas encore configurée côté serveur
            {statut.manquants?.length ? ` (${statut.manquants.join(', ')})` : ''} : la connexion personnelle sera
            possible dès que ce sera fait.
          </p>
        ) : isLoading ? (
          <p className="text-sm text-navy-400">Chargement…</p>
        ) : connexion ? (
          <div className="flex items-center justify-between rounded-lg border border-navy-100 p-4">
            <div className="flex items-center gap-2 text-sm text-navy-700">
              <CheckCircle2 className="h-4 w-4 text-kiwi-600" />
              Connecté en tant que <span className="font-medium">{connexion.docusign_email ?? connexion.docusign_nom}</span>
              {connexion.account_nom && <span className="text-navy-400">· {connexion.account_nom}</span>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              Déconnecter
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-navy-100 p-4">
            <Button size="sm" onClick={handleConnect} disabled={connecting}>
              Connecter mon compte DocuSign
            </Button>
          </div>
        )}
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
      </CardContent>
    </Card>
  )
}

export default function MonProfil() {
  const { session } = useAuth()
  const { data: profil, isLoading } = useMonProfil()
  const { data: access } = useCurrentAccess()
  const uploadPhoto = useUploadMaPhoto()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null)

  const email = profil?.email ?? session?.user.email ?? ''
  const nomComplet = profil ? `${profil.prenom} ${profil.nom}`.trim() : ''
  const initiales = profil
    ? `${profil.prenom[0] ?? ''}${profil.nom[0] ?? ''}`.toUpperCase()
    : (email || 'KW').slice(0, 2).toUpperCase()

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFeedback(null)
    try {
      await uploadPhoto.mutateAsync(file)
      setPhotoFeedback('Photo mise à jour ✓')
    } catch (err) {
      setPhotoFeedback(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div>
      <Topbar title="Mon profil" />
      <div className="space-y-4 p-4 sm:p-6">
        <PageHeader title="Mon profil" description="Vos informations et l'accès associé à votre compte." />

        <Card className="max-w-2xl">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="relative shrink-0">
              {profil?.photo_url ? (
                <img src={profil.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-700 text-base font-semibold text-navy-100">
                  {initiales}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadPhoto.isPending}
                title="Changer la photo"
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-ink-800 text-white hover:bg-ink-700"
              >
                <Camera className="h-3 w-3" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
            <div className="min-w-0">
              {isLoading ? (
                <p className="text-sm text-navy-400">Chargement…</p>
              ) : (
                <>
                  <p className="font-display text-lg font-semibold text-navy-900">{nomComplet || 'Profil'}</p>
                  {email && <EmailLink value={email} className="text-sm text-navy-500" />}
                  {photoFeedback && <p className="mt-1 text-xs text-navy-500">{photoFeedback}</p>}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-kiwi-600" />
              Rôle d'accès
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-navy-700">
              {access?.roleLibelle ?? 'Aucun rôle attribué — contactez un administrateur.'}
            </p>
          </CardContent>
        </Card>

        <GmailCard />
        <DocusignCard />
      </div>
    </div>
  )
}
