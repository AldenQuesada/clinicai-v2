import { createServerClient } from '@/lib/supabase/server'
import { listAllFlipbooks, type FlipbookWithStats } from '@/lib/supabase/flipbooks'
import { AdminGrid } from './AdminGrid'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createServerClient()
  let books: FlipbookWithStats[] = []
  try {
    books = await listAllFlipbooks(supabase)
  } catch {
    books = []
  }

  return <AdminGrid books={books} />
}
