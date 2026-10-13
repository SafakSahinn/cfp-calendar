import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { buildItem, deleteAllEntries, isApplicable, revokeAccess, syncEntry, type CalendarEnv, type EventRow } from '../../supabase/functions/_shared/calendar.ts';
import { decrypt, encrypt } from '../../supabase/functions/_shared/crypto.ts';
import { FakeDb, mockFetch } from './fakes.ts';

const KEY = Buffer.alloc(32, 3).toString('base64');
const env: CalendarEnv = {
  TOKEN_ENC_KEY: KEY,
  GOOGLE_CLIENT_ID: 'gid',
  GOOGLE_CLIENT_SECRET: 'gsecret',
  MS_CLIENT_ID: 'mid',
  MS_CLIENT_SECRET: 'msecret',
  SITE_URL: 'https://site/',
};

const event: EventRow = {
  id: 'ev1', kind: 'conference', acronym: 'DAC', title: 'Design Automation Conference', url: 'https://dac.com',
  location: 'San Francisco', submission_open: null, first_seen_at: '2026-10-10T08:00:00Z',
  abstract_deadline: null, submission_deadline: '2026-11-16T11:59:59.000Z', deadline_tz: 'AoE', event_start: '2027-06-20', event_end: '2027-06-24',
};

const GOOGLE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
let db: FakeDb;
let fetchMock: ReturnType<typeof mockFetch> | null = null;

async function connect(provider: 'google' | 'microsoft', expired = false) {
  db.rows('calendar_connections').push({
    user_id: 'u1',
    provider,
    refresh_token_enc: await encrypt('refresh-1', KEY),
    access_token_enc: await encrypt('access-1', KEY),
    access_expires_at: new Date(Date.now() + (expired ? -60_000 : 3600_000)).toISOString(),
  });
  db.rows('profiles').push({ id: 'u1', calendar_provider: provider });
}

beforeEach(() => {
  db = new FakeDb();
});
afterEach(() => {
  fetchMock?.restore();
  fetchMock = null;
});

test('takvim bağlı değilse hiçbir şey yapılmaz', async () => {
  fetchMock = mockFetch([]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'deadline', 'tr'), 'skipped');
  assert.equal(fetchMock.calls.length, 0);
});

test('Google: yeni kayıt oluşturulur ve harici kimlik saklanır', async () => {
  await connect('google');
  fetchMock = mockFetch([{ json: { id: 'g-123', status: 'confirmed' } }]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'deadline', 'tr'), 'created');

  const [call] = fetchMock.calls;
  assert.equal(call.method, 'POST');
  assert.equal(call.url, GOOGLE);
  const body = call.body as Record<string, any>;
  assert.equal(body.summary, '⏰ Son başvuru: DAC');
  assert.equal(body.end.dateTime, '2026-11-16T11:59:59.000Z');
  assert.deepEqual(body.reminders.overrides.map((o: any) => o.minutes), [10080, 1440]);
  assert.equal(body.transparency, 'transparent');

  const [entry] = db.rows('calendar_entries');
  assert.equal(entry.external_id, 'g-123');
  assert.equal(entry.synced_hash, 'dl:2026-11-16T11:59:59.000Z');
});

test('tarih değişmediyse API çağrılmaz', async () => {
  await connect('google');
  db.rows('calendar_entries').push({
    id: 'e1', user_id: 'u1', event_id: 'ev1', entry_type: 'deadline', provider: 'google',
    external_id: 'g-123', synced_hash: 'dl:2026-11-16T11:59:59.000Z', status: 'active',
  });
  fetchMock = mockFetch([]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'deadline', 'tr'), 'unchanged');
});

test('son tarih uzatılınca mevcut kayıt PATCH ile güncellenir', async () => {
  await connect('google');
  db.rows('calendar_entries').push({
    id: 'e1', user_id: 'u1', event_id: 'ev1', entry_type: 'deadline', provider: 'google',
    external_id: 'g-123', synced_hash: 'dl:2026-11-01T11:59:59.000Z', status: 'active',
  });
  fetchMock = mockFetch([{ json: { id: 'g-123', status: 'confirmed' } }]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'deadline', 'tr'), 'updated');
  assert.equal(fetchMock.calls[0].method, 'PATCH');
  assert.equal(fetchMock.calls[0].url, `${GOOGLE}/g-123`);
  assert.equal(db.rows('calendar_entries')[0].synced_hash, 'dl:2026-11-16T11:59:59.000Z');
});

test('kullanıcı takviminden sildiyse (cancelled) tekrar eklenmez', async () => {
  await connect('google');
  db.rows('calendar_entries').push({
    id: 'e1', user_id: 'u1', event_id: 'ev1', entry_type: 'deadline', provider: 'google',
    external_id: 'g-123', synced_hash: 'dl:eski', status: 'active',
  });
  fetchMock = mockFetch([{ json: { id: 'g-123', status: 'cancelled' } }]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'deadline', 'tr'), 'skipped');
  assert.equal(db.rows('calendar_entries')[0].status, 'removed_by_user');

  // Sonraki eşitlemede API'ye hiç gidilmez
  fetchMock.restore();
  fetchMock = mockFetch([]);
  assert.equal(await syncEntry(db, env, 'u1', { ...event, submission_deadline: '2026-12-01T11:59:59.000Z' }, 'deadline', 'tr'), 'skipped');
  assert.equal(fetchMock.calls.length, 0);
});

