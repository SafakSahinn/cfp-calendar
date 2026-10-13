-- E-posta sıklığı: 'weekly' (pazartesi özeti, varsayılan) | 'instant' (12 saatte bir yeni mesaj özeti + haftalık)
-- Ana anahtar hâlâ email_notifications (kapalıysa hiçbir e-posta gitmez).

alter table public.profiles
  add column email_frequency text not null default 'weekly' check (email_frequency in ('weekly', 'instant')),
  add column last_weekly_email_at timestamptz;

grant update (email_frequency) on public.profiles to authenticated;
