const { AppError } = require("../errors");
const { calculateCashback, monthlyCapPaise, applyMonthlyCap } = require("./cashback.service");
const { monthBounds } = require("../utils/month");

const MAX_AMOUNT_PAISE = 10000000; // Rs 1,00,000 per payment - guards against typos and overflow
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Design assumption AS5 (confirm before production):
//  - Top-up (category TOPUP) ADDS the amount to the balance.
//  - A purchase SUBTRACTS the amount; the awarded cashback is CREDITED to the balance.
//  - The balance may never go negative (no overdraft).
const CREDIT_CASHBACK_TO_BALANCE = true;

function createPaymentService({ withTransaction, walletRepo, transactionRepo, referenceRepo, reference, now = () => new Date(), monthOffsetMinutes = 330 }) {

  function validate({ merchantId, amountPaise, idempotencyKey }) {
    if (!Number.isInteger(merchantId) || merchantId <= 0) throw new AppError(422, "INVALID_MERCHANT", "Please choose a merchant.");
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new AppError(422, "INVALID_AMOUNT", "Amount must be a whole number of paise greater than 0.");
    if (amountPaise > MAX_AMOUNT_PAISE) throw new AppError(422, "AMOUNT_TOO_LARGE", "Amount is above the allowed maximum of Rs 1,00,000 per payment.");
    if (typeof idempotencyKey !== "string" || !KEY_PATTERN.test(idempotencyKey)) {
      throw new AppError(422, "INVALID_IDEMPOTENCY_KEY", "A unique request key (8-64 letters, digits, - or _) is required.");
    }
  }

  const shape = (tx, balancePaise, extra = {}) => ({
    transaction_id: Number(tx.transaction_id),
    merchant_id: tx.merchant_id,
    merchant_name: tx.merchant_name,
    category: tx.category,
    amount_paise: Number(tx.amount_paise),
    cashback_paise: Number(tx.cashback_paise),
    created_at: tx.created_at,
    balance_paise: balancePaise,
    ...extra,
  });

  // process_payment(): ONE atomic database transaction.
  // lock wallet -> idempotency check -> balance check -> cashback -> month-to-date sum -> cap -> insert -> update balance
  async function attempt({ studentId, merchantId, amountPaise, idempotencyKey }, tables) {
    return withTransaction(async (x) => {
      // 1. Wallet is found from the verified token's student id - NEVER from the request body.
      const wallet = await walletRepo.findByStudentId(x, studentId, true); // row lock
      if (!wallet) throw new AppError(404, "NO_WALLET", "Open your wallet first.");
      const balance = Number(wallet.balance_paise);

      // 2. Duplicate protection: same key for this wallet -> return the ORIGINAL result, change nothing.
      const existing = await transactionRepo.findByIdempotencyKey(x, wallet.wallet_id, idempotencyKey);
      if (existing) {
        if (existing.merchant_id !== merchantId || Number(existing.amount_paise) !== amountPaise) {
          throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "This request key was already used for a different payment.");
        }
        return shape(existing, balance, { duplicate: true });
      }

      const merchant = await referenceRepo.findMerchant(x, merchantId);
      if (!merchant) throw new AppError(404, "MERCHANT_NOT_FOUND", "Merchant not found.");
      const isTopup = merchant.category === "TOPUP";

      // 3. No overdraft for purchases.
      if (!isTopup && balance < amountPaise) throw new AppError(409, "INSUFFICIENT_BALANCE", "Not enough balance for this payment.");

      // 4. Raw cashback (pure function), then the monthly cap.
      const raw = calculateCashback(amountPaise, merchant.category, wallet.tier, tables.rates, tables.tiers);
      let awarded = 0;
      if (raw > 0) {
        const { start, end } = monthBounds(now(), monthOffsetMinutes);
        const earned = await transactionRepo.sumCashbackForCategory(x, wallet.wallet_id, merchant.category, start, end);
        const cap = monthlyCapPaise(tables.rates[merchant.category].baseMonthlyCapPaise, tables.tiers[wallet.tier].capMultX10);
        awarded = applyMonthlyCap(raw, cap, earned);
      }

      // 5. Record the transaction and move the money.
      const createdAt = now();
      const transactionId = await transactionRepo.insert(x, { walletId: wallet.wallet_id, merchantId, idempotencyKey, amountPaise, cashbackPaise: awarded, createdAt });
      const newBalance = balance + (isTopup ? amountPaise : -amountPaise) + (CREDIT_CASHBACK_TO_BALANCE ? awarded : 0);
      await walletRepo.updateBalance(x, wallet.wallet_id, newBalance);

      return shape(
        { transaction_id: transactionId, merchant_id: merchant.merchant_id, merchant_name: merchant.merchant_name, category: merchant.category, amount_paise: amountPaise, cashback_paise: awarded, created_at: createdAt },
        newBalance,
        { duplicate: false, cashback_capped: awarded < raw }
      );
    });
  }

  async function processPayment(input) {
    validate(input);
    const tables = await reference.getTables();
    try {
      return await attempt(input, tables);
    } catch (err) {
      // The UNIQUE constraint is the last line of defence; a second pass finds the stored row and returns it.
      if (err && err.code === "ER_DUP_ENTRY") return attempt(input, tables);
      throw err;
    }
  }

  return { processPayment };
}

module.exports = { createPaymentService, MAX_AMOUNT_PAISE, CREDIT_CASHBACK_TO_BALANCE };
