import { describe, expect, it } from 'vitest';

import { latestOnly } from '../serial';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('latestOnly', () => {
  it('never overlaps jobs and skips superseded ones', async () => {
    const run = latestOnly<string>();
    const log: string[] = [];
    let active = 0;
    const job = (name: string) => async () => {
      active++;
      expect(active).toBe(1);
      log.push(`start ${name}`);
      await wait(10);
      log.push(`end ${name}`);
      active--;
      return name;
    };
    const a = run(job('a'));
    await wait(1); // a is now running
    const b = run(job('b'));
    const c = run(job('c'));
    expect(await Promise.all([a, b, c])).toEqual(['a', undefined, 'c']);
    expect(log).toEqual(['start a', 'end a', 'start c', 'end c']);
  });

  it('collapses calls made together into the last one', async () => {
    const run = latestOnly<string>();
    const results = await Promise.all([run(async () => 'x'), run(async () => 'y')]);
    expect(results).toEqual([undefined, 'y']);
  });

  it('keeps going after a failed job', async () => {
    const run = latestOnly<number>();
    await expect(run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(await run(async () => 2)).toBe(2);
  });
});
