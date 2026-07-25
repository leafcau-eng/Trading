import type { Candle } from '../src/types';
import { SessionEngine } from '../src/sessionEngine';

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail: string) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition || process.env.VERBOSE) console.log(`       ${detail}`);
  condition ? pass++ : fail++;
}

function c(utcTimestamp: string, high: number, low: number): Candle {
  const mid = (high + low) / 2;
  return { timestamp: utcTimestamp, open: mid, close: mid, high, low };
}

// NY Januari 2026 = EST, UTC-5 (dipilih biar mudah dihitung manual, sama
// kayak kasus "Winter" di verify Engine C).
// NY 10:00 = UTC 15:00. NY 11:00 = UTC 16:00.

// =======================================================================
// 1. Window membership: candle sebelum window diabaikan total
// =======================================================================
{
  const engine = new SessionEngine([{ id: 'w1', start: '10:00', end: '11:00', timezone: 'America/New_York', active: true }]);
  const result = engine.ingestCandle(c('2026-01-15T14:59:00Z', 100, 90)); // NY 09:59, sebelum window
  check('Candle sebelum window -> gak ada perubahan', result.length === 0, `result=${JSON.stringify(result)}`);
}

// =======================================================================
// 2. Batas inklusif: candle TEPAT di start dan TEPAT di end masuk window
// =======================================================================
{
  const engine = new SessionEngine([{ id: 'w1', start: '10:00', end: '11:00', timezone: 'America/New_York', active: true }]);
  const atStart = engine.ingestCandle(c('2026-01-15T15:00:00Z', 100, 90)); // NY 10:00 persis
  check('Candle tepat di start -> masuk window (IN_PROGRESS)', atStart.length === 1 && atStart[0].status === 'IN_PROGRESS', `result=${JSON.stringify(atStart)}`);

  const atEnd = engine.ingestCandle(c('2026-01-15T16:00:00Z', 105, 95)); // NY 11:00 persis
  check('Candle tepat di end -> MASIH masuk window (inklusif), belum COMPLETE', atEnd.length === 1 && atEnd[0].status === 'IN_PROGRESS', `result=${JSON.stringify(atEnd)}`);
}

// =======================================================================
// 3. Running high/low + transisi ke COMPLETE begitu lewat end
// =======================================================================
{
  const engine = new SessionEngine([{ id: 'w1', start: '10:00', end: '11:00', timezone: 'America/New_York', active: true }]);
  engine.ingestCandle(c('2026-01-15T15:00:00Z', 100, 90)); // NY 10:00, high=100 low=90
  engine.ingestCandle(c('2026-01-15T15:30:00Z', 110, 85)); // NY 10:30, high=110(baru) low=85(baru)
  const third = engine.ingestCandle(c('2026-01-15T15:45:00Z', 95, 92)); // NY 10:45, dalam range lama, gak ubah high/low
  check('session_high = max sejauh ini (110)', third[0].session_high === 110, `high=${third[0].session_high}`);
  check('session_low = min sejauh ini (85)', third[0].session_low === 85, `low=${third[0].session_low}`);
  check('Masih IN_PROGRESS', third[0].status === 'IN_PROGRESS', `status=${third[0].status}`);

  check('getLastCompleteOccurrence null sebelum window selesai', engine.getLastCompleteOccurrence('w1') === null, 'sebelum complete');

  const afterEnd = engine.ingestCandle(c('2026-01-15T16:05:00Z', 200, 200)); // NY 11:05, LEWAT end -> trigger COMPLETE
  check('Lewat end -> transisi COMPLETE', afterEnd.length === 1 && afterEnd[0].status === 'COMPLETE', `result=${JSON.stringify(afterEnd)}`);
  check('Nilai high/low COMPLETE = yang terakumulasi (110/85), BUKAN kena candle setelah end (200)', afterEnd[0].session_high === 110 && afterEnd[0].session_low === 85, `high=${afterEnd[0].session_high}, low=${afterEnd[0].session_low}`);
  check(
    'Candle yang men-trigger COMPLETE (di luar window) TIDAK ikut jadi entry window baru',
    afterEnd.length === 1,
    'cuma 1 hasil (transisi COMPLETE), bukan window baru terbentuk dari candle 11:05'
  );

  const lastComplete = engine.getLastCompleteOccurrence('w1');
  check('getLastCompleteOccurrence sesudahnya terisi benar', lastComplete !== null && lastComplete.high === 110 && lastComplete.low === 85, `lastComplete=${JSON.stringify(lastComplete)}`);
}

