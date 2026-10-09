const EPSILON = 1e-8;
type Score = [number, number, number, number, number];
const better = (a: Score, b: Score) => {
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) > EPSILON) return a[i]! < b[i]!;
  }
  return false;
};

/** Solve independent muscle/exercise components without letting balance override target fit.
 * Small components are enumerated exactly; larger ones use deterministic multi-start
 * integer descent, including coupled moves and volume-neutral transfers between days.
 * The per-exercise cap is an allocation preference, not a medical safety threshold.
 */
export function fitSetCounts(matrix: number[][], days: number[], targets: number[], original: number[], strict: boolean, maximum: number): number[] {
  const result = [...original];
  const remaining = new Set(matrix.flatMap((row, i) => row.some(Boolean) ? [i] : []));
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
    const selected = [...muscles];
    const credits = indices.map(i => selected.map(m => matrix[i]![m]!));
    const exposures = selected.map((_, m) => [...new Set(indices.flatMap((i, j) => credits[j]![m]! > 0 ? [days[i]!] : []))]);
    const prior = indices.map(i => original[i]!); // only used to preserve edits on otherwise equal fits
    const objective = (counts: number[]): Score => {
      let bounds = 0, distance = 0, balance = 0;
      selected.forEach((muscle, m) => {
        const dayVolumes = exposures[m]!.map(day => counts.reduce((sum, n, j) => sum + (days[indices[j]!] === day ? n * credits[j]![m]! : 0), 0));
        const volume = dayVolumes.reduce((sum, n) => sum + n, 0);
        if (strict) bounds += Math.max(0, 10 - volume) ** 2 + Math.max(0, volume - 20) ** 2;
        distance += (volume - targets[muscle]!) ** 2;
        const mean = volume / dayVolumes.length;
        balance += dayVolumes.reduce((sum, n) => sum + (n - mean) ** 2, 0);
      });
      return [bounds, distance, balance, counts.reduce((sum, n) => sum + n * n, 0), counts.reduce((sum, n, j) => sum + Math.abs(n - prior[j]!), 0)];
    };
    let bestCounts = indices.map(i => Math.min(maximum, original[i]!));
    let bestScore = objective(bestCounts);
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
      const seeds = [bestCounts, ...[1, Math.min(3, maximum), maximum].map(n => indices.map(() => n))];
      for (const seed of seeds) {
        let counts = [...seed], score = objective(counts);
        for (let iteration = 0; iteration < 500; iteration++) {
          let winner: number[] | undefined, winnerScore = score;
          const move = (i: number, di: number, j?: number, dj = 0) => {
            if (counts[i]! + di < 1 || counts[i]! + di > maximum || (j !== undefined && (counts[j]! + dj < 1 || counts[j]! + dj > maximum))) return;
            const candidate = [...counts]; candidate[i]! += di;
            if (j !== undefined) candidate[j]! += dj;
            const value = objective(candidate);
            if (better(value, winnerScore)) { winner = candidate; winnerScore = value; }
          };
          for (let i = 0; i < counts.length; i++) for (const delta of [-1, 1]) move(i, delta);
          if (!winner) for (let i = 0; i < counts.length; i++) for (let j = i + 1; j < counts.length; j++) {
            for (const di of [-1, 1]) for (const dj of [-1, 1]) move(i, di, j, dj);
          }
          if (!winner) break;
          counts = winner; score = winnerScore;
        }
        consider(counts);
      }
    }
    indices.forEach((i, j) => { result[i] = bestCounts[j]!; });
  }
  return result;
}
