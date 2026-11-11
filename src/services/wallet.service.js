const { AppError } = require("../errors");
const { monthlyCapPaise } = require("./cashback.service");
const { monthBounds } = require("../utils/month");

function createWalletService({ db, walletRepo, transactionRepo, reference, now = () => new Date(), monthOffsetMinutes = 330 }) {
  const publicWallet = (w) => ({ tier: w.tier, balance_paise: Number(w.balance_paise) });

  async function getWallet(studentId) {
    const w = await walletRepo.findByStudentId(db, studentId);
    return w ? publicWallet(w) : null; // null = student has not opened a wallet yet (STUDENT 1 : 0..1 WALLET)
  }

  async function openWallet(studentId, tier = "BASIC") {
    const tables = await reference.getTables();
    if (!Object.hasOwn(tables.tiers, tier)) throw new AppError(422, "UNKNOWN_TIER", "Unknown wallet tier.");
    if (await walletRepo.findByStudentId(db, studentId)) throw new AppError(409, "WALLET_EXISTS", "You already have a wallet.");
    try {
      await walletRepo.create(db, studentId, tier);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "WALLET_EXISTS", "You already have a wallet.");
      throw err;
    }
    return getWallet(studentId);
  }

  async function changeTier(studentId, tier) {
    const tables = await reference.getTables();
    if (!Object.hasOwn(tables.tiers, tier)) throw new AppError(422, "UNKNOWN_TIER", "Unknown wallet tier.");
    const w = await walletRepo.findByStudentId(db, studentId);
    if (!w) throw new AppError(404, "NO_WALLET", "Open your wallet first.");
    await walletRepo.updateTier(db, w.wallet_id, tier);
    return getWallet(studentId);
  }

  // Month-to-date cashback used vs. cap, per category. Derived from transactions - nothing stored.
  async function cashbackSummary(studentId) {
    const w = await walletRepo.findByStudentId(db, studentId);
    if (!w) throw new AppError(404, "NO_WALLET", "Open your wallet first.");
    const tables = await reference.getTables();
    const { start, end } = monthBounds(now(), monthOffsetMinutes);
    const earnedRows = await transactionRepo.sumCashbackByCategory(db, w.wallet_id, start, end);
    const earnedBy = Object.fromEntries(earnedRows.map((r) => [r.category, r.earned]));
    const capMult = tables.tiers[w.tier].capMultX10;
    const categories = Object.entries(tables.rates).map(([category, rule]) => {
      const cap = monthlyCapPaise(rule.baseMonthlyCapPaise, capMult);
      const earned = earnedBy[category] || 0;
      return { category, earned_paise: earned, cap_paise: cap, remaining_paise: Math.max(0, cap - earned) };
    });
    return { month_start: start, month_end: end, categories };
  }

  async function listTransactions(studentId, limit, offset) {
    const w = await walletRepo.findByStudentId(db, studentId);
    if (!w) throw new AppError(404, "NO_WALLET", "Open your wallet first.");
    const rows = await transactionRepo.listForWallet(db, w.wallet_id, limit, offset);
    // Only the fields the screen needs - no wallet id, no idempotency key.
    return rows.map((r) => ({
      transaction_id: Number(r.transaction_id), merchant_name: r.merchant_name, category: r.category,
      amount_paise: Number(r.amount_paise), cashback_paise: Number(r.cashback_paise), created_at: r.created_at,
    }));
  }

  return { getWallet, openWallet, changeTier, cashbackSummary, listTransactions };
}
module.exports = { createWalletService };
