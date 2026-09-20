import type { SupabaseClient } from '@supabase/supabase-js';

export type SupportStatus = { total: number; voted: boolean };

export async function readSupport(client: SupabaseClient): Promise<SupportStatus> {
  const { data, error } = await client.rpc('pandr_support_status');
  if (error) throw error;
  const row = data?.[0];
  if (!row || !Number.isSafeInteger(row.total) || row.total < 0 || typeof row.voted !== 'boolean') {
    throw new Error('The upvote count is unavailable.');
  }
  return { total: row.total, voted: row.voted };
}

export async function setSupport(client: SupabaseClient, userId: string, voted: boolean): Promise<void> {
  if (!userId || userId === 'local') throw new Error('Sign in to save your upvote.');
  // Explicit desired state makes retries safe. The primary key and RLS enforce ownership.
  const { error } = voted
    ? await client.from('pandr_support_votes').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
    : await client.from('pandr_support_votes').delete().eq('user_id', userId);
  if (error) throw error;
}
