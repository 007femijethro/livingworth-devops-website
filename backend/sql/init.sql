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
  role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO courses (title, description, duration, level) VALUES
  ('DevOps Engineering Bootcamp', 'A complete practical journey through Linux, Git, AWS, automation, Docker, Kubernetes, CI/CD and monitoring.', '12 weeks', 'Beginner–Intermediate'),
  ('Cloud & Infrastructure Automation', 'Build AWS environments and automate infrastructure with Ansible and Terraform.', 'Included', 'Practical track'),
  ('Containers, Kubernetes & CI/CD', 'Dockerize applications, orchestrate workloads and create reliable delivery pipelines.', 'Included', 'Practical track');
