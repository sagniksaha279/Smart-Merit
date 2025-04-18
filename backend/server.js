require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Database connection with pooling
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test DB Connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error("❌ DB connection failed:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SmartMerit DB");
    connection.release();
  }
});

// Helper function for database queries
const query = (sql, values) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, values, (err, results) => {
      if (err) {
        console.error("Database error:", err);
        return reject(err);
      }
      resolve(results);
    });
  });
};


// ----REGISTER PORTAL----
app.post("/student", async (req, res) => {
  try {
    const { studentName, studentPassword, studentRoll, schoolName } = req.body;
    if (!studentName || !studentPassword || !studentRoll) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const results = await query(
      "SELECT * FROM students WHERE name = ? AND password = ? AND rollNumber = ? AND schoolName = ?",
      [studentName, studentPassword, studentRoll, schoolName]
    );

    if (results.length > 0) {
      res.json({ success: true, message: "Student login successful", data: results[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid student credentials" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error", error: err.message });
  }
});

app.post("/teacher", async (req, res) => {
  try {
    const { teacherName, teacherPassword, teacherBatch, teacherSchool } = req.body;
    const results = await query(
      "SELECT * FROM teachers WHERE name = ? AND password = ? AND batchId = ? schoolName = ?",
      [teacherName, teacherPassword, teacherBatch, teacherSchool]
    );

    if (results.length > 0) {
      res.json({ success: true, message: "Teacher login successful", data: results[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid teacher credentials" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error", error: err.message });
  }
});

app.post("/school", async (req, res) => {
  try {
    const { schoolName, schoolPassword, schoolId } = req.body;
    const results = await query("SELECT * FROM schools WHERE schoolName = ? AND password = ? AND schoolId = ?", [schoolName, schoolPassword, schoolId]);
    if (results.length > 0) {
      res.json({ success: true, message: "School login successful", data: results[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid school credentials" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error", error: err.message });
  }
});

//-------------TEACHER PORTAL------------
app.post("/upload-marks", async (req, res) => {
  try {
    const { studentRoll, subject, marks, behaviour, attendance, schoolName } = req.body;
    await query(`INSERT INTO performance (rollNumber, subject, marks, behaviour, attendance, schoolName)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE marks = VALUES(marks), behaviour = VALUES(behaviour), attendance = VALUES(attendance)`,
                [studentRoll, subject, marks, behaviour, attendance, schoolName]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error uploading marks", error: err.message });
  }
});

app.post("/daily-attendance", async (req, res) => {
  try {
    const { studentRoll, date, subject, schoolName } = req.body;
    const existing = await query("SELECT * FROM attendance_log WHERE studentRoll = ? AND subject = ? AND date = ? AND schoolName = ?",
      [studentRoll, subject, date, schoolName]);

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Attendance already recorded" });
    }

    await query("INSERT INTO attendance_log (studentRoll, subject, date, schoolName) VALUES (?, ?, ?, ?)", [studentRoll, subject, date, schoolName]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error recording attendance", error: err.message });
  }
});

app.post("/delete-attendance", async (req, res) => {
  try {
    const { date, studentRoll, subject, schoolName } = req.body;
    const result = await query("DELETE FROM attendance_log WHERE date = ? AND studentRoll = ? AND subject = ? AND schoolName = ?",
      [date, studentRoll, subject, schoolName]);
    res.json({ success: result.affectedRows > 0 });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/add-student", async (req, res) => {
  const { name, rollNumber, password, section, class: studentClass, schoolName } = req.body;
  try {
    await query("INSERT INTO students (name, rollNumber, password, section, class, schoolName) VALUES (?, ?, ?, ?, ?, ?)",
      [name, rollNumber, password, section, studentClass, schoolName]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/delete-student", async (req, res) => {
  try {
    const { studentRoll, studentName, schoolName } = req.body;
    const result = await query("DELETE FROM students WHERE rollNumber = ? AND name = ? AND schoolName = ?",
      [studentRoll, studentName, schoolName]);
    res.json({ success: result.affectedRows > 0 });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/attendance-summary", async (req, res) => {
  const { schoolName } = req.query;
  try {
    const results = await query("SELECT studentRoll, subject, COUNT(*) as total_days FROM attendance_log WHERE schoolName = ? GROUP BY studentRoll, subject", [schoolName]);
    res.json({ success: true, summary: results });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/students", async (req, res) => {
  const { schoolName } = req.query;
  try {
    const students = await query("SELECT name, rollNumber, section, class FROM students WHERE schoolName = ?", [schoolName]);
    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/class-toppers", async (req, res) => {
  const { className, schoolName } = req.query;
  try {
    let sql = `SELECT s.name, s.rollNumber, s.class, s.section, AVG(p.marks) as avg_marks, SUM(p.marks) as total_marks
               FROM students s JOIN performance p ON s.rollNumber = p.rollNumber
               WHERE s.schoolName = ? AND p.schoolName = ?`;
    const params = [schoolName, schoolName];

    if (className) {
      sql += ` AND s.class = ?`;
      params.push(className);
    }

    sql += ` GROUP BY s.rollNumber ORDER BY avg_marks DESC LIMIT 10`;

    const results = await query(sql, params);
    res.json({
      success: true,
      toppers: results.map(r => ({ ...r, avg_marks: parseFloat(r.avg_marks) || 0, total_marks: parseInt(r.total_marks) || 0 }))
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/all-performance", async (req, res) => {
  const { schoolName } = req.query;
  try {
    const results = await query(
      `SELECT subject, AVG(marks) as avg_marks, AVG(attendance) as avg_attendance
       FROM performance WHERE schoolName = ? GROUP BY subject`,
      [schoolName]
    );
    res.json({
      success: true,
      subjects: results.map(r => r.subject),
      avgMarks: results.map(r => parseFloat(r.avg_marks)),
      avgAttendance: results.map(r => parseFloat(r.avg_attendance))
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// --------------SCHOOL PORTAL---------------
app.post("/add-teacher", async (req, res) => {
  const { name, password, subject, batchId, schoolName } = req.body;
  if (!name || !password || !subject || !batchId || !schoolName) {
    return res.status(400).json({ success: false, message: "All fields are required" });
  }
  try {
    await query("INSERT INTO teachers (name, password, subject, batchId, schoolName) VALUES (?, ?, ?, ?, ?)", [name, password, subject, batchId, schoolName]);
    res.json({ success: true, message: "Teacher added" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to add teacher" });
  }
});

app.post("/delete-teacher", async (req, res) => {
  const { name, batchId, schoolName } = req.body;
  try {
    const result = await query("DELETE FROM teachers WHERE name = ? AND batchId = ? AND schoolName = ?", [name, batchId, schoolName]);
    res.json({ success: result.affectedRows > 0 });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/teachers", async (req, res) => {
  try {
    const results = await query("SELECT name, subject, batchId, schoolName FROM teachers");
    res.json({ success: true, teachers: results });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching teachers" });
  }
});

app.get("/student-count", async (req, res) => {
  const { schoolName } = req.query;
  try {
    const results = await query("SELECT name, class FROM students WHERE schoolName = ? ORDER BY class ASC", [schoolName]);
    const grouped = {};
    results.forEach(student => {
      if (!grouped[student.class]) grouped[student.class] = { count: 0, students: [] };
      grouped[student.class].count++;
      grouped[student.class].students.push(student.name);
    });
    res.json({ success: true, classes: grouped });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/performance-by-class", async (req, res) => {
  const { schoolName } = req.query;
  try {
    const queryStr = `SELECT s.class AS className, COUNT(s.rollNumber) AS studentCount, t.name AS teacherName, t.subject FROM students 
    s LEFT JOIN teachers t ON s.class = t.batchId AND s.schoolName = t.schoolName WHERE s.schoolName = ? GROUP BY s.class, t.name, t.subject ORDER BY s.class ASC`;
    const results = await query(queryStr, [schoolName]);
    res.json({ success: true, performance: results });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/teacher-performance", async (req, res) => {
  const { schoolName } = req.query;
  try {
    const queryStr = `SELECT t.name, t.subject, t.batchId, COUNT(s.rollNumber) AS studentCount FROM teachers t LEFT JOIN students s ON s.class = t.batchId AND s.schoolName = t.schoolName WHERE t.schoolName = ? GROUP BY t.name, t.subject, t.batchId`;
    const results = await query(queryStr, [schoolName]);
    res.json({ success: true, teachers: results });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get("/teacher-attendance-report", async (req, res) => {
  const { schoolName } = req.query;
  try {
    const results = await query("SELECT name, date FROM teacher_attendance WHERE schoolName = ? ORDER BY date DESC", [schoolName]);
    res.json({ success: true, attendance: results });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/mark-teacher-attendance", async (req, res) => {
  const { name, date, schoolName } = req.body;
  try {
    await query("INSERT IGNORE INTO teacher_attendance (name, date, schoolName) VALUES (?, ?, ?)", [name, date, schoolName]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});


// Root Route
app.get("/", (req, res) => {
  res.send("📚 SmartMerit Backend is Running!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
