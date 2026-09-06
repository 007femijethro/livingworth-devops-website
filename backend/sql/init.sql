CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  duration VARCHAR(40) NOT NULL,
  level VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  first_name VARCHAR(80),
  last_name VARCHAR(80),
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  experience_level VARCHAR(60),
  learning_goal TEXT,
  gender VARCHAR(30),
  country VARCHAR(80),
  state_city VARCHAR(120),
  employment_status VARCHAR(100),
  educational_level VARCHAR(80),
  course_choice VARCHAR(120),
  learning_mode VARCHAR(60),
  tech_experience VARCHAR(100),
  terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  role ENUM('student', 'mentor', 'admin') NOT NULL DEFAULT 'student',
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(500),
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX password_reset_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  join_code VARCHAR(8) NOT NULL UNIQUE,
  status ENUM('draft','lobby','live','completed') NOT NULL DEFAULT 'draft',
  allow_retakes BOOLEAN NOT NULL DEFAULT FALSE,
  question_time_seconds INT NOT NULL DEFAULT 30,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  prompt TEXT NOT NULL,
  topic VARCHAR(120) NOT NULL DEFAULT 'General',
  options_json JSON NOT NULL,
  correct_index TINYINT NOT NULL,
  sequence_no INT NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  student_id INT NOT NULL,
  attempt_no INT NOT NULL DEFAULT 1,
  status ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  score INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  total_questions INT NOT NULL DEFAULT 0,
  average_response_ms INT NOT NULL DEFAULT 0,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  UNIQUE KEY one_numbered_attempt (quiz_id, student_id, attempt_no),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  attempt_id BIGINT NOT NULL,
  question_id INT NOT NULL,
  answer_index TINYINT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_ms INT NOT NULL,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_attempt_answer (attempt_id, question_id),
  FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  question_id INT NOT NULL,
  student_id INT NOT NULL,
  answer_index TINYINT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_ms INT NOT NULL,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_answer (quiz_id, question_id, student_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  session_date DATE NOT NULL,
  status ENUM('present', 'late', 'absent', 'excused') NOT NULL,
  note VARCHAR(255),
  marked_by INT NOT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY one_attendance_per_session (student_id, session_date),
  INDEX attendance_session_date (session_date),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (marked_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  category ENUM('general','class','quiz','assignment') NOT NULL DEFAULT 'general',
  meeting_link VARCHAR(1000),
  expires_at DATETIME NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (announcement_id, user_id),
  FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  week_number INT NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  summary TEXT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS learning_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  material_type ENUM('file','link','video','note') NOT NULL,
  resource_url VARCHAR(1000) NOT NULL,
  lesson_content LONGTEXT NULL,
  original_name VARCHAR(255),
  uploaded_by INT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  instructions TEXT NOT NULL,
  due_at DATETIME NOT NULL,
  max_score INT NOT NULL DEFAULT 100,
  created_by INT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  submission_url VARCHAR(1000) NOT NULL,
  note TEXT,
  status ENUM('submitted','needs_correction','completed') NOT NULL DEFAULT 'submitted',
  score INT,
  feedback TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewed_by INT NULL,
  UNIQUE KEY one_submission_per_assignment (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

INSERT INTO courses (title, description, duration, level) VALUES
  ('DevOps Engineering Bootcamp', 'A complete practical journey through Linux, Git, AWS, automation, Docker, Kubernetes, CI/CD and monitoring.', '12 weeks', 'Beginner–Intermediate'),
  ('Cloud & Infrastructure Automation', 'Build AWS environments and automate infrastructure with Ansible and Terraform.', 'Included', 'Practical track'),
  ('Containers, Kubernetes & CI/CD', 'Dockerize applications, orchestrate workloads and create reliable delivery pipelines.', 'Included', 'Practical track');
