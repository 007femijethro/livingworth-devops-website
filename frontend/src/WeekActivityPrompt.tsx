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
        <h4>Practise with this week’s class activity</h4>
        <p>{materialsDone
          ? 'Your learning materials are complete. You can practise this activity now. All published learning weeks remain available.'
          : 'Review the materials and practise this week’s activity when ready. It does not block access to later published learning weeks.'}</p>
      </div>
      <a className="button primary" href={`/portal/student/class-activity?week=${module.weekNumber}`}>
        Go to Week {module.weekNumber} class activity →
      </a>
    </aside>
  );
}
