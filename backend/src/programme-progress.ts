// Summarize only server-authorized weeks; never return lesson content or answers.
export function programmeProgress(published: any[], unlocked: any[]) {
  const available = new Map(unlocked.map(week => [Number(week.id), week]));
  const weeks = published.map(row => {
    const week = available.get(Number(row.id));
    const base = { id: Number(row.id), weekNumber: Number(row.weekNumber), title: row.title };
    if (!week) return { ...base, status: 'locked', work: null };
    const materials = week.materials || [];
    const assignments = (week.assignments || []).filter((item: any) => item.assignmentType !== 'manual');
    const materialDone = materials.filter((item: any) => item.progressStatus === 'done').length;
    const assignmentDone = assignments.filter((item: any) => item.closedAt || item.submissionId).length;
    const activityTotal = week.activity ? 1 : 0;
    const activityDone = week.activity?.submittedAt ? 1 : 0;
    const total = materials.length + assignments.length + activityTotal;
    const done = materialDone + assignmentDone + activityDone;
    return { ...base, status: week.isComplete ? 'complete' : total ? 'current' : 'upcoming',
      work: { done, total, percentage: total ? Math.round(done / total * 100) : 0,
        materials: { done: materialDone, total: materials.length },
        assignments: { done: assignmentDone, total: assignments.length },
        activity: { done: activityDone, total: activityTotal } } };
  });
  const completedWeeks = weeks.filter(week => week.status === 'complete').length;
  return { weeks, totalWeeks: weeks.length, completedWeeks, remainingWeeks: weeks.length - completedWeeks,
    percentage: weeks.length ? Math.round(completedWeeks / weeks.length * 100) : 0,
    currentWeek: weeks.find(week => week.status === 'current' || week.status === 'upcoming') || null };
}
