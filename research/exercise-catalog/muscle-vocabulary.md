# Approved muscle vocabulary extension

The user explicitly approved these additions during implementation on September 18, 2026 and asked that they be regarded as a reference requiring future updates. Original 19 IDs and display names are exact, unchanged.

| New stable ID | Display name | Scope and limitations |
|---|---|---|
| `abdominals` | Abdominals | Primarily rectus abdominis for flexion/posterior pelvic curl and targeted anti-extension. Excludes separately counted obliques; does not promise equal regional stimulus or imply all abdominal-wall muscles are measured. |
| `obliques` | Obliques | Internal/external oblique group for deliberate rotation/lateral flexion or targeted anti-rotation/lateral holds. Side-specific volume is unavailable. |
| `neck` | Neck muscles | Broad cervical flexor/extensor/lateral-flexor group. Direction-specific exercises are distinct; one set does not train every compartment equally. Do not give neck credit for ordinary shrugs/press bracing. |
| `wrist-flexors` | Wrist flexors | Direct wrist flexion, not automatic finger-grip or elbow-flexor credit. |
| `wrist-extensors` | Wrist extensors | Direct wrist extension, not routine wrist stabilization during curls. |

Affected surfaces: `src/data/additional-muscles.ts` defines the additions; generated `seed.ts` exports `SOURCE_MUSCLES` and combined `MUSCLES`; `scripts/extract-source.py` preserves this boundary on regeneration. Library filters/muscle download, plan target controls, FSA volume rows, training/history volume displays using those IDs and CSV exports now use or carry the additional groups. The source parity test compares the source's 19 rows separately and expects five extra zero rows on the unchanged plan.

No `AppData.schemaVersion` migration is required: muscle IDs already are validated strings, targets already are records and contribution values already use the same three bins. The strict importer historically accepts owner-defined muscle IDs, and still does. No Supabase/database/table/RLS change is needed because metadata and snapshots already store these strings in JSON. Cloud sync, backup and restore tests include a new group. Old app versions can preserve these IDs, though their fixed UI filter/target menus will not know the new display labels.

Default selected targets are unchanged. Constrained PANDR-5 split roles are derived from the original exercises; direct new-group work generally requires custom mode. It would be a training-model change to silently add neck/abdominal/wrist slots or change the constrained split, so this expansion does neither.

Future review: evaluate whether separate neck compartments or additional anatomical groups merit an approved extension, and whether new longitudinal evidence changes the provisional allocations. Preserve released IDs, snapshot histories and old custom records during all updates. Do not silently rename Brachioradial., Gastroc., Glute max, or any original label.
