// Source: https://v3.shadcn.com/r/styles/new-york/skeleton.json
// MIT; local adaptations documented in docs/ui-migration-components.md.
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-ui="skeleton"
      className={cn("animate-pulse rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
