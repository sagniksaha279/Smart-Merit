require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.api_key_openAI
});

// MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

// Test DB Connection
db.connect((err) => {
  if (err) {
    console.error("❌ DB connection failed:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to SmartMerit DB");
  }
});

// Login Routes
app.post("/student", (req, res) => {

  const { studentName, studentPassword, studentRoll } = req.body;

  const query = "SELECT * FROM students WHERE name = ? AND password = ? AND rollNumber = ?";

  db.query(query, [studentName, studentPassword, studentRoll], (err, results) => {

    if (err) 
        return res.status(500).json({ 
            success: false, 
            error: "Database error" 
        });
    if (results.length > 0) {
      res.json({ 
            success: true, 
            message: "Student login successful", 
            data: results[0] 
        });
    } else {
        res.json({    
            success: false, 
            message: "Invalid student credentials" 
        });
    }
  });
});

app.post("/teacher", (req, res) => {

  const { teacherName, teacherPassword, teacherBatch } = req.body;

  const query = "SELECT * FROM teachers WHERE name = ? AND batchId = ?";

  db.query(query, [teacherName, teacherBatch], async (err, results) => {

    if (err || results.length === 0) 
        return res.status(400).json({ 
    success: false, 
    message: "Invalid credentials" 
    });
    res.json({ success: true, message: "Teacher login successful", data: results[0] });
  });
});

app.post("/school", (req, res) => {

  const { schoolName, schoolPassword, schoolId } = req.body;

  const query = "SELECT * FROM schools WHERE schoolName = ? AND password = ? AND schoolId = ?";

  db.query(query, [schoolName, schoolPassword, schoolId], (err, results) => {
    if (err) 
        return res.status(500).json({ 
    success: false, 
    error: "Database error" 
    });
    if (results.length > 0) {
      res.json({ success: true, message: "School login successful", data: results[0] });
    } else {
      res.json({ success: false, message: "Invalid school credentials" });
    }
  });
});

// Add and Delete Students
app.post("/add-student", (req, res) => {

  const { name, rollNumber, password, section } = req.body;

  const query = "INSERT INTO students (name, rollNumber, password, section) VALUES (?, ?, ?, ?)";

  db.query(query, [name, rollNumber, password, section], (err) => {
    if (err) 
        return res.status(500).json({ 
            success: false, 
            message: "Error adding student", 
            error: err 
        });
    res.json({ 
        success: true, 
        message: "Student added successfully" 
    });
  });
});

app.post("/delete-student", (req, res) => {
  const { studentRoll, studentName } = req.body;

  const query = "DELETE FROM students WHERE rollNumber = ? AND name = ?";

  db.query(query, [studentRoll, studentName], (err) => {
    if (err) 
        return res.status(500).json({ 
    success: false, 
    message: "Error deleting student" 
    });
    res.json({ 
        success: true, 
        message: "Student deleted successfully" 
    });
  });
});

// Upload Marks
app.post("/upload-marks", (req, res) => {

  const { studentRoll, subject, marks, behaviour, attendance } = req.body;

  const query = "INSERT INTO performance (rollNumber, subject, marks, behaviour, attendance) VALUES (?, ?, ?, ?, ?)";

  db.query(query, [studentRoll, subject, marks, behaviour, attendance], (err) => {
    if (err) 
        return res.status(500).json({ 
    success: false, 
    message: "Error uploading marks", 
    error: err 
    });
    res.json({ 
        success: true, 
        message: "Marks uploaded successfully" 
    });
  });
});

// Attendance
app.post("/daily-attendance", (req, res) => {

  const { studentRoll, date, subject } = req.body;

  const checkQuery = "SELECT * FROM attendance_log WHERE studentRoll = ? AND subject = ? AND date = ?";

  db.query(checkQuery, [studentRoll, subject, date], (err, results) => {
    if (err) 
        return res.status(500).json({ 
    success: false, 
    message: "DB error", 
    error: err 
    });
    if (results.length > 0) 
        return res.status(400).json({ 
            success: false,    
            message: "Attendance already recorded for this date" 
        });
    const insertQuery = "INSERT INTO attendance_log (studentRoll, subject, date) VALUES (?, ?, ?)";

    db.query(insertQuery, [studentRoll, subject, date], (insertErr) => {
      if (insertErr) 
        return res.status(500).json({  
    success: false, 
    message: "Error inserting attendance", 
    error: insertErr 
    });
        res.json({ 
            success: true, 
            message: "Attendance recorded successfully" 
        });
    });
  });
});