// =======================================================================
// 4. Multi-window independen
// =======================================================================
{
  const engine = new SessionEngine([
    { id: 'morning', start: '10:00', end: '11:00', timezone: 'America/New_York', active: true },
    { id: 'afternoon', start: '14:00', end: '15:00', timezone: 'America/New_York', active: true },
  ]);
  const inMorning = engine.ingestCandle(c('2026-01-15T15:00:00Z', 100, 90)); // NY 10:00 -> morning doang
  check('Candle NY 10:00 cuma masuk window "morning"', inMorning.length === 1 && inMorning[0].session_window_id === 'morning', `result=${JSON.stringify(inMorning)}`);

  const inAfternoon = engine.ingestCandle(c('2026-01-15T19:30:00Z', 50, 40)); // NY 14:30 -> masuk "afternoon" DAN lewat end "morning" (masih IN_PROGRESS dari langkah sebelumnya) -> trigger COMPLETE morning juga, sah dua-duanya
  const afternoonEntry = inAfternoon.find((r) => r.session_window_id === 'afternoon');
  const morningEntry = inAfternoon.find((r) => r.session_window_id === 'morning');
  check('Candle NY 14:30 update window "afternoon" (IN_PROGRESS)', afternoonEntry?.status === 'IN_PROGRESS', `afternoonEntry=${JSON.stringify(afternoonEntry)}`);
  check('Candle NY 14:30 SEKALIGUS trigger COMPLETE "morning" (lewat end-nya, masih IN_PROGRESS dari sebelumnya)', morningEntry?.status === 'COMPLETE', `morningEntry=${JSON.stringify(morningEntry)}`);
}

// =======================================================================
// 5. Multi-hari independen + getLastCompleteOccurrence ambil yang PALING BARU
// =======================================================================
{
  const engine = new SessionEngine([{ id: 'w1', start: '10:00', end: '11:00', timezone: 'America/New_York', active: true }]);
  // Hari 1: high=100
  engine.ingestCandle(c('2026-01-15T15:00:00Z', 100, 90));
  engine.ingestCandle(c('2026-01-15T16:05:00Z', 200, 200)); // trigger complete hari 1
  const day1 = engine.getLastCompleteOccurrence('w1');
  check('Occurrence hari 1: high=100', day1?.high === 100, `day1=${JSON.stringify(day1)}`);

  // Hari 2: high=150 (beda dari hari 1, harus gak numpuk/reset)
  engine.ingestCandle(c('2026-01-16T15:00:00Z', 150, 140));
  const day2Progress = engine.getLastCompleteOccurrence('w1');
  check('Sebelum window hari 2 selesai, masih occurrence hari 1', day2Progress?.high === 100, `still=${JSON.stringify(day2Progress)}`);

  engine.ingestCandle(c('2026-01-16T16:05:00Z', 200, 200)); // trigger complete hari 2
  const day2 = engine.getLastCompleteOccurrence('w1');
  check('Setelah hari 2 selesai, occurrence ter-update ke hari 2 (high=150)', day2?.high === 150, `day2=${JSON.stringify(day2)}`);
}

// =======================================================================
// 6. Window inactive diabaikan total
// =======================================================================
{
  const engine = new SessionEngine([{ id: 'w1', start: '10:00', end: '11:00', timezone: 'America/New_York', active: false }]);
  const result = engine.ingestCandle(c('2026-01-15T15:00:00Z', 100, 90)); // NY 10:00, harusnya masuk kalau active
  check('Window inactive -> gak pernah ada perubahan', result.length === 0, `result=${JSON.stringify(result)}`);
  check('getLastCompleteOccurrence tetap null', engine.getLastCompleteOccurrence('w1') === null, 'null');
}

// =======================================================================
// 7. Timestamp invalid -> gak crash, gak dianggap masuk window manapun
// =======================================================================
{
  const engine = new SessionEngine([{ id: 'w1', start: '10:00', end: '11:00', timezone: 'America/New_York', active: true }]);
  const result = engine.ingestCandle(c('2026-01-15T15:00:00', 100, 90)); // tanpa Z/offset -> INVALID_SOURCE_TIMEZONE di Engine C
  check('Timestamp tanpa timezone eksplisit -> gak crash, 0 hasil', result.length === 0, `result=${JSON.stringify(result)}`);
}

console.log(`\n${pass}/${pass + fail} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
