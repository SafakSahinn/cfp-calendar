// Çağrılar: mevcut filtreleri kaydet, kayıtlı aramaları tek tıkla uygula; isteğe bağlı yeni çağrı bildirimi.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { activeFilterCount, EMPTY_FILTERS, type Filters } from '../../../shared/filters';
import { useApp } from '../lib/app';
import { useI18n } from '../lib/i18n';
import { supabase } from '../lib/supabase';

interface Saved { id: string; name: string; filters: Partial<Filters>; notify: boolean }

export function SavedSearches({ filters, apply }: { filters: Filters; apply: (f: Filters) => void }) {
  const { t } = useI18n();
  const { showToast } = useApp();
  const [list, setList] = useState<Saved[]>([]);
  const [form, setForm] = useState<{ name: string; notify: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('saved_searches').select('id, name, filters, notify').order('created_at');
    setList((data ?? []) as Saved[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const canSave = activeFilterCount(filters) > 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form?.name.trim()) return;
    // Sıralama ve "sadece takip ettiklerim" kayıtlı aramada anlamsız
    const { sort: _sort, followedOnly: _f, ...rest } = filters;
    void _sort; void _f;
    const { error } = await supabase.from('saved_searches').insert({ name: form.name.trim(), filters: rest, notify: form.notify });
    if (error) return showToast(/too_many_searches/.test(error.message) ? t.ssTooMany : error.message);
    setForm(null);
    showToast(t.ssSaved);
    load();
  };
  const toggleNotify = async (s: Saved) => {
    await supabase.from('saved_searches').update({ notify: !s.notify }).eq('id', s.id);
    load();
  };
  const remove = async (s: Saved) => {
    await supabase.from('saved_searches').delete().eq('id', s.id);
    load();
  };

  return (
    <div className="saved-searches">
      {list.length > 0 && (
        <div className="ss-list" aria-label={t.ssTitle}>
          {list.map((s) => (
            <span key={s.id} className="ss-chip">
              <button className="ss-apply" onClick={() => apply({ ...EMPTY_FILTERS, ...s.filters, sort: filters.sort })} title={t.ssApply}>🔎 {s.name}</button>
              <button className="ss-icon" onClick={() => toggleNotify(s)} title={s.notify ? t.ssNotifyOn : t.ssNotifyOff} aria-label={s.notify ? t.ssNotifyOn : t.ssNotifyOff}>
                {s.notify ? '🔔' : '🔕'}
              </button>
              <button className="ss-icon" onClick={() => remove(s)} title={t.ssDelete} aria-label={`${t.ssDelete}: ${s.name}`}>×</button>
            </span>
          ))}
        </div>
      )}
      {!form ? (
        <button className="small ghost" onClick={() => (canSave ? setForm({ name: '', notify: true }) : showToast(t.ssNeedFilter))}>💾 {t.ssSave}</button>
      ) : (
        <form className="ss-form" onSubmit={save}>
          <input autoFocus maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t.ssNamePlaceholder} aria-label={t.ssNamePrompt} />
          <label className="check small"><input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} /> {t.ssNotify}</label>
          <button type="submit" className="small primary" disabled={!form.name.trim()}>{t.save}</button>
          <button type="button" className="small ghost" onClick={() => setForm(null)}>{t.cancel}</button>
        </form>
      )}
    </div>
  );
}
