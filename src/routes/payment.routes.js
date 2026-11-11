const router = require("express").Router();
const requireAuth = require("../middleware/auth");
const { paymentService, walletService, reference } = require("../container");
const { wrap } = require("../middleware/errors");

// Public reference data (merchants, cashback rates, tiers) - nothing personal.
router.get("/meta", wrap(async (req, res) => res.json(await reference.getMeta())));

// Body: { merchant_id, amount_paise, idempotency_key }. There is deliberately NO wallet id here:
// the wallet is resolved on the server from the signed-in student.
router.post("/payments", requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  const result = await paymentService.processPayment({
    studentId: req.user.id,
    merchantId: b.merchant_id,
    amountPaise: b.amount_paise,
    idempotencyKey: b.idempotency_key,
  });
  res.status(result.duplicate ? 200 : 201).json(result);
}));

router.get("/transactions", requireAuth, wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  res.json({ transactions: await walletService.listTransactions(req.user.id, limit, offset) });
}));

module.exports = router;
