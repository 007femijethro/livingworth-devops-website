import type { LearningMaterial, LearningWeek } from './continue-learning';

const pilotTopics = [
  'introduction to kubernetes',
  'kubernetes architecture — control plane and worker nodes',
  'deploy and verify an application on kubernetes',
  'kubernetes services — discovery and traffic',
];

export function orderedMaterials(week: LearningWeek): LearningMaterial[] {
  if (week.weekNumber !== 13) return week.materials;
  const rank = (material: LearningMaterial) => {
    const topic = pilotTopics.indexOf(material.title.trim().toLowerCase());
    return topic < 0 ? pilotTopics.length * 2 : topic * 2 + Number(material.materialType !== 'video');
  };
  return [...week.materials].sort((left, right) => rank(left) - rank(right));
}

type Step = { title: string; kind: string; status: string; href: string };

export function weekGuide(week: LearningWeek): Step[] {
  const steps = orderedMaterials(week).map(material => ({
    title: material.title,
    kind: material.materialType === 'video' ? 'Video' : material.materialType === 'note' ? 'Lesson note' : 'Learning resource',
    status: material.progressStatus === 'done' ? 'Done' : material.progressStatus === 'in_progress' ? 'In progress' : 'To do',
    href: `#learning-material-${encodeURIComponent(material.id)}`,
  }));
  if (week.activity) steps.push({
    title: week.activity.title || 'Private class activity',
    kind: 'Class activity',
    status: week.activity.submittedAt ? 'Done' : 'To do',
    href: `/portal/student/class-activity?week=${week.weekNumber}`,
  });
  for (const assignment of week.assignments) steps.push({
    title: assignment.title,
    kind: assignment.assignmentType === 'manual' ? 'Mentor assignment' : 'Practical assignment',
    status: assignment.submissionStatus === 'rejected' ? 'Redo required'
      : assignment.submissionStatus === 'completed' ? 'Graded'
      : assignment.submissionStatus === 'unavailable' ? 'Unavailable'
      : assignment.submissionId ? 'Submitted'
      : assignment.closedAt ? 'Closed' : 'To do',
    href: `#learning-assignment-${encodeURIComponent(assignment.id)}`,
  });
  return steps;
}
