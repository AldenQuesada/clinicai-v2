import { createServerClient } from '@/lib/supabase/server'
import { listProductsWithOffers, listFlipbooksMinimal } from '@/lib/supabase/products'
import { ProductsAdmin } from './ProductsAdmin'

export const dynamic = 'force-dynamic'

export default async function AdminProductsPage() {
  const supabase = await createServerClient()

  const [products, flipbooks] = await Promise.all([
    listProductsWithOffers(supabase),
    listFlipbooksMinimal(supabase),
  ])

  return <ProductsAdmin products={products} flipbooks={flipbooks} />
}
