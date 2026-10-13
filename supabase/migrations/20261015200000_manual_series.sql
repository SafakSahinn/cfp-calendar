-- Yönetim panelinden elle eklenen etkinlikler de seriye bağlansın (ör. "SIU 2027" → "SIU"),
-- böylece seriyi takip edenlere otomatik bildirim gider. jobs/src/types.ts makeDedupeKey/seriesKeyOf ile aynı kural.

create function public.series_key_of(p_acronym text) returns text
language sql immutable set search_path = '' as $$
  select case when k ~ '^[A-Z0-9]{2,40}$' and k ~ '[A-Z]' then k end
  from (
    select regexp_replace(
      regexp_replace(
        regexp_replace(upper(coalesce(p_acronym, '')), '\m(19|20)\d{2}\M', '', 'g'),
        '\m(IEEE|ACM|SPRINGER|IFIP|IET|EI|SCOPUS)\M', '', 'g'),
      '[^A-Z0-9]', '', 'g') as k
  ) s;
$$;

create function public.events_manual_series() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.source = 'manual' then
    new.series_key := case when new.kind <> 'journal' then public.series_key_of(new.acronym) end;
  end if;
  return new;
end;
$$;

create trigger events_manual_series before insert or update of acronym, kind, source on public.events
  for each row execute function public.events_manual_series();

update public.events set series_key = public.series_key_of(acronym) where source = 'manual' and kind <> 'journal';
