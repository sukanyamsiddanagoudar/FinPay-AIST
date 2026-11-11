const router = require("express").Router();
const requireAuth = require("../middleware/auth");
const { walletService } = require("../container");
const { wrap } = require("../middleware/errors");

router.use(requireAuth);
router.get("/", wrap(async (req, res) => res.json({ wallet: await walletService.getWallet(req.user.id) })));
router.post("/", wrap(async (req, res) => res.status(201).json({ wallet: await walletService.openWallet(req.user.id, (req.body || {}).tier) })));
router.put("/tier", wrap(async (req, res) => res.json({ wallet: await walletService.changeTier(req.user.id, (req.body || {}).tier) })));
router.get("/cashback-summary", wrap(async (req, res) => res.json(await walletService.cashbackSummary(req.user.id))));

module.exports = router;
