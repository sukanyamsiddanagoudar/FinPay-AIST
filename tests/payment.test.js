const test = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentService } = require("../src/services/payment.service");
const { makeWorld } = require("./helpers/fakes");

const svc = (w) => createPaymentService({ ...w, transactionRepo: w.transactionRepo, monthOffsetMinutes: 330 });
const pay = (s, o) => s.processPayment({ studentId: 10, merchantId: 1, amountPaise: 10000, idempotencyKey: "key-00000001", ...o });

test("purchase: debits amount, credits cashback, records transaction", async () => {
  const w = makeWorld({ balance: 50000 }); const r = await pay(svc(w), {});
  assert.equal(r.cashback_paise, 200);
  assert.equal(r.balance_paise, 50000 - 10000 + 200);
  assert.equal(w.state.wallet.balance_paise, 40200);
  assert.equal(w.state.txs.length, 1);
  assert.equal(r.duplicate, false);
});

test("tier changes the rate: PRIME gets 3% on Rs100 canteen", async () => {
  const w = makeWorld({ tier: "PRIME", balance: 50000 });
  assert.equal((await pay(svc(w), {})).cashback_paise, 300);
});

test("top-up adds the amount and earns no cashback", async () => {
  const w = makeWorld({ balance: 0 });
  const r = await pay(svc(w), { merchantId: 7, amountPaise: 100000 });
  assert.equal(r.balance_paise, 100000);
  assert.equal(r.cashback_paise, 0);
});

test("no overdraft: insufficient balance is rejected and nothing is written", async () => {
  const w = makeWorld({ balance: 5000 });
  await assert.rejects(pay(svc(w), {}), { code: "INSUFFICIENT_BALANCE" });
  assert.equal(w.state.txs.length, 0);
  assert.equal(w.state.wallet.balance_paise, 5000);
});

test("paying exactly the whole balance is allowed", async () => {
  const w = makeWorld({ balance: 10000 });
  const r = await pay(svc(w), {});
  assert.equal(r.balance_paise, 200); // 0 left + Rs2 cashback
});

test("monthly cap: earned 4800, raw 400 -> awarded only 200, flagged as capped", async () => {
  const w = makeWorld({ balance: 1000000 }); const s = svc(w);
  const first = await pay(s, { amountPaise: 240000, idempotencyKey: "key-00000001" });
  assert.equal(first.cashback_paise, 4800);
  const second = await pay(s, { amountPaise: 20000, idempotencyKey: "key-00000002" });
  assert.equal(second.cashback_paise, 200);
  assert.equal(second.cashback_capped, true);
  const third = await pay(s, { amountPaise: 10000, idempotencyKey: "key-00000003" });
  assert.equal(third.cashback_paise, 0);
});

test("cap is per category: a full CANTEEN cap does not block STATIONERY", async () => {
  const w = makeWorld({ balance: 1000000 }); const s = svc(w);
  await pay(s, { amountPaise: 250000, idempotencyKey: "key-00000001" }); // fills CANTEEN (5000)
  const r = await pay(s, { merchantId: 3, amountPaise: 10000, idempotencyKey: "key-00000002" });
  assert.equal(r.cashback_paise, 100);
});

test("cap resets in a new calendar month (IST)", async () => {
  const w = makeWorld({ balance: 1000000, now: new Date("2026-11-30T10:00:00Z") }); const s = svc(w);
  await pay(s, { amountPaise: 250000, idempotencyKey: "key-00000001" });
  w.state.clock = new Date("2026-11-30T19:00:00Z"); // 00:30 IST on 1 December
  const r = await pay(s, { amountPaise: 10000, idempotencyKey: "key-00000002" });
  assert.equal(r.cashback_paise, 200);
});

test("higher tier = higher cap: PRIME canteen cap is 7500", async () => {
  const w = makeWorld({ tier: "PRIME", balance: 5000000 }); const s = svc(w);
  const r = await pay(s, { amountPaise: 1000000, idempotencyKey: "key-00000001" }); // raw 30000 -> capped to 7500
  assert.equal(r.cashback_paise, 7500);
});

