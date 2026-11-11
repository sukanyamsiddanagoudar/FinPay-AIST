# Design to implementation mapping

Source: *FinPay Lab 4 - Detailed Design Record (DDR)*, status APPROVED.

## Data design (Part A)

| DDR decision | Where it is implemented |
|---|---|
| Option A: RDBMS only | MySQL only. No file store, no search/vector store. |
| STUDENT keeps only StudentID, StudentName | `student` table |
| WALLET_TIER lookup (BASIC 10/10, PRIME 15/15, PREMIUM 20/20) | `wallet_tier`, seeded |
| CASHBACK_RULE (CANTEEN 200/5000, STATIONERY 100/2000, TRANSPORT 300/10000, HOSTEL 50/20000, ONLINE 100/3000, TOPUP 0/0) | `cashback_rule`, seeded |
| MERCHANT -> CASHBACK_RULE by Category | `merchant.category` FK |
| STUDENT 1 : 0..1 WALLET | `wallet.student_id` UNIQUE; wallet is opened on demand |
| No MONTHLY_CASHBACK table | Month-to-date cashback is `SUM(cashback_paise)` in `transaction.repository.js` |
| No direct TRANSACTION -> CASHBACK_RULE FK | Rule is reached via merchant -> category |
| UNIQUE(WalletID, IdempotencyKey) | `uq_wallet_idempotency` on `payment_transaction` |
| CHECK AmountPaise > 0, CashbackPaise >= 0, BalancePaise >= 0 | CHECK constraints in `schema.sql` (+ validated again in code) |
| Index (WalletID, CreatedAt) | `idx_wallet_created` |
| Physical name `payment_transaction` (AS6) | Used |
| Integer paise, basis points, multipliers x10 (AS3) | All money columns are BIGINT paise; the UI converts rupees to paise as text, never floating-point |

## Algorithm design (Part B)

| DDR decision | Where |
|---|---|
| `calculate_cashback()` is pure: single expression, one floor, 64-bit integers | `src/services/cashback.service.js` (BigInt) |
| Raises InvalidAmount / UnknownCategory / UnknownTier | Error codes `INVALID_AMOUNT`, `UNKNOWN_CATEGORY`, `UNKNOWN_TIER` |
| Rate/tier tables are in memory, no DB access inside the function | `reference.service.js` (refreshes every 30 s) |
| Cap applied by `process_payment()`: `cap = base x capMult DIV 10`, `awarded = MIN(raw, MAX(0, cap - earned))` | `monthlyCapPaise`, `applyMonthlyCap`, used in `payment.service.js` |
| Cap per wallet, category and calendar month in one time zone (AS4) | `src/utils/month.js`, zone from `MONTH_TZ_OFFSET_MINUTES` (default IST) |
| All 12 edge cases | `tests/cashback.test.js` |

## Security design (Part C)

| DDR decision | Where |
|---|---|
| JWT identity; WalletID resolved on the server, never from the request body | `middleware/auth.js`; `payments` route passes `req.user.id` only |
| Minimal responses, owner-only; no balances/amounts/keys in logs or errors | `wallet.service.js` returns only needed fields; `middleware/errors.js` logs the error **code** only |
| No column encryption | None (as decided) |
| UNIQUE idempotency + one atomic transaction that locks the wallet row | `payment.service.js` + `config/db.js`: `SELECT ... FOR UPDATE`, then idempotency check, balance check, cashback, month sum, cap, insert, balance update, commit/rollback |
| Insert-only history | `transaction.repository.js` has no update/delete |

Layers kept as in Lab 3: **router -> service -> repository -> model (tables)**.

## Assumptions resolved in code (AS5 - please confirm)

The design says top-up and cashback-credit behaviour must be confirmed before coding. The implementation chose, in `payment.service.js`:

1. A **top-up** (merchant category TOPUP) **adds** the amount to the balance. Cashback rate is 0, so none is earned.
2. A **purchase subtracts** the amount; the **awarded cashback is credited** to the balance (`CREDIT_CASHBACK_TO_BALANCE = true`). Set it to `false` if cashback should be tracked but not credited.
3. **No overdraft**: a purchase needs `balance >= amount` (checked before cashback is credited).

Because `amount_paise` and `cashback_paise` are both stored per transaction, changing these rules needs no schema change.

## Added beyond the DDR (needed to make a runnable app)

| Addition | Why | Where |
|---|---|---|
| `student_login` table (email + password hash) | The DDR reuses an *existing* JWT login that is not part of this project. This small table stands in for it so the app runs alone. It is outside the 3NF FinPay model. Replace it with your real auth when integrating. | `schema.sql`, `auth.service.js` |
| Choose / change tier in the UI | The DDR defines tiers but not how a wallet gets one. Marked "demo setting" in the UI; in production an administrator would assign it. | `wallet.service.js`, Settings page |
| Max Rs 1,00,000 per payment | Guards against typos and numeric overflow. | `MAX_AMOUNT_PAISE` in `payment.service.js` |
| Same idempotency key + different amount/merchant is refused (409) | A reused key for a different payment is a client bug. | `payment.service.js` |
| Merchant seed data | The DDR defines categories, not merchant names. | `schema.sql` |

## Testing note

`npm test` exercises the real service code against an in-memory database stand-in that serialises transactions to model the wallet row lock. It proves the logic (cap, idempotency, rollback, concurrent requests). It does not replace running the app once against real MySQL: use the walkthrough in the README.