test('PATCH 404 dönerse kayıt silinmiş sayılır', async () => {
  await connect('microsoft');
  db.rows('calendar_entries').push({
    id: 'e1', user_id: 'u1', event_id: 'ev1', entry_type: 'event_days', provider: 'microsoft',
    external_id: 'm-1', synced_hash: 'days:eski', status: 'active',
  });
  fetchMock = mockFetch([{ status: 404, json: { error: { code: 'ErrorItemNotFound' } } }]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'event_days', 'en'), 'skipped');
  assert.equal(db.rows('calendar_entries')[0].status, 'removed_by_user');
});

test('Microsoft: konferans günleri tüm gün etkinliği olarak eklenir', async () => {
  await connect('microsoft');
  fetchMock = mockFetch([{ status: 201, json: { id: 'm-9' } }]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'event_days', 'en'), 'created');
  const body = fetchMock.calls[0].body as Record<string, any>;
  assert.equal(fetchMock.calls[0].url, 'https://graph.microsoft.com/v1.0/me/events');
  assert.equal(body.isAllDay, true);
  assert.deepEqual(body.start, { dateTime: '2027-06-20T00:00:00', timeZone: 'UTC' });
  assert.deepEqual(body.end, { dateTime: '2027-06-25T00:00:00', timeZone: 'UTC' }); // bitiş hariç
  assert.equal(body.showAs, 'free');
  assert.equal(body.subject, '🎤 DAC – Design Automation Conference');
});

test('süresi dolan erişim token\'ı yenilenir ve şifreli saklanır', async () => {
  await connect('google', true);
  fetchMock = mockFetch([
    { json: { access_token: 'access-2', expires_in: 3599 } },
    { json: { id: 'g-1', status: 'confirmed' } },
  ]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'submission_open', 'tr'), 'created');
  assert.equal(fetchMock.calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal((fetchMock.calls[0].body as any).refresh_token, 'refresh-1');
  const conn = db.rows('calendar_connections')[0];
  assert.equal(await decrypt(conn.access_token_enc as string, KEY), 'access-2');
});

test('Microsoft refresh token rotasyonu: yeni refresh token saklanır', async () => {
  await connect('microsoft', true);
  fetchMock = mockFetch([
    { json: { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3599 } },
    { status: 201, json: { id: 'm-1' } },
  ]);
  await syncEntry(db, env, 'u1', event, 'deadline', 'tr');
  const conn = db.rows('calendar_connections')[0];
  assert.equal(await decrypt(conn.refresh_token_enc as string, KEY), 'refresh-2');
  assert.equal((fetchMock.calls[0].body as any).scope, 'offline_access Calendars.ReadWrite');
});

test('izin geri çekildiyse (invalid_grant) bağlantı kaldırılır', async () => {
  await connect('google', true);
  fetchMock = mockFetch([{ status: 400, json: { error: 'invalid_grant' } }]);
  assert.equal(await syncEntry(db, env, 'u1', event, 'deadline', 'tr'), 'skipped');
  assert.equal(db.rows('calendar_connections').length, 0);
  assert.equal(db.rows('profiles')[0].calendar_provider, null);
});

test('dergi çağrılarına konferans günü eklenmez', async () => {
  await connect('google');
  fetchMock = mockFetch([]);
  assert.equal(await syncEntry(db, env, 'u1', { ...event, kind: 'journal' }, 'event_days', 'tr'), 'skipped');
});

test('hesap silme: eklenen kayıtlar takvimden silinir, kullanıcının sildikleri atlanır', async () => {
  await connect('google');
  db.rows('calendar_entries').push(
    { id: 'e1', user_id: 'u1', provider: 'google', external_id: 'g-1', status: 'active' },
    { id: 'e2', user_id: 'u1', provider: 'google', external_id: 'g-2', status: 'active' },
    { id: 'e3', user_id: 'u1', provider: 'google', external_id: 'g-3', status: 'removed_by_user' },
  );
  fetchMock = mockFetch([{ status: 200, json: {} }, { status: 410, json: {} }]);
  assert.equal(await deleteAllEntries(db, env, 'u1'), 2);
  assert.deepEqual(fetchMock.calls.map((c) => [c.method, c.url.split('/').pop()]), [['DELETE', 'g-1'], ['DELETE', 'g-2']]);
});

test('hesap silme: Google izni geri çekilir', async () => {
  await connect('google');
  fetchMock = mockFetch([{ status: 200, json: {} }]);
  await revokeAccess(db, env, 'u1');
  assert.equal(fetchMock.calls[0].url, 'https://oauth2.googleapis.com/revoke?token=refresh-1');
});

test('özet son tarihi: ayrıysa ayrı kayıt, aynıysa eklenmez', async () => {
  const withAbstract = { ...event, abstract_deadline: '2026-11-09T11:59:59.000Z' };
  assert.equal(isApplicable(withAbstract, 'abstract'), true);
  assert.equal(isApplicable({ ...event, abstract_deadline: event.submission_deadline }, 'abstract'), false);
  assert.equal(isApplicable({ ...event, abstract_deadline: null }, 'abstract'), false);
  const item = buildItem(withAbstract, 'abstract', 'tr', 'https://x');
  assert.equal(item.summary, '✍️ Özet son tarihi: DAC');
  assert.equal(item.timed?.endIso, '2026-11-09T11:59:59.000Z');
  assert.deepEqual(item.reminders, [10080, 1440]);
  assert.match(item.description, /Özet son tarihi: 2026-11-09 11:59 UTC/);

  await connect('google');
  fetchMock = mockFetch([{ json: { id: 'g-abs', status: 'confirmed' } }]);
  assert.equal(await syncEntry(db, env, 'u1', withAbstract, 'abstract', 'tr'), 'created');
  assert.equal(db.rows('calendar_entries')[0].synced_hash, 'abs:2026-11-09T11:59:59.000Z');
});
