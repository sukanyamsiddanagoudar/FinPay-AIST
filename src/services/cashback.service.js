const { AppError } = require("../errors");

// 1 basis point = 0.01%  ->  BPS_SCALE = 10000. Multipliers are stored x10 (1.5x = 15).
const BPS_SCALE = 10000n;
const MULT_SCALE = 10n;
const DIVISOR = BPS_SCALE * MULT_SCALE; // 100000

// calculate_cashback(): PURE function - no database, no month-to-date total, no cap.
// rateTable: { CANTEEN: { baseRateBps, baseMonthlyCapPaise }, ... }
// tierTable: { BASIC: { rateMultX10, capMultX10 }, ... }
// Integer arithmetic only (BigInt = 64-bit safe) and ONE floor at the very end.
function calculateCashback(amountPaise, category, tier, rateTable, tierTable) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new AppError(422, "INVALID_AMOUNT", "Amount must be a whole number of paise greater than 0.");
  }
  if (!Object.hasOwn(rateTable, category)) throw new AppError(422, "UNKNOWN_CATEGORY", "Unknown merchant category.");
  if (!Object.hasOwn(tierTable, tier)) throw new AppError(422, "UNKNOWN_TIER", "Unknown wallet tier.");

  const rateBps = rateTable[category].baseRateBps;
  const multX10 = tierTable[tier].rateMultX10;
  if (rateBps === 0) return 0; // TOPUP: no cashback

  // BigInt division truncates, which equals floor for non-negative numbers.
  return Number((BigInt(amountPaise) * BigInt(rateBps) * BigInt(multX10)) / DIVISOR);
}

// cap_paise = base_monthly_cap_paise x cap_mult_x10 DIV 10
function monthlyCapPaise(baseMonthlyCapPaise, capMultX10) {
  return Number((BigInt(baseMonthlyCapPaise) * BigInt(capMultX10)) / MULT_SCALE);
}

// Applied by process_payment() AFTER calculateCashback(): awarded = MIN(raw, MAX(0, cap - earned))
function applyMonthlyCap(rawPaise, capPaise, earnedPaise) {
  const remaining = Math.max(0, capPaise - earnedPaise);
  return Math.min(rawPaise, remaining);
}

module.exports = { calculateCashback, monthlyCapPaise, applyMonthlyCap };
