// Yönetici paneli. Arayüz yalnızca kolaylık içindir: tüm yetki kontrolü veritabanındaki SECURITY DEFINER
// fonksiyonlarda (admin_assert) yapılır; yönetici olmayan biri bu sayfayı açsa bile hiçbir veri alamaz.
// Yönetici paneli Türkçedir (yönetici kitlesi).

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fieldsOf, TOPICS } from '../../../shared/topics';
import { useApp } from '../lib/app';
import { formatDate, formatDeadline, timeAgo } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { supabase, type EventRow } from '../lib/supabase';

type Tab = 'overview' | 'feedback' | 'users' | 'events' | 'announcements' | 'audit';

interface Stats {
  users: number; users_new_7d: number; users_active_7d: number; calendar_connected: number; email_on: number;
  follows: number; feedback_new: number; events_open: number; events_manual: number; last_sync: string | null;
  groups: number; group_members: number; submissions: number; last_sync_failed: boolean | null;
}
interface FeedbackRow {
  id: string; kind: 'suggest_event' | 'wrong_info' | 'other'; status: 'new' | 'done' | 'rejected'; message: string;
  url: string | null; created_at: string; admin_note: string | null; handled_at: string | null; user_email: string | null;
  event_id: string | null; event_acronym: string | null; event_title: string | null; event_url: string | null;
}
interface UserRow {
  id: string; email: string; display_name: string | null; academic_title: string | null; institution: string | null;
  department: string | null; providers: string[]; created_at: string;
  last_sign_in_at: string | null; email_confirmed: boolean; calendar_provider: string | null;
  email_notifications: boolean; followed: number; topics: number; is_admin: boolean;
}
interface AuditRow { created_at: string; admin_email: string | null; action: string; target: string | null; detail: Record<string, unknown> }

const KIND_LABEL = { suggest_event: '➕ Etkinlik önerisi', wrong_info: '⚠️ Hatalı bilgi', other: '💬 Diğer' };
const STATUS_LABEL = { new: 'Yeni', done: 'Yapıldı', rejected: 'Reddedildi' };
const PROVIDER_LABEL: Record<string, string> = { google: 'Google', azure: 'Microsoft', email: 'E-posta' };

