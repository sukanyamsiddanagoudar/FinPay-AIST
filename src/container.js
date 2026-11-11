// Composition root: builds each layer once and wires them together (router -> service -> repository).
const { pool, withTransaction } = require("./config/db");
const studentRepo = require("./repositories/student.repository");
const walletRepo = require("./repositories/wallet.repository");
const transactionRepo = require("./repositories/transaction.repository");
const referenceRepo = require("./repositories/reference.repository");
const { createReferenceService } = require("./services/reference.service");
const { createPaymentService } = require("./services/payment.service");
const { createWalletService } = require("./services/wallet.service");
const { createAuthService } = require("./services/auth.service");

const monthOffsetMinutes = Number(process.env.MONTH_TZ_OFFSET_MINUTES ?? 330);

const reference = createReferenceService({ referenceRepo, executor: pool });
module.exports = {
  pool,
  reference,
  authService: createAuthService({ withTransaction, db: pool, studentRepo }),
  walletService: createWalletService({ db: pool, walletRepo, transactionRepo, reference, monthOffsetMinutes }),
  paymentService: createPaymentService({ withTransaction, walletRepo, transactionRepo, referenceRepo, reference, monthOffsetMinutes }),
};
