// payment_transaction is insert-only: this repository has no update or delete.
const BASE = `SELECT t.transaction_id, t.merchant_id, t.amount_paise, t.cashback_paise, t.created_at,
                     m.merchant_name, m.category
                FROM payment_transaction t JOIN merchant m ON m.merchant_id = t.merchant_id`;

module.exports = {
  async findByIdempotencyKey(x, walletId, key) {
    const [rows] = await x.query(`${BASE} WHERE t.wallet_id = ? AND t.idempotency_key = ?`, [walletId, key]);
    return rows[0] || null;
  },
  async insert(x, tx) {
    const [r] = await x.query(
      `INSERT INTO payment_transaction (wallet_id, merchant_id, idempotency_key, amount_paise, cashback_paise, created_at)
       VALUES (?,?,?,?,?,?)`,
      [tx.walletId, tx.merchantId, tx.idempotencyKey, tx.amountPaise, tx.cashbackPaise, tx.createdAt]);
    return r.insertId;
  },
  // Month-to-date cashback for ONE category (derived, never stored). Window: start <= created_at < end.
  async sumCashbackForCategory(x, walletId, category, start, end) {
    const [rows] = await x.query(
      `SELECT COALESCE(SUM(t.cashback_paise), 0) AS earned
         FROM payment_transaction t JOIN merchant m ON m.merchant_id = t.merchant_id
        WHERE t.wallet_id = ? AND m.category = ? AND t.created_at >= ? AND t.created_at < ?`,
      [walletId, category, start, end]);
    return Number(rows[0].earned);
  },
  async sumCashbackByCategory(x, walletId, start, end) {
    const [rows] = await x.query(
      `SELECT m.category, COALESCE(SUM(t.cashback_paise), 0) AS earned
         FROM payment_transaction t JOIN merchant m ON m.merchant_id = t.merchant_id
        WHERE t.wallet_id = ? AND t.created_at >= ? AND t.created_at < ?
        GROUP BY m.category`, [walletId, start, end]);
    return rows.map((r) => ({ category: r.category, earned: Number(r.earned) }));
  },
  async listForWallet(x, walletId, limit, offset) {
    const [rows] = await x.query(
      `${BASE} WHERE t.wallet_id = ? ORDER BY t.created_at DESC, t.transaction_id DESC LIMIT ? OFFSET ?`,
      [walletId, limit, offset]);
    return rows;
  },
};