app.post("/delete-attendance", (req, res) => {

  const { studentRoll, date, subject } = req.body;

  const deleteQuery = "DELETE FROM attendance_log WHERE studentRoll = ? AND subject = ? AND date = ?";

  db.query(deleteQuery, [studentRoll, subject, date], (err, result) => {
    if (err)   
        return res.status(500).json({ 
    success: false, 
    message: "Error deleting attendance", 
    error: err 
    });
    if (result.affectedRows > 0) {
      res.json({ 
        success: true, 
        message: "Attendance deleted successfully" 
    });
    } else {
      res.status(404).json({ 
        success: false, 
        message: "No such attendance found" 
    });
    }
  });
});

app.get("/attendance-summary", (req, res) => {

  const query = "SELECT subject, studentRoll, COUNT(*) AS total_days FROM attendance_log GROUP BY subject, studentRoll";

  db.query(query, (err, results) => {
    if (err) 
        return res.status(500).json({ 
    success: false, 
    message: "Error fetching summary" 
    });
    res.json({ 
        success: true, 
        summary: results 
    });
  });
});

// Performance
app.get("/all-performance", (req, res) => {

  const query = `SELECT subject, ROUND(AVG(marks), 2) AS avgMarks, ROUND(AVG(attendance), 2) AS avgAttendance FROM performance GROUP BY subject`;
  
  db.query(query, (err, results) => {
    if (err) 
        return res.json({ 
        success: false, 
        message: "Error fetching performance data" 
    });
    res.json({
      success: true,
      subjects: results.map(r => r.subject),
      avgMarks: results.map(r => r.avgMarks),
      avgAttendance: results.map(r => r.avgAttendance)
    });
  });
});

app.get("/performance-by-class", (req, res) => {

  const { className, section } = req.query;

  const query = `
    SELECT p.subject, ROUND(AVG(p.marks), 2) AS avgMarks, ROUND(AVG(p.attendance), 2) AS avgAttendance
    FROM performance p
    JOIN students s ON p.rollNumber = s.rollNumber
    WHERE s.class = ? AND s.section = ?
    GROUP BY p.subject`;

    db.query(query, [className, section], (err, results) => {
    if (err) 
        return res.status(500).json({ 
            success: false, 
            message: "Error loading class performance" 
        });
        res.json({
        success: true,
        subjects: results.map(r => r.subject),
        avgMarks: results.map(r => r.avgMarks),
        avgAttendance: results.map(r => r.avgAttendance)
        });
    });
});

// Teacher Management
app.post("/add-teacher", async (req, res) => {

  const { name, password, subject, batchId } = req.body;

  const query = "INSERT INTO teachers (name, password, subject, batchId) VALUES (?, ?, ?, ?)";

  db.query(query, [name, hashedPassword, subject, batchId], (err) => {
    if (err) 
        return res.status(500).json({ 
        success: false, 
        message: "Error adding teacher" 
    });
    res.json({ 
        success: true, 
        message: "Teacher added successfully" 
    });
  });
});

app.post("/delete-teacher", (req, res) => {

  const { name, batchId } = req.body;

  const query = "DELETE FROM teachers WHERE name = ? AND batchId = ?";

  db.query(query, [name, batchId], (err) => {
    if (err) return res.status(500).json({ 
        success: false, 
        message: "Error deleting teacher" 
    });
    res.json({ 
        success: true, 
        message: "Teacher deleted successfully" 
    });
  });
});

app.get("/teachers", (req, res) => {

  db.query("SELECT name, subject, batchId FROM teachers", (err, results) => {
    if (err) 
        return res.status(500).json({ 
    success: false, 
    message: "Error fetching teachers" 
    });
    res.json({ success: true, teachers: results });
  });
});

