// Yönetim → Onaylar: onay bekleyen profil fotoğrafları. Onaylanan fotoğraf grup arkadaşlarına görünür olur;
// reddedilen dosya depodan silinir (kullanıcının varsa önceki onaylı fotoğrafı kalır). Her karar işlem kaydına yazılır.

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/app';
import { supabase } from '../lib/supabase';

interface Pending { user_id: string; display_name: string | null; email: string | null; avatar_path: string; uploaded_at: string | null; has_approved: boolean }

export function AdminAvatars({ onCount }: { onCount?: (n: number) => void }) {
  const { showToast } = useApp();
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_pending_avatars');
    if (error) return showToast(error.message);
    const list = (data ?? []) as Pending[];
    setRows(list);
    onCount?.(list.length);
    if (list.length) {
      const { data: signed } = await supabase.storage.from('avatars').createSignedUrls(list.map((r) => r.avatar_path), 600);
      setUrls(new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path!, s.signedUrl as string])));
    }
  }, [onCount, showToast]);
  useEffect(() => {
    load();
  }, [load]);

  const review = async (r: Pending, approve: boolean) => {
    setBusy(r.user_id);
    const { data, error } = await supabase.rpc('admin_review_avatar', { p_user: r.user_id, p_path: r.avatar_path, p_approve: approve });
    if (error) {
      setBusy(null);
      showToast(/stale/.test(error.message) ? 'Kullanıcı bu arada yeni fotoğraf yükledi; liste yenilendi.' : error.message);
      return load();
    }
    const del = (data ?? []) as string[];
    if (del.length) await supabase.storage.from('avatars').remove(del);
    setBusy(null);
    showToast(approve ? 'Fotoğraf onaylandı' : 'Fotoğraf reddedildi ve silindi');
    load();
  };

  if (rows === null) return <p className="muted">Yükleniyor…</p>;
  return (
    <div className="page-stack">
      <p className="muted small">
        Onaylanan fotoğraf, kullanıcının grup arkadaşlarına (üye listesi, yorumlar, “kim başvuruyor”) görünür. Reddedilen fotoğraf
        depodan silinir; kullanıcıya mesaj gider ve varsa önceki onaylı fotoğrafı görünmeye devam eder. Uygunsuz, başkasına ait
        veya kişiyi tanıtmayan (logo, reklam vb.) fotoğrafları reddedin.
      </p>
      {rows.length === 0 ? (
        <div className="card center"><p>Onay bekleyen fotoğraf yok. ✓</p></div>
      ) : (
        <div className="avatar-review-grid">
          {rows.map((r) => (
            <div key={r.avatar_path} className="card avatar-review">
              {urls.get(r.avatar_path) ? <img src={urls.get(r.avatar_path)} alt={`${r.display_name ?? ''} profil fotoğrafı`} /> : <div className="avatar-review-missing">?</div>}
              <strong>{r.display_name ?? '—'}</strong>
              <span className="muted small">{r.email}</span>
              <span className="muted small">
                {r.uploaded_at && new Date(r.uploaded_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {r.has_approved && ' · önceki fotoğrafı onaylı'}
              </span>
              <div className="row">
                <button className="primary small" disabled={busy === r.user_id} onClick={() => review(r, true)}>✓ Onayla</button>
                <button className="small ghost danger" disabled={busy === r.user_id} onClick={() => review(r, false)}>✕ Reddet</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
