// Google Takvim izni: Google Identity Services "popup kod akışı".
// Supabase'in OAuth yönlendirmesi yerine Google'ın kendi penceresi açılır; izin ekranında sadece bu sitenin
// adresi görünür (Google doğrulamasında sahiplik kanıtlanabilir). Dönen tek kullanımlık kod, Edge Function'da
// (save-calendar-token) redirect_uri=postmessage ile token'a çevrilir.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

interface CodeResponse {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface CodeClient {
  requestCode(): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient(config: {
            client_id: string;
            scope: string;
            ux_mode: 'popup';
            prompt?: string;
            hint?: string;
            include_granted_scopes?: boolean;
            callback: (r: CodeResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): CodeClient;
        };
      };
    };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Google Identity Services yüklenemedi'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Google izin penceresini açar; kullanıcı onaylarsa yetki kodunu döndürür. */
export async function requestGoogleCalendarCode(clientId: string, emailHint?: string): Promise<string> {
  await loadScript();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: `openid email ${CALENDAR_SCOPE}`,
      ux_mode: 'popup',
      // Her bağlamada onay ekranı: Google refresh token'ı yalnızca onay verildiğinde döndürür.
      prompt: 'consent',
      hint: emailHint,
      include_granted_scopes: false,
      callback: (r) => {
        if (r.error || !r.code) reject(new Error(r.error_description ?? r.error ?? 'no_code'));
        else if (!(r.scope ?? '').includes(CALENDAR_SCOPE)) reject(new Error('calendar_scope_missing'));
        else resolve(r.code);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'popup_closed' : e.message ?? e.type)),
    });
    client.requestCode();
  });
}
