// Holds the rate/tier tables in memory so calculate_cashback() never touches the database.
// Refreshed every 30 seconds, so edits to the rule tables are picked up without a restart.
const TTL_MS = 30000;

function createReferenceService({ referenceRepo, executor, now = () => Date.now() }) {
  let cache = null;
  let loadedAt = 0;

  async function getTables() {
    if (cache && now() - loadedAt < TTL_MS) return cache;
    const [rules, tiers] = await Promise.all([referenceRepo.listRules(executor), referenceRepo.listTiers(executor)]);
    cache = { rates: {}, tiers: {} };
    rules.forEach((r) => { cache.rates[r.category] = { baseRateBps: Number(r.base_rate_bps), baseMonthlyCapPaise: Number(r.base_monthly_cap_paise) }; });
    tiers.forEach((t) => { cache.tiers[t.tier] = { rateMultX10: Number(t.rate_mult_x10), capMultX10: Number(t.cap_mult_x10) }; });
    loadedAt = now();
    return cache;
  }

  async function getMeta() {
    const [merchants, rules, tiers] = await Promise.all([
      referenceRepo.listMerchants(executor), referenceRepo.listRules(executor), referenceRepo.listTiers(executor)]);
    return { merchants, rules, tiers };
  }

  return { getTables, getMeta };
}
module.exports = { createReferenceService };
