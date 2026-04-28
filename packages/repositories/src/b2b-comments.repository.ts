/**
 * B2BCommentsRepository · espelho 1:1 do `b2b.comments.repository.js`.
 *
 * 3 RPCs sobre b2b_partnership_comments:
 *   - list(partnershipId)        · b2b_partnership_comment_list
 *   - add(partnershipId, author, body) · b2b_partnership_comment_add
 *   - remove(commentId)          · b2b_partnership_comment_delete
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface PartnershipComment {
  id: string
  partnership_id: string
  author_name: string | null
  body: string
  created_at: string
}

export class B2BCommentsRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<Database>) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(name, args || {})
    if (error) throw new Error(`[${name}] ${error.message}`)
    return data as T
  }

  async list(partnershipId: string): Promise<PartnershipComment[]> {
    const data = await this.rpc<PartnershipComment[] | null>('b2b_partnership_comment_list', {
      p_partnership_id: partnershipId,
    })
    return Array.isArray(data) ? data : []
  }

  add(
    partnershipId: string,
    author: string,
    body: string,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    return this.rpc('b2b_partnership_comment_add', {
      p_partnership_id: partnershipId,
      p_author_name: author,
      p_body: body,
    })
  }

  remove(commentId: string): Promise<{ ok: boolean; error?: string }> {
    return this.rpc('b2b_partnership_comment_delete', {
      p_comment_id: commentId,
    })
  }
}
