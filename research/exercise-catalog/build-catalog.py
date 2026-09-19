"""Deterministic catalog compiler. Explicit reviewed variants, never an equipment cross product.
Run from any directory: python3 research/exercise-catalog/build-catalog.py
"""
import json,csv,re,pathlib,collections,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'src/data/catalog'
legacy=json.loads((ROOT/'tests/fixtures/legacy-catalog.json').read_text())['exercises']
muscles=json.loads((ROOT/'tests/fixtures/legacy-muscles.json').read_text())+[
 {'id':'abdominals','name':'Abdominals'},{'id':'obliques','name':'Obliques'},
 {'id':'neck','name':'Neck muscles'},{'id':'wrist-flexors','name':'Wrist flexors'},{'id':'wrist-extensors','name':'Wrist extensors'}]
N={m['id']:m['name'] for m in muscles}
F={}
def family(key,category,credits,rationale,sources,confidence='medium',limitation='Direct evidence for this exact setup is limited. Fractions are conservative bookkeeping estimates, not measured hypertrophy equivalence.'):
 F[key]=dict(category=category,credits=credits,rationale=rationale,sourceIds=sources,confidence=confidence,limitations=limitation)
family('press','Horizontal press',{'chest':1,'anterior-delts':.5,'triceps':.25},'Loaded shoulder horizontal adduction/flexion gives chest full credit; anterior deltoid assists and elbow extension earns conservative triceps credit calibrated to the source press.', ['anatomy-upper','press'])
family('incline','Incline press',{'chest':1,'anterior-delts':.5,'triceps':.25},'Low-incline pressing retains chest as the target with shoulder-flexor and elbow-extensor assistance. Bench angle distinguishes loading, not a new muscle group.', ['anatomy-upper','incline'])
family('closepress','Elbow-extension biased press',{'triceps':1,'chest':.5,'anterior-delts':.25},'Close elbow path emphasizes loaded elbow extension; chest and anterior deltoid still move the upper arm. Full triceps credit is an anatomical inference for this specified technique.', ['anatomy-upper','press'],'medium')
family('fly','Shoulder horizontal adduction',{'chest':1},'Horizontal adduction against resistance directly loads the pectorals; nearly fixed elbows do not justify triceps credit.', ['anatomy-upper'])
family('dip','Dip',{'chest':1,'triceps':.5,'anterior-delts':.25},'Forward-leaning dip combines loaded shoulder movement with elbow extension; chest is the designated target and triceps a substantial synergist.', ['anatomy-upper'],'low')
family('ohp','Overhead press',{'anterior-delts':1,'lateral-delts':.5,'triceps':.5},'Shoulder elevation directly loads anterior deltoid with lateral-deltoid assistance and meaningful elbow extension. Trunk bracing receives no automatic credit.', ['anatomy-upper'])
family('landpress','Angled press',{'anterior-delts':1,'chest':.5,'triceps':.25},'The upward-forward arc combines shoulder flexion with some adduction and elbow extension; anterior deltoid is the designated prime mover.', ['anatomy-upper'],'low')
family('lateral','Shoulder abduction',{'lateral-delts':1},'Loaded humeral abduction directly trains lateral deltoid; scapular rotation and grip are not automatically counted.', ['anatomy-upper','lateral'])
family('front','Shoulder flexion',{'anterior-delts':1},'Loaded shoulder flexion targets anterior deltoid; no elbow movement is required.', ['anatomy-upper'])
family('rear','Shoulder horizontal abduction',{'rear-delts':1,'mid-low-traps-rhomboids':.5},'Horizontal abduction targets rear deltoid; deliberate scapular retraction gives the grouped retractors secondary credit.', ['anatomy-upper'])
family('row','Horizontal pull — tucked elbows',{'lats':1,'mid-low-traps-rhomboids':.5,'biceps':.5,'rear-delts':.25},'Tucked-elbow shoulder extension emphasizes lats; scapular retraction, elbow flexion and posterior shoulder assistance earn bounded supporting credits.', ['anatomy-upper','pull'])
family('highrow','Horizontal pull — flared elbows',{'mid-low-traps-rhomboids':1,'rear-delts':.5,'biceps':.5,'lats':.25},'Flared elbows and deliberate scapular retraction emphasize upper-back retractors; posterior shoulder and elbow flexors assist. Lats receive only minor credit in this path.', ['anatomy-upper'],'medium')
family('vertical','Vertical pull',{'lats':1,'biceps':.5,'mid-low-traps-rhomboids':.25},'Shoulder adduction/extension loads lats; elbow flexors contribute substantially and scapular movement supports modest grouped-back credit.', ['anatomy-upper','pull'])
family('pullover','Shoulder extension — nearly fixed elbow',{'lats':1},'Loaded shoulder extension targets lats/teres major while elbow angle stays nearly fixed; no automatic elbow-flexor or triceps credit.', ['anatomy-upper'])
family('dbpullover','Supine pullover',{'lats':1,'chest':.5},'Overhead-to-chest shoulder extension can load lats and pectorals; the designated lat emphasis assumes a controlled, nearly fixed elbow angle.', ['anatomy-upper'],'low')
family('shrug','Scapular elevation',{'upper-traps':1},'Dynamic resisted scapular elevation directly loads upper trapezius; holding the implement does not earn forearm set credit.', ['anatomy-upper'])
family('retract','Scapular retraction',{'mid-low-traps-rhomboids':1},'Deliberate loaded scapular retraction targets the grouped retractors without counting elbow flexion or passive arm support.', ['anatomy-upper'])
family('yraise','Scapular upward rotation / Y raise',{'mid-low-traps-rhomboids':1,'lateral-delts':.25},'The defined Y path emphasizes lower-trapezius scapular action with minor shoulder-elevation assistance. Group credit does not mean equal rhomboid recruitment.', ['anatomy-upper'],'low')
family('curl','Supinated elbow flexion',{'biceps':1,'brachialis':.5,'brachioradialis':.25},'Supinated elbow flexion directly targets biceps; brachialis remains an elbow flexor and brachioradialis earns minor supporting credit, calibrated to source curls.', ['anatomy-upper','elbow'])
family('hammer','Neutral-grip elbow flexion',{'brachialis':1,'biceps':.5,'brachioradialis':.5},'Neutral forearm position preserves all three elbow flexors; the source hammer-curl convention designates brachialis primary. Exact partition is not experimentally established.', ['anatomy-upper','elbow'])
family('reversecurl','Pronated elbow flexion',{'brachioradialis':1,'brachialis':.5,'biceps':.25},'Pronation reduces biceps mechanical advantage; brachioradialis is designated the target while brachialis still flexes the elbow. Wrist stabilization alone is not counted.', ['anatomy-upper','elbow'],'low')
family('triceps','Elbow extension',{'triceps':1},'Loaded elbow extension directly trains triceps; shoulder position changes head-specific loading but does not justify extra whole-muscle set credit.', ['anatomy-upper','triceps'])
family('squat','Squat / knee-dominant press',{'quads':1,'glute-max':.5,'adductors':.25},'Knee extension earns full quad credit; meaningful hip extension earns glute and adductor assistance. Hamstrings and spinal bracing are not automatically credited.', ['anatomy-lower','squat','hip-thrust'])
family('deep','Deep hip-and-knee extension',{'quads':1,'glute-max':1,'adductors':.5},'Substantial knee and hip excursion loads quads and glute max as prime movers; adductor magnus assists hip extension. Full glute credit is conditional on the specified deep ROM.', ['anatomy-lower','squat','hip-thrust'])
family('split','Unilateral squat / lunge',{'quads':1,'glute-max':.5,'adductors':.25},'Working-leg knee and hip extension load quads with glute/adductor assistance. Balance demand does not automatically earn glute med/min credit.', ['anatomy-lower','squat'])
family('glutesplit','Long-stride unilateral squat',{'glute-max':1,'quads':.5,'adductors':.25},'Long stride, forward torso and deep working-hip flexion emphasize hip extension while retaining substantial knee-extension work.', ['anatomy-lower','glute-review'],'low')
family('extension','Knee extension',{'quads':1},'Resisted knee extension directly trains quadriceps; pelvic and ankle stabilization are not credited.', ['anatomy-lower'])
family('hinge','Hip hinge',{'hamstrings':1,'glute-max':.5,'adductors':.25},'Hip extension with slightly flexed knees lengthens and loads biarticular hamstrings; glute max and adductor magnus assist. Erector bracing is deliberately not counted.', ['anatomy-lower','ham-curl','lumbar'])
family('deadlift','Floor deadlift',{'glute-max':1,'quads':.5,'hamstrings':.5},'Floor pull requires hip and knee extension; glute max is designated primary with bounded knee-extensor/hamstring credit. Isometric back/grip work is omitted.', ['anatomy-lower'],'low')
family('legcurl','Knee flexion',{'hamstrings':1},'Resisted knee flexion directly trains hamstrings. Joint position affects regional loading; no unmeasured calf or adductor allocation is added.', ['anatomy-lower','ham-curl'])
family('bridge','Bent-knee hip extension',{'glute-max':1},'Bent-knee hip extension targets glute max; short hamstring length and weak longitudinal growth evidence argue against routine hamstring credit.', ['anatomy-lower','hip-thrust','glute-review'])
family('kickback','Hip extension isolation',{'glute-max':1},'Deliberate loaded hip extension targets glute max; lumbar motion and passive hamstring tension should not substitute for hip movement.', ['anatomy-lower','glute-review'])
family('abduction','Hip abduction',{'glute-med-min':1},'Resisted hip abduction directly loads the represented gluteal abductors; the group does not include tensor fasciae latae.', ['anatomy-lower','adduction'])
family('adduction','Hip adduction',{'adductors':1},'Resisted hip adduction directly loads the adductor group; no stabilization credits are added.', ['anatomy-lower','adduction'])
family('calf','Straight-knee plantarflexion',{'gastrocnemius':1,'soleus':.5},'Plantarflexion with near-extended knee loads gastrocnemius and soleus; source-calibrated soleus half credit is conservative, not a proven ratio.', ['anatomy-lower','calf'])
family('soleus','Bent-knee plantarflexion',{'soleus':1},'Bent-knee plantarflexion retains soleus loading while shortening gastrocnemius; routine gastrocnemius credit is omitted conservatively.', ['anatomy-lower','calf'])
family('spine','Spinal extension',{'erector-spinae':1},'Intentional spinal extension against resistance directly loads spinal extensors; distinguish it from neutral-spine hip extension.', ['anatomy-neck','lumbar','lumbar-counter'])
family('crunch','Trunk flexion / posterior pelvic curl',{'abdominals':1},'Resisted trunk flexion or deliberate posterior pelvic curling directly loads rectus abdominis. Hip flexion alone does not qualify.', ['anatomy-trunk'])
family('oblique','Trunk rotation / lateral flexion',{'obliques':1},'Resisted rotation or lateral flexion targets internal/external obliques; pelvic stability and arm movement alone do not qualify.', ['anatomy-trunk'])
family('anti-extension','Targeted trunk anti-extension',{'abdominals':1},'Here trunk anti-extension is the intended, limiting resisted task, not incidental bracing in another lift. Full credit is a low-confidence isometric-to-dynamic accounting convention.', ['anatomy-trunk','core-emg'],'low')
family('anti-rotation','Targeted trunk anti-rotation / lateral hold',{'obliques':1},'Resisting trunk rotation or lateral bending is the explicit limiting task. Count a deliberate working bout, not every breath, step or second.', ['anatomy-trunk','core-emg'],'low')
family('neck','Direct cervical resistance',{'neck':1},'Direct resisted cervical motion trains the intended neck compartment; it does not imply equal flexor, extensor and lateral-flexor stimulation.', ['anatomy-neck','neck'],'low')
family('wristflex','Wrist flexion',{'wrist-flexors':1},'Dynamic wrist flexion directly loads wrist flexors; this differs from finger gripping or elbow flexion.', ['anatomy-upper','wrist'])
family('wristext','Wrist extension',{'wrist-extensors':1},'Dynamic wrist extension directly loads wrist extensors; passive gripping does not receive the same credit.', ['anatomy-upper','wrist'])
family('power','Weightlifting / ballistic compound',{'glute-max':1,'quads':.5,'upper-traps':.25},'Hip extension drives the pull with knee extension and a brief active shrug. The mapping is a rough accounting placeholder for loaded working sets, not equivalent to hard hypertrophy sets.', ['anatomy-lower','anatomy-upper','olympic'],'low')
family('swing','Ballistic hip hinge',{'glute-max':1,'hamstrings':.5},'Ballistic hip extension drives the bell; arms guide rather than lift. Hip extensors receive conservative credit; grip, abs and back stabilization are omitted.', ['anatomy-lower','olympic'],'low')