test("idempotency: same key twice charges ONCE and returns the original result", async () => {
  const w = makeWorld({ balance: 50000 }); const s = svc(w);
  const a = await pay(s, {}); const b = await pay(s, {});
  assert.equal(b.duplicate, true);
  assert.equal(b.transaction_id, a.transaction_id);
  assert.equal(w.state.txs.length, 1);
  assert.equal(w.state.wallet.balance_paise, 40200);
});

test("idempotency: same key with a different amount is refused", async () => {
  const w = makeWorld({ balance: 50000 }); const s = svc(w);
  await pay(s, {});
  await assert.rejects(pay(s, { amountPaise: 99999 }), { code: "IDEMPOTENCY_KEY_REUSED" });
});

test("two SIMULTANEOUS requests with one key still charge once (wallet lock)", async () => {
  const w = makeWorld({ balance: 50000 }); const s = svc(w);
  const [a, b] = await Promise.all([pay(s, {}), pay(s, {})]);
  assert.equal(w.state.txs.length, 1);
  assert.deepEqual([a.duplicate, b.duplicate].sort(), [false, true]);
  assert.equal(w.state.wallet.balance_paise, 40200);
});

test("simultaneous different payments cannot overshoot the cap or the balance", async () => {
  const w = makeWorld({ balance: 100000 }); const s = svc(w);
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) => pay(s, { amountPaise: 200000, idempotencyKey: `key-0000000${i}` })));
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 0); // Rs2000 each vs Rs1000 balance: all refused
  assert.equal(w.state.wallet.balance_paise, 100000);

  const w2 = makeWorld({ balance: 10000000 }); const s2 = svc(w2);
  await Promise.all(Array.from({ length: 6 }, (_, i) => pay(s2, { amountPaise: 200000, idempotencyKey: `key-1000000${i}` })));
  const total = w2.state.txs.reduce((t, x) => t + x.cashback_paise, 0);
  assert.equal(total, 5000); // never more than the BASIC canteen cap
});

test("a failure part-way rolls everything back", async () => {
  const w = makeWorld({ balance: 50000 });
  const broken = { ...w, walletRepo: { ...w.walletRepo, updateBalance: async () => { throw new Error("db down"); } } };
  await assert.rejects(pay(createPaymentService(broken), {}), /db down/);
  assert.equal(w.state.txs.length, 0);
  assert.equal(w.state.wallet.balance_paise, 50000);
});

test("validation: bad amount, merchant and key", async () => {
  const s = svc(makeWorld({ balance: 50000 }));
  await assert.rejects(pay(s, { amountPaise: 0 }), { code: "INVALID_AMOUNT" });
  await assert.rejects(pay(s, { amountPaise: 12.5 }), { code: "INVALID_AMOUNT" });
  await assert.rejects(pay(s, { amountPaise: "100" }), { code: "INVALID_AMOUNT" });
  await assert.rejects(pay(s, { amountPaise: 10000001 }), { code: "AMOUNT_TOO_LARGE" });
  await assert.rejects(pay(s, { merchantId: "1" }), { code: "INVALID_MERCHANT" });
  await assert.rejects(pay(s, { merchantId: 999 }), { code: "MERCHANT_NOT_FOUND" });
  await assert.rejects(pay(s, { idempotencyKey: "short" }), { code: "INVALID_IDEMPOTENCY_KEY" });
  await assert.rejects(pay(s, { idempotencyKey: undefined }), { code: "INVALID_IDEMPOTENCY_KEY" });
});

test("no wallet -> 404 NO_WALLET", async () => {
  await assert.rejects(pay(svc(makeWorld({ hasWallet: false })), {}), { code: "NO_WALLET" });
});

test("a student can only ever pay from THEIR OWN wallet (wallet comes from the student id)", async () => {
  const w = makeWorld({ balance: 50000 });
  await assert.rejects(pay(svc(w), { studentId: 99 }), { code: "NO_WALLET" });
  assert.equal(w.state.wallet.balance_paise, 50000);
});
