// Read-only reference data: tiers, cashback rules, merchants.
module.exports = {
  async listTiers(x) {
    const [rows] = await x.query("SELECT tier, rate_mult_x10, cap_mult_x10 FROM wallet_tier ORDER BY rate_mult_x10");
    return rows;
  },
  async listRules(x) {
    const [rows] = await x.query("SELECT category, base_rate_bps, base_monthly_cap_paise FROM cashback_rule ORDER BY category");
    return rows;
  },
  async listMerchants(x) {
    const [rows] = await x.query("SELECT merchant_id, merchant_name, category FROM merchant ORDER BY category, merchant_name");
    return rows;
  },
  async findMerchant(x, merchantId) {
    const [rows] = await x.query("SELECT merchant_id, merchant_name, category FROM merchant WHERE merchant_id = ?", [merchantId]);
    return rows[0] || null;
  },
};
