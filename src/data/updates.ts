export type AppUpdate = {
 version: string;
 title: string;
 added?: string[];
 improved?: string[];
 fixed?: string[];
};

/** User-facing release history. Add the new release here when bumping package.json. */
export const appUpdates: AppUpdate[] = [
 {version:'0.5.9',title:'Feedback, name saving, and independent assessments',added:[
  'Read the update log beside your app version in Settings, including new features, improvements, and bug fixes.',
  'Report a bug, request a feature, or share feedback through the new Google Form in Settings. Contact details are optional.',
 ],fixed:[
  'Your name saves automatically, including while an assessment or workout is in progress.',
  'Other preferences can save during an assessment. Weight units remain fixed until its tests are finished.',
  'End a training cycle or schedule a future one without finishing or discarding your assessment. Test results and unfinished entries are preserved.',
 ]},
 {version:'0.5.8',title:'Quiet saving and deliberate dragging',added:[
  'See your installed app version in Settings.',
 ],improved:[
  'Hold an exercise’s three-line handle briefly before dragging it. Early movement cancels the hold.',
 ],fixed:[
  'Plan autosaves no longer shift your screen or put a saving popup over the editor.',
  'The updated desktop download opens newer saved assessment data without resetting your account.',
 ]},
 {version:'0.5.7',title:'Automatic saves and grouped assessments',improved:[
  'Applied plan changes save automatically when you pause editing. Leaving the editor waits for the save.',
  'Assessment exercises stay together by muscle group, with group order following their first appearance in your plan.',
 ],fixed:[
  'Failed or invalid plan edits stay available to correct and retry.',
  'Completed tests and unfinished assessment inputs stay intact when you change your plan.',
 ]},
 {version:'0.5.6',title:'Choose, search, and reorder exercises',added:[
  'Drag exercises with a three-line handle. Keyboard Up/Down controls are also available.',
  'Search names and aliases with a dropdown of matching exercises when adding or replacing a movement.',
 ],fixed:[
  'Add exercise opens a picker instead of inserting a bench press.',
  'Plan changes can save during an unfinished assessment. Its pending exercises follow your current selections.',
 ]},
 {version:'0.5.5',title:'Equipment-specific dumbbell defaults',improved:[
  'New dumbbell prescriptions use 2.5 lb steps through 50 lb, then 5 lb steps. Edit the rack list to match your gym.',
  'Machine and cable defaults use a configurable 5 lb increment, separate from barbell plate sizes.',
  'Existing equipment choices and progression rules are preserved.',
 ]},
 {version:'0.5.4',title:'Scale days together',added:[
  'Scale one or more training days proportionally with a percentage slider or a reference muscle’s weekly set goal.',
  'Preview the exercise sets and all affected muscle totals before applying changes.',
 ],improved:[
  'New barbell prescriptions assume a 45 lb bar and paired 5, 10, 25, and 45 lb plates. Smaller plates remain selectable.',
 ]},
 {version:'0.5.3',title:'Balanced weekly set allocation',improved:[
  'Adjust exercise sets to targets distributes each muscle’s work across its training days.',
  'Choose a maximum automatic set count per exercise; it starts at six.',
 ],fixed:[
  'The allocator no longer favors extreme splits such as 11 sets on one day and one on another.',
  'Targets that cannot be reached with your exercise selection and whole sets show the remaining mismatch.',
 ]},
 {version:'0.5.2',title:'One clear assessment prompt',fixed:[
  'A saved assessment shows Resume assessment without a duplicate Begin prompt, including after reopening the app.',
 ]},
 {version:'0.5.1',title:'Assess at your own pace',added:[
  'Save and exit an assessment, then resume its unfinished entries on another visit.',
 ],improved:[
  'Each workout unlocks when its own exercises have baselines. Other days and an overnight delay no longer block it.',
 ]},
 {version:'0.5.0',title:'Exercise-specific strength assessments',added:[
  'Resumable initial strength assessments set each exercise’s starting load from a clean maximum or standardized repetition test.',
  'New exercises and long training gaps prompt reassessment. Completed baselines and their setup are saved with your account.',
  'Review baseline estimates, equipment limits, and load overrides.',
 ]},
 {version:'0.4.0',title:'Equipment, recovery, and training cycles',added:[
  'Record exact equipment loads and measured bodyweight resistance, added loads, and assistance.',
  'Keep named training cycles with archived plans and history filters.',
 ],improved:[
  'Progression shows when your equipment cannot make a qualifying load change.',
  'Recovery volume responds to repeated check-ins and can return toward your saved plan.',
  'Performance declines use multiple comparable exposures, including gradual deterioration.',
  'Account saving, theme options, check-in scheduling, exports, and support hearts are available.',
 ]},
 {version:'0.3.0',title:'A larger exercise library',added:[
  'Browse 372 exercises, searchable aliases, setup notes, muscle credits, research sources, and confidence information.',
  'Additional muscle groups support custom plans; original exercises and saved custom imports stay compatible.',
 ]},
 {version:'0.2.0',title:'Google accounts and cross-device saving',added:[
  'Sign in with Google and synchronize training across devices, including the desktop app.',
  'Separate account data from older local profiles, with explicit conflict reporting and complete backups.',
 ]},
 {version:'0.1.0',title:'The first PANDR-5 app',added:[
  'Plan workouts, log sets, calculate progression, track muscle volume, and record recovery check-ins.',
  'Review training history and export CSV or complete JSON backups.',
  'Download desktop builds or install the web app on a phone.',
 ]},
];
