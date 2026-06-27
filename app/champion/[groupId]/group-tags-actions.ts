'use server';

import { createClient } from '@/lib/supabase/server';

/** Replace a group's tag set. Authorization is enforced in the SQL RPC
 *  (superuser OR champion of the group). */
export async function setGroupTags(groupId: string, labels: string[]): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_group_tags', {
    p_group: groupId,
    p_labels: labels,
  });
  if (error) throw new Error(error.message);
}
