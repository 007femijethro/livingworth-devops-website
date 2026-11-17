export function parseRubric(value: unknown, maxScore: number) {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Enter a valid rubric.');
  const lines = value.split('\n').map(line => line.trim()).filter(Boolean);
  const criteria = lines.map(line => {
    const match = /^(.*?)\s*\|\s*(\d+)$/.exec(line);
    if (!match || !match[1].trim() || match[1].trim().length > 150 || Number(match[2]) < 1) throw new Error('Use one criterion per line: Name | points.');
    return { label: match[1].trim(), max: Number(match[2]) };
  });
  if (new Set(criteria.map(row => row.label.toLowerCase())).size !== criteria.length) throw new Error('Use a different name for each criterion.');
  if (criteria.length > 15 || (criteria.length && criteria.reduce((sum, item) => sum + item.max, 0) !== maxScore)) throw new Error('Use up to 15 criteria with points that add up to the assignment maximum.');
  return criteria;
}

export function scoreRubric(criteria: {label:string;max:number}[], scores: unknown, draft: boolean, maxScore: number) {
  if (!Array.isArray(scores) || scores.length !== criteria.length || !criteria.length) throw new Error('Enter a mark for each rubric criterion.');
  const breakdown = criteria.map((criterion, index) => {
    const points = scores[index];
    if (!(draft && points === null) && (!Number.isInteger(points) || points < 0 || points > criterion.max)) throw new Error(`Enter a whole mark between 0 and ${criterion.max} for ${criterion.label}.`);
    return { ...criterion, points };
  });
  const score = breakdown.reduce((total, row) => total + (row.points ?? 0), 0);
  if (score > maxScore || criteria.reduce((total, row) => total + row.max, 0) !== maxScore) throw new Error('The rubric must match the assignment maximum.');
  return {score,breakdown};
}
