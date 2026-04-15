import type { WeeklyWindow } from '../types';

const dayLabelFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const shortDayLabelFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
const dateLabelFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short'
});
const timeFormatter = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit'
});
const lastUpdatedFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

export const getLocalWeekWindow = (
  currentDate = new Date(),
  weekOffset = 0
): WeeklyWindow => {
  const start = new Date(currentDate);
  start.setHours(0, 0, 0, 0);

  const day = start.getDay();
  const diffToMonday = (day + 6) % 7;
  start.setDate(start.getDate() - diffToMonday);
  start.setDate(start.getDate() + weekOffset * 7);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const syncStart = new Date(start);
  syncStart.setDate(syncStart.getDate() - 1);

  const syncEnd = new Date(end);
  syncEnd.setDate(syncEnd.getDate() + 1);

  const weekKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(start.getDate()).padStart(2, '0')}`;

  return {
    startMs: start.getTime(),
    endMs: end.getTime(),
    syncStartMs: syncStart.getTime(),
    syncEndMs: syncEnd.getTime(),
    weekKey
  };
};

export const getWeekdayIndex = (epochSeconds: number): number => {
  const date = new Date(epochSeconds * 1000);
  return (date.getDay() + 6) % 7;
};

export const getTodayWeekdayIndex = (currentDate = new Date()): number =>
  (currentDate.getDay() + 6) % 7;

export const isWithinLocalWeek = (
  epochSeconds: number,
  startMs: number,
  endMs: number
): boolean => {
  const timestampMs = epochSeconds * 1000;
  return timestampMs >= startMs && timestampMs < endMs;
};

export const formatDayLabel = (date: Date): string => {
  const label = dayLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatShortDayLabel = (date: Date): string => {
  const label = shortDayLabelFormatter.format(date).replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatDateLabel = (date: Date): string => {
  const label = dateLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatTimeLabel = (epochSeconds: number): string =>
  timeFormatter.format(new Date(epochSeconds * 1000));

export const formatLastUpdatedLabel = (timestamp: number | null): string =>
  timestamp ? lastUpdatedFormatter.format(new Date(timestamp)) : 'Nunca';

export const addDays = (date: Date, days: number): Date => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

export const formatWeekRangeLabel = (weekWindow: WeeklyWindow): string => {
  const start = new Date(weekWindow.startMs);
  const end = addDays(new Date(weekWindow.endMs), -1);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.toLocaleString('es-ES', { month: 'short' });
  const endMonth = end.toLocaleString('es-ES', { month: 'short' });

  if (startMonth === endMonth) {
    return `${startDay} - ${endDay} ${endMonth}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
};
