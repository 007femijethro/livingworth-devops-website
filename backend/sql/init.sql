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

INSERT INTO courses (title, description, duration, level) VALUES
  ('DevOps Foundations', 'Build practical skills in Linux, Git, Docker and deployment workflows.', '12 weeks', 'Beginner'),
  ('Cloud Engineering', 'Learn cloud infrastructure, networking, security and reliable operations.', '12 weeks', 'Intermediate'),
  ('Agile Delivery', 'Understand Scrum, sprint planning, Jira workflows, stories and epics.', '6 weeks', 'All levels');

