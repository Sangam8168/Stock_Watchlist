import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, fmtMoney } from './currency.ts';

const rates = { USD: 1, INR: 96, EUR: 0.92, GBP: 0.78 };

test('same currency is returned untouched', () => {
  assert.equal(convert(100, 'USD', rates, 'USD'), 100);
});

test('converts from the base currency', () => {
  assert.equal(convert(100, 'INR', rates), 9600);
  assert.equal(convert(100, 'EUR', rates), 92);
});

test('cross-rates go via the base, not by multiplying blindly', () => {
  // 100 GBP -> USD -> INR
  const v = convert(100, 'INR', rates, 'GBP')!;
  assert.ok(Math.abs(v - (100 / 0.78) * 96) < 0.001);
});

test('an unknown source currency returns null rather than a wrong number', () => {
  // A listing quoted in JPY must never be shown as if it were dollars.
  assert.equal(convert(100, 'INR', rates, 'JPY'), null);
  assert.equal(convert(100, 'JPY', rates, 'USD'), null);
});

test('non-numeric input is safe', () => {
  for (const bad of [null, undefined, NaN, Infinity]) {
    assert.equal(convert(bad as number, 'INR', rates), null);
  }
});

test('missing rates fail closed', () => {
  assert.equal(convert(100, 'INR', { USD: 1 }), null, 'no INR rate = no guess');
});

test('fmtMoney abbreviates large figures and keeps the right symbol', () => {
  assert.equal(fmtMoney(2.5e12, 'USD'), '$2.50T');
  assert.equal(fmtMoney(3.2e9, 'INR'), '₹3.20B');
  assert.equal(fmtMoney(1234.5, 'GBP'), '£1,234.50');
  assert.equal(fmtMoney(null, 'USD'), '—');
  assert.equal(fmtMoney(NaN, 'USD'), '—');
});

test('negative amounts abbreviate correctly', () => {
  assert.equal(fmtMoney(-2.5e9, 'USD'), '$-2.50B');
});
