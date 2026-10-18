export type LearningMaterial = { id: number | string; title: string; progressStatus?: string };
type Assignment = { id: number | string; title: string; assignmentType?: string; closedAt?: unknown; submissionId?: unknown };
export type LearningWeek = { id: number | string; weekNumber: number; title: string; isComplete?: boolean; materials: LearningMaterial[]; assignments: Assignment[]; activity?: { title?: string; submittedAt?: unknown } | null };

// Use the server's ordered, unlocked weeks and its existing completion rules.
export function continueLearning(modules: LearningWeek[], lockedWeeks = 0) {
  const completedWeeks = modules.filter(week => week.isComplete).length;
  const totalWeeks = modules.length + Math.max(0, Number(lockedWeeks) || 0);
  const week = modules.find(item => !item.isComplete);
  const overview = { completedWeeks, totalWeeks, week: undefined as LearningWeek | undefined, completed: 0, total: 0, percentage: 0 };
  if (!modules.length) return { ...overview, kind: 'empty', title: 'Your learning journey starts here', description: 'Your mentor will publish your first week here. Check back soon.', href: '/portal/student/learning', label: 'View learning workspace' };
  if (!week) return { ...overview, kind: 'complete', title: 'You’re up to date!', description: 'You have completed all currently available weeks. You can revisit your lessons while you wait for new content.', href: '/portal/student/learning', label: 'Review your learning' };
  const assignments = week.assignments.filter(item => item.assignmentType !== 'manual');
  const doneAssignments = assignments.filter(item => item.closedAt || item.submissionId).length;
  const completed = week.materials.filter(item => item.progressStatus === 'done').length + doneAssignments + (week.activity?.submittedAt ? 1 : 0);
  const total = week.materials.length + assignments.length + (week.activity ? 1 : 0);
  const current = { ...overview, week, completed, total, percentage: total ? Math.round(completed / total * 100) : 0 };
  const material = week.materials.find(item => item.progressStatus !== 'done');
  if (material) return { ...current, kind: 'material', title: material.title, description: material.progressStatus === 'in_progress' ? 'Pick up where you left off. Complete this material, then move on to the next step.' : 'This is your next learning material. Open it to keep moving through the week.', href: `/portal/student/learning?week=${week.weekNumber}&material=${encodeURIComponent(material.id)}`, label: material.progressStatus === 'in_progress' ? 'Continue material' : 'Start next material' };
  if (week.activity && !week.activity.submittedAt) return { ...current, kind: 'activity', title: week.activity.title || `Week ${week.weekNumber} class activity`, description: 'Your materials are complete. Finish this private class activity. The next week unlocks when all required work for this week is complete.', href: `/portal/student/class-activity?week=${week.weekNumber}`, label: 'Complete class activity' };
  const assignment = assignments.find(item => !item.closedAt && !item.submissionId);
  if (assignment) return { ...current, kind: 'assignment', title: assignment.title, description: 'Your next step is to submit this assignment. Later weeks unlock when this week’s required work is complete.', href: `/portal/student/assignments?week=${week.weekNumber}&assignment=${encodeURIComponent(assignment.id)}`, label: 'Open assignment' };
  return { ...current, kind: 'waiting', title: 'Your next lesson is on its way', description: 'Your mentor has not added learning work to this week yet. Check back soon.', href: `/portal/student/learning?week=${week.weekNumber}`, label: 'View current week' };
}
