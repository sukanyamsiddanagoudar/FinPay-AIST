// Repository layer: SQL only, no business rules. `x` is the pool or a transaction connection.
module.exports = {
  async createStudent(x, name) {
    const [r] = await x.query("INSERT INTO student (student_name) VALUES (?)", [name]);
    return r.insertId;
  },
  async createLogin(x, studentId, email, passwordHash) {
    await x.query("INSERT INTO student_login (student_id, email, password_hash) VALUES (?,?,?)", [studentId, email, passwordHash]);
  },
  async findLoginByEmail(x, email) {
    const [rows] = await x.query(
      `SELECT s.student_id, s.student_name, l.password_hash
         FROM student_login l JOIN student s ON s.student_id = l.student_id WHERE l.email = ?`, [email]);
    return rows[0] || null;
  },
};
