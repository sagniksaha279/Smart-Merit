require("dotenv").config();
const express = require("express");
const mysql = require('mysql2/promise');
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require('path');
const OpenAI = require("openai");
const app = express();
const PORT = process.env.PORT || 3000;


app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors({
  origin: 'https://smartmerit.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', (req, res) => res.sendStatus(200));

//db connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  connectTimeout: 5000,
  acquireTimeout: 5000 
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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


app.post("/submit-feedback", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Feedback cannot be empty" });
    }

    // Add timeout to the query
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Database timeout")), 8000
    ));

    const queryPromise = query("INSERT INTO feedback (message) VALUES (?)", [message]);
    
    await Promise.race([queryPromise, timeoutPromise]);
    
    res.status(201).json({ message: "Thank you for your feedback!" });
    
  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ 
      error: err.message.includes("timeout") 
        ? "Operation took too long, please try again" 
        : "Failed to submit feedback"
    });
  }
});

//-------STUDENT PORTAL------------
app.get("/studentdetails", async (req, res) => {
  try {
    const { roll, schoolName } = req.query;
    
    if (!roll || !schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: "Roll number and school name are required" 
      });
    }

    const studentResult = await query(
      "SELECT * FROM students WHERE rollNumber = ? AND schoolName = ?",
      [roll, schoolName]
    );
    
    if (!studentResult || studentResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Student not found in the specified school" 
      });
    }
    
    const performanceResult = await query(
      "SELECT * FROM performance WHERE rollNumber = ? AND schoolName = ?",
      [roll, schoolName]
    );

    res.json({
      success: true,
      student: studentResult[0],
      performance: performanceResult
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Database error", 
      error: err.message 
    });
  }
});

app.post("/ai-feedback", async (req, res) => {
  try {
    const { name, rollNumber, performance, schoolName } = req.body;

    // Validate required fields
    if (!name || !rollNumber || !performance || !schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, rollNumber, performance data and schoolName are required" 
      });
    }

    // Prepare performance summary
    const subjectSummary = performance.map(p => 
      `${p.subject}: ${p.marks} marks, ${p.attendance}% attendance, behaviour: ${p.behaviour}`
    ).join("\n");

    const prompt = `Student Name: ${name}\nPerformance Summary:\n${subjectSummary}\n\nProvide a short, encouraging feedback with study suggestions if needed. Keep it friendly and under 100 words.`;

    // Check cache first
    const cacheQuery = "SELECT feedback FROM feedback_cache WHERE rollNumber = ? AND schoolName = ?";
    const cachedResults = await query(cacheQuery, [rollNumber, schoolName]);

    if (cachedResults.length > 0) {
      return res.json({ 
        success: true, 
        feedback: cachedResults[0].feedback 
      });
    }

    // Get AI feedback
    const gptResponse = await openai.chat.completions.create({ 
      model: "gpt-4",
      messages: [{ 
        role: "user", 
        content: prompt 
      }],
      max_tokens: 150
    });
    
    const feedback = gptResponse.choices[0].message.content;

    // Cache the feedback
    const insertQuery = "INSERT INTO feedback_cache (rollNumber, schoolName, feedback) VALUES (?, ?, ?)";
    await query(insertQuery, [rollNumber, schoolName, feedback]);

    res.json({ 
      success: true, 
      feedback 
    });

  } catch (error) {
    console.error("AI feedback error:", error);
    
    let fallback = "You're doing great! Keep working hard, and focus on subjects that need improvement. 😊";
    if (error.code === "insufficient_quota") {
      fallback += " (Note: This is a general message due to API quota limits)";
    }

    res.json({ 
      success: true, 
      feedback: fallback 
    });
  }
});

