# Practical working weights

PANDR-5 keeps the strength estimate separate from the weight you can put on the equipment. RIR and the load–repetition curve calculate a target resistance; the prescription chooses an available weight at or below that target. Bodyweight and estimated maximums are physical/model values, not plate prescriptions.

Default equipment:

| Equipment | Pounds | Kilograms |
| --- | --- | --- |
| Standard barbell | 45 lb bar + equal plates; 10 lb total steps | 20 kg bar + equal plates; 5 kg total steps |
| Bilateral plate-loaded machine or Smith machine | 10 lb total steps | 5 kg total steps |
| Isolateral plate-loaded machine, per loaded side | 5 lb steps | 2.5 kg steps |
| Dumbbell rack, per hand | 5 lb steps | 2.5 kg steps |
| Cable/other external equipment | 5 lb steps | 2.5 kg steps |

These are defaults, not an inventory of every gym. Equipment options can specify smaller plates, a different total increment or an exact list of weights. A 2.5 lb plate on each side makes a 5 lb total barbell change. Different bars, machine starting weights and unusual racks should use an exact inventory. Explicit custom microloading can retain more precision; automatic pound prescriptions fall on a 2.5 lb grid and display whole or half pounds.

Automatic defaults carry an `equipmentPreset` marker. Changing units regenerates unit-native default equipment rather than repeatedly converting an already rounded increment. Explicit custom equipment is physically converted with higher precision and retains its custom marker.

On account opening and saving, the app recognizes the old 0.5 kg / 1.1023 lb default and previously generated standard inventories. It updates only the current plan's future equipment and working weights. Other unrecognized equipment is marked custom and preserved. Past strength observations, unfinished assessment inputs, workout records, archived plans and the current workout remain intact. The upgrade uses the normal authenticated revision checks; applying it again makes no further change. If a concurrent merge supplies another old plan, a second guarded save applies the same upgrade to the merged result.

An old progression recommendation may request a weight outside the new default grid. Future prescriptions choose the available weight at or below that absolute target instead of invalidating the strength test. A workout already in progress keeps its performed weight; completing it uses the current equipment for future guidance. Normal increases remain within 2–5% and reductions within 2–3%. When no equipment option fits those limits, the app holds the weight and explains the gap.

Bodyweight exercise inventories contain confirmed added weights or assistance settings. The app does not invent equipment, round body mass to plate steps, or modify saved measured-resistance profiles. Supported movements use reps and RIR unless an existing measured setup is retained.

JSON backups and CSV exports preserve original observation values. Display formatting never rewrites an old test or workout.