records=[]
def add(f, name, equipment, setup, aliases='', mode='bilateral', loading='external', confidence=None):
 # Names define durable IDs in this initial release; future renames must retain the ID.
 ident='p5-'+re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')
 if ident in {r['exercise']['id'] for r in records}: raise ValueError(ident)
 spec=F[f]
 als=[a.strip() for a in aliases.split('|') if a.strip()]
 for word,abbr in [('Dumbbell','DB'),('Barbell','BB'),('Kettlebell','KB')]:
  if word in name: als.append(name.replace(word,abbr))
 als=list(dict.fromkeys(als))
 credits=[{'muscle':m,'coefficient':v} for m,v in spec['credits'].items()]
 conf=confidence or spec['confidence']
 lim=spec['limitations']
 if 'Machine' in equipment or equipment=='Smith machine': lim+=' Machine lever arms, cable routing, cams and seat settings vary; match the described joint path rather than a product label.'
 if mode in ['unilateral','alternating']: lim+=' Sets are per side: one prescribed set means one set on each side; do not double bilateral group volume.'
 if loading=='bodyweight/weighted/assisted': lim+=' Added weight or counterweight assistance uses the same ID when joint path/ROM is unchanged; record load type in the plan.'
 if f in ['power','swing']: lim+=' Technique practice, low-effort speed sets and conditioning bouts are not validated hypertrophy-equivalent sets; no beyond-failure work.'
 if f=='neck': lim+=' Neck is a coarse group: alternate movement directions as needed; extension findings do not validate other directions. Use controlled resistance and comfortable ROM.'
 meta=dict(id=ident,aliases=als,category=spec['category'],laterality=mode,loading=loading,setup=setup,primaryMuscle=credits[0]['muscle'],secondaryMuscles=[c['muscle'] for c in credits if c['coefficient']==.5],tertiaryMuscles=[c['muscle'] for c in credits if c['coefficient']==.25],rationale=spec['rationale'],confidence=conf,sourceIds=spec['sourceIds'],limitations=lim,family=f,allocationEvidence=[dict(**c,confidence=conf,basis='Editorial mapping of anatomical role to PANDR-5 credit; sources do not measure an exact fraction.') for c in credits])
 exercise=dict(id=ident,name=name,equipment=equipment,contributions=credits,source='PANDR-5 research catalog v1: '+', '.join(spec['sourceIds']),beyondFailureAllowed=False)
 records.append(dict(exercise=exercise,**meta))

def batch(f,equipment,lines,mode='bilateral',loading='external'):
 for line in lines.strip().splitlines():
  bits=line.split(' | ')
  add(f,bits[0],equipment,bits[1],bits[2] if len(bits)>2 else '',mode,loading)

