/**
 * Time at 4x the input over time at 1x: about 4 for linear work, about 16 for
 * quadratic. A ratio instead of a wall-clock limit, so a slow CI machine
 * scales both sides alike. Each side takes its fastest repeat, which drops
 * scheduler and GC noise; one untimed call first lets the JIT warm up.
 * `prepare(scale)` builds the input untimed and returns the call to time,
 * which must not depend on earlier calls.
 */
export async function growth(
  prepare: (scale: number) => () => unknown,
  repeats = 5,
): Promise<number> {
  const fastest = async (scale: number) => {
    const run = prepare(scale);
    let best = Infinity;
    for (let i = 0; i < repeats; i++) {
      const start = performance.now();
      await run();
      best = Math.min(best, performance.now() - start);
    }
    return best;
  };
  await prepare(1)();
  const base = await fastest(1);
  return (await fastest(4)) / base;
}

/** Linear is 4 and quadratic is 16; 8 leaves room for noise on either side. */
export const MAX_LINEAR_GROWTH = 8;
