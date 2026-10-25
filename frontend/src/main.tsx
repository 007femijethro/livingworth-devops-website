import { ThemeProvider, ThemeToggle } from './Theme';
import { AcademySettingsProvider } from './AcademySettingsContext';
import { startMobile } from './mobile';
import {startMobileViewport} from './mobile-interaction';
import './mobile.css';
import React, { useEffect, lazy, Suspense } from 'react';
import { startMobileUpdates } from './mobile-updates';
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
import './account-settings.css';
import './brand-display.css';
import './app-polish.css';
import './theme.css';
import './mobile-usability.css';
import { startClientLogging } from './client-logging';

startMobileViewport();
startMobile();
const reviewerPath=/^\/review(?:\/|$)/.test(window.location.pathname);
if(!reviewerPath)startClientLogging();
const ReviewerPortal=lazy(()=>import('./ReviewerPortal'));
const LiveReviewerPortal=lazy(()=>import('./LiveReviewerPortal'));

const root = document.getElementById('root');
if (!root) throw new Error('Application root element was not found.');

function MobileLifecycle() {
  useEffect(() => { startMobileUpdates(); }, []);
  return null;
}

createRoot(root).render(
  <React.StrictMode><ThemeProvider>{reviewerPath?<Suspense fallback={<div className="review-loading">Loading reviewer portal…</div>}>{window.location.pathname==='/review/live'?<LiveReviewerPortal/>:<ReviewerPortal/>}</Suspense>:<AcademySettingsProvider><MobileLifecycle /><App /><ThemeToggle standalone /></AcademySettingsProvider>}</ThemeProvider></React.StrictMode>
);