function useRpc<T>(fn: string, args?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(args ?? {});
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) setError(error.message);
    else {
      setError(null);
      setData(data as T);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

export function AdminPage() {
  const { isAdmin } = useApp();
  const [tab, setTab] = useState<Tab>('overview');

  if (isAdmin === null) return <p className="muted center">Yükleniyor…</p>;
  if (!isAdmin) return <div className="notice">Bu sayfa yalnızca yöneticilere açıktır.</div>;

  const tabs: [Tab, string][] = [
    ['overview', 'Özet'],
    ['feedback', 'Geri bildirimler'],
    ['users', 'Üyeler'],
    ['events', 'Etkinlik ekle'],
    ['announcements', 'Duyurular'],
    ['audit', 'İşlem kaydı'],
  ];

  return (
    <section className="admin">
      <h2>Yönetim</h2>
      <div className="tabs admin-tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'feedback' && <Feedback />}
      {tab === 'users' && <Users />}
      {tab === 'events' && <ManualEvents />}
      {tab === 'announcements' && <Announcements />}
      {tab === 'audit' && <Audit />}
    </section>
  );
}

interface SyncRun { started_at: string; finished_at: string | null; trigger: string | null; ok: boolean | null; stats: Record<string, unknown>; error: string | null }

function Overview() {
  const { data, error } = useRpc<Stats>('admin_stats');
  const { data: runs } = useRpc<SyncRun[]>('admin_sync_runs');
  const { data: maint } = useRpc<{ items?: { key: string; level: 'ok' | 'warn' | 'todo'; title: string; detail: string }[]; updated_at?: string }>('admin_maintenance');
  if (error) return <div className="notice">{error}</div>;
  if (!data) return <p className="muted">Yükleniyor…</p>;
  const tiles: [string, number | string, string?][] = [
    ['Üye', data.users, `+${data.users_new_7d} son 7 gün`],
    ['Aktif (7 gün)', data.users_active_7d],
    ['Grup', data.groups, `${data.group_members} üyelik`],
    ['Başvuru kaydı', data.submissions],
    ['Takvim bağlı', data.calendar_connected],
    ['Takip edilen çağrı', data.follows],
    ['Yeni geri bildirim', data.feedback_new],
    ['Açık çağrı', data.events_open, `${data.events_manual} elle eklenen`],
  ];
  const fmt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="page-stack">
      {data.last_sync_failed && (
        <div className="notice">⚠️ Son veri güncellemesi başarısız oldu. Ayrıntılar aşağıda ve GitHub → Actions → “Veri çek ve dağıt”.</div>
      )}
      <div className="stat-grid">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="card stat">
            <span className="muted small">{label}</span>
            <strong>{value}</strong>
            {sub && <span className="muted small">{sub}</span>}
          </div>
        ))}
      </div>
      {(maint?.items?.length ?? 0) > 0 && (
        <div>
          <h3>🛠️ Bakım</h3>
          <div className="maint-list">
            {maint!.items!.map((m) => (
              <div key={m.key} className={`maint maint-${m.level}`}>
                <span className="maint-badge">{m.level === 'todo' ? 'Yapılacak' : m.level === 'warn' ? 'Takip et' : 'Güncel'}</span>
                <strong>{m.title}</strong>
                <p>{m.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3>Sistem durumu — veri güncellemeleri</h3>
        <p className="muted small">
          Veriler 12 saatte bir otomatik güncellenir (GitHub bazen birkaç saat geciktirebilir).
          {data.last_sync && <> Son başarılı güncelleme: <strong>{timeAgo(data.last_sync, 'tr')}</strong>.</>}
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Başlangıç</th><th>Durum</th><th>Süre</th><th>Kaynaklar</th><th>Değişen</th><th>Bildirim</th><th>Takvim</th></tr></thead>
            <tbody>
              {(runs ?? []).map((r) => {
                const s = r.stats ?? {};
                const sources = Object.entries((s.sources ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(' · ');
                const secs = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
                return (
                  <tr key={r.started_at}>
                    <td>{fmt(r.started_at)}<div className="muted small">{r.trigger === 'schedule' ? 'otomatik' : 'elle'}</div></td>
                    <td>{r.ok === null ? '⏳ sürüyor' : r.ok ? '✅' : <span title={r.error ?? ''}>❌ {r.error?.slice(0, 80)}</span>}</td>
                    <td>{secs !== null ? `${Math.floor(secs / 60)} dk ${secs % 60} sn` : '—'}</td>
                    <td className="small">{sources || '—'}</td>
                    <td>{String(s.events_changed ?? '—')}</td>
                    <td>{String(s.notifications ?? '—')}</td>
                    <td>{String(s.calendar_entries ?? '—')}</td>
                  </tr>
                );
              })}
              {runs?.length === 0 && <tr><td colSpan={7} className="muted">Henüz kayıt yok (ilk güncellemeden sonra görünür).</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Feedback() {
  const [status, setStatus] = useState<string>('new');
  const { data, error, reload } = useRpc<FeedbackRow[]>('admin_list_feedback', { p_status: status || null });
  const { showToast } = useApp();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const update = async (id: string, s: FeedbackRow['status']) => {
    const { error } = await supabase.rpc('admin_update_feedback', { p_id: id, p_status: s, p_note: notes[id] ?? null });
    if (error) return showToast(error.message);
    showToast(`Durum: ${STATUS_LABEL[s]}`);
    reload();
  };

  return (
    <div>
      <div className="row">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="new">Yeni</option>
          <option value="done">Yapıldı</option>
          <option value="rejected">Reddedildi</option>
          <option value="">Tümü</option>
        </select>
        <span className="muted small">{data?.length ?? 0} kayıt</span>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="list">
        {data?.length === 0 && <p className="muted">Kayıt yok.</p>}
        {data?.map((f) => (
          <article key={f.id} className="card">
            <div className="message-head">
              <strong>{KIND_LABEL[f.kind]}</strong>
              <span className={`tag status-${f.status}`}>{STATUS_LABEL[f.status]}</span>
              <span className="muted small">{timeAgo(f.created_at, 'tr')}</span>
            </div>
            <p className="pre">{f.message}</p>
            <ul className="facts">
              <li>Gönderen: {f.user_email ?? 'silinmiş hesap'}</li>
              {f.event_id && (
                <li>
                  Etkinlik: <strong>{f.event_acronym ?? f.event_title}</strong>
                  {f.event_url && <> · <a href={f.event_url} target="_blank" rel="noreferrer">sayfa</a></>}
                </li>
              )}
              {f.url && (
                <li>
                  Bağlantı: <a href={f.url} target="_blank" rel="noreferrer noopener">{f.url}</a>
                </li>
              )}
              {f.admin_note && <li>Not: {f.admin_note}</li>}
            </ul>
            <div className="row">
              <input
                className="grow"
                placeholder="Not (isteğe bağlı)"
                maxLength={1000}
                value={notes[f.id] ?? ''}
                onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })}
              />
              {f.status !== 'done' && <button className="small primary" onClick={() => update(f.id, 'done')}>Yapıldı</button>}
              {f.status !== 'rejected' && <button className="small" onClick={() => update(f.id, 'rejected')}>Reddet</button>}
              {f.status !== 'new' && <button className="small ghost" onClick={() => update(f.id, 'new')}>Yeniye al</button>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function Users() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, error } = useRpc<UserRow[]>('admin_list_users', { p_search: query || null });
  const { t } = useI18n();

  return (
    <div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}>
        <input className="grow" type="search" placeholder="E-posta, ad veya kurum ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="submit" className="small">Ara</button>
        <span className="muted small">{data?.length ?? 0} üye</span>
      </form>
      {error && <div className="notice">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Üye</th><th>Unvan / kurum</th><th>Giriş yöntemi</th><th>Kayıt</th><th>Son giriş</th><th>Takvim</th><th>Takip</th><th>Konu</th><th>E-posta bild.</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.display_name ?? '—'}</strong>
                  {u.is_admin && <span className="tag rank">yönetici</span>}
                  <div className="muted small">{u.email}{!u.email_confirmed && ' · onaysız'}</div>
                </td>
                <td>
                  {u.academic_title ? t.titles[u.academic_title as keyof typeof t.titles] : '—'}
                  {u.institution && <div className="muted small">{u.institution}{u.department && ` · ${u.department}`}</div>}
                </td>
                <td>{u.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(', ')}</td>
                <td>{formatDate(u.created_at.slice(0, 10), 'tr')}</td>
                <td>{u.last_sign_in_at ? timeAgo(u.last_sign_in_at, 'tr') : '—'}</td>
                <td>{u.calendar_provider === 'google' ? 'Google' : u.calendar_provider === 'microsoft' ? 'Microsoft' : '—'}</td>
                <td>{u.followed}</td>
                <td>{u.topics}</td>
                <td>{u.email_notifications ? 'açık' : 'kapalı'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface EventForm {
  id?: string; title: string; acronym: string; kind: EventRow['kind']; url: string; location: string;
  submission_deadline: string; abstract_deadline: string; event_start: string; event_end: string;
  topics: string[]; is_ieee: boolean;
}
const EMPTY_EVENT: EventForm = {
  title: '', acronym: '', kind: 'conference', url: '', location: '', submission_deadline: '', abstract_deadline: '',
  event_start: '', event_end: '', topics: [], is_ieee: false,
};
/** Tarih (YYYY-MM-DD) → o günün AoE (UTC-12) sonu: dünyanın her yerinde o gün bitene kadar geçerli. */
const aoeEndOfDay = (d: string) => (d ? `${d}T23:59:59-12:00` : '');
/** ISO zaman damgası → AoE takvim günü (forma geri doldurmak için). */
const aoeDate = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 12 * 3600_000).toISOString().slice(0, 10) : '');

function ManualEvents() {
  const { showToast } = useApp();
  const [form, setForm] = useState<EventForm>(EMPTY_EVENT);
  const [list, setList] = useState<EventRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('events').select('*').eq('source', 'manual').order('submission_deadline');
    setList((data ?? []) as EventRow[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleTopic = (id: string) =>
    set('topics', form.topics.includes(id) ? form.topics.filter((t) => t !== id) : [...form.topics, id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.submission_deadline) return showToast('Başlık ve son başvuru tarihi zorunlu.');
    if (form.topics.length === 0) return showToast('En az bir konu seçin (konu bildirimleri buna göre gider).');
    setBusy(true);
    const { error } = await supabase.rpc('admin_save_event', {
      p: {
        ...form,
        submission_deadline: aoeEndOfDay(form.submission_deadline),
        abstract_deadline: aoeEndOfDay(form.abstract_deadline),
        fields: fieldsOf(form.topics),
      },
    });
    setBusy(false);
    if (error) return showToast(error.message);
    showToast(form.id ? 'Etkinlik güncellendi.' : 'Etkinlik eklendi. Konuyu seçen üyelere bir sonraki veri güncellemesinde mesaj gider.');
    setForm(EMPTY_EVENT);
    load();
  };

  const edit = (ev: EventRow) =>
    setForm({
      id: ev.id, title: ev.title, acronym: ev.acronym ?? '', kind: ev.kind, url: ev.url ?? '', location: ev.location ?? '',
      submission_deadline: aoeDate(ev.submission_deadline), abstract_deadline: aoeDate(ev.abstract_deadline),
      event_start: ev.event_start ?? '', event_end: ev.event_end ?? '', topics: ev.topics, is_ieee: ev.is_ieee,
    });

  const remove = async (ev: EventRow) => {
    if (!window.confirm(`“${ev.acronym ?? ev.title}” silinsin mi? Takip eden üyelerin takip kaydı da silinir.`)) return;
    const { error } = await supabase.rpc('admin_delete_event', { p_id: ev.id });
    if (error) return showToast(error.message);
    showToast('Silindi.');
    load();
  };

  return (
    <div className="admin-events">
      <form className="card admin-form" onSubmit={save}>
        <h3>{form.id ? 'Etkinliği düzenle' : 'Yeni etkinlik'}</h3>
        <p className="muted small">
          Kaynaklarda olmayan çağrılar için (ör. SIU, ELECO, ASYU, UBMK). Tarihler AoE (dünyanın her yerinde o gün sonu) olarak kaydedilir.
        </p>
        <div className="form-grid">
          <label className="inline-field span2">
            <span className="small muted">Başlık *</span>
            <input required maxLength={300} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="ör. 35. IEEE Sinyal İşleme ve İletişim Uygulamaları Kurultayı" />
          </label>
          <label className="inline-field">
            <span className="small muted">Kısaltma</span>
            <input maxLength={60} value={form.acronym} onChange={(e) => set('acronym', e.target.value)} placeholder="SIU 2027" />
          </label>
          <label className="inline-field">
            <span className="small muted">Tür</span>
            <select value={form.kind} onChange={(e) => set('kind', e.target.value as EventRow['kind'])}>
              <option value="conference">Konferans</option>
              <option value="workshop">Çalıştay</option>
              <option value="journal">Dergi / özel sayı</option>
            </select>
          </label>
          <label className="inline-field span2">
            <span className="small muted">Resmi sayfa</span>
            <input type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
          </label>
          <label className="inline-field span2">
            <span className="small muted">Yer</span>
            <input maxLength={200} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="İstanbul, Türkiye" />
          </label>
          <label className="inline-field">
            <span className="small muted">Son başvuru *</span>
            <input type="date" required value={form.submission_deadline} onChange={(e) => set('submission_deadline', e.target.value)} />
          </label>
          <label className="inline-field">
            <span className="small muted">Özet son tarihi</span>
            <input type="date" value={form.abstract_deadline} onChange={(e) => set('abstract_deadline', e.target.value)} />
          </label>
          <label className="inline-field">
            <span className="small muted">Etkinlik başlangıcı</span>
            <input type="date" value={form.event_start} onChange={(e) => set('event_start', e.target.value)} />
          </label>
          <label className="inline-field">
            <span className="small muted">Etkinlik bitişi</span>
            <input type="date" value={form.event_end} min={form.event_start} onChange={(e) => set('event_end', e.target.value)} />
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={form.is_ieee} onChange={(e) => set('is_ieee', e.target.checked)} /> IEEE</label>
        <div>
          <span className="small muted">Konular * (bu konuları seçen üyelere “İlgileniyor musunuz?” mesajı gider)</span>
          <div className="chips">
            {TOPICS.map((t) => (
              <button type="button" key={t.id} className={`chip ${form.topics.includes(t.id) ? 'on' : ''}`} onClick={() => toggleTopic(t.id)}>
                {t.tr}
              </button>
            ))}
          </div>
        </div>
        <div className="row end">
          {form.id && <button type="button" className="ghost" onClick={() => setForm(EMPTY_EVENT)}>Vazgeç</button>}
          <button type="submit" className="primary" disabled={busy}>{form.id ? 'Kaydet' : 'Ekle'}</button>
        </div>
      </form>

      <h3>Elle eklenen etkinlikler ({list.length})</h3>
      <div className="list">
        {list.length === 0 && <p className="muted">Henüz yok.</p>}
        {list.map((ev) => (
          <div key={ev.id} className="card row">
            <span className="grow">
              <strong>{ev.acronym ?? ev.title}</strong>
              <span className="muted small"> · son başvuru {ev.submission_deadline ? formatDeadline(ev.submission_deadline, 'tr') : '—'}</span>
            </span>
            <button className="small" onClick={() => edit(ev)}>Düzenle</button>
            <button className="small ghost" onClick={() => remove(ev)}>Sil</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Audit() {
  const { data, error } = useRpc<AuditRow[]>('admin_list_audit');
  const ACTIONS: Record<string, string> = {
    list_users: 'Üye listesini görüntüledi', update_feedback: 'Geri bildirim durumu', create_event: 'Etkinlik ekledi',
    update_event: 'Etkinlik düzenledi', delete_event: 'Etkinlik sildi',
    create_announcement: 'Duyuru yayımladı', delete_announcement: 'Duyuru sildi',
  };
  if (error) return <div className="notice">{error}</div>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Zaman</th><th>Yönetici</th><th>İşlem</th><th>Ayrıntı</th></tr></thead>
        <tbody>
          {data?.map((a, i) => (
            <tr key={i}>
              <td>{timeAgo(a.created_at, 'tr')}</td>
              <td>{a.admin_email ?? '—'}</td>
              <td>{ACTIONS[a.action] ?? a.action}</td>
              <td className="muted small">{Object.entries(a.detail ?? {}).map(([k, v]) => `${k}: ${v ?? ''}`).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AnnouncementRow { id: string; title: string; body: string; url: string | null; created_at: string; recipients: number; read_count: number }

function Announcements() {
  const { showToast } = useApp();
  const { data, error, reload } = useRpc<AnnouncementRow[]>('admin_list_announcements');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3 || !body.trim()) return showToast('Başlık (en az 3 karakter) ve metin zorunlu.');
    if (url.trim() && !/^https?:\/\/\S+$/.test(url.trim())) return showToast('Bağlantı https:// ile başlamalı.');
    if (!window.confirm(`“${title.trim()}” duyurusu TÜM üyelerin mesaj kutusuna gönderilecek. Emin misiniz?`)) return;
    setBusy(true);
    const { data: sent, error } = await supabase.rpc('admin_create_announcement', { p_title: title.trim(), p_body: body.trim(), p_url: url.trim() || null });
    setBusy(false);
    if (error) return showToast(error.message);
    showToast(`Duyuru ${sent} üyeye gönderildi.`);
    setTitle(''); setBody(''); setUrl('');
    reload();
  };
  const remove = async (a: AnnouncementRow) => {
    if (!window.confirm(`“${a.title}” silinsin mi? Üyelerin mesaj kutusundan da kalkar.`)) return;
    const { error } = await supabase.rpc('admin_delete_announcement', { p_id: a.id });
    if (error) return showToast(error.message);
    reload();
  };

  return (
    <div className="admin-events">
      <form className="card admin-form" onSubmit={publish}>
        <h3>Yeni duyuru</h3>
        <p className="muted small">Tüm üyelerin “Mesajlar” kutusuna düşer (ör. “SIU 2027 eklendi”, bakım duyurusu).</p>
        <label className="inline-field"><span className="small muted">Başlık *</span><input maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="inline-field"><span className="small muted">Metin *</span><textarea rows={4} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <label className="inline-field"><span className="small muted">Bağlantı (isteğe bağlı)</span><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
        <div className="row end"><button type="submit" className="primary" disabled={busy}>Yayımla</button></div>
      </form>
      {error && <div className="notice">{error}</div>}
      <h3>Yayımlanan duyurular</h3>
      <div className="list">
        {data?.length === 0 && <p className="muted">Henüz yok.</p>}
        {data?.map((a) => (
          <article key={a.id} className="card">
            <div className="message-head"><strong>📣 {a.title}</strong><span className="muted small">{timeAgo(a.created_at, 'tr')}</span></div>
            <p className="pre">{a.body}</p>
            <div className="row">
              <span className="muted small grow">{a.read_count} / {a.recipients} üye okudu</span>
              <button className="small ghost" onClick={() => remove(a)}>Sil</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
