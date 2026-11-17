import type { LearningWeek } from './continue-learning';
import { weekGuide } from './week-guide';
import './week-guide.css';

export default function WeekGuide({ week }: { week: LearningWeek }) {
  const steps = weekGuide(week);
  if (!steps.length) return null;
  return <nav className="week-guide" aria-label={`Week ${week.weekNumber} learning path`}>
    <h4>Your path through Week {week.weekNumber}</h4>
    <p>Watch each video, read the matching note, and follow its lab. Mark each material Done as you finish. Then complete the private activity and submit the practical assignment. You can revisit any published week.</p>
    <ol>{steps.map(step => <li key={step.href}><a href={step.href}><span><small>{step.kind}</small><b>{step.title}</b></span><span className="week-guide-status">{step.status}</span></a></li>)}</ol>
  </nav>;
}
