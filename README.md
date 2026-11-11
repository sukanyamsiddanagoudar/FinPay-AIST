# FinPay – Campus Digital Wallet and Cashback System

FinPay is a campus digital wallet application built using **Node.js, Express, MySQL, HTML, CSS, and JavaScript**. Students can create an account, open a wallet, add money, make payments at campus merchants, earn cashback, and view their transaction history.

## Main features

- Student registration and login with password hashing
- JWT-based authentication for protected API routes
- Create a wallet and select a wallet tier: BASIC, PRIME, or PREMIUM
- Add money to the wallet (top-ups do not earn cashback)
- Make payments at seeded campus merchants
- Cashback calculation based on merchant category and wallet tier
- Monthly cashback caps applied separately for each category
- Transaction history and monthly cashback summary
- Duplicate-payment protection using idempotency keys
- Balance validation to prevent overdrafts
- Database transactions with commit/rollback handling
- Responsive single-page frontend served by Express

## Technology stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express |
| Database | MySQL 8.0.16 or newer |
| Frontend | HTML, CSS, JavaScript |
| Authentication | JSON Web Tokens (JWT), bcryptjs |
| Database driver | mysql2 |
| Tests | Node.js built-in test runner |

## Requirements

Install the following before running the application:

- Node.js 18 or newer
- MySQL 8.0.16 or newer
- MySQL Workbench (recommended, for running the SQL script)
- A web browser

Check Node.js and npm:

```cmd
node -v
npm -v
```

## Setup and run on Windows

### 1. Extract and open the project

Extract the ZIP file. Open the `FinPay-NodeJS` folder in VS Code.

Open **Terminal → New Terminal**. Make sure the terminal is inside the folder containing `server.js` and `package.json`.

### 2. Create the MySQL database

1. Open MySQL Workbench and connect to your local MySQL server.
2. Select **File → Open SQL Script**.
3. Open `database/schema.sql` from this project.
4. Click the lightning-bolt **Execute** button.
5. Verify the database and tables by running:

```sql
USE finpay_db;
SHOW TABLES;
SELECT * FROM wallet_tier;
SELECT * FROM cashback_rule;
SELECT * FROM merchant;
```

The script creates the `finpay_db` database, required tables, cashback rules, wallet tiers, and sample merchants. It is safe to run again; it uses `IF NOT EXISTS` and `INSERT IGNORE`.

### 3. Create the environment file

In the VS Code terminal, run:

```cmd
copy .env.example .env
```

Open `.env` and enter the MySQL password you use for your local MySQL installation. Example:

```env
PORT=5050
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=finpay_db
JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRES_IN=2h
MONTH_TZ_OFFSET_MINUTES=330
```

Replace `your_mysql_password` with your actual MySQL password. Do not share or upload your `.env` file.

### 4. Install dependencies

Run this command in the project folder:

```cmd
npm install
```

### 5. Start the application

```cmd
npm start
```

When the server starts successfully, the terminal displays:

```text
FinPay running at http://localhost:5050
```

Keep the terminal open while using the application. Press `Ctrl + C` to stop the server.

### 6. Open the application

Open the following URL in your browser:

- Application: http://localhost:5050
- Database health check: http://localhost:5050/api/health

The health endpoint should return a response similar to:

```json
{"status":"ok","database":"connected"}
```

Register a student account through the application, log in, open a wallet, and try adding money and making a payment.

## Cashback example

For the BASIC wallet tier, the seeded Campus Canteen merchant has a 2% cashback rate and a monthly cap of ₹50.

| Action | Amount | Cashback / result |
|---|---:|---:|
| Add money to wallet | ₹5,000 | ₹0.00 |
| Pay at Campus Canteen | ₹2,400 | ₹48.00 |
| Pay again at Campus Canteen | ₹200 | ₹2.00 (only ₹2 remains before the cap) |
| Pay again at Campus Canteen | ₹100 | ₹0.00 (monthly cap reached) |
| Pay at Campus Stationery | ₹100 | ₹1.00 (separate category cap) |

Cashback is credited to the wallet balance after a successful purchase. A payment is rejected if the wallet does not have enough balance.

## Run automated tests

The project includes 34 automated tests for cashback calculations, monthly caps, wallet payments, duplicate requests, concurrent requests, validation, and rollback behaviour.

Run:

```cmd
npm test
```

The tests use an in-memory database stand-in and do not require a running MySQL server.

## Project structure

```text
FinPay-NodeJS/
├── database/
│   └── schema.sql
├── docs/
│   └── DESIGN_MAPPING.md
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── config/
│   │   └── db.js
│   ├── middleware/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── container.js
│   └── errors.js
├── tests/
│   ├── helpers/
│   ├── cashback.test.js
│   └── payment.test.js
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── server.js
```

## Important security and submission notes

- `.env` contains local database credentials and must never be committed to GitHub.
- The `.gitignore` file excludes `.env`, `node_modules`, and log files.
- Commit `.env.example` so another person can see which environment variables are required.
- The default JWT secret shown in `.env.example` is a placeholder. Set a strong private value in your local `.env`.
- This project is intended for academic demonstration and local development. Review security, deployment, and payment-provider integration requirements before using it with real money.

For implementation decisions and the mapping between the design record and source code, see `docs/DESIGN_MAPPING.md`.
