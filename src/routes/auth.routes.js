const router = require("express").Router();
const { authService } = require("../container");
const { wrap } = require("../middleware/errors");

router.post("/register", wrap(async (req, res) => res.status(201).json(await authService.register(req.body || {}))));
router.post("/login", wrap(async (req, res) => res.json(await authService.login(req.body || {}))));

module.exports = router;
