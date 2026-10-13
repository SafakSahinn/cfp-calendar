// Grup verisi: tüm yetki kontrolü veritabanı fonksiyonlarında (RLS + SECURITY DEFINER); burası yalnızca çağırır.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface MyGroup {
  id: string;
  name: string;
  description: string | null;
  role: 'owner' | 'member';
  member_count: number;
  event_count: number;
  members_can_post: boolean;
  owner_name: string | null;
}

export interface GroupMember {
  user_id: string;
  display_name: string | null;
  academic_title: string | null;
  institution: string | null;
  role: 'owner' | 'member';
  joined_at: string;
}

/** Kullanıcının grupları; "Gruba öner" butonu ve grup sayfaları kullanır. */
export function useMyGroups() {
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  const reload = useCallback(async () => {
    const { data } = await supabase.rpc('my_groups');
    setGroups((data ?? []) as MyGroup[]);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { groups, reload };
}

/** Bu grupta çağrı önerebilir mi? (sahip her zaman; üyeler grup ayarına bağlı) */
export const canPost = (g: MyGroup) => g.role === 'owner' || g.members_can_post;

/** Supabase/PostgREST hata mesajını kullanıcıya gösterilecek anahtara çevirir. */
export function groupError(message: string): string {
  for (const key of ['too_many_groups', 'invalid_code', 'group_full', 'owner_cannot_leave', 'already_added', 'forbidden']) {
    if (message.includes(key)) return key;
  }
  return message;
}