// ----REGISTER PORTAL----
app.post("/student", async (req, res) => {
  try {
    const { studentName, studentPassword, studentRoll, studentSchool } = req.body;
    if (!studentName || !studentPassword || !studentRoll || !studentSchool) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const results = await query(
      "SELECT * FROM students WHERE name = ? AND password = ? AND rollNumber = ? AND schoolName = ?",
      [studentName, studentPassword, studentRoll, studentSchool]
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
      "SELECT * FROM teachers WHERE name = ? AND password = ? AND batchId = ? AND schoolName = ?",
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
    const results = await query(
      "SELECT * FROM schools WHERE schoolName = ? AND password = ? AND schoolId = ?", 
      [schoolName, schoolPassword, schoolId]
    );
    
    if (results.length > 0) {
      res.json({ success: true, message: "School login successful", data: results[0] });
    } else {
      res.status(401).json({ success: false, message: "Invalid school credentials" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error", error: err.message });
  }
});

app.get("/all-performance", async (req, res) => {
  try {
    const { schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: "School name is required" 
      });
    }

    const results = await query(
      `SELECT 
        p.subject,
        AVG(p.marks) AS average_marks,
        AVG(p.attendance) AS average_attendance
      FROM performance p
      WHERE p.schoolName = ?
      GROUP BY p.subject
      ORDER BY p.subject;`,
      [schoolName]
    );
    
    if (!results.length) {
      return res.json({ 
        success: true, 
        message: "No performance records found",
        subjects: [],
        avgMarks: [],
        avgAttendance: []
      });
    }
    
    res.json({
      success: true,
      subjects: results.map(r => r.subject),
      avgMarks: results.map(r => parseFloat(r.average_marks)),
      avgAttendance: results.map(r => parseFloat(r.average_attendance))
    });
    
  } catch (err) {
    console.error("Performance data error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch performance data",
      error: err.message 
    });
  }
});


//-------------TEACHER PORTAL------------
app.post("/upload-marks", async (req, res) => {
  try {
    const { studentRoll, subject, marks, behaviour, attendance, schoolName } = req.body;
    
    if (!studentRoll || !subject || marks === undefined || !schoolName) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }

    await query(
      `INSERT INTO performance (rollNumber, subject, marks, behaviour, attendance, schoolName)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         marks = VALUES(marks), 
         behaviour = VALUES(behaviour), 
         attendance = VALUES(attendance)`,
      [studentRoll, subject, marks, behaviour, attendance, schoolName]
    );
    
    res.json({ success: true, message: "Marks uploaded successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error uploading marks", error: err.message });
  }
});

app.post("/daily-attendance", async (req, res) => {
  try {
    const { studentRoll, date, subject, schoolName } = req.body;
    
    if (!studentRoll || !date || !subject || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existing = await query(
      "SELECT * FROM attendance_log WHERE studentRoll = ? AND subject = ? AND date = ? AND schoolName = ?",
      [studentRoll, subject, date, schoolName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "Attendance already recorded" });
    }

    await query(
      "INSERT INTO attendance_log (studentRoll, subject, date, schoolName) VALUES (?, ?, ?, ?)", 
      [studentRoll, subject, date, schoolName]
    );
    
    res.json({ success: true, message: "Attendance recorded successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error recording attendance", error: err.message });
  }
});

