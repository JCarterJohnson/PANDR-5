const EPSILON = 1e-8;
export const SET_TARGET_TOLERANCE = 1;
type Score = [number, number, number, number, number, number, number];
const better = (a: Score, b: Score) => {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) > EPSILON) return a[i]! < b[i]!;
  }
  return false;
};
interface AllocationOptions {
  /** Original exercise primary roles, not roles inferred after filtering selected targets. */
  primary?: number[][];
  priorities?: number[];
  /** Stable slot keys make search/tie handling independent of editor row order. */
  keys?: string[];
}

/** App policy, not a physiological growth equation: whole-set target tolerance, retained
 * exercise coverage, primary-session balance, and explicit user priorities. Small connected
 * problems are exhaustive. Larger problems use bounded deterministic multi-start search;
 * this does not establish global optimality or prove mathematical infeasibility.
 */
export function fitSetCounts(matrix: number[][], days: number[], targets: number[], original: number[], strict: boolean, maximum: number, options: AllocationOptions = {}): number[] {
  const result = [...original];
  const order = matrix.map((_, i) => i).sort((a, b) => (options.keys?.[a] ?? `${a}`).localeCompare(options.keys?.[b] ?? `${b}`, undefined, { numeric: true }));
  const remaining = new Set(order.filter(i => matrix[i]!.some(Boolean)));
  while (remaining.size) {
    const indices = [remaining.values().next().value!];
    remaining.delete(indices[0]!);
    const muscles = new Set<number>();
    for (let k = 0; k < indices.length; k++) {
      matrix[indices[k]!]!.forEach((credit, m) => { if (credit) muscles.add(m); });
      for (const i of remaining) if (matrix[i]!.some((credit, m) => credit > 0 && muscles.has(m))) {
        indices.push(i); remaining.delete(i);
      }
    }
    indices.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const selected = [...muscles].sort((a, b) => a - b);
    const credits = indices.map(i => selected.map(m => matrix[i]![m]!));
    // A direct-set budget is an integer count, so retain it exactly when attainable.
    // Fractional overlap for another muscle must not relax this muscle's direct budget.
    const tolerances = selected.map((_, m) => credits.some(row => row[m]! > 0 && row[m]! < 1) ? SET_TARGET_TOLERANCE : 0);
    const primary = indices.map(i => selected.map(m => options.primary?.[i]?.[m] ?? matrix[i]![m]!));
    const exposures = selected.map((_, m) => {
      const main = indices.flatMap((i, j) => primary[j]![m]! > 0 ? [days[i]!] : []);
      return [...new Set(main.length ? main : indices.flatMap((i, j) => credits[j]![m]! > 0 ? [days[i]!] : []))];
    });
    const balanceCredits = selected.map((_, m) => primary.some(c => c[m]! > 0) ? primary.map(c => c[m]!) : credits.map(c => c[m]!));
    const dayGroups = [...new Set(indices.map(i => days[i]!))].map(day => indices.flatMap((i, j) => days[i] === day ? [j] : []));
    const weights = indices.map(i => options.priorities?.[i] === 2 ? 2 : 1);
    const prior = indices.map(i => original[i]!);
    const objective = (counts: number[]): Score => {
      let bounds = 0, outsideTolerance = 0, distance = 0, dayBalance = 0, exerciseBalance = 0;
      selected.forEach((muscle, m) => {
        const volume = counts.reduce((sum, n, j) => sum + n * credits[j]![m]!, 0);
        if (strict) bounds += Math.max(0, 10 - volume) ** 2 + Math.max(0, volume - 20) ** 2;
        const error = Math.abs(volume - targets[muscle]!);
        outsideTolerance += Math.max(0, error - tolerances[m]!) ** 2;
        distance += error ** 2;
        const dayVolumes = exposures[m]!.map(day => counts.reduce((sum, n, j) => sum + (days[indices[j]!] === day ? n * balanceCredits[m]![j]! : 0), 0));
        const total = dayVolumes.reduce((sum, n) => sum + n, 0);
        // Share variance avoids preferring a smaller dose merely because all counts shrink.
        if (total > 0) dayBalance += dayVolumes.reduce((sum, n) => sum + (n / total - 1 / dayVolumes.length) ** 2, 0);
      });
      for (const group of dayGroups) {
        const total = group.reduce((sum, j) => sum + counts[j]!, 0), weight = group.reduce((sum, j) => sum + weights[j]!, 0);
        exerciseBalance += group.reduce((sum, j) => sum + counts[j]! ** 2 / weights[j]!, 0) / total ** 2 - 1 / weight;
      }
      return [bounds, outsideTolerance, maximum >= 2 ? counts.filter(n => n === 1).length : 0, dayBalance, exerciseBalance, distance, counts.reduce((sum, n, j) => sum + Math.abs(n - prior[j]!), 0)];
    };
    let bestCounts = indices.map(i => Math.max(1, Math.min(maximum, original[i]!))), bestScore = objective(bestCounts);
    const consider = (counts: number[]) => {
      const score = objective(counts);
      if (better(score, bestScore)) { bestCounts = [...counts]; bestScore = score; }
    };
    if (maximum ** indices.length <= 100_000) {
      const counts = new Array<number>(indices.length).fill(1);
      const enumerate = (i: number) => {
        if (i === counts.length) { consider(counts); return; }
        for (let n = 1; n <= maximum; n++) { counts[i] = n; enumerate(i + 1); }
      };
      enumerate(0);
    } else {
      const fixedSeeds = [...new Set([1, Math.min(2, maximum), Math.min(3, maximum), maximum])].map(n => indices.map(() => n));
      const descend = (seed: number[]) => {
        let counts = [...seed], score = objective(counts);
        for (let iteration = 0; iteration < 200; iteration++) {
          let winner: number[] | undefined, winnerScore = score;
          const move = (i: number, ni: number, j?: number, nj = 0) => {
            if (ni === counts[i] && (j === undefined || nj === counts[j])) return;
            const candidate = [...counts]; candidate[i] = ni;
            if (j !== undefined) candidate[j] = nj;
            const value = objective(candidate);
            if (better(value, winnerScore)) { winner = candidate; winnerScore = value; }
          };
          for (let i = 0; i < counts.length; i++) for (let n = 1; n <= maximum; n++) move(i, n);
          if (!winner) for (let i = 0; i < counts.length; i++) for (let j = i + 1; j < counts.length; j++) {
            // Full pair replacements cross the old ±1/exact-credit traps. Bound the
            // neighbourhood for large imported plans or an unusually high chosen cap.
            const values = (k: number) => maximum <= 10 && counts.length <= 24
              ? Array.from({ length: maximum }, (_, n) => n + 1)
              : [...new Set([1, maximum, counts[k]! - 1, counts[k]!, counts[k]! + 1])].filter(n => n >= 1 && n <= maximum);
            for (const ni of values(i)) for (const nj of values(j)) move(i, ni, j, nj);
          }
          if (!winner) break;
          counts = winner; score = winnerScore;
        }
        return counts;
      };
      for (const seed of [bestCounts, ...fixedSeeds]) consider(descend(seed));
      // Finish from the best multi-start candidate, rather than return a nonstationary seed.
      consider(descend(bestCounts));
    }
    indices.forEach((i, j) => { result[i] = bestCounts[j]!; });
  }
  return result;
}
