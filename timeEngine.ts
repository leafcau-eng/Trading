/**
 * Engine C — Time Engine
 * Spec: ict-rule-specification.md, section "Engine C. Time Engine"
 * Status: FINAL — generik, minim ambiguitas. Dependencies: tidak ada (base primitive).
 *
 * Menyediakan waktu New York yang timezone-aware (IANA tz database, DST-safe)
 * untuk dikonsumsi Session Engine (Engine D) dan rule lain yang butuh waktu
 * NY lokal. Primitif dasar — tidak spesifik ICT, tidak ada interpretasi trading.
 *
 * Kenapa bukan fixed offset: NY berpindah DST dua kali setahun (awal Maret,
 * awal November) sementara UTC tidak. Hardcode offset -4/-5 jam akan meleset
 * 1 jam selama beberapa minggu tiap tahun begitu tanggal transisi DST US
 * berubah (bukan tanggal kalender tetap — ikut aturan "second Sunday in
 * March" / "first Sunday in November"). Implementasi ini reuse resolver
 * timezone Intl API bawaan JS engine, bukan kalkulasi tanggal manual.
 */

const NY_TIMEZONE = 'America/New_York';

export interface TimeEngineOutput {
  /** Echo dari input, dinormalisasi ke ISO8601 UTC. */
  utc_timestamp: string;
  /**
   * Wall-clock NY lokal, format "YYYY-MM-DDTHH:mm:ss" TANPA offset/Z.
   * Ini "floating local time" yang sengaja gak punya offset — nilainya
   * sudah final hasil konversi, offset udah gak relevan lagi dibaca ulang.
   * Buat dipakai konsumen (mis. Session Engine) yang perlu bandingin jam
   * NY terhadap window "HH:MM", parse substring [11:19] dari string ini.
   */
  ny_time: string;
  /** "YYYY-MM-DD" — kalender NY, bukan kalender UTC. */
  ny_date: string;
  is_dst: boolean;
}

export interface TimeEngineFailure {
  status: 'UNKNOWN';
  failure_reason: 'INVALID_SOURCE_TIMEZONE';
}

export type TimeEngineResult = TimeEngineOutput | TimeEngineFailure;

export function isTimeEngineFailure(
  result: TimeEngineResult
): result is TimeEngineFailure {
  return 'failure_reason' in result;
}

/**
 * ISO8601 dianggap valid input cuma kalau timezone-nya eksplisit:
 * diakhiri 'Z' (UTC) atau offset +HH:MM/-HH:MM. String tanpa itu
 * ("2026-07-24T14:30:00") ambigu — `new Date()` akan diam-diam
 * menafsirkannya sebagai local time runtime, bukan UTC, dan itu
 * persis kelas bug yang mau dicegah Engine ini.
 */
function hasExplicitTimezone(timestamp: string): boolean {
  return /Z$|[+-]\d{2}:\d{2}$/.test(timestamp.trim());
}

function getOffsetMinutesAt(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TIMEZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);

  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  const match = tzName.match(/GMT([+-]\d+)(?::?(\d{2}))?/);

  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const sign = hours < 0 ? -1 : 1;

  return hours * 60 + sign * minutes;
}

/**
 * DST ditentukan dengan bandingin offset aktual candle ini vs offset
 * pertengahan Januari tahun yang sama (selalu standard time/EST, gak
 * pernah DST). Beda → sedang DST. Ini generic terhadap tahun berapa pun
 * (gak hardcode tanggal transisi US yang bisa beda tahun ke tahun),
 * karena reuse resolver IANA tz yang sama dengan konversi utamanya —
 * satu sumber kebenaran, konsisten sama prinsip di spec.
 */
function resolveIsDST(date: Date): boolean {
  const currentOffset = getOffsetMinutesAt(date);
  const referenceStandardOffset = getOffsetMinutesAt(
    new Date(Date.UTC(date.getUTCFullYear(), 0, 15))
  );
  return currentOffset !== referenceStandardOffset;
}

/**
 * Core definition Engine C: konversi timestamp UTC ke waktu NY.
 */
export function resolveNYTime(utcTimestamp: string): TimeEngineResult {
  if (!hasExplicitTimezone(utcTimestamp)) {
    return { status: 'UNKNOWN', failure_reason: 'INVALID_SOURCE_TIMEZONE' };
  }

  const inputDate = new Date(utcTimestamp);

  if (isNaN(inputDate.getTime())) {
    return { status: 'UNKNOWN', failure_reason: 'INVALID_SOURCE_TIMEZONE' };
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(inputDate);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const ny_date = `${get('year')}-${get('month')}-${get('day')}`;
  const ny_time = `${ny_date}T${get('hour')}:${get('minute')}:${get('second')}`;

  return {
    utc_timestamp: inputDate.toISOString(),
    ny_time,
    ny_date,
    is_dst: resolveIsDST(inputDate),
  };
}
