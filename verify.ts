import { resolveNYTime, isTimeEngineFailure } from '../src/timeEngine';

type Case = {
  label: string;
  input: string;
  expect:
    | { kind: 'ok'; ny_time: string; ny_date: string; is_dst: boolean }
    | { kind: 'fail'; failure_reason: string };
};

// DST transitions untuk 2026: mulai second Sunday Maret (8 Mar, 2AM lokal -> 3AM),
// berakhir first Sunday November (1 Nov, 2AM lokal -> 1AM).
const cases: Case[] = [
  {
    label: 'Winter (Januari) — harus EST, UTC-5',
    input: '2026-01-15T17:00:00Z',
    expect: { kind: 'ok', ny_time: '2026-01-15T12:00:00', ny_date: '2026-01-15', is_dst: false },
  },
  {
    label: 'Summer (Juli, hari ini) — harus EDT, UTC-4',
    input: '2026-07-24T17:00:00Z',
    expect: { kind: 'ok', ny_time: '2026-07-24T13:00:00', ny_date: '2026-07-24', is_dst: true },
  },
  {
    label: 'Spring-forward boundary — 1 menit SEBELUM transisi (masih EST)',
    input: '2026-03-08T06:59:00Z',
    expect: { kind: 'ok', ny_time: '2026-03-08T01:59:00', ny_date: '2026-03-08', is_dst: false },
  },
  {
    label: 'Spring-forward boundary — TEPAT saat transisi (jadi EDT)',
    input: '2026-03-08T07:00:00Z',
    expect: { kind: 'ok', ny_time: '2026-03-08T03:00:00', ny_date: '2026-03-08', is_dst: true },
  },
  {
    label: 'Fall-back boundary — 1 menit SEBELUM transisi (masih EDT)',
    input: '2026-11-01T05:59:00Z',
    expect: { kind: 'ok', ny_time: '2026-11-01T01:59:00', ny_date: '2026-11-01', is_dst: true },
  },
  {
    label: 'Fall-back boundary — TEPAT saat transisi (jadi EST)',
    input: '2026-11-01T06:00:00Z',
    expect: { kind: 'ok', ny_time: '2026-11-01T01:00:00', ny_date: '2026-11-01', is_dst: false },
  },
  {
    label: 'Timestamp tanpa timezone eksplisit — harus ditolak',
    input: '2026-07-24T14:30:00',
    expect: { kind: 'fail', failure_reason: 'INVALID_SOURCE_TIMEZONE' },
  },
  {
    label: 'Timestamp dengan offset eksplisit non-UTC — harus diterima & dikonversi',
    input: '2026-07-24T09:00:00-08:00', // 17:00 UTC
    expect: { kind: 'ok', ny_time: '2026-07-24T13:00:00', ny_date: '2026-07-24', is_dst: true },
  },
  {
    label: 'String bukan tanggal valid — harus ditolak',
    input: '2026-13-45T99:99:99Z',
    expect: { kind: 'fail', failure_reason: 'INVALID_SOURCE_TIMEZONE' },
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const result = resolveNYTime(c.input);
  let ok = false;
  let detail = '';

  if (c.expect.kind === 'fail') {
    ok = isTimeEngineFailure(result) && result.failure_reason === c.expect.failure_reason;
    detail = isTimeEngineFailure(result)
      ? `failure_reason=${result.failure_reason}`
      : `got OK result instead of failure: ${JSON.stringify(result)}`;
  } else {
    if (!isTimeEngineFailure(result)) {
      ok =
        result.ny_time === c.expect.ny_time &&
        result.ny_date === c.expect.ny_date &&
        result.is_dst === c.expect.is_dst;
      detail = `ny_time=${result.ny_time} ny_date=${result.ny_date} is_dst=${result.is_dst}`;
    } else {
      detail = `got failure instead of OK: ${result.failure_reason}`;
    }
  }

  console.log(`${ok ? 'PASS' : 'FAIL'} — ${c.label}`);
  console.log(`       input: ${c.input}`);
  console.log(`       ${detail}`);
  if (!ok) {
    console.log(`       expected: ${JSON.stringify(c.expect)}`);
  }

  if (ok) pass++;
  else fail++;
}

console.log(`\n${pass}/${cases.length} passed.`);
if (fail > 0) {
  console.log(`${fail} FAILED.`);
  process.exit(1);
}
