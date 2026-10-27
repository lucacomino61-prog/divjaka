/**
 * Europe/Tirane start times for the bank-transfer check (core round, 2026-10-27): service starts
 * are read at the real offset of their date (+02:00 late March to late October, +01:00 otherwise),
 * on the server (orders.ts assertBankInTime) and on the checkout page alike — both call
 * firstStartBefore from src/lib/time.ts, imported here directly (Node strips the types).
 * No server needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiraneOffset, tiraneMs, serviceStartMs, firstStartBefore } from '../../src/lib/time.ts';

const at = (iso) => Date.parse(iso);
const H72 = 72 * 3600_000;

test('a start in summer time is read at +02:00, in winter at +01:00', () => {
  assert.equal(tiraneMs('2026-10-20T10:00'), at('2026-10-20T08:00:00Z'));
  assert.equal(tiraneMs('2026-11-20T10:00'), at('2026-11-20T09:00:00Z'));
  // a date alone = noon of that day (a stay's first night)
  assert.equal(tiraneMs('2026-07-01'), at('2026-07-01T10:00:00Z'));
  assert.equal(tiraneMs('2026-12-01'), at('2026-12-01T11:00:00Z'));
  assert.equal(tiraneMs('not a date'), null);
  assert.equal(serviceStartMs({ kind: 'experience', starts_at: '2026-10-20T10:00' }), at('2026-10-20T08:00:00Z'));
  assert.equal(serviceStartMs({ kind: 'room', date_from: '2026-11-20' }), at('2026-11-20T11:00:00Z'));
  assert.equal(serviceStartMs({ kind: 'goods' }), null);
});

test('offsets around the switches: the repeated autumn hour, the spring gap', () => {
  assert.equal(tiraneOffset('2026-10-24T10:00'), '+02:00');
  assert.equal(tiraneOffset('2026-10-25T01:30'), '+02:00');
  assert.equal(tiraneOffset('2026-10-25T02:30'), '+02:00'); // happens twice: the first (earlier) one
  assert.equal(tiraneOffset('2026-10-25T03:30'), '+01:00');
  assert.equal(tiraneOffset('2027-03-28T01:30'), '+01:00');
  assert.equal(tiraneOffset('2027-03-28T02:30'), '+01:00'); // never happens
  assert.equal(tiraneOffset('2027-03-28T03:30'), '+02:00');
  assert.equal(tiraneOffset('2026-10-20'), '+02:00');
  assert.equal(tiraneOffset('garbage'), '+01:00');
});

test('bank cutoff (72 h unpaid hold) on the summer side of the 2026-10-25 switch', () => {
  // Session 2026-10-24 10:00 Tirana = 08:00Z. The hold may end exactly at the start, not later.
  const line = { kind: 'experience', starts_at: '2026-10-24T10:00', key: 's' };
  assert.equal(firstStartBefore([line], at('2026-10-21T08:00:00Z') + H72), undefined, 'exactly 72 h ahead: bank allowed');
  assert.equal(firstStartBefore([line], at('2026-10-21T08:00:01Z') + H72)?.l, line, 'one second later: refused');
  // The old fixed +01:00 put this start at 09:00Z and still allowed bank here, half an hour after
  // the hold would end with the session already running.
  assert.equal(firstStartBefore([line], at('2026-10-21T08:30:00Z') + H72)?.l, line);
});

test('bank cutoff (72 h unpaid hold) on the winter side of the 2026-10-25 switch', () => {
  // Session 2026-10-26 10:00 Tirana = 09:00Z; the 72 h before it cross the switch.
  const line = { kind: 'experience', starts_at: '2026-10-26T10:00', key: 's' };
  assert.equal(firstStartBefore([line], at('2026-10-23T09:00:00Z') + H72), undefined);
  assert.equal(firstStartBefore([line], at('2026-10-23T09:00:01Z') + H72)?.l, line);
  // A stay arriving on the switch day: noon 2026-10-25 is already +01:00 (11:00Z) …
  const stay = { kind: 'room', date_from: '2026-10-25', key: 'r' };
  assert.equal(firstStartBefore([stay], at('2026-10-22T11:00:00Z') + H72), undefined);
  assert.equal(firstStartBefore([stay], at('2026-10-22T11:00:01Z') + H72)?.l, stay);
  // … and the day before is still +02:00 (10:00Z).
  const before = { kind: 'room', date_from: '2026-10-24', key: 'r0' };
  assert.equal(firstStartBefore([before], at('2026-10-21T10:00:00Z') + H72), undefined);
  assert.equal(firstStartBefore([before], at('2026-10-21T10:00:01Z') + H72)?.l, before);
});

test('firstStartBefore picks the earliest dated line and skips undated ones', () => {
  const lines = [
    { kind: 'goods', key: 'g' },
    { kind: 'room', date_from: '2026-11-21', key: 'r' },
    { kind: 'experience', starts_at: '2026-11-20T10:00', key: 'e' },
  ];
  const soon = firstStartBefore(lines, at('2026-12-01T00:00:00Z'));
  assert.equal(soon.l.key, 'e');
  assert.equal(soon.at, at('2026-11-20T09:00:00Z'));
  assert.equal(firstStartBefore(lines, at('2026-11-20T09:00:00Z')), undefined);
});