app.post("/delete-attendance", async (req, res) => {
  try {
    const { date, studentRoll, subject, schoolName } = req.body;
    
    if (!date || !studentRoll || !subject || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const result = await query(
      "DELETE FROM attendance_log WHERE date = ? AND studentRoll = ? AND subject = ? AND schoolName = ?",
      [date, studentRoll, subject, schoolName]
    );
    
    res.json({ 
      success: result.affectedRows > 0,
      message: result.affectedRows > 0 ? "Attendance deleted" : "No attendance record found"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error deleting attendance", error: err.message });
  }
});

app.post("/add-student", async (req, res) => {
  try {
    const { name, rollNumber, password, section, studentClass, schoolName } = req.body;
    
    if (!name || !rollNumber || !password || !section || !studentClass || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    await query(
      "INSERT INTO students (name, rollNumber, password, section, class, schoolName) VALUES (?, ?, ?, ?, ?, ?)",
      [name, rollNumber, password, section, studentClass, schoolName]
    );
    
    res.json({ success: true, message: "Student added successfully" });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.code === 'ER_DUP_ENTRY' ? "Student with this roll number already exists" : "Error adding student",
      error: err.message 
    });
  }
});

app.post("/delete-student", async (req, res) => {
  try {
    const { studentRoll, studentName, schoolName } = req.body;
    
    if (!studentRoll || !studentName || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const result = await query(
      "DELETE FROM students WHERE rollNumber = ? AND name = ? AND schoolName = ?",
      [studentRoll, studentName, schoolName]
    );
    
    res.json({ 
      success: result.affectedRows > 0,
      message: result.affectedRows > 0 ? "Student deleted" : "No student found"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error deleting student", error: err.message });
  }
});

app.get("/attendance-summary", async (req, res) => {
  try {
    const { schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: "School name is required" 
      });
    }

    const results = await query(
      `SELECT a.studentRoll, s.name, a.subject, COUNT(*) as total_days 
       FROM attendance_log a
       JOIN students s ON a.studentRoll = s.rollNumber AND a.schoolName = s.schoolName
       WHERE a.schoolName = ? 
       GROUP BY a.studentRoll, a.subject, s.name
       ORDER BY s.name, a.subject`,
      [schoolName]
    );
    
    res.json({ 
      success: true, 
      summary: results 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Error fetching attendance summary", 
      error: err.message 
    });
  }
});

app.get("/students", async (req, res) => {
  try {
    const { schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: "School name is required as a query parameter" 
      });
    }

    // Verify school exists first
    const schoolExists = await query(
      "SELECT 1 FROM schools WHERE schoolName = ? LIMIT 1",
      [schoolName]
    );

    if (!schoolExists.length) {
      return res.status(404).json({
        success: false,
        message: "School not found"
      });
    }

    const students = await query(
      "SELECT name, rollNumber, section, class FROM students WHERE schoolName = ? ORDER BY class, rollNumber",
      [schoolName]
    );

    if (!students.length) {
      return res.json({
        success: true,
        message: "No students found for this school",
        students: []
      });
    }

    res.json({ 
      success: true,
      count: students.length,
      students 
    });

  } catch (err) {
    console.error("Error in /students:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch students",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get("/class-toppers", async (req, res) => {
  try {
    const { className, schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: "School name is required as a query parameter" 
      });
    }

    // Verify school exists first
    const schoolExists = await query(
      "SELECT 1 FROM schools WHERE schoolName = ? LIMIT 1",
      [schoolName]
    );

    if (!schoolExists.length) {
      return res.status(404).json({
        success: false,
        message: "School not found"
      });
    }

    let sql = `
      SELECT 
        s.name, 
        s.rollNumber, 
        s.class, 
        s.section, 
        ROUND(AVG(p.marks), 2) as avg_marks, 
        SUM(p.marks) as total_marks
      FROM students s 
      JOIN performance p ON s.rollNumber = p.rollNumber AND s.schoolName = p.schoolName
      WHERE s.schoolName = ? 
    `;
    
    const params = [schoolName];

    if (className) {
      sql += ` AND s.class = ?`;
      params.push(className);
    }

    sql += `
      GROUP BY s.rollNumber 
      HAVING COUNT(p.marks) > 0
      ORDER BY avg_marks DESC 
      LIMIT 10
    `;

    const results = await query(sql, params);

    if (!results.length) {
      return res.json({
        success: true,
        message: "No toppers found",
        toppers: []
      });
    }

    const toppers = results.map(r => ({
      name: r.name,
      rollNumber: r.rollNumber,
      class: r.class,
      section: r.section,
      avg_marks: parseFloat(r.avg_marks) || 0,
      total_marks: parseInt(r.total_marks) || 0
    }));

    res.json({
      success: true,
      count: toppers.length,
      toppers
    });

  } catch (err) {
    console.error("Error in /class-toppers:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch class toppers",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// --------------SCHOOL PORTAL---------------
app.post("/add-teacher", async (req, res) => {
  try {
    const { name, password, subject, batchId, schoolName } = req.body;
    
    if (!name || !password || !subject || !batchId || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    await query(
      "INSERT INTO teachers (name, password, subject, batchId, schoolName) VALUES (?, ?, ?, ?, ?)", 
      [name, password, subject, batchId, schoolName]
    );
    
    res.json({ success: true, message: "Teacher added successfully" });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.code === 'ER_DUP_ENTRY' ? "Teacher with these details already exists" : "Error adding teacher",
      error: err.message 
    });
  }
});

app.post("/delete-teacher", async (req, res) => {
  try {
    const { name, batchId, schoolName } = req.body;
    
    if (!name || !batchId || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const result = await query(
      "DELETE FROM teachers WHERE name = ? AND batchId = ? AND schoolName = ?", 
      [name, batchId, schoolName]
    );
    
    res.json({ 
      success: result.affectedRows > 0,
      message: result.affectedRows > 0 ? "Teacher deleted" : "No teacher found"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error deleting teacher", error: err.message });
  }
});

app.get("/teachers", async (req, res) => {
  try {
    const { schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ success: false, message: "School name is required" });
    }

    const results = await query(
      "SELECT name, subject, batchId, schoolName FROM teachers WHERE schoolName = ?", 
      [schoolName]
    );
    
    res.json({ success: true, teachers: results });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching teachers", error: err.message });
  }
});

app.get("/student-count", async (req, res) => {
  try {
    const { schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ success: false, message: "School name is required" });
    }

    // Query only the required fields
    const results = await query(
      "SELECT name, class, rollNumber FROM students WHERE schoolName = ? ORDER BY class ASC, rollNumber ASC", 
      [schoolName]
    );
    
    res.json({ 
      success: true, 
      students: results,
      totalCount: results.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching student count", error: err.message });
  }
});

app.get("/performance-by-class", async (req, res) => {
  try {
    const { schoolName } = req.query;
    if (!schoolName) return res.status(400).json({ success: false, message: "School name required" });

    const results = await query(`
      SELECT 
        s.class AS className,
        COUNT(DISTINCT s.rollNumber) AS studentCount,
        IFNULL(GROUP_CONCAT(DISTINCT t.name SEPARATOR ', '), 'Not assigned') AS teacherNames,
        IFNULL(GROUP_CONCAT(DISTINCT t.subject SEPARATOR ', '), 'Not assigned') AS subjects
      FROM students s
      LEFT JOIN teachers t ON s.class = t.batchId AND s.schoolName = t.schoolName
      WHERE s.schoolName = ?
      GROUP BY s.class
      ORDER BY s.class ASC
    `, [schoolName]);

    const performance = results.map(row => ({
      className: row.className,
      studentCount: row.studentCount,
      teacherName: row.teacherNames,
      subject: row.subjects
    }));

    res.json({ success: true, performance });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Error fetching class performance", 
      error: err.message 
    });
  }
});

app.get("/teacher-performance", async (req, res) => {
  try {
    const { schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ success: false, message: "School name is required" });
    }

    const queryStr = `
      SELECT 
        t.id,
        t.name, 
        t.subject, 
        t.batchId,
        COUNT(DISTINCT tsr.student_roll) AS studentCount,
        IFNULL(AVG(p.marks), 0) AS avg_marks,
        IFNULL(AVG(p.attendance), 0) AS avg_attendance,
        (
          SELECT COUNT(DISTINCT date) 
          FROM teacher_attendance 
          WHERE teacher_name = t.name 
          AND schoolName = t.schoolName
          AND status = 'present'
        ) AS days_present
      FROM teachers t
      LEFT JOIN teacher_student_relationship tsr ON 
        t.id = tsr.teacher_id AND 
        t.schoolName = tsr.schoolName
      LEFT JOIN performance p ON 
        tsr.student_roll = p.rollNumber AND 
        tsr.subject = p.subject AND 
        tsr.schoolName = p.schoolName
      WHERE t.schoolName = ?
      GROUP BY t.id, t.name, t.subject, t.batchId
      ORDER BY t.name ASC
    `;
    
    const results = await query(queryStr, [schoolName]);
    
    const teachers = results.map(teacher => ({
      id: teacher.id,
      name: teacher.name,
      subject: teacher.subject,
      batchId: teacher.batchId,
      studentCount: teacher.studentCount || 0,
      avg_marks: parseFloat(teacher.avg_marks) || 0,
      avg_attendance: parseFloat(teacher.avg_attendance) || 0,
      attendancePercentage: teacher.days_present > 0 ? 
        Math.round((teacher.days_present / 30) * 100) : 0 // Assuming 30 days period
    }));

    res.json({ success: true, teachers });
  } catch (err) {
    console.error("Error in /teacher-performance:", err);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching teacher performance", 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Get students for a specific teacher
app.get("/teacher-students", async (req, res) => {
  try {
    const { teacherId, schoolName } = req.query;
    
    if (!teacherId || !schoolName) {
      return res.status(400).json({ success: false, message: "Teacher ID and school name are required" });
    }

    const queryStr = `
      SELECT s.rollNumber, s.name, s.class, s.section, tsr.subject
      FROM teacher_student_relationship tsr
      JOIN students s ON tsr.student_roll = s.rollNumber AND tsr.schoolName = s.schoolName
      WHERE tsr.teacher_id = ? AND tsr.schoolName = ?
      ORDER BY s.class, s.section, s.name
    `;
    
    const results = await query(queryStr, [teacherId, schoolName]);
    res.json({ success: true, students: results });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Error fetching teacher's students", 
      error: err.message 
    });
  }
});

// Assign student to teacher
app.post("/assign-student", async (req, res) => {
  try {
    const { teacherId, studentRoll, subject, schoolName } = req.body;
    
    if (!teacherId || !studentRoll || !subject || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    await query(
      "INSERT INTO teacher_student_relationship (teacher_id, student_roll, subject, schoolName) VALUES (?, ?, ?, ?)",
      [teacherId, studentRoll, subject, schoolName]
    );
    
    res.json({ success: true, message: "Student assigned to teacher successfully" });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: err.code === 'ER_DUP_ENTRY' ? "This relationship already exists" : "Error assigning student",
      error: err.message 
    });
  }
});

app.get("/teacher-attendance-report", async (req, res) => {
  try {
    const { schoolName } = req.query;
    
    if (!schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: "School name is required" 
      });
    }

    const results = await query(
      `SELECT 
        teacher_name as name, 
        COUNT(DISTINCT date) AS presentCount 
       FROM teacher_attendance 
       WHERE schoolName = ? 
       AND status = 'present'
       GROUP BY teacher_name`, 
      [schoolName]
    );
    
    res.json({ 
      success: true, 
      attendance: results 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "Error fetching teacher attendance", 
      error: err.message 
    });
  }
});

app.post("/mark-teacher-attendance", async (req, res) => {
  try {
    const { name, date, schoolName } = req.body;
    
    if (!name || !date || !schoolName) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    await query(
      "INSERT IGNORE INTO teacher_attendance (teacher_name, date, schoolName) VALUES (?, ?, ?)", 
      [name, date, schoolName]
    );
    
    res.json({ success: true, message: "Teacher attendance marked" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error marking teacher attendance", error: err.message });
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
