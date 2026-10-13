// Çağrılar sayfasındaki takvim görünümü: filtrelenmiş çağrıların son başvuru tarihleri.

import { useMemo } from 'react';
import { useApp } from '../lib/app';
import { itemsForEvent } from '../lib/calendarItems';
import { useI18n } from '../lib/i18n';
import type { EventRow } from '../lib/supabase';
import { MonthCalendar } from './MonthCalendar';

export function CalendarView({ events }: { events: EventRow[] }) {
  const { t } = useI18n();
  const { followed } = useApp();
  const items = useMemo(() => events.flatMap((e) => itemsForEvent(e, ['deadline'], followed.has(e.id))), [events, followed]);
  return <MonthCalendar items={items} showIcons={false} legend={t.calendarLegend} />;
}