# Chest: no duplicate of the legacy flat barbell / incline dumbbell / machine fly entries.
batch('press','Dumbbell','''Dumbbell Flat Bench Press | Flat bench, moderate elbow flare, lower to a comfortable chest stretch. | Flat DB press
Dumbbell Floor Press | Lie on floor; upper arms stop at floor, limiting shoulder extension.
Single-Arm Dumbbell Bench Press | Flat bench, one arm presses while torso stays level.''')
records[-1]['laterality']='unilateral'
batch('press','Barbell','''Barbell Decline Bench Press | Modest decline bench with secured legs; bar descends to lower chest.
Barbell Floor Press | Upper arms stop on floor; reset without bouncing.''')
batch('incline','Barbell','''Barbell Incline Bench Press | Bench approximately 15–30 degrees; controlled descent to upper chest. | Incline barbell press''')
batch('press','Smith machine','''Smith Flat Bench Press | Flat bench positioned so fixed bar path meets mid chest.
Smith Decline Bench Press | Decline bench secured under fixed bar path.''')
batch('incline','Smith machine','''Smith Incline Bench Press | Low incline 15–30 degrees; bench aligned with fixed path.''')
batch('press','Selectorized machine','''Seated Fixed-Path Chest Press | Back supported; linked handles follow a roughly horizontal press path. | Chest press machine''')
batch('press','Plate-loaded machine','''Converging Chest Press | Independent lever arms converge toward midline; flat pressing angle. | Iso-lateral chest press''')
batch('incline','Plate-loaded machine','''Incline Converging Chest Press | Independent handles converge along an upward press path; seat sets low-incline angle.''')
batch('press','Cable','''Standing Cable Chest Press | Split stance, handles at chest height; resist torso sway.
Supine Cable Bench Press | Flat bench between low pulleys; cables provide outward resistance throughout press.''')
batch('press','Resistance band','''Band Chest Press | Anchor behind at chest height; step forward to maintain tension through ROM.''')
batch('press','Specialty bar','''Swiss-Bar Bench Press | Flat bench with multi-grip neutral handles; elbows moderately tucked. | Football-bar bench press
Cambered-Bar Bench Press | Camber permits deeper shoulder extension; use only controlled comfortable depth. | Buffalo-style cambered bench press''')
batch('fly','Dumbbell','''Dumbbell Flat Fly | Flat bench, fixed slight elbow bend; bring upper arms together. | Dumbbell flyes
Dumbbell Incline Fly | Low incline bench, fixed elbow bend; avoid turning into a press.''')
batch('fly','Cable','''Standing Mid-Height Cable Fly | Pulleys near shoulder height; arc hands inward without elbow extension. | Cable crossover
High-to-Low Cable Fly | Pulleys above shoulders; adduct upper arms downward across torso. | Decline cable fly
Low-to-High Cable Fly | Low pulleys; adduct arms upward to upper-chest height. | Incline cable fly
Supine Cable Fly | Flat bench between low pulleys; maintain small fixed elbow bend.
Single-Arm Cable Fly | One pulley near shoulder height; resist trunk rotation.''')
records[-1]['laterality']='unilateral'
batch('fly','Resistance band','''Band Chest Fly | Anchor behind shoulder level; bring upper arms together with fixed elbow bend.''')
batch('press','Bodyweight','''Push-Up | Hands near shoulder width, trunk rigid; lower chest between hands. | Press-up|Standard pushup
Feet-Elevated Push-Up | Feet on stable support; hands on floor; retain full controlled chest ROM. | Decline pushup
Kneeling Push-Up | Knees on floor; straight line from knees to shoulders.
Deficit Push-Up | Hands on stable handles or blocks; lower chest below hand level.
Close-Grip Push-Up | Hands closer than shoulder width, elbows tucked; chest still moves through meaningful ROM. | Diamond pushup
Ring Push-Up | Suspension rings hang low; control independent hand paths. | Suspension push-up''',loading='bodyweight/weighted/assisted')
batch('dip','Bodyweight','''Parallel-Bar Dip | Torso leans forward, controlled depth; shoulder extension stays comfortable. | Chest dip|Weighted dip|Assisted dip
Ring Dip | Independently moving rings, slight torso lean, controlled shoulder extension.''',loading='bodyweight/weighted/assisted')
batch('dip','Resistance band','''Band-Assisted Parallel-Bar Dip | Band under knees or feet supplies greatest assistance near bottom; controlled forward lean.''',loading='assistance')
# Shoulders
batch('ohp','Barbell','''Standing Barbell Overhead Press | Strict standing press from upper chest overhead without leg drive. | Military press|Strict press
Seated Barbell Overhead Press | Back-supported upright bench; no leg drive.''')
batch('ohp','Dumbbell','''Seated Dumbbell Shoulder Press | Back support near upright; elbows in scapular plane. | DB shoulder press
Standing Dumbbell Shoulder Press | Strict standing overhead press; no knee dip.
Arnold Press | Seated; rotate from palms facing torso into overhead press, within comfortable shoulder ROM.''')
add('ohp','Single-Arm Dumbbell Overhead Press','Dumbbell','One arm presses vertically; torso stays level.','One-arm DB shoulder press','unilateral')
batch('ohp','Smith machine','''Smith Shoulder Press | Upright supported bench aligned with fixed bar path in front of head.''')
batch('ohp','Selectorized machine','''Seated Machine Shoulder Press | Supported torso; handles move upward in scapular plane.''')
batch('ohp','Plate-loaded machine','''Independent-Lever Shoulder Press | Separate converging overhead lever arms; seat aligns handles with shoulders.''')
batch('ohp','Cable','''Seated Cable Shoulder Press | Bench between low pulleys; press independent handles overhead.''')
batch('ohp','Resistance band','''Band Overhead Press | Stand on band; strict upward press with rising resistance.''')
batch('ohp','Kettlebell','''Double-Kettlebell Strict Press | Two bells in rack; press without knee drive.
Single-Kettlebell Strict Press | One bell rests against forearm in rack; press without torso lean.''')
records[-1]['laterality']='unilateral'
batch('ohp','Bodyweight','''Pike Push-Up | Hips high, hands on floor; flex elbows to lower head then press up.
Wall-Supported Handstand Push-Up | Wall supplies balance; lower head under control to consistent depth.''',loading='bodyweight')
batch('landpress','Landmine','''Half-Kneeling Single-Arm Landmine Press | One knee down; press bar end upward and forward without torso rotation.
Standing Single-Arm Landmine Press | Staggered stance, bar end at shoulder; follow upward arc.''',mode='unilateral')
batch('landpress','Landmine','''Two-Hand Landmine Press | Both hands cup bar end at upper chest; press forward-up through arc.''')
batch('lateral','Cable','''Single-Arm Cable Lateral Raise | Low pulley across body; raise in scapular plane with soft elbow. | Cable side raise
Behind-Body Cable Lateral Raise | Low cable passes behind pelvis; begin with arm slightly across body.
Leaning Cable Lateral Raise | Hold upright support and lean away; raise arm against low cable.''',mode='unilateral')
batch('lateral','Dumbbell','''Seated Dumbbell Lateral Raise | Sit upright; elevate arms to shoulder level without swinging.
Side-Lying Dumbbell Lateral Raise | Lie on side on a shallow incline bench; move upper arm away from trunk.''')
records[-1]['laterality']='unilateral'
batch('lateral','Selectorized machine','''Machine Lateral Raise | Elbow pads or handles resist shoulder abduction; seat aligns joint with pivot.''')
batch('lateral','Resistance band','''Band Lateral Raise | Stand on band; abduct arms without shrugging to initiate motion.''')
batch('front','Dumbbell','''Dumbbell Front Raise | Lift arms forward to approximately shoulder height; torso remains still.''')
batch('front','Cable','''Cable Front Raise | Low cable behind body; raise handle forward with fixed elbow angle.''')
batch('front','Barbell','''Barbell Front Raise | Overhand shoulder-width grip; elevate arms forward without hip drive.''')
batch('rear','Dumbbell','''Bent-Over Dumbbell Reverse Fly | Hinge torso near horizontal; abduct arms with slight fixed elbow bend.
Chest-Supported Dumbbell Reverse Fly | Lie face down on low incline bench; move arms out and retract scapulae. | Incline rear-delt fly''')
batch('rear','Cable','''Standing Cable Reverse Fly | Cross opposing shoulder-height cables; open arms and retract scapulae.
Cable Face Pull | Rope toward forehead, elbows out; combine horizontal abduction with retraction. | Rope face pull''')
batch('rear','Selectorized machine','''Reverse Pec Deck | Face pad; handles at shoulder height; abduct arms and retract scapulae. | Rear-delt machine''')
batch('rear','Resistance band','''Band Pull-Apart | Arms forward at shoulder level; pull band apart by horizontal abduction.
Band Face Pull | Anchor near face height; draw hands toward forehead with elbows out.''')
batch('yraise','Dumbbell','''Prone Dumbbell Y Raise | Face down on incline bench; thumbs up, arms form Y; emphasize scapular upward rotation.''')
batch('yraise','Cable','''Cable Y Raise | Low opposing pulleys; lift arms in Y plane with controlled scapular movement.''')
# Back: grip, elbow path and support differences have explicit definitions.
batch('row','Barbell','''Bent-Over Barbell Row | Unsupported hip hinge; overhand grip, elbows near torso, pull to lower ribs. | Barbell bent row
Underhand Barbell Row | Supinated grip with elbows close; pull to waist without torso heave. | Yates-style underhand row
Pendlay Row | Torso near horizontal; reset bar on floor each rep, elbows moderately tucked.
Barbell Seal Row | Prone on elevated flat bench; pull bar toward lower ribs with no torso movement.''')
batch('row','Dumbbell','''Chest-Supported Dumbbell Row | Prone low-incline bench, neutral grip, elbows near torso. | Incline dumbbell row
Two-Dumbbell Bent-Over Row | Unsupported hinge, neutral grip, both arms pull to hips.''')
batch('highrow','Dumbbell','''Chest-Supported Dumbbell High Row | Prone incline bench, elbows 60–90 degrees from torso, retract scapulae.
Bent-Over Dumbbell High Row | Unsupported hinge with elbows flared, pull toward upper ribs.''')
batch('row','Cable','''Close-Grip Seated Cable Row | Neutral narrow handle; pull toward waist with elbow path near torso. | Seated low cable row
Single-Arm Seated Cable Row | One low handle, elbow toward hip, torso remains square.
Standing Single-Arm Cable Row | Pulley at lower chest; split stance resists forward pull.''')
for r in records[-2:]: r['laterality']='unilateral'
batch('highrow','Cable','''Chest-Supported Cable High Row | Bench faces pulley at shoulder height; elbows flare, scapulae retract.
Single-Arm Cable High Row | Pulley at chest height, elbow flared; no trunk rotation.''')
records[-1]['laterality']='unilateral'
batch('row','Landmine','''Landmine T-Bar Row | Straddle bar, close neutral handle, unsupported hinge; pull to lower ribs. | T-bar row
Single-Arm Landmine Row | Stand alongside bar, grip sleeve with neutral hand and tucked elbow.''')
records[-1]['laterality']='unilateral'
add('highrow','Meadows Row','Landmine','Stand perpendicular to bar end, overhand sleeve grip, elbow flares; brace free arm.','','unilateral')
batch('row','Selectorized machine','''Chest-Supported Fixed-Path Row | Chest pad, linked neutral handles, elbows drive toward hips.
Unilateral Seated Machine Row | Independent handle in horizontal path; chest pad limits torso rotation.''')
records[-1]['laterality']='unilateral'
batch('row','Plate-loaded machine','''Chest-Supported Lever T-Bar Row | Inclined torso pad and close handles; lever arc draws toward waist.
Independent-Lever Low Row | Supported torso with separate handles pulling from forward-low position.''')
batch('highrow','Plate-loaded machine','''Chest-Supported Wide Lever Row | Wide handles and chest pad; elbow flare and scapular retraction define the movement.''')
batch('row','Smith machine','''Smith Bent-Over Row | Hinge torso, fixed bar path toward waist, elbows tucked.''')
batch('row','Resistance band','''Seated Band Row | Band anchored ahead at waist height; elbows pull toward hips.
Standing Band Row | Mid-torso anchor; split stance, no torso swing.''')
batch('row','Kettlebell','''Single-Arm Kettlebell Row | One hand braced on bench; bell hangs below hand, elbow tracks toward hip.''',mode='unilateral')
batch('row','Bodyweight','''Inverted Row | Fixed bar, straight trunk; pull lower chest to bar with moderately tucked elbows. | Australian pull-up|Body row
Ring Row | Suspended rings permit rotating grip; elbows near torso. | Suspension row
Feet-Elevated Inverted Row | Feet raised on bench, body near horizontal under fixed bar.''',loading='bodyweight/weighted/assisted')
batch('highrow','Bodyweight','''Wide-Grip Inverted Row | Overhand wide grip, elbows flared, pull upper chest toward bar.''',loading='bodyweight/weighted/assisted')
batch('vertical','Bodyweight','''Pull-Up | Shoulder-width pronated grip; pull elbows down without kipping. | Overhand pullup|Weighted pull-up|Assisted pull-up
Neutral-Grip Pull-Up | Parallel handles with palms facing; controlled full shoulder excursion. | Hammer-grip pull-up
Wide-Grip Pull-Up | Pronated grip about 1.5 times shoulder width; controlled ROM without behind-neck pulling.
Ring Chin-Up | Rings rotate freely from neutral toward supinated grip; no kipping.''',loading='bodyweight/weighted/assisted')
batch('vertical','Resistance band','''Band-Assisted Pull-Up | Band under foot/knee on fixed overhand bar; assistance varies through ROM.
Band Lat Pulldown | High fixed anchor; kneel and pull elbows toward ribs.''')
records[-2]['loading']='assistance'
batch('vertical','Cable','''Neutral-Grip Lat Pulldown | Close parallel handles; torso nearly upright, elbows travel toward ribs. | V-handle pulldown
Underhand Lat Pulldown | Shoulder-width supinated grip; pull in front to upper chest. | Reverse-grip pulldown
Single-Arm Lat Pulldown | One high handle, torso square, elbow travels toward hip.
Half-Kneeling Single-Arm Cable Pulldown | High cable diagonally forward; one knee down and torso upright.''')
for r in records[-2:]: r['laterality']='unilateral'
batch('vertical','Plate-loaded machine','''Independent-Lever Pulldown | Separate overhead levers descend in converging arc; no torso heave.
Diagonal Lever High Row | Chest pad; handles begin overhead-forward and descend toward lower ribs.''')
batch('pullover','Selectorized machine','''Machine Pullover | Elbow pads transfer load to upper arms; shoulder extension with elbow angle fixed. | Nautilus-style pullover''')
batch('dbpullover','Dumbbell','''Dumbbell Pullover | Lie lengthwise on bench; arc one dumbbell from overhead toward chest, elbows slightly bent.''')
batch('pullover','Resistance band','''Band Straight-Arm Pulldown | High anchor; pull upper arms toward sides with fixed soft elbows.''')
add('pullover','Single-Arm Cable Straight-Arm Pulldown','Cable','High pulley, one nearly straight arm; extend shoulder without torso rotation.','','unilateral')
batch('shrug','Barbell','''Barbell Shrug | Arms straight at sides of torso; elevate and lower scapulae without rolling shoulders.''')
batch('shrug','Dumbbell','''Dumbbell Shrug | Bells at sides; elevate scapulae through controlled comfortable ROM.
Incline Dumbbell Shrug | Chest on steep incline bench; scapular elevation follows inclined torso.''')
batch('shrug','Specialty bar','''Trap-Bar Shrug | Stand centered in hex bar; straight-arm scapular elevation. | Hex-bar shrug''')
batch('shrug','Smith machine','''Smith Shrug | Fixed bar in front; scapulae elevate with elbows extended.''')
batch('shrug','Cable','''Low-Cable Shrug | Handles from low pulleys; elevate scapulae without elbow flexion.''')
batch('shrug','Plate-loaded machine','''Lever Shrug | Standing lever handles beside body; machine pivot determines resistance arc.''')
batch('retract','Dumbbell','''Chest-Supported Scapular Shrug | Prone low-incline bench; retract/protract scapulae with arms hanging and elbows fixed. | Kelso shrug''')
batch('retract','Cable','''Cable Scapular Row | Seated at low pulley; straight elbows, move scapulae through retraction and protraction.''')
# Elbow flexors: no duplicate of original preacher machine, hammer and incline curls.
batch('curl','Barbell','''Standing Barbell Curl | Supinated grip, upper arms near sides; no hip drive. | Straight-bar curl
Barbell Drag Curl | Elbows move backward as bar slides close to torso; controlled elbow flexion.''')
batch('curl','Specialty bar','''EZ-Bar Curl | Semi-supinated angled grips; upper arms remain near sides.
EZ-Bar Preacher Curl | Upper arms supported on preacher pad; use angled supinated grip.
EZ-Bar Spider Curl | Prone inclined bench, arms hang forward freely; curl without shoulder swing.''')
batch('curl','Dumbbell','''Standing Dumbbell Supinating Curl | Start near neutral, supinate as elbow flexes; no shoulder swing. | Supinating dumbbell curl
Seated Dumbbell Curl | Upright bench, palms supinated, elbows near sides.
Dumbbell Preacher Curl | One upper arm supported on sloped pad; supinated hand. | One-arm preacher curl
Dumbbell Concentration Curl | Seated with upper arm braced against inner thigh; supinated elbow flexion.
Dumbbell Spider Curl | Prone incline bench; upper arms hang below shoulders, palms supinated.''')
for r in records[-3:-1]: r['laterality']='unilateral'
batch('curl','Cable','''Standing Cable Curl | Low pulley ahead, supinated handle, upper arms near sides. | Low-pulley curl
Behind-Body Cable Curl | One low pulley behind body, upper arm slightly extended; supinated curl. | Bayesian curl
High-Cable Curl | Upper arms raised to sides at shoulder height; curl handles toward temples. | Double-biceps cable curl
Cable Preacher Curl | Upper arms supported on preacher pad; low cable resists elbow flexion.''')
records[-3]['laterality']='unilateral'
batch('curl','Selectorized machine','''Seated Arm-Curl Machine | Upper arms beside torso on supports; pivot aligned with elbows, distinct from preacher angle.''')
batch('curl','Resistance band','''Band Supinated Curl | Stand on band, palms up; curl through rising resistance.''')
batch('hammer','Dumbbell','''Cross-Body Hammer Curl | Neutral hand; curl across torso toward opposite shoulder with minimal shoulder movement.
Incline Dumbbell Hammer Curl | Reclined bench, arms behind trunk line, neutral grip.''')
records[-2]['laterality']='alternating'
batch('hammer','Cable','''Rope Hammer Curl | Low pulley ahead; palms face each other on rope ends.
Cable Hammer Preacher Curl | Neutral grip with upper arm braced on preacher pad.''')
batch('hammer','Specialty bar','''Swiss-Bar Hammer Curl | Neutral parallel grips on multi-grip bar; elbows near sides.''')
batch('hammer','Resistance band','''Band Hammer Curl | Stand on band and grasp neutral handles; controlled elbow flexion.''')
batch('reversecurl','Barbell','''Barbell Reverse Curl | Overhand grip, upper arms near sides; wrist stays neutral.''')
batch('reversecurl','Specialty bar','''EZ-Bar Reverse Curl | Angled pronated grip; upper arms near sides.''')
batch('reversecurl','Cable','''Cable Reverse Curl | Low pulley and pronated straight bar; no wrist curl.''')
batch('reversecurl','Dumbbell','''Dumbbell Reverse Curl | Palms down throughout; upper arms stay beside torso.
Zottman Curl | Supinate on upward curl, rotate to pronation for controlled lowering; both phases share one set.''')
# Elbow extensors
batch('closepress','Barbell','''Close-Grip Barbell Bench Press | Hands near shoulder width; elbows tucked, press from lower chest. | Close-grip bench press''')
batch('closepress','Smith machine','''Smith Close-Grip Bench Press | Flat bench; shoulder-width grip and tucked elbow path.''')
batch('closepress','Dumbbell','''Neutral-Grip Dumbbell Floor Press | Palms face each other and elbows tucked; floor limits shoulder extension.''')
batch('triceps','Dumbbell','''Lying Dumbbell Triceps Extension | Flat bench; upper arms near vertical, bend and straighten elbows. | Dumbbell skull crusher
Seated Dumbbell Overhead Triceps Extension | Both hands hold one bell overhead; keep upper arms elevated. | French press with dumbbell
Single-Arm Dumbbell Overhead Extension | One upper arm overhead, elbow flexes behind head within comfortable ROM.
Dumbbell Triceps Kickback | Upper arm held beside inclined torso, elbow extends behind body.''')
for r in records[-2:]: r['laterality']='unilateral'
batch('triceps','Specialty bar','''EZ-Bar Lying Triceps Extension | Supine bench; upper arms slightly behind vertical, flex elbows toward forehead. | EZ-bar skull crusher
EZ-Bar Incline Triceps Extension | Inclined bench, upper arms overhead relative to torso; elbow extension.''')
batch('triceps','Barbell','''Barbell Lying Triceps Extension | Supine flat bench, shoulder-width grip; elbows flex near forehead. | Barbell skull crusher''')
batch('triceps','Cable','''Single-Arm Cable Pushdown | One handle at high pulley, upper arm beside trunk; extend elbow.
Single-Arm Overhead Cable Extension | One low or mid pulley behind; upper arm elevated; elbow extension.
Cross-Body Cable Triceps Extension | High cable across torso; upper arm slightly abducted and held still.
Cable Triceps Kickback | Low pulley ahead; upper arm near horizontal behind trunk line; extend elbow.
Lying Cable Triceps Extension | Flat bench with cable behind head; extend elbows with upper arms elevated.''')
for r in records[-5:-1]: r['laterality']='unilateral'
batch('triceps','Selectorized machine','''Seated Triceps Extension Machine | Upper arms rest on forward pad; elbow pivot aligned; extend forearms.''')
batch('closepress','Plate-loaded machine','''Seated Lever Dip Press | Upright supported torso; press handles down with elbows tucked, substantial elbow extension.''')
batch('triceps','Resistance band','''Band Triceps Pushdown | High anchor, elbows beside torso; extend against rising band tension.
Band Overhead Triceps Extension | Anchor behind, upper arms overhead, bend and extend elbows.''')
batch('triceps','Bodyweight','''Bodyweight Triceps Extension | Hands on fixed waist-height bar; rigid torso, bend elbows to bring forehead toward hands. | Bodyweight skull crusher
Suspension Triceps Extension | Hands in suspension handles; lean forward and flex/extend elbows while shoulders stay set.''',loading='bodyweight')
# Squats, lunges and presses: no generic duplicate of source leg press/hack squat/lunges.
batch('deep','Barbell','''High-Bar Back Squat | Bar on upper traps; descend below parallel as controlled mobility allows, with substantial hip and knee flexion. | High-bar squat
Front Squat | Front rack; deep controlled knee/hip flexion with upright torso. | Barbell front squat''')
batch('squat','Barbell','''Low-Bar Back Squat | Bar across rear deltoids, moderate stance; descend to at least parallel, greater torso inclination. | Low-bar squat
Barbell Box Squat | Sit back to box near parallel under control, pause without relaxing trunk, then stand.''')
batch('deep','Dumbbell','''Dumbbell Goblet Squat | One bell held at chest; deep controlled squat, whole foot supported.
Double-Dumbbell Front Squat | Bells at shoulders; deep controlled squat with upright trunk.''')
batch('deep','Kettlebell','''Double-Kettlebell Front Squat | Two bells in rack, descend into deep squat.
Kettlebell Goblet Squat | Bell held by horns at chest; deep squat with full-foot support.''')
batch('deep','Specialty bar','''Safety-Bar Squat | Padded yoke on shoulders, handles ahead; deep squat without pulling on handles. | SSB squat
Zercher Squat | Bar cradled in elbow crooks; controlled deep squat.''')
batch('squat','Smith machine','''Smith Squat | Feet modestly ahead of fixed bar, descend to parallel with controlled knee tracking.
Smith Heel-Elevated Squat | Heels on stable wedge, upright torso, knees travel forward through comfortable ROM.''')
batch('squat','Plate-loaded machine','''Pendulum Squat | Back pad follows long rotating lever arc; depth and foot platform set knee/hip loading.
Belt Squat | Load attached at hips; squat to parallel while torso stays upright. | Hip-belt squat
Horizontal Lever Leg Press | Seat fixed; feet drive a pivoting platform through controlled hip/knee extension.
Vertical Leg Press | Supine under vertically moving platform; pelvis stays supported, no lumbar rounding.''')
batch('squat','Selectorized machine','''Horizontal Seated Leg Press | Seat/platform travels horizontally against cable stack; maintain pelvis contact through ROM.
Single-Leg Seated Leg Press | One foot on platform; supported pelvis, controlled knee/hip extension.''')
records[-1]['laterality']='unilateral'
batch('squat','Landmine','''Landmine Squat | Bar end held at chest; follow arc downward while maintaining full-foot pressure.''')
batch('squat','Resistance band','''Band Squat | Stand on band, handles at shoulders; squat through controlled hip/knee flexion.''')
batch('squat','Bodyweight','''Bodyweight Squat | Whole-foot stance, controlled squat to parallel or deeper. | Air squat
Assisted Sissy Squat | Hold stable support; knees travel forward while hips stay relatively extended.''',loading='bodyweight')
records[-1]['family']='extension';records[-1]['category']=F['extension']['category'];records[-1]['rationale']=F['extension']['rationale'];records[-1]['sourceIds']=F['extension']['sourceIds'];records[-1]['primaryMuscle']='quads';records[-1]['secondaryMuscles']=[];records[-1]['tertiaryMuscles']=[];records[-1]['exercise']['contributions']=[{'muscle':'quads','coefficient':1}];records[-1]['allocationEvidence']=[dict(muscle='quads',coefficient=1,confidence='medium',basis='Knee extension emphasis; anatomical inference.')]
records[-1]['exercise']['source']='PANDR-5 research catalog v1: anatomy-lower'
batch('split','Dumbbell','''Dumbbell Split Squat | Stationary staggered stance; rear toes supported, front knee and hip flex together. | Static dumbbell lunge
Dumbbell Rear-Foot-Elevated Split Squat | Rear foot on bench, moderate stride and upright torso; lower front knee/hip under control. | Bulgarian split squat
Dumbbell Reverse Lunge | Step backward and lower; drive through front leg to return.
Dumbbell Walking Lunge | Step forward each rep, moderate stride; count reps per leg.
Dumbbell Step-Up | Stable box near knee height; rise using lead leg, minimize trailing-foot push.
Dumbbell Lateral Lunge | Step sideways and sit into moving hip/knee while other leg stays straighter.''',mode='unilateral')
add('glutesplit','Long-Stride Rear-Foot-Elevated Split Squat','Dumbbell','Rear foot on bench; longer stance, forward torso and substantial front-hip flexion.','Glute-biased Bulgarian split squat','unilateral')
batch('split','Barbell','''Barbell Split Squat | Bar on upper back, stationary staggered stance; front knee and hip flex together.
Barbell Reverse Lunge | Bar on back; step backward under control, return using front leg.
Barbell Step-Up | Stable box, bar on upper back; lead-leg drive with minimal push from trailing leg.''',mode='unilateral')
batch('split','Smith machine','''Smith Split Squat | Stationary staggered stance under fixed bar; front knee and hip flex together.
Smith Rear-Foot-Elevated Split Squat | Rear foot on stable bench; fixed bar path, moderate stride.''',mode='unilateral')
batch('split','Bodyweight','''Bodyweight Split Squat | Stationary staggered stance, front leg performs most work.
Pistol Squat | Single-leg squat with free leg forward; use support if needed to retain controlled ROM.
Skater Squat | Single-leg squat with free knee bending behind; descend without rear-foot push.''',mode='unilateral',loading='bodyweight/weighted/assisted')
batch('split','Landmine','''Landmine Reverse Lunge | Bar end held at chest; step backward and rise with front leg.''',mode='unilateral')
batch('extension','Selectorized machine','''Single-Leg Leg Extension | One shin under pad; align knee with machine pivot, keep hips supported.''',mode='unilateral')
batch('extension','Cable','''Seated Cable Leg Extension | Ankle cuff and low cable behind; thigh supported, extend knee.''',mode='unilateral')
batch('extension','Resistance band','''Seated Band Leg Extension | Band anchored behind chair to ankle; thigh supported, extend knee.''',mode='unilateral')
batch('extension','Bodyweight','''Reverse Nordic Curl | Kneel with hips extended; lean backward from knees and return, no hip hinge.''',loading='bodyweight/weighted/assisted')
# Posterior chain
batch('hinge','Barbell','''Barbell Good Morning | Bar on upper back, soft knees, hinge hips while spine remains stable.
Barbell Stiff-Leg Deadlift | Knees near straight but not locked; lower bar with controlled hip hinge, ROM limited by pelvis control.
Snatch-Grip Romanian Deadlift | Wide overhand grip changes bar clearance and attainable hip ROM; controlled soft-knee hinge.''')
# The source RDL explicitly covers ordinary barbell AND dumbbell RDL: these are aliases, not new rows.
batch('hinge','Dumbbell','''Single-Leg Dumbbell Romanian Deadlift | Hinge on one leg with pelvis square; free leg moves backward.
B-Stance Dumbbell Romanian Deadlift | Rear toes provide light support; front leg supplies most hip extension.''',mode='unilateral')
batch('hinge','Smith machine','''Smith Romanian Deadlift | Soft knees and fixed bar path; set feet to allow hip hinge without spinal rounding.''')
batch('hinge','Cable','''Cable Pull-Through | Low pulley behind legs; rope between thighs, hip hinge with soft knees.''')
batch('hinge','Resistance band','''Band Romanian Deadlift | Stand on band, soft knees; hinge from hips against increasing resistance.
Band Good Morning | Band anchored under feet and across shoulders; soft-knee hip hinge.''')
batch('hinge','Specialty bar','''Safety-Bar Good Morning | Padded yoke, soft knees, controlled hip hinge; no pulling on handles.''')
batch('deadlift','Barbell','''Conventional Deadlift | Bar over midfoot, hands outside knees; lift from floor by coordinated knee/hip extension.
Sumo Deadlift | Wide stance, hands inside knees; extend hips and knees with bar close.
Deficit Conventional Deadlift | Stand on low stable platform, start bar from floor; increased hip/knee excursion.''')
batch('deadlift','Specialty bar','''Low-Handle Trap-Bar Deadlift | Stand centered, use low handles for floor-height ROM. | Low-handle hex-bar deadlift
High-Handle Trap-Bar Deadlift | Raised handles reduce starting flexion and ROM; no bouncing. | High-handle hex-bar deadlift''')
batch('deadlift','Kettlebell','''Kettlebell Deadlift | Bell between feet, coordinated knee/hip extension from floor.''')
batch('legcurl','Selectorized machine','''Standing Single-Leg Curl | One knee flexes against ankle pad; pelvis stays fixed.
Single-Leg Seated Leg Curl | One leg at a time; hip flexed, thigh pad secures pelvis.
Single-Leg Lying Leg Curl | Prone, one knee flexes; hips stay against pad.''',mode='unilateral')
batch('legcurl','Cable','''Standing Cable Leg Curl | Ankle cuff at low pulley; thigh stays vertical while knee flexes.''',mode='unilateral')
batch('legcurl','Resistance band','''Prone Band Leg Curl | Anchor beyond feet; prone knee flexion with pelvis still.''')
batch('legcurl','Dumbbell','''Prone Dumbbell Leg Curl | Secure one dumbbell between feet; flex knees with hips on bench; suitable setup essential.''')
batch('legcurl','Bodyweight','''Nordic Hamstring Curl | Kneel with ankles secured; lower straight body from knees with controlled assistance on return. | Nordic curl
Sliding Leg Curl | Supine heels on sliders; maintain hips elevated while flexing knees. | Towel hamstring curl
Single-Leg Sliding Curl | One heel slides, hips supported off floor; flex working knee.
Stability-Ball Leg Curl | Heels on ball; hips elevated as knees flex.
Suspension Leg Curl | Heels in straps; keep hips elevated and curl heels toward body.
Glute-Ham Raise | GHD setup places knees behind pad; combine controlled knee flexion with a stable hip angle.''',loading='bodyweight/weighted/assisted')
records[-4]['laterality']='unilateral'
batch('bridge','Barbell','''Barbell Hip Thrust | Upper back on bench, bar across pelvis; extend hips without lumbar hyperextension.
Barbell Glute Bridge | Upper back on floor; bar at hips, bent-knee hip extension through shorter ROM.''')
batch('bridge','Dumbbell','''Dumbbell Hip Thrust | Upper back on bench, bell secured at pelvis; knees bent near top.''')
batch('bridge','Smith machine','''Smith Hip Thrust | Upper back on stable bench; fixed bar over pelvis, no lumbar hyperextension.''')
batch('bridge','Plate-loaded machine','''Lever Hip Thrust | Upper back supported, lap pad/belt on hips; lever resists hip extension. | Glute drive machine''')
batch('bridge','Resistance band','''Band Hip Thrust | Band secured across pelvis, shoulders on bench; maintain tension at top.''')
batch('bridge','Bodyweight','''Glute Bridge | Back on floor, knees bent; extend hips without spinal extension.
Single-Leg Glute Bridge | One planted foot, other leg elevated; pelvis stays level.
Single-Leg Hip Thrust | Upper back on bench; one working leg extends hip with pelvis level.''',loading='bodyweight/weighted/assisted')
for r in records[-2:]: r['laterality']='unilateral'
batch('kickback','Cable','''Standing Cable Hip Extension | Ankle cuff, slightly bent working knee; move thigh backward without lumbar sway.
Kneeling Cable Hip Extension | Hands/knees supported on bench; ankle cuff draws thigh backward.''',mode='unilateral')
batch('kickback','Selectorized machine','''Standing Glute Kickback Machine | Chest/forearm support, bent knee pushes pad backward through hip extension.''',mode='unilateral')
batch('kickback','Resistance band','''Band Glute Kickback | Band anchored forward; extend working hip while pelvis stays square.''',mode='unilateral')
batch('kickback','Plate-loaded machine','''Reverse Hyperextension | Prone torso supported; lever attached near ankles, raise legs by hip extension without swinging.''')
batch('hinge','Roman chair','''Horizontal Hip Extension | Pelvis at edge of horizontal bench, spine neutral; hinge hips and return without spinal hyperextension.''',loading='bodyweight/weighted/assisted')
# Hip frontal plane, calves, direct spine
batch('abduction','Selectorized machine','''Seated Hip Abduction | Pads outside knees, pelvis still; abduct thighs without bouncing. | Hip abductor machine''')
batch('abduction','Cable','''Standing Cable Hip Abduction | Ankle cuff, support balance; move leg sideways without pelvic hike.''',mode='unilateral')
batch('abduction','Resistance band','''Standing Band Hip Abduction | Low anchor across body; move working thigh sideways with pelvis level.
Side-Lying Band Hip Abduction | Band at ankles, pelvis stacked; lift top thigh sideways.
Seated Band Hip Abduction | Loop above knees; thighs move apart while pelvis stays still.
Lateral Band Walk | Loop above knees or ankles; deliberate lateral steps against band, no shuffling momentum.''')
for r in records[-4:-2]: r['laterality']='unilateral'
records[-1]['laterality']='alternating'
batch('abduction','Bodyweight','''Side-Lying Hip Abduction | Lie on side, top leg aligned with trunk; raise it sideways without hip rotation.''',mode='unilateral',loading='bodyweight')
batch('adduction','Selectorized machine','''Seated Hip Adduction | Pads inside knees, pelvis still; bring thighs together against resistance. | Hip adductor machine''')
batch('adduction','Cable','''Standing Cable Hip Adduction | Ankle cuff at low outside pulley; move thigh inward across midline without turning pelvis.''',mode='unilateral')
batch('adduction','Resistance band','''Standing Band Hip Adduction | Low anchor outside working leg; draw thigh inward against band.''',mode='unilateral')
batch('adduction','Bodyweight','''Side-Lying Hip Adduction | Lie on working side, upper foot crossed in front; raise lower leg off floor.
Dynamic Copenhagen Adduction | Upper leg supported on bench; lower and lift pelvis through hip adduction, controlled lever length.''',mode='unilateral',loading='bodyweight')
batch('calf','Dumbbell','''Standing Dumbbell Calf Raise | Forefeet on stable step, knees near straight; full controlled ankle ROM.
Single-Leg Dumbbell Calf Raise | One forefoot on step, hand support for balance; no knee drive.''')
records[-1]['laterality']='unilateral'
batch('calf','Smith machine','''Smith Standing Calf Raise | Forefeet on secure block, near-straight knees, controlled plantarflexion.''')
batch('calf','Plate-loaded machine','''Leg-Press Calf Press | Forefeet on platform edge, knees near straight; move ankles without bending knees.
Donkey Calf Raise Machine | Torso hinged and supported; load over pelvis, knees near straight.''')
batch('calf','Bodyweight','''Standing Bodyweight Calf Raise | Forefeet on step, knees near straight; controlled lowering below step.
Single-Leg Bodyweight Calf Raise | One forefoot on step, hand support removes balance limitation.''',loading='bodyweight')
records[-1]['laterality']='unilateral'
batch('soleus','Plate-loaded machine','''Seated Calf Raise | Knees flexed about 90 degrees, thigh pads above knees; full ankle ROM. | Bent-knee calf raise machine''')
batch('soleus','Dumbbell','''Seated Dumbbell Calf Raise | Sit with knees about 90 degrees, dumbbells on thighs; forefeet on step.''')
batch('soleus','Smith machine','''Smith Seated Calf Raise | Sit under padded fixed bar on distal thighs; knees flexed, forefeet on block.''')
batch('soleus','Resistance band','''Seated Band Plantarflexion | Band around forefoot, knee flexed; press forefoot away against tension.''',mode='unilateral')
batch('spine','Selectorized machine','''Pelvis-Restrained Lumbar Extension | Secure pelvis on lumbar extension machine; extend spine through controlled comfortable ROM.''')
batch('spine','Roman chair','''Roman-Chair Spinal Extension | Pelvis supported; deliberately extend thoracolumbar spine through modest comfortable ROM, rather than only hinging hips.''',loading='bodyweight/weighted/assisted')
batch('spine','Bodyweight','''Prone Trunk Extension | Pelvis and legs supported on floor; lift trunk modestly through spinal extension, no violent arching.''',loading='bodyweight')
# Approved vocabulary extension: specific trunk, neck and wrist work.
batch('crunch','Bodyweight','''Floor Crunch | Curl ribcage toward pelvis; avoid pulling head forward. | Abdominal crunch
Reverse Crunch | Knees bent; curl pelvis toward ribs rather than only flexing hips. | Pelvic curl
Decline Crunch | Feet secured, decline bench; curl trunk without turning movement into hip-dominant sit-up.
Hanging Knee Raise with Pelvic Curl | Hang from bar; raise knees then actively curl pelvis toward ribs without swinging.
Captain-Chair Knee Raise with Pelvic Curl | Forearms supported; curl pelvis toward ribs at top rather than just lifting thighs.
Hanging Straight-Leg Raise with Pelvic Curl | Knees straight; raise legs and actively posteriorly tilt pelvis, no swinging.
Stability-Ball Crunch | Upper back on ball; controlled spinal flexion from slight extension.''',loading='bodyweight/weighted/assisted')
batch('crunch','Cable','''Kneeling Cable Crunch | High rope pulley, hips stay relatively still; flex trunk against cable.
Seated Cable Crunch | Sit facing away from high pulley; curl ribs toward pelvis against rope.''')
batch('crunch','Selectorized machine','''Seated Abdominal Crunch Machine | Seat/pads aligned; loaded trunk flexion rather than arm-only pulling.''')
batch('crunch','Resistance band','''Kneeling Band Crunch | High anchor; curl trunk against band, keep hip angle relatively stable.''')
batch('anti-extension','Ab wheel','''Kneeling Ab-Wheel Rollout | Start on knees; roll forward while resisting lumbar extension, return under control. | Ab roller
Standing Ab-Wheel Rollout | Begin from feet; roll only as far as trunk position can be controlled.''',loading='bodyweight')
batch('anti-extension','Bodyweight','''Forearm Plank | Elbows under shoulders; purposeful challenging anti-extension bout, no sagging.
Long-Lever Plank | Elbows farther ahead of shoulders increase anti-extension moment; maintain posterior pelvic control.
Suspension Body Saw | Feet in straps; shift rigid torso forward/back while resisting lumbar extension.
Dead Bug | Supine, trunk braced; alternate extending opposite arm/leg without lumbar extension.''',loading='bodyweight')
records[-1]['laterality']='alternating'
batch('anti-extension','Stability ball','''Stability-Ball Rollout | Kneel with forearms on ball; roll away while controlling lumbar position.''',loading='bodyweight')
batch('oblique','Cable','''Cable Trunk Rotation | Pulley at chest height; controlled trunk rotation with pelvis mostly stable, arms guide handle.
High-to-Low Cable Woodchop | High pulley, controlled diagonal trunk rotation/flexion; avoid arm-only pulling.
Low-to-High Cable Lift | Low pulley, controlled upward diagonal trunk rotation; pelvis stays relatively stable.
Cable Side Bend | Low handle at side; bend trunk laterally through controlled comfortable ROM.''',mode='unilateral')
batch('oblique','Dumbbell','''Dumbbell Side Bend | One bell at side, opposite hand unweighted; controlled lateral trunk flexion.''',mode='unilateral')
batch('oblique','Bodyweight','''Side Crunch | Lie partly on side; approximate lower ribs and pelvis through lateral flexion.
Bicycle Crunch | Controlled trunk rotation and flexion toward opposite knee; no pulling on neck.''',loading='bodyweight')
records[-2]['laterality']='unilateral';records[-1]['laterality']='alternating'
batch('oblique','Selectorized machine','''Seated Torso Rotation Machine | Pelvis restrained, rotate trunk against pad/handles through controlled ROM.''',mode='alternating')
batch('anti-rotation','Cable','''Pallof Press | Pulley at chest height, stand sideways; press hands out while resisting rotation. | Cable anti-rotation press''',mode='unilateral')
batch('anti-rotation','Resistance band','''Band Pallof Press | Band anchored at chest height; stand sideways and resist rotation as arms extend.''',mode='unilateral')
batch('anti-rotation','Bodyweight','''Side Plank | Support on forearm and side of foot; resist lateral trunk flexion in deliberate working bout.
Short-Lever Side Plank | Knees bent and supported; forearm support, purposeful lateral hold.''',mode='unilateral',loading='bodyweight')
batch('neck','Neck harness','''Harness Neck Extension | Load attached in front below head; extend neck slowly through comfortable ROM without moving trunk.''')
batch('neck','Selectorized machine','''Machine Neck Extension | Seated, pad behind head resists extension; torso supported.
Machine Neck Flexion | Forehead pad resists flexion; torso supported, avoid shoulder motion.
Machine Neck Lateral Flexion | Side head pad resists lateral flexion; shoulders remain level.''')
records[-1]['laterality']='unilateral'
batch('neck','Resistance band','''Band Neck Extension | Band around rear of head anchored forward; controlled cervical extension.
Band Neck Flexion | Band across forehead anchored behind; controlled cervical flexion.
Band Neck Lateral Flexion | Band against side of head, anchor opposite working direction; controlled lateral flexion.''')
records[-1]['laterality']='unilateral'
batch('neck','Manual resistance','''Manual-Resistance Neck Flexion | Hand provides gentle progressive resistance at forehead; controlled flexion through comfortable ROM.
Manual-Resistance Neck Extension | Hand or partner provides controlled resistance behind head during extension.
Manual-Resistance Neck Lateral Flexion | Hand at side of head supplies controlled resistance; keep shoulders still.''')
records[-1]['laterality']='unilateral'
batch('wristflex','Barbell','''Seated Barbell Wrist Curl | Forearms supported, palms up; move wrists rather than elbows.
Behind-Back Barbell Wrist Curl | Stand with bar behind hips, palms backward; flex wrists without elbow motion.''')
batch('wristflex','Dumbbell','''Supported Dumbbell Wrist Curl | Forearm on bench, palm up; flex wrist through comfortable range.''',mode='unilateral')
batch('wristflex','Cable','''Supported Cable Wrist Curl | Forearm supported, palm up; cable pulls against wrist flexion.''',mode='unilateral')
batch('wristflex','Resistance band','''Band Wrist Curl | Forearm supported and palm up; band pulls wrist toward extension.''',mode='unilateral')
batch('wristext','Barbell','''Seated Barbell Reverse Wrist Curl | Forearms supported, palms down; extend wrists without elbow motion.''')
batch('wristext','Dumbbell','''Supported Dumbbell Wrist Extension | Forearm on bench, palm down; lift back of hand. | Dumbbell reverse wrist curl''',mode='unilateral')
batch('wristext','Cable','''Supported Cable Wrist Extension | Forearm supported palm down; cable resists wrist extension.''',mode='unilateral')
batch('wristext','Resistance band','''Band Wrist Extension | Forearm supported palm down; band pulls hand toward flexion.''',mode='unilateral')
batch('wristflex','Wrist roller','''Wrist Roller — Flexion Direction | Forearms supported where possible; roll load up using wrist flexion, reverse slowly.''')
batch('wristext','Wrist roller','''Wrist Roller — Extension Direction | Forearms supported where possible; roll load up using wrist extension, reverse slowly.''')
# Power/general resistance: limited credits and explicit low confidence.
batch('power','Barbell','''Power Clean | Pull bar from floor, explosive hip/knee extension, catch above parallel; reset each rep.
Hang Power Clean | Begin above knees in hang; extend hips/knees and catch above parallel.
Clean Pull | Clean-width grip from floor; extend hips/knees and shrug without catch.
Snatch Pull | Wide snatch grip from floor; coordinated extension and shrug, no catch.
Hang High Pull | Begin above knees; explosive extension with brief shrug and high elbows; no catch.
Power Snatch | Wide grip from floor; catch overhead above parallel, controlled reset.
Barbell Push Press | Dip knees then drive bar overhead; leg drive differentiates it from strict press.''')
# Push press has a distinct upper/lower allocation rather than inheriting pulling credits.
r=records[-1];r['exercise']['contributions']=[{'muscle':'anterior-delts','coefficient':1},{'muscle':'triceps','coefficient':.5},{'muscle':'quads','coefficient':.25}];r['primaryMuscle']='anterior-delts';r['rationale']='Leg drive assists overhead shoulder elevation and elbow extension; deltoid is designated primary. Power sets do not have validated hypertrophy set equivalence.'
batch('swing','Kettlebell','''Two-Hand Kettlebell Swing | Hip-driven hinge swing to chest height; arms remain relaxed, no squat-and-front-raise. | Russian kettlebell swing
One-Hand Kettlebell Swing | One hand holds bell; hip-driven swing to chest height without torso rotation.''')
records[-1]['laterality']='unilateral'
batch('power','Kettlebell','''Kettlebell Clean | Hip-driven pull into rack; one hand guides bell, no reverse-curl motion.
Kettlebell Snatch | Hip-driven pull to overhead fixation; controlled bell path, avoid arm-dominant lifting.''',mode='unilateral')

