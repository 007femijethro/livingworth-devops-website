import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './devops.css';
import './quiz.css';
import './enhancements.css';
import './attendance.css';
import './student-progress.css';
import './announcements.css';
import './security.css';
import './application.css';
import './learning.css';
import './staff-analytics.css';
import './learner-profile.css';
import './accessibility.css';
import './stories.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
