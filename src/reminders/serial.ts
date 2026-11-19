/**
 * Runs async jobs one at a time, and skips any job that is no longer the
 * latest by the time its turn comes. Used so overlapping reminder syncs
 * can't interleave and leave stale notifications scheduled.
 */
export function latestOnly<T>() {
  let chain: Promise<unknown> = Promise.resolve();
  let latest = 0;
  return (job: () => Promise<T>): Promise<T | undefined> => {
    const ticket = ++latest;
    const run = chain.then(() => (ticket === latest ? job() : undefined));
    chain = run.catch(() => undefined);
    return run;
  };
}
