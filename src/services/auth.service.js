const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { AppError } = require("../errors");

function createAuthService({ withTransaction, db, studentRepo }) {
  const secret = () => process.env.JWT_SECRET || "development_secret_change_me";
  const sign = (s) => jwt.sign({ id: s.student_id, name: s.student_name }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || "2h" });

  async function register({ name, email, password }) {
    name = String(name || "").trim();
    email = String(email || "").trim().toLowerCase();
    password = String(password || "");
    if (!name || name.length > 100) throw new AppError(422, "INVALID_NAME", "Please enter your name (up to 100 characters).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw new AppError(422, "INVALID_EMAIL", "Please enter a valid email address.");
    if (password.length < 8) throw new AppError(422, "WEAK_PASSWORD", "Password must contain at least 8 characters.");
    const hash = await bcrypt.hash(password, 10);
    try {
      const studentId = await withTransaction(async (x) => {
        const id = await studentRepo.createStudent(x, name);
        await studentRepo.createLogin(x, id, email, hash);
        return id;
      });
      const student = { student_id: studentId, student_name: name };
      return { token: sign(student), user: { id: studentId, name } };
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw new AppError(409, "EMAIL_EXISTS", "This email is already registered.");
      throw err;
    }
  }

  async function login({ email, password }) {
    email = String(email || "").trim().toLowerCase();
    const row = await studentRepo.findLoginByEmail(db, email);
    const ok = row && (await bcrypt.compare(String(password || ""), row.password_hash));
    if (!ok) throw new AppError(401, "BAD_CREDENTIALS", "Incorrect email or password.");
    return { token: sign(row), user: { id: row.student_id, name: row.student_name } };
  }

  return { register, login };
}
module.exports = { createAuthService };
