import { useState } from 'react'
import { RefreshCw, Hash, MessageSquare, Sun, Moon, Monitor } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
]

function AppearanceCard() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {resolvedTheme === 'dark' ? <Moon className="h-5 w-5 text-kiwi-600" /> : <Sun className="h-5 w-5 text-kiwi-600" />}
          Apparence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-navy-500">
          Choisis l'apparence de l'application. "Système" suit automatiquement le réglage clair/sombre de ton
          ordinateur ou téléphone, y compris s'il change en cours de journée.
        </p>
        <div className="inline-flex rounded-lg border border-navy-200 bg-navy-50 p-1">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  active ? 'bg-white text-navy-800 shadow-card' : 'text-navy-500 hover:text-navy-700',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-navy-400">
          Réglage actuellement appliqué : <span className="font-semibold text-navy-600">{resolvedTheme === 'dark' ? 'Sombre' : 'Clair'}</span>
        </p>
      </CardContent>
    </Card>
  )
}
import {
  useSlackSettings,
  useUpdateSlackSetting,
  useSlackChannels,
  sendTestSlackMessage,
  type SlackModule,
} from '@/lib/data/slackSettings'
import {
  buildAccountCreatedBlocks,
  sampleAccountCreatedData,
  buildContratCreatedBlocks,
  sampleContratCreatedData,
} from '@/lib/slackTemplates'

const MODULE_LABELS: Record<SlackModule, string> = {
  compte: 'Nouveaux comptes',
  contrat: 'Nouveaux contrats',
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
        : buildContratCreatedBlocks(sampleContratCreatedData())
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

        <AppearanceCard />

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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
