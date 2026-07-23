import { useEffect, useRef, useState } from 'react'
import { User, ShieldCheck, Mail, CheckCircle2, Camera } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmailLink } from '@/components/ui/contact-link'
import { useAuth } from '@/lib/auth'
import { useMonProfil, useCurrentAccess, useUploadMaPhoto } from '@/lib/data/roles'
import { useGmailConnection, useDisconnectGmail, connectGmail } from '@/lib/data/gmail'

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

export default function MonProfil() {
  const { session, demoMode } = useAuth()
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
              {!demoMode && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadPhoto.isPending}
                  title="Changer la photo"
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-navy-800 text-white hover:bg-navy-700"
                >
                  <Camera className="h-3 w-3" />
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
            <div className="min-w-0">
              {demoMode ? (
                <>
                  <p className="font-display text-lg font-semibold text-navy-900">Mode démonstration</p>
                  <p className="text-sm text-navy-500">Aucun compte réel connecté.</p>
                </>
              ) : isLoading ? (
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

        {!demoMode && (
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
        )}

        {!demoMode && <GmailCard />}

        {demoMode && (
          <Card className="max-w-2xl">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-navy-500">
              <User className="h-5 w-5 shrink-0 text-navy-400" />
              Connectez-vous avec un vrai compte pour gérer votre profil, votre rôle et votre connexion Gmail.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
