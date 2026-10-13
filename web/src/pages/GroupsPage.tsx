import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { KindLegend, MonthCalendar } from '../components/MonthCalendar';
import { GroupSubmissions } from '../components/Submissions';
import { useApp } from '../lib/app';
import { itemsForEvent } from '../lib/calendarItems';
import { eventHref } from '../lib/events';
import { formatDeadline, timeAgo } from '../lib/format';
import { groupError, useMyGroups, type GroupMember, type MyGroup } from '../lib/groups';
import { useI18n } from '../lib/i18n';
import { siteRoot, supabase, type EventRow } from '../lib/supabase';

/** Davet bağlantısından kodu çıkarır (tam bağlantı veya sadece kod yapıştırılabilir). */
const extractCode = (s: string) => s.trim().split('/').pop()!.replace(/[^0-9a-f]/gi, '').toLowerCase();

// ---------------------------------------------------------------------------
// Gruplarım
// ---------------------------------------------------------------------------
export function GroupsPage() {
  const { t } = useI18n();
  const { showToast } = useApp();
  const { groups, reload } = useMyGroups();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) return showToast(t.groupNameShort);
    setBusy(true);
    const { data, error } = await supabase.rpc('create_group', { p_name: name.trim(), p_description: desc.trim() || null });
    setBusy(false);
    if (error) return showToast(groupError(error.message) === 'too_many_groups' ? t.tooManyGroups : error.message);
    await reload();
    window.location.hash = `#/grup/${data}`;
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = extractCode(code);
    if (c.length < 8) return showToast(t.invalidInvite);
    window.location.hash = `#/katil/${c}`;
  };

  return (
    <section className="page-stack">
      <div className="page-head">
        <h2>{t.navGroups}</h2>
        <p className="muted">{t.groupsText}</p>
      </div>

      {groups === null ? (
        <p className="muted center">{t.loading}</p>
      ) : groups.length === 0 ? (
        <p className="muted">{t.noGroups}</p>
      ) : (
        <div className="group-grid">
          {groups.map((g) => (
            <a key={g.id} href={`#/grup/${g.id}`} className="card group-card">
              <strong>{g.name}</strong>
              {g.description && <span className="muted small">{g.description}</span>}
              <span className="small">
                👥 {t.memberCount(g.member_count)} · 📌 {t.groupEventCount(g.event_count)}
              </span>
              <span className="tag">{g.role === 'owner' ? t.roleOwner : t.roleMember}</span>
            </a>
          ))}
        </div>
      )}

      <div className="two-col">
        <form className="card email-auth left" onSubmit={create}>
          <h3>{t.createGroup}</h3>
          <p className="muted small">{t.createGroupText}</p>
          <div className="field">
            <label htmlFor="g-name">{t.groupName}</label>
            <input id="g-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.groupNamePlaceholder} />
          </div>
          <div className="field">
            <label htmlFor="g-desc">{t.groupDescription}</label>
            <textarea id="g-desc" rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <button type="submit" className="primary" disabled={busy}>{t.createGroup}</button>
        </form>

        <form className="card email-auth left" onSubmit={join}>
          <h3>{t.joinGroup}</h3>
          <p className="muted small">{t.joinGroupText}</p>
          <div className="field">
            <label htmlFor="g-code">{t.inviteLinkOrCode}</label>
            <input id="g-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={`${siteRoot}#/katil/…`} />
          </div>
          <button type="submit">{t.continue}</button>
        </form>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Davet bağlantısı: önce grubu göster, açık onayla katıl
// ---------------------------------------------------------------------------
export function JoinGroupPage({ code }: { code: string }) {
  const { t } = useI18n();
  const { showToast } = useApp();
  const [preview, setPreview] = useState<{ id: string; name: string; description: string | null; member_count: number; already_member: boolean } | null | undefined>(undefined);

  useEffect(() => {
    supabase.rpc('group_preview', { p_code: code }).then(({ data }) => setPreview((data as never[])?.[0] ?? null));
  }, [code]);

  const join = async () => {
    const { data, error } = await supabase.rpc('join_group', { p_code: code });
    if (error) {
      const k = groupError(error.message);
      return showToast(k === 'group_full' ? t.groupFull : k === 'invalid_code' ? t.invalidInvite : error.message);
    }
    showToast(t.joined);
    window.location.hash = `#/grup/${data}`;
  };

  if (preview === undefined) return <p className="muted center">{t.loading}</p>;
  if (preview === null) return <div className="card center"><p>{t.invalidInvite}</p><a href="#/gruplar">{t.navGroups} →</a></div>;
  return (
    <div className="card center join-card">
      <p className="muted">{t.invitedTo}</p>
      <h2>{preview.name}</h2>
      {preview.description && <p>{preview.description}</p>}
      <p className="muted small">👥 {t.memberCount(preview.member_count)}</p>
      <p className="muted small">{t.joinPrivacyNote}</p>
      {preview.already_member ? (
        <a className="button primary" href={`#/grup/${preview.id}`}>{t.openGroup}</a>
      ) : (
        <button className="primary" onClick={join}>{t.joinThisGroup}</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grup sayfası
// ---------------------------------------------------------------------------
interface GroupEventRow { event_id: string; note: string | null; added_by: string | null; created_at: string; events: EventRow }

export function GroupPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { session, profile, showToast } = useApp();
  const { groups, reload } = useMyGroups();
  const [tab, setTab] = useState<'calendar' | 'events' | 'members' | 'submissions' | 'settings'>('calendar');
  const [rows, setRows] = useState<GroupEventRow[] | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const g: MyGroup | undefined = groups?.find((x) => x.id === id);
  const isOwner = g?.role === 'owner';
  const me = session!.user.id;

  const load = useCallback(async () => {
    const [{ data: ev }, { data: mem }] = await Promise.all([
      supabase.from('group_events').select('event_id, note, added_by, created_at, events(*)').eq('group_id', id).order('created_at', { ascending: false }),
      supabase.rpc('group_member_list', { p_group: id }),
    ]);
    setRows(((ev ?? []) as unknown as GroupEventRow[]).filter((r) => r.events));
    setMembers((mem ?? []) as GroupMember[]);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, m.display_name])), [members]);
  const items = useMemo(() => (rows ?? []).flatMap((r) => itemsForEvent(r.events, ['abstract', 'deadline', 'event'])), [rows]);

  if (groups === null) return <p className="muted center">{t.loading}</p>;
  if (!g) return <div className="card center"><p>{t.groupNotFound}</p><a href="#/gruplar">{t.navGroups} →</a></div>;

  const icsUrl = profile ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ics?token=${profile.ics_token}&group=${id}` : '';
  const removeEvent = async (eventId: string) => {
    const { error } = await supabase.rpc('group_remove_event', { p_group: id, p_event: eventId });
    if (error) return showToast(error.message);
    load();
    reload();
  };

  return (
    <section className="page-stack">
      <a href="#/gruplar" className="small">← {t.navGroups}</a>
      <div className="page-head">
        <h2>{g.name}</h2>
        {g.description && <p className="muted">{g.description}</p>}
        <p className="small muted">👥 {t.memberCount(g.member_count)} · {isOwner ? t.roleOwner : `${t.ownerLabel}: ${g.owner_name ?? '—'}`}</p>
      </div>

      <div className="tabs admin-tabs" role="tablist">
        {([['calendar', t.groupCalendar], ['events', t.groupEvents], ['members', t.members], ...(isOwner ? [['submissions', t.submissionsTab]] : []), ['settings', isOwner ? t.settings : t.groupInfo]] as [typeof tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'calendar' && (
        <>
          <MonthCalendar items={items} legend={<KindLegend />} />
          <p className="muted small">{g.role === 'owner' || g.members_can_post ? t.howToRecommend : t.onlyOwnerRecommends}</p>
        </>
      )}

      {tab === 'events' && (
        <div className="list">
          {rows?.length === 0 && <p className="muted">{t.noGroupEvents}</p>}
          {rows?.map((r) => (
            <article key={r.event_id} className="card">
              <div className="row">
                <a href={eventHref(r.event_id)} className="grow"><strong>{r.events.acronym ?? r.events.title}</strong></a>
                {r.events.submission_deadline && <span className="small">{t.deadline}: <strong>{formatDeadline(r.events.submission_deadline, lang)}</strong></span>}
              </div>
              <p className="event-title">{r.events.title}</p>
              <p className="muted small">
                {t.recommendedBy(nameOf.get(r.added_by ?? '') ?? '—')} · {timeAgo(r.created_at, lang)}
              </p>
              {r.note && <p className="note">💬 {r.note}</p>}
              {(isOwner || r.added_by === me) && (
                <button className="small ghost" onClick={() => removeEvent(r.event_id)}>{t.removeFromGroup}</button>
              )}
            </article>
          ))}
        </div>
      )}

      {tab === 'submissions' && isOwner && <GroupSubmissions groupId={id} />}

      {tab === 'members' && <Members group={g} members={members} reload={() => { load(); reload(); }} />}

      {tab === 'settings' && (
        <div className="page-stack">
          {isOwner && <OwnerSettings group={g} reload={reload} />}
          <div className="card">
            <h3>{t.groupIcsTitle}</h3>
            <p className="muted small">{t.groupIcsText}</p>
            <div className="row">
              <input readOnly value={icsUrl} className="grow mono" onFocus={(e) => e.target.select()} />
              <button className="small" onClick={async () => { await navigator.clipboard.writeText(icsUrl); showToast(t.copied); }}>{t.copy}</button>
            </div>
          </div>
          {!isOwner && <LeaveGroup group={g} />}
        </div>
      )}
    </section>
  );
}

function Members({ group, members, reload }: { group: MyGroup; members: GroupMember[]; reload: () => void }) {
  const { t } = useI18n();
  const { showToast } = useApp();
  const remove = async (m: GroupMember) => {
    if (!window.confirm(t.confirmRemoveMember(m.display_name ?? '—'))) return;
    const { error } = await supabase.rpc('remove_group_member', { p_group: group.id, p_user: m.user_id });
    if (error) return showToast(error.message);
    reload();
  };
  return (
    <div className="card">
      <p className="muted small">{t.membersPrivacyNote}</p>
      <ul className="followed">
        {members.map((m) => (
          <li key={m.user_id}>
            <span>
              <strong>{m.display_name ?? t.unnamed}</strong>
              {m.role === 'owner' && <span className="tag rank">{t.roleOwner}</span>}
              <span className="muted small">
                {m.academic_title && ` · ${t.titles[m.academic_title as keyof typeof t.titles]}`}
                {m.institution && ` · ${m.institution}`}
              </span>
            </span>
            {group.role === 'owner' && m.role !== 'owner' && (
              <button className="small ghost" onClick={() => remove(m)}>{t.removeMember}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OwnerSettings({ group, reload }: { group: MyGroup; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const { showToast } = useApp();
  const [name, setName] = useState(group.name);
  const [desc, setDesc] = useState(group.description ?? '');
  const [canPostMembers, setCanPostMembers] = useState(group.members_can_post);
  const [code, setCode] = useState<string | null>(null);
  const invite = code ? `${siteRoot}#/katil/${code}` : '';

  useEffect(() => {
    supabase.rpc('group_invite_code', { p_group: group.id, p_regenerate: false }).then(({ data }) => setCode(data as string));
  }, [group.id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('update_group', { p_group: group.id, p_name: name, p_description: desc, p_members_can_post: canPostMembers });
    if (error) return showToast(error.message);
    showToast(t.saved);
    reload();
  };
  const regenerate = async () => {
    if (!window.confirm(t.confirmRegenerate)) return;
    const { data } = await supabase.rpc('group_invite_code', { p_group: group.id, p_regenerate: true });
    setCode(data as string);
    showToast(t.inviteRegenerated);
  };
  const remove = async () => {
    if (window.prompt(t.confirmDeleteGroup(group.name)) !== group.name) return;
    const { error } = await supabase.rpc('delete_group', { p_group: group.id });
    if (error) return showToast(error.message);
    await reload();
    window.location.hash = '#/gruplar';
  };

  return (
    <>
      <div className="card">
        <h3>{t.inviteLink}</h3>
        <p className="muted small">{t.inviteText}</p>
        <div className="row">
          <input readOnly value={invite} className="grow mono" onFocus={(e) => e.target.select()} />
          <button className="small" onClick={async () => { await navigator.clipboard.writeText(invite); showToast(t.copied); }}>{t.copy}</button>
          <button className="small ghost" onClick={regenerate}>{t.regenerate}</button>
        </div>
      </div>
      <form className="card email-auth left" onSubmit={save}>
        <h3>{t.settings}</h3>
        <div className="field"><label htmlFor="gs-name">{t.groupName}</label><input id="gs-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="gs-desc">{t.groupDescription}</label><textarea id="gs-desc" rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <label className="check"><input type="checkbox" checked={canPostMembers} onChange={(e) => setCanPostMembers(e.target.checked)} /> {t.membersCanPost}</label>
        <div className="row end"><button type="submit" className="primary">{t.save}</button></div>
      </form>
      <div className="card danger">
        <h3>{t.deleteGroup}</h3>
        <p className="muted">{t.deleteGroupText}</p>
        <button className="danger-btn" onClick={remove}>{t.deleteGroup}</button>
      </div>
    </>
  );
}

function LeaveGroup({ group }: { group: MyGroup }) {
  const { t } = useI18n();
  const { showToast } = useApp();
  const leave = async () => {
    if (!window.confirm(t.confirmLeave(group.name))) return;
    const { error } = await supabase.rpc('leave_group', { p_group: group.id });
    if (error) return showToast(error.message);
    window.location.hash = '#/gruplar';
  };
  return (
    <div className="card">
      <h3>{t.leaveGroup}</h3>
      <button className="small" onClick={leave}>{t.leaveGroup}</button>
    </div>
  );
}
