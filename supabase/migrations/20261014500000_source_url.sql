-- Kaynak kaydının adresi (ör. WikiCFP sayfası); "url" artık etkinliğin RESMİ sitesi.
alter table public.events add column source_url text check (source_url is null or source_url ~ '^https?://');
