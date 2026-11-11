// In-memory stand-ins for the repositories. withTransaction() here is SERIALISED (one at a time) to
// model the database wallet-row lock (SELECT ... FOR UPDATE), and it rolls back on error.
const SEED_RATES = {
  CANTEEN: { baseRateBps: 200, baseMonthlyCapPaise: 5000 },
  STATIONERY: { baseRateBps: 100, baseMonthlyCapPaise: 2000 },
  TRANSPORT: { baseRateBps: 300, baseMonthlyCapPaise: 10000 },
  HOSTEL: { baseRateBps: 50, baseMonthlyCapPaise: 20000 },
  ONLINE: { baseRateBps: 100, baseMonthlyCapPaise: 3000 },
  TOPUP: { baseRateBps: 0, baseMonthlyCapPaise: 0 },
};
const SEED_TIERS = {
  BASIC: { rateMultX10: 10, capMultX10: 10 },
  PRIME: { rateMultX10: 15, capMultX10: 15 },
  PREMIUM: { rateMultX10: 20, capMultX10: 20 },
};
const MERCHANTS = [
  { merchant_id: 1, merchant_name: "Campus Canteen", category: "CANTEEN" },
  { merchant_id: 3, merchant_name: "Campus Stationery", category: "STATIONERY" },
  { merchant_id: 5, merchant_name: "Hostel Mess Office", category: "HOSTEL" },
  { merchant_id: 7, merchant_name: "FinPay Wallet Top-up", category: "TOPUP" },
];

function makeWorld({ tier = "BASIC", balance = 0, hasWallet = true, now = new Date("2026-11-08T10:00:00Z") } = {}) {
  const state = {
    wallet: hasWallet ? { wallet_id: 1, student_id: 10, tier, balance_paise: balance } : null,
    txs: [],
    nextId: 1,
    clock: now,
  };
  let queue = Promise.resolve();

  const withTransaction = (fn) => {
    const run = queue.then(async () => {
      const snap = JSON.stringify({ w: state.wallet, t: state.txs, n: state.nextId });
      try {
        return await fn({});
      } catch (e) {
        const s = JSON.parse(snap, (k, v) => (k === "created_at" && v ? new Date(v) : v));
        state.wallet = s.w; state.txs = s.t; state.nextId = s.n;
        throw e;
      }
    });
    queue = run.catch(() => {});
    return run;
  };

  const walletRepo = {
    async findByStudentId(x, sid) { return state.wallet && state.wallet.student_id === sid ? { ...state.wallet } : null; },
    async updateBalance(x, id, b) { state.wallet.balance_paise = b; },
  };
  const joined = (t) => { const m = MERCHANTS.find((m) => m.merchant_id === t.merchant_id); return { ...t, merchant_name: m.merchant_name, category: m.category }; };
  const transactionRepo = {
    async findByIdempotencyKey(x, wid, key) { const t = state.txs.find((t) => t.wallet_id === wid && t.idempotency_key === key); return t ? joined(t) : null; },
    async insert(x, tx) {
      if (state.txs.some((t) => t.wallet_id === tx.walletId && t.idempotency_key === tx.idempotencyKey)) { const e = new Error("dup"); e.code = "ER_DUP_ENTRY"; throw e; }
      const id = state.nextId++;
      state.txs.push({ transaction_id: id, wallet_id: tx.walletId, merchant_id: tx.merchantId, idempotency_key: tx.idempotencyKey, amount_paise: tx.amountPaise, cashback_paise: tx.cashbackPaise, created_at: tx.createdAt });
      return id;
    },
    async sumCashbackForCategory(x, wid, category, start, end) {
      return state.txs.filter((t) => t.wallet_id === wid && joined(t).category === category && t.created_at >= start && t.created_at < end)
        .reduce((s, t) => s + t.cashback_paise, 0);
    },
  };
  const referenceRepo = { async findMerchant(x, id) { return MERCHANTS.find((m) => m.merchant_id === id) || null; } };
  const reference = { async getTables() { return { rates: SEED_RATES, tiers: SEED_TIERS }; } };
  return { state, withTransaction, walletRepo, transactionRepo, referenceRepo, reference, now: () => state.clock };
}

module.exports = { makeWorld, SEED_RATES, SEED_TIERS };
