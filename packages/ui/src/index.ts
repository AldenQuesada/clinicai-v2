/**
 * @clinicai/ui · barrel export.
 *
 * Componentes individuais: import direto via subpath
 *   import { Button } from '@clinicai/ui/components/button'
 *
 * Estilos globais: importar uma vez no app raiz
 *   import '@clinicai/ui/styles/globals.css'
 */
export { cn } from './lib/cn'
export { Sparkline, type SparklineProps } from './components/sparkline'
export { CountUp, type CountUpProps } from './components/count-up'
export { EmptyState } from './components/empty-state'
export type { EmptyStateProps, EmptyStateVariant } from './components/empty-state'
export { Skeleton } from './components/skeleton'
export type { SkeletonProps, SkeletonVariant } from './components/skeleton'
