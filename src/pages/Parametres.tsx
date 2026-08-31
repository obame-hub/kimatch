import { useEffect, useState } from 'react'
import { RefreshCw, Hash, MessageSquare, Mail } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select } from '@/components/ui/form'
import { cn } from '@/lib/utils'

import {
  useSlackSettings,
  useUpdateSlackSetting,
  useSlackChannels,
  sendTestSlackMessage,
  type SlackModule,
} from '@/lib/data/slackSettings'
import {
  useEmailSettings,
  useUpdateEmailSetting,
  type EmailModule,
} from '@/lib/data/emailSettings'
import {
  buildAccountCreatedBlocks,
  sampleAccountCreatedData,
  buildContratCreatedBlocks,
  sampleContratCreatedData,
  buildMandatSignedBlocks,
  sampleMandatSignedData,
} from '@/lib/slackTemplates'

const MODULE_LABELS: Record<SlackModule, string> = {
  compte: 'Nouveaux comptes',
  contrat: 'Nouveaux contrats',
  mandat: 'Mandats signés (+ synchro GRD auto)',
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-kiwi-600' : 'bg-navy-200')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

/** Destinataires email d'un module. Les adresses viennent de la base (reprises de Tools), jamais
 * du code : l'équipe peut les changer sans redéploiement. */
function EmailModuleCard({ module, libelle }: { module: EmailModule; libelle: string }) {
  const { data: settings } = useEmailSettings()
  const updateSetting = useUpdateEmailSetting()
  const [feedback, setFeedback] = useState<string | null>(null)

  const row = settings?.find((s) => s.module === module)
  const [destinataires, setDestinataires] = useState('')
  const [copies, setCopies] = useState('')
  const [initialise, setInitialise] = useState(false)

  useEffect(() => {
    if (initialise || !row) return
    setDestinataires((row.destinataires ?? []).join(', '))
    setCopies((row.copies ?? []).join(', '))
    setInitialise(true)
  }, [row, initialise])

  function enListe(v: string) {
    return v.split(',').map((x) => x.trim()).filter(Boolean)
  }

  async function enregistrer() {
    const res = await updateSetting.mutateAsync({
      module,
      patch: { destinataires: enListe(destinataires), copies: enListe(copies) },
    })
    setFeedback(res.persisted ? 'Enregistré ✓' : 'Non synchronisé avec la base')
    setTimeout(() => setFeedback(null), 2500)
  }

  return (
    <div className="rounded-xl border border-navy-100 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-navy-800">{libelle}</p>
          <p className="text-xs text-navy-400">{row?.actif ? 'Notifications activées' : 'Notifications désactivées'}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-navy-600">
          <input
            type="checkbox"
            checked={!!row?.actif}
            onChange={(e) => updateSetting.mutate({ module, patch: { actif: e.target.checked } })}
          />
          Actif
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <FormField label="Destinataires">
          <Input value={destinataires} onChange={(e) => setDestinataires(e.target.value)} placeholder="prenom@kiwee-energie.fr" />
        </FormField>
        <FormField label="En copie">
          <Input value={copies} onChange={(e) => setCopies(e.target.value)} placeholder="Séparer par des virgules" />
        </FormField>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={enregistrer} disabled={updateSetting.isPending}>
          Enregistrer
        </Button>
        {feedback && <span className="text-xs text-navy-500">{feedback}</span>}
      </div>
    </div>
  )
}

function SlackModuleCard({ module }: { module: SlackModule }) {
  const { data: settings } = useSlackSettings()
  const { data: channelsData, isLoading: loadingChannels, error: channelsError, refetch } = useSlackChannels()
  const updateSetting = useUpdateSlackSetting()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const row = settings?.find((s) => s.module === module)
  const channels = channelsData?.channels ?? []

  async function sendTest() {
    setSending(true)
    setFeedback(null)
    const tpl =
      module === 'compte'
        ? buildAccountCreatedBlocks(sampleAccountCreatedData())
        : module === 'contrat'
          ? buildContratCreatedBlocks(sampleContratCreatedData())
          : buildMandatSignedBlocks(sampleMandatSignedData())
    const result = await sendTestSlackMessage(module, `:test_tube: [TEST] ${tpl.text}`, tpl.blocks)
    if (result.ok) {
      setFeedback(result.skipped ? 'Module désactivé ou pas de canal.' : 'Message envoyé sur Slack ✓')
    } else {
      setFeedback(result.error ?? 'Échec de l’envoi')
    }
    setSending(false)
  }

  return (
    <div className="rounded-lg border border-navy-100 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-navy-800">{MODULE_LABELS[module]}</p>
          <p className="text-xs text-navy-400">{row?.enabled ? 'Notifications actives' : 'Notifications désactivées'}</p>
        </div>
        <Toggle checked={!!row?.enabled} onChange={(v) => updateSetting.mutate({ module, patch: { enabled: v } })} />
      </div>

      <div className="mt-3">
        <label className="mb-1.5 block text-xs font-medium text-navy-600">Canal Slack</label>
        <Select
          value={row?.channel_id ?? ''}
          onChange={(e) => {
            const ch = channels.find((c) => c.id === e.target.value)
            updateSetting.mutate({ module, patch: { channel_id: e.target.value || null, channel_name: ch?.name ?? null } })
          }}
        >
          <option value="">{loadingChannels ? 'Chargement…' : 'Sélectionner un canal…'}</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </Select>
        {channelsError && <p className="mt-1 text-xs text-red-600">{(channelsError as Error).message}</p>}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={sendTest} disabled={sending || !row?.enabled || !row?.channel_id}>
          Envoyer un message test
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {feedback && <p className="mt-2 text-xs text-navy-500">{feedback}</p>}
    </div>
  )
}

export default function Parametres() {
  return (
    <div>
      <Topbar title="Paramètres" />
      <div className="p-4 sm:p-6 space-y-4">
        <PageHeader title="Paramètres" description="Intégrations et notifications de l'application. Vos préférences personnelles (profil, Gmail) se gèrent depuis Mon profil." />


        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-kiwi-600" />
              Notifications Slack
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-navy-500">
              Choisissez le canal Slack où envoyer les notifications de chaque événement. Le bot doit être membre des
              canaux privés — les canaux publics fonctionnent automatiquement.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-navy-400">
              <Hash className="h-3 w-3" />
              D'autres modules (cotations, pistes) arriveront une fois les objets correspondants branchés.
            </div>
            <SlackModuleCard module="compte" />
            <SlackModuleCard module="contrat" />
            <SlackModuleCard module="mandat" />
          </CardContent>
        </Card>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-kiwi-600" />
              Notifications par email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-navy-500">
              Qui reçoit un email à chaque nouvelle demande de contrat ou cotation. Les messages partent de votre
              propre compte Gmail — les réponses vous reviennent donc directement.
            </p>
            <EmailModuleCard module="contrat" libelle="Demandes de contrat" />
            <EmailModuleCard module="cotation" libelle="Cotations" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
