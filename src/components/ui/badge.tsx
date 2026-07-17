import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'bg-navy-100 text-navy-700',
      kiwi: 'bg-kiwi-100 text-kiwi-800',
      amber: 'bg-amber-100 text-amber-800',
      red: 'bg-red-100 text-red-700',
      blue: 'bg-blue-100 text-blue-700',
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
})

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
