import { Badge } from '@/components/ui/badge'
import type { SiteHealth } from '@/lib/siteHealth'

export function SiteHealthBadge({ health }: { health: SiteHealth }) {
  return (
    <Badge tone={health.tone} title={health.raisons.join(' · ')}>
      {health.label} · {health.score}
    </Badge>
  )
}
