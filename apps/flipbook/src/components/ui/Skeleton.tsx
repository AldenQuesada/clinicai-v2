import { cn } from '@/lib/utils/cn'

/**
 * Skeleton com shimmer dourado matching brand. Usar pra loading premium.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-bg-elevated rounded',
        'before:absolute before:inset-0',
        'before:-translate-x-full before:animate-[shimmer_1.8s_infinite]',
        'before:bg-gradient-to-r before:from-transparent before:via-gold/10 before:to-transparent',
        className,
      )}
      aria-hidden
    />
  )
}

/**
 * Skeleton específico do leitor: silhueta de livro aberto.
 */
export function ReaderSkeleton() {
  return (
    <div className="flex items-center justify-center gap-4 w-full h-full">
      <Skeleton className="w-[300px] md:w-[420px] h-[420px] md:h-[600px] rounded-sm" />
      <Skeleton className="hidden md:block w-[420px] h-[600px] rounded-sm" />
    </div>
  )
}

/**
 * Skeleton pro card de livro (catalogo).
 */
export function BookCardSkeleton() {
  return <Skeleton className="aspect-[2/3] rounded-lg" />
}
