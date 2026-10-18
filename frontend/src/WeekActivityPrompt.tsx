type WeekActivityPromptProps = {
  module: {
    weekNumber: number;
    materials: { progressStatus?: string }[];
    activity?: { submittedAt?: string | null } | null;
  };
};

export default function WeekActivityPrompt({ module }: WeekActivityPromptProps) {
  if (!module.activity || module.activity.submittedAt) return null;
  const materialsDone = module.materials.every(material => material.progressStatus === 'done');
  return (
    <aside className="week-activity-next" aria-label={`Week ${module.weekNumber} next step`}>
      <div>
        <span className="eyebrow">Your next step · Week {module.weekNumber}</span>
        <h4>Complete the class activity to continue</h4>
        <p>{materialsDone
          ? 'Your learning materials are complete. Finish this week’s class activity and any outstanding assignments to unlock the next week.'
          : 'Finish this week’s learning materials, then complete the class activity. Later weeks unlock after this week’s required work is complete.'}</p>
      </div>
      <a className="button primary" href={`/portal/student/class-activity?week=${module.weekNumber}`}>
        Go to Week {module.weekNumber} class activity →
      </a>
    </aside>
  );
}
