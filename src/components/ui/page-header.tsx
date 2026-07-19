import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-semibold text-navy-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-navy-500">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
