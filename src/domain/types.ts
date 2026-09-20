export type MuscleId = string;
export type Rir = number | '0-1' | '<0';
export interface Contribution { muscle: MuscleId; coefficient: number }
export interface Exercise { id: string; name: string; equipment: string; contributions: Contribution[]; source: string; beyondFailureAllowed: boolean }
export interface BodyweightResistance { resistance: number; addedLoads: number[]; assistanceLoads: number[] }
export interface PlanExercise { id: string; exerciseId: string; sets: number; repMin: number; repMax: number; rir: Rir[]; load: number; increment: number; loadMode: 'external' | 'assistance' | 'bodyweight'; availableLoads?: number[]; bodyweight?: BodyweightResistance }
export interface PlanDay { id: string; name: string; kind: 'training' | 'rest'; exercises: PlanExercise[] }
export interface RecoveryDecision { action: 'reduce' | 'restore' | 'hold' | 'minimum'; reason: string; effectiveWeek: number; beforeSets: number; afterSets: number }
export interface RecoveryAdjustment { checkInId: string; reviewedWeek: number; effectiveWeek: number; action: 'reduce' | 'restore'; counts: Record<string, number> }
export interface TrainingPlan { id: string; name: string; days: PlanDay[]; targets: Record<MuscleId, number>; updatedAt: string; recovery?: { cycleId: string; signature: string; adjustments: RecoveryAdjustment[] } }
export interface Settings { name: string; strict: boolean; unit: 'kg' | 'lb'; startDate: string; increasePercent: number; decreasePercent: number; restSeconds: number; theme?: 'light' | 'dark' | 'automatic'; checkInDay?: number; adaptiveRecovery?: boolean }
export interface TrainingCycle { id: string; name: string; startDate: string; endedAt?: string; plan?: TrainingPlan }
export interface SetLog { index: number; reps: number; rir: number; completed: boolean }
export interface ExerciseLog { increment?: number; slotId: string; exerciseId: string; name: string; load: number; unit: 'kg' | 'lb'; loadMode: PlanExercise['loadMode']; availableLoads?: number[]; bodyweight?: BodyweightResistance; repMin: number; repMax: number; targetRir: Rir[]; contributions: Contribution[]; sets: SetLog[]; notes: string; recommendation?: Recommendation }
export interface Session { id: string; cycleId?: string; dayId: string; dayName: string; date: string; startedAt: string; completedAt?: string; week: number; pivot: boolean; exercises: ExerciseLog[]; notes: string }
export interface CheckIn { id: string; cycleId?: string; date: string; week: number; poorSleep: boolean; runDown: boolean; elevatedHr: boolean; lingeringSoreness: boolean; performanceDip: boolean; jointPain: boolean; notes: string; sleepHours?: number; fatigue?: number; soreness?: number; stress?: number; measuredPerformanceDip?: boolean; performanceEvidence?: string[]; assessmentVersion?: '1' | '2'; coaching?: RecoveryDecision }
export interface Recommendation { action: 'increase' | 'decrease' | 'hold'; nextLoad: number; targetReps: number; reason: string; anchorIndex: number; nextLoadMode?: PlanExercise['loadMode']; resistanceChangePercent?: number; status?: 'equipment-needed' | 'bodyweight-setup'; requiredChange?: { min: number; max: number } }
export interface AppData { schemaVersion: 1; id: string; updatedAt: string; settings: Settings; plan: TrainingPlan; exercises: Exercise[]; sessions: Session[]; checkIns: CheckIn[]; activeSession?: Session; cycles?: TrainingCycle[]; activeCycleId?: string }
export interface VolumeRow { muscle: string; direct: number; fractional: number; total: number; target?: number }
export interface ConstraintIssue { code: string; message: string; severity: 'error' | 'warning' }
