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
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  experience_level VARCHAR(60),
  learning_goal TEXT,
  role ENUM('student', 'mentor', 'admin') NOT NULL DEFAULT 'student',
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  join_code VARCHAR(8) NOT NULL UNIQUE,
  status ENUM('draft','lobby','live','completed') NOT NULL DEFAULT 'draft',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  prompt TEXT NOT NULL,
  options_json JSON NOT NULL,
  correct_index TINYINT NOT NULL,
  sequence_no INT NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
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

INSERT INTO courses (title, description, duration, level) VALUES
  ('DevOps Engineering Bootcamp', 'A complete practical journey through Linux, Git, AWS, automation, Docker, Kubernetes, CI/CD and monitoring.', '12 weeks', 'Beginner–Intermediate'),
  ('Cloud & Infrastructure Automation', 'Build AWS environments and automate infrastructure with Ansible and Terraform.', 'Included', 'Practical track'),
  ('Containers, Kubernetes & CI/CD', 'Dockerize applications, orchestrate workloads and create reliable delivery pipelines.', 'Included', 'Practical track');