# Enrich the immutable source entries through a sidecar, never rewriting their six fields.
legacy_info={
 'source-5':('press','Flat barbell bench press; moderate elbow flare.','Flat barbell bench press|Flat bench|BB bench press'),
 'source-6':('incline','Low-incline dumbbell bench press, roughly 15–30 degrees.','Incline DB press'),
 'source-7':('fly','Seated supported fly machine; arms follow horizontal adduction.','Pec deck|Machine chest fly'),
 'source-8':('vertical','Close supinated grip; bodyweight, external load or counterweight assistance retain same movement ID.','Close-grip chin-up|Chinup|Weighted chin-up|Assisted chin-up'),
 'source-9':('curl','Upper arms supported on machine preacher pad, supinated handles.','Machine preacher curl'),
 'source-10':('hammer','Dumbbells, neutral palms, upper arms near sides.','Dumbbell hammer curl|DB hammer curl'),
 'source-11':('lateral','Standing dumbbells, raise arms to shoulder height without torso swing.','Standing dumbbell lateral raise|Dumbbell side raise|DB lateral raise'),
 'source-13':('row','One hand braced, hip hinge, elbow toward hip.','One-arm dumbbell row|DB bench row'),
 'source-14':('vertical','Pronated standard bar, pull in front to upper chest.','Overhand lat pulldown|Wide-grip lat pulldown'),
 'source-15':('pullover','High cable, nearly fixed soft elbows, pull arms to sides.','Straight-arm cable pulldown|Cable lat pullover'),
 'source-16':('triceps','EZ-bar overhead, upper arms elevated while elbows bend.','EZ-bar overhead triceps extension|EZ-bar French press'),
 'source-17':('triceps','High pulley, upper arms at sides; attachment choice alone does not create another movement.','Triceps pressdown|Rope pushdown|Cable push-down'),
 'source-18':('triceps','Cable behind torso, upper arms overhead; fixed upper-arm angle.','Overhead cable triceps extension|Rope overhead extension'),
 'source-20':('legcurl','Seated machine, hips flexed and thigh pad secure.','Seated leg curl'),
 'source-21':('hinge','Source explicitly includes barbell or dumbbells; soft knees, neutral-spine hip hinge.','Romanian deadlift|Barbell RDL|Dumbbell RDL|Dumbbell Romanian deadlift|Barbell Romanian deadlift'),
 'source-22':('squat','Legacy generic leg press; use supported 45-degree sled, moderate foot height, controlled depth for calibration.','45-degree sled leg press|Sled leg press'),
 'source-23':('squat','Dumbbell held near chest, stable heel wedge, upright torso.','Heels-elevated goblet squat|Cyclist goblet squat'),
 'source-24':('extension','Seated machine, knee aligned with pivot; bilateral knee extension.','Machine leg extension|Seated knee extension'),
 'source-25':('calf','Standing calf machine, near-straight knee and full controlled ankle ROM.','Standing machine calf raise'),
 'source-30':('highrow','Seated wide cable handle; elbow path materially affects lat/retractor emphasis.','Wide seated cable row'),
 'source-34':('press','Hands on elevated stable surface, feet on floor; source means hands-elevated.','Hands-elevated push-up|Incline push-up|Elevated press-up'),
 'source-35':('curl','Reclined dumbbell curl, supinated forearm, arm behind trunk line.','Incline dumbbell curl|Incline DB curl'),
 'source-39':('legcurl','Prone machine, hips supported while knees flex.','Prone leg curl|Lying leg curl'),
 'source-40':('hinge','45-degree Roman chair, hinge hips; source does not specify spinal motion.','45-degree back extension|Roman-chair hip extension'),
 'source-41':('squat','Back-supported inclined sled squat, controlled hip/knee flexion.','Hack squat machine|Sled hack squat'),
 'source-43':('split','Generic source lunge; assume moderate forward step. Direction/load unspecified.','Forward lunge'),
}
legacy_records=[]
for e in legacy:
 f,setup,aliases=legacy_info[e['id']];spec=F[f]
 primary=next((c['muscle'] for c in e['contributions'] if c['coefficient']==1), 'hamstrings')
 conf='low' if e['id'] in ['source-21','source-22','source-30','source-40','source-41','source-43'] else 'medium'
 legacy_records.append(dict(exercise=e,id=e['id'],aliases=aliases.split('|'),category=spec['category'],laterality='unilateral' if e['id'] in ['source-13','source-43'] else 'bilateral',loading='bodyweight/weighted/assisted' if e['id'] in ['source-8','source-34','source-40'] else 'external',setup=setup,primaryMuscle=primary,rationale='Preserved source calibration. '+spec['rationale']+' See legacy-review.md for conflicts between this rationale and retained credits.',confidence=conf,sourceIds=['pandr-sheet']+spec['sourceIds'],limitations='Original numerical values and ambiguous names are retained for saved-plan compatibility; this is not an independent endorsement of every allocation.',family=f,allocationEvidence=[]))

