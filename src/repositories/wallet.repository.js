module.exports = {
  // forUpdate = true locks this wallet row until the transaction ends (stops double spend / cap overshoot).
  async findByStudentId(x, studentId, forUpdate = false) {
    const [rows] = await x.query(
      `SELECT wallet_id, student_id, tier, balance_paise FROM wallet WHERE student_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
      [studentId]);
    return rows[0] || null;
  },
  async create(x, studentId, tier) {
    const [r] = await x.query("INSERT INTO wallet (student_id, tier, balance_paise) VALUES (?, ?, 0)", [studentId, tier]);
    return r.insertId;
  },
  async updateBalance(x, walletId, balancePaise) {
    await x.query("UPDATE wallet SET balance_paise = ? WHERE wallet_id = ?", [balancePaise, walletId]);
  },
  async updateTier(x, walletId, tier) {
    await x.query("UPDATE wallet SET tier = ? WHERE wallet_id = ?", [tier, walletId]);
  },
};
