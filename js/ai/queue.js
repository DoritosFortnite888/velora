// Runs background jobs (memory notes and chat summaries) one at a time, after a reply is shown.
// Nothing here waits on a timer: the queue only runs work that was already requested. A job that is
// still running can be cancelled by its owner, so a new message never waits behind it for long.
let tail = Promise.resolve();
let pending = 0;

// Adds a job after the jobs already queued. A failing job does not stop the ones after it.
export function enqueue(job) {
  pending++;
  const run = tail.then(() => job()).catch(() => {}).finally(() => {
    pending--;
  });
  tail = run;
  return run;
}

// Resolves when every job queued so far has finished (or failed).
export const idle = () => tail;

// How many jobs are queued or running.
export const pendingJobs = () => pending;
