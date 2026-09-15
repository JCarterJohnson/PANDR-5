export type MuscleId = string;
export type Rir = number | '0-1' | '<0';
export interface Contribution { muscle: MuscleId; coefficient: number }
export interface Exercise { id: string; name: string; equipment: string; contributions: Contribution[]; source: string; beyondFailureAllowed: boolean }
export interface PlanExercise { id: string; exerciseId: string; sets: number; repMin: number; repMax: number; rir: Rir[]; load: number; increment: number; loadMode: 'external' | 'assistance' | 'bodyweight' }
export interface PlanDay { id: string; name: string; kind: 'training' | 'rest'; exercises: PlanExercise[] }
export interface TrainingPlan { id: string; name: string; days: PlanDay[]; targets: Record<MuscleId, number>; updatedAt: string }
export interface Settings { name: string; strict: boolean; unit: 'kg' | 'lb'; startDate: string; increasePercent: number; decreasePercent: number; restSeconds: number }
export interface SetLog { index: number; reps: number; rir: number; completed: boolean }
export interface ExerciseLog { increment?: number; slotId: string; exerciseId: string; name: string; load: number; unit: 'kg' | 'lb'; loadMode: PlanExercise['loadMode']; repMin: number; repMax: number; targetRir: Rir[]; contributions: Contribution[]; sets: SetLog[]; notes: string; recommendation?: Recommendation }
export interface Session { id: string; dayId: string; dayName: string; date: string; startedAt: string; completedAt?: string; week: number; pivot: boolean; exercises: ExerciseLog[]; notes: string }
export interface CheckIn { id: string; date: string; week: number; poorSleep: boolean; runDown: boolean; elevatedHr: boolean; lingeringSoreness: boolean; performanceDip: boolean; jointPain: boolean; notes: string }
export interface Recommendation { action: 'increase' | 'decrease' | 'hold'; nextLoad: number; targetReps: number; reason: string; anchorIndex: number }
export interface AppData { schemaVersion: 1; id: string; updatedAt: string; settings: Settings; plan: TrainingPlan; exercises: Exercise[]; sessions: Session[]; checkIns: CheckIn[]; activeSession?: Session }
export interface VolumeRow { muscle: string; direct: number; fractional: number; total: number; target?: number }
export interface ConstraintIssue { code: string; message: string; severity: 'error' | 'warning' }
