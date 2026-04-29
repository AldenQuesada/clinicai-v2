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

// ── Camada 6 · UI foundation CRM (2026-04-28) ──────────────────────────────
export { Button, buttonVariants, type ButtonProps } from './components/button'
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/card'
export {
  Badge,
  LeadPhaseBadge,
  AppointmentStatusBadge,
  OrcamentoStatusBadge,
  PatientStatusBadge,
  type BadgeProps,
} from './components/badge'
export { Modal, ConfirmDialog } from './components/modal'
export {
  FormField,
  Input,
  Select,
  Textarea,
  type InputProps,
  type SelectProps,
  type TextareaProps,
} from './components/form-field'
export { ToastProvider, useToast } from './components/toast'
export {
  DataTable,
  type DataTableColumn,
  type DataTablePagination,
  type DataTableProps,
  type DataTableBulkSelect,
} from './components/data-table'
export {
  PageHeader,
  type PageHeaderProps,
  type BreadcrumbItem,
} from './components/page-header'
