const BR_LOCALE = 'pt-BR';
const BR_TIMEZONE = 'America/Sao_Paulo';

export function parseUtcDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const trimmed = value.trim();

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(trimmed);
  return new Date(hasTimezone ? trimmed : `${trimmed}Z`);
}

export function formatTimeBR(value?: string | Date | null): string {
  if (!value) return '--';
  const date = parseUtcDate(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString(BR_LOCALE, {
    timeZone: BR_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDateBR(value?: string | Date | null): string {
  if (!value) return '--';
  const date = parseUtcDate(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString(BR_LOCALE, {
    timeZone: BR_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTimeBR(value?: string | Date | null): string {
  if (!value) return '--';
  const date = parseUtcDate(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString(BR_LOCALE, {
    timeZone: BR_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
