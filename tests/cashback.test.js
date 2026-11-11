const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCashback, monthlyCapPaise, applyMonthlyCap } = require("../src/services/cashback.service");
const { monthBounds } = require("../src/utils/month");
const { SEED_RATES, SEED_TIERS } = require("./helpers/fakes");

const calc = (a, c, t) => calculateCashback(a, c, t, SEED_RATES, SEED_TIERS);

// ---- the 12 edge cases from the Detailed Design Record ----
test("10000 CANTEEN BASIC = 200 (Rs100 x 2%)", () => assert.equal(calc(10000, "CANTEEN", "BASIC"), 200));
test("10000 CANTEEN PRIME = 300 (2% x 1.5)", () => assert.equal(calc(10000, "CANTEEN", "PRIME"), 300));
test("10000 CANTEEN PREMIUM = 400 (2% x 2.0)", () => assert.equal(calc(10000, "CANTEEN", "PREMIUM"), 400));
test("333 CANTEEN BASIC = 6 (6.66 floors, not rounds)", () => assert.equal(calc(333, "CANTEEN", "BASIC"), 6));
test("49 CANTEEN BASIC = 0 (below 1 paise)", () => assert.equal(calc(49, "CANTEEN", "BASIC"), 0));
test("50 CANTEEN BASIC = 1 (smallest earning amount)", () => assert.equal(calc(50, "CANTEEN", "BASIC"), 1));
test("10300 HOSTEL PRIME = 77 (single floor; two floors would give 76)", () => assert.equal(calc(10300, "HOSTEL", "PRIME"), 77));
test("10000 TOPUP any tier = 0", () => { for (const t of Object.keys(SEED_TIERS)) assert.equal(calc(10000, "TOPUP", t), 0); });
test("amount <= 0 -> InvalidAmount", () => {
  for (const a of [0, -5]) assert.throws(() => calc(a, "CANTEEN", "BASIC"), { code: "INVALID_AMOUNT" });
});
test("non-integer amount rejected (floating rupees not allowed)", () => {
  for (const a of [1.5, "100", null, NaN]) assert.throws(() => calc(a, "CANTEEN", "BASIC"), { code: "INVALID_AMOUNT" });
});
test("unknown category / tier", () => {
  assert.throws(() => calc(100, "MOVIES", "BASIC"), { code: "UNKNOWN_CATEGORY" });
  assert.throws(() => calc(100, "CANTEEN", "GOLD"), { code: "UNKNOWN_TIER" });
});
test("cap: earned 4900, raw 200, cap 5000 -> awarded 100", () => assert.equal(applyMonthlyCap(200, 5000, 4900), 100));
test("cap: earned >= cap -> awarded 0 (never negative)", () => {
  assert.equal(applyMonthlyCap(200, 5000, 5000), 0);
  assert.equal(applyMonthlyCap(200, 5000, 9000), 0);
});

// ---- extra checks ----
test("monthly cap scales with tier: CANTEEN 5000 -> 5000 / 7500 / 10000", () => {
  assert.equal(monthlyCapPaise(5000, 10), 5000);
  assert.equal(monthlyCapPaise(5000, 15), 7500);
  assert.equal(monthlyCapPaise(5000, 20), 10000);
});
test("large amount stays exact (64-bit safe)", () => assert.equal(calc(10000000, "TRANSPORT", "PREMIUM"), 600000));

test("month window uses the configured zone (IST): 18:30Z on 31 Oct is already November", () => {
  const { start, end } = monthBounds(new Date("2026-10-31T19:00:00Z"), 330);
  assert.equal(start.toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-11-30T18:30:00.000Z");
});
test("month window rolls over the year", () => {
  const { start, end } = monthBounds(new Date("2026-12-15T00:00:00Z"), 330);
  assert.equal(start.toISOString(), "2026-11-30T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-12-31T18:30:00.000Z");
});