# Strong evidence for the target ROLE in these exact isolation setups, never high confidence in a fraction.
high_ids={'source-11','source-18','source-20','source-24','source-39','p5-single-arm-cable-lateral-raise','p5-seated-calf-raise','p5-barbell-hip-thrust'}
all_records=legacy_records+records
for r in all_records:
 if r['id'] in ['p5-behind-body-cable-curl','p5-cable-preacher-curl']:
  r['sourceIds']=[*r['sourceIds'],'curl-position']
  r['rationale']+=' Matched-profile cable curl research found growth in both biceps and brachialis without a clear shoulder-position advantage; the study does not validate the fractional ratio.'
  r['exercise']['source']='PANDR-5 research catalog v1: '+', '.join(r['sourceIds'])
 cs=r['exercise']['contributions']
 if r['laterality'] in ['unilateral','alternating'] and 'Sets are per side' not in r['limitations']:
  r['limitations']+=' Sets are per side: one prescribed set means one set on each side; do not double bilateral group volume.'
 r['secondaryMuscles']=[c['muscle'] for c in cs if c['coefficient']==.5]
 r['tertiaryMuscles']=[c['muscle'] for c in cs if c['coefficient']==.25]
 if r['id'] in high_ids: r['confidence']='high'
 r['allocationEvidence']=[dict(**c,confidence=r['confidence'] if c['coefficient']==1 else ('low' if r['confidence']=='low' else 'medium'),basis='Confidence in the assigned training role; numerical equivalence remains an editorial model estimate.') for c in cs]
 r['reviewVersion']='1.0.0';r['reviewedOn']='2026-09-18'
 # Clearly identify published support versus cross-equipment extrapolation.
 r['evidenceScope']='Sources support anatomy, movement-family rationale, or specified study setups; extension to this exact device/variant and all fractional credits is inference unless stated otherwise.'
 # Generic selectable primary is a label; original engine retains all max-coefficient roles.
 r['primaryMuscles']=[c['muscle'] for c in cs if c['coefficient']==max(x['coefficient'] for x in cs)]

