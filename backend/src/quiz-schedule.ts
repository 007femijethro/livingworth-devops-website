// @ts-nocheck
/** Keep room opening separate from the automatic start; legacy opening-only quizzes stay manual. */
export function quizSchedule(opening, starting, now = Date.now()) {
  const parse = (value) => {
    if (!value) return null;
    const time = new Date(value);
    if (!Number.isFinite(+time)) throw new Error('Choose a valid quiz schedule date and time.');
    return time.toISOString();
  };
  const scheduledAt = parse(opening), startsAt = parse(starting);
  if (startsAt && !scheduledAt) throw new Error('Set the waiting room opening time before the quiz start.');
  if (startsAt && +new Date(startsAt) <= +new Date(scheduledAt)) throw new Error('Quiz start must be after the waiting room opens.');
  if (startsAt && +new Date(startsAt) <= now) throw new Error('Quiz start must be in the future.');
  return {scheduledAt, startsAt};
}

/** One poll at a time. Atomic claims in startQuiz prevent manual/timer races and repeat starts. */
export function scheduledQuizWorker(pool, startQuiz, onError = () => {}, intervalMs = 1000) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await pool.query("UPDATE quizzes SET status='lobby' WHERE status='draft' AND scheduled_at IS NOT NULL AND scheduled_at <= CURRENT_TIMESTAMP");
      const [due] = await pool.query("SELECT id FROM quizzes WHERE status IN ('draft','lobby') AND scheduled_start_at IS NOT NULL AND scheduled_start_at <= CURRENT_TIMESTAMP AND scheduled_started_at IS NULL ORDER BY scheduled_start_at, id");
      for (const quiz of due) {
        try { await startQuiz(Number(quiz.id), {scheduled: true}); } catch (error) { onError(error, quiz.id); }
      }
    } catch (error) { onError(error); }
    finally { busy = false; }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();
  return {tick, stop: () => clearInterval(timer)};
}