app.get("/student-count", (req, res) => {

  db.query("SELECT COUNT(*) AS count FROM students", (err, result) => {
    if (err) 
        return res.status(500).json({ 
            success: false 
        });
    res.json({ 
        success: true, 
        count: result[0].count 
    });
  });
});

app.get("/teacher-performance", (req, res) => {
  const query = `
    SELECT t.name, t.subject, t.batchId, COUNT(s.rollNumber) AS studentCount
    FROM teachers t
    LEFT JOIN students s ON s.batchId = t.batchId
    GROUP BY t.name, t.subject, t.batchId`;
    
    db.query(query, (err, results) => {
    if (err)  
        return res.status(500).json({ 
            success: false 
        });
    res.json({ 
        success: true, 
        teachers: results 
    });
  });
});

app.get("/teacher-attendance-report", (req, res) => {

  const query = "SELECT name, date FROM teacher_attendance ORDER BY date DESC";

  db.query(query, (err, results) => {
    if (err) 
        return res.status(500).json({ 
            success: false, 
            message: "Error fetching attendance" 
        });
    res.json({ success: true, attendance: results });
  });
});

app.post("/mark-teacher-attendance", (req, res) => {

  const { name, date } = req.body;

  const query = "INSERT IGNORE INTO teacher_attendance (name, date) VALUES (?, ?)";

  db.query(query, [name, date], (err) => {
    if (err) 
        return res.status(500).json({ 
            success: false,     
            message: "Error marking attendance" 
        });
    res.json({ 
        success: true, 
        message: "Attendance marked successfully" 
    });
  });
});

// AI Feedback
app.post("/ai-feedback", async (req, res) => {

  const { name, rollNumber, performance } = req.body;

  const subjectSummary = performance.map(p => `${p.subject}: ${p.marks} marks, ${p.attendance}% attendance, behaviour: ${p.behaviour}`).join("\n");
  const prompt = `Student Name: ${name} 
  Performance Summary:${subjectSummary}\n
  Provide a short, encouraging feedback with study suggestions if needed. Keep it friendly and under 100 words.`;


  const cacheQuery = "SELECT feedback FROM feedback_cache WHERE rollNumber = ?";

  db.query(cacheQuery, [rollNumber], async (err, results) => {

    if (err) return res.status(500).json({ success: false, message: "DB error checking cache" });

    if (results.length > 0) return res.json({ success: true, feedback: results[0].feedback });

    try {
      const gptResponse = await openai.chat.completions.create({ 
        model: "gpt-4o-mini", 
            messages: [{ 
                role: "user", 
                content: prompt 
            }] 
        });
        
        const feedback = gptResponse.choices[0].message.content;
        
        const insertQuery = "INSERT INTO feedback_cache (rollNumber, feedback) VALUES (?, ?)";
        
        db.query(insertQuery, [rollNumber, feedback], (insertErr) => {
        if (insertErr) 
            console.error("Failed to cache feedback:", insertErr);
        });
      res.json({ 
        success: true, 
        feedback 
    });
    } catch (error) {
      console.error("AI error:", error);

      let fallback = "You're doing great! Keep working hard, and focus on subjects that need improvement. 😊";
      if (error.code === "insufficient_quota") 
        fallback += " (Note: This is a general message due to free-tier usage)";
      res.json({ 
        success: true, 
        feedback: fallback 
    });
    }
  });
});


app.post("/submit-feedback", (req, res) => {
    const { feedback } = req.body;

    if (!feedback || feedback.trim() === "") {
        return res.status(400).json({ 
            success: false, 
            message: "Feedback cannot be empty." 
        });
    }

    const query = "INSERT INTO feedback (message) VALUES (?)";

    db.query(query, [feedback], (err) => {
        if (err) {
            console.error("❌ Error saving feedback:", err);
            return res.status(500).json({ 
                success: false, 
                message: "Database error while saving feedback." 
            });
        }

        res.json({ 
            success: true, 
            message: "✅ Feedback submitted successfully!" 
        });
    });
});


// Root Route
app.get("/", (req, res) => {
  res.send("📚 SmartMerit Backend is Running!");
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 SmartMerit server running at http://localhost:${PORT}`);
});