registry_path=ROOT/'research/exercise-catalog/id-registry.json'
if registry_path.exists():
 registry=json.loads(registry_path.read_text())
 by_id={r['id']:r for r in all_records}
 for ident,old_name in registry.items():
  assert ident in by_id, f'Released ID removed: {ident}'
  assert by_id[ident]['exercise']['name']==old_name or old_name in by_id[ident]['aliases'], f'Rename must retain old alias: {ident}'

master={'schemaVersion':1,'exercises':[r['exercise'] for r in all_records]}
(OUT/'master-catalog.json').write_text(json.dumps(master,indent=2,ensure_ascii=False)+'\n')
metadata={r['id']:{k:v for k,v in r.items() if k!='exercise'} for r in all_records}
(OUT/'metadata.json').write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n')
# Full human-reviewable record; use exact display names, stable IDs also available in JSON.
columns=['id','name','aliases','equipment','category','laterality','loading','setup','primary_muscle','credited_muscles','fractional_allocations','rationale','confidence','allocation_confidence','source_ids','limitations']
with (ROOT/'research/exercise-catalog/catalog.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
 for r in all_records:
  e=r['exercise'];w.writerow(dict(id=e['id'],name=e['name'],aliases=' | '.join(r['aliases']),equipment=e['equipment'],category=r['category'],laterality=r['laterality'],loading=r['loading'],setup=r['setup'],primary_muscle=N[r['primaryMuscle']],credited_muscles=' | '.join(N[c['muscle']] for c in e['contributions']),fractional_allocations=' | '.join(f"{N[c['muscle']]}={c['coefficient']}" for c in e['contributions']),rationale=r['rationale'],confidence=r['confidence'],allocation_confidence=' | '.join(f"{N[c['muscle']]}={c['confidence']}" for c in r['allocationEvidence']),source_ids=' | '.join(r['sourceIds']),limitations=r['limitations']))
summary=dict(version='1.0.0',legacy=len(legacy),added=len(records),total=len(all_records),aliases=sum(len(r['aliases']) for r in all_records),newExerciseAliases=sum(len(r['aliases']) for r in records),confidence=dict(collections.Counter(r['confidence'] for r in all_records)),allocationConfidence=dict(collections.Counter(c['confidence'] for r in all_records for c in r['allocationEvidence'])),equipment=dict(sorted(collections.Counter(r['exercise']['equipment'] for r in all_records).items())),muscles={m['name']:{'primary':sum(m['id']==r['primaryMuscle'] for r in all_records),'credited':sum(any(c['muscle']==m['id'] for c in r['exercise']['contributions']) for r in all_records)} for m in muscles})
(ROOT/'research/exercise-catalog/coverage.json').write_text(json.dumps(summary,indent=2)+'\n')
summary['addedConfidence']=dict(collections.Counter(r['confidence'] for r in records))
summary['addedAllocationConfidence']=dict(collections.Counter(c['confidence'] for r in records for c in r['allocationEvidence']))
(ROOT/'research/exercise-catalog/coverage.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
