import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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
import './homepage.css';
import './assignments.css';
import './overall-leaderboard.css';
import './certificates.css';
import './live-class.css';
import './portal-redesign.css';
import './learning-platform.css';
import './structural-platform.css';
import './profile-changes.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root element was not found.');

createRoot(root).render(
  <React.StrictMode><App /></React.StrictMode>
);
