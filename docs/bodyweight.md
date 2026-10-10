# Bodyweight, exercise resistance, and Apple Health

Bodyweight belongs in **Settings → Bodyweight**. Enter your scale weight once. PANDR saves it in kilograms with the date it was recorded and displays it in your selected unit. Updating it changes future exercises that use your full bodyweight or a measured share of it. Past assessments and workouts retain the bodyweight they used; an active workout keeps the weight it started with.

Your scale weight is different from the resistance moved in an exercise. For a pull-up or chin-up, the setup can use your full bodyweight. For an incline push-up, your hands support only part of it. Record a measurement for that exact hand height, foot position, and range of motion instead of entering your entire scale weight. There is no universal percentage that works for every push-up setup.

**Added weight** means weight carried during the movement, such as a weighted vest or a plate attached to a belt. **Assistance** means a measured force that makes the movement easier, such as a calibrated assisted pull-up machine. Plates resting under your hands change a push-up’s setup; their printed weight is neither added load nor assistance. Describe the elevation in the setup notes. Band color or a printed band range is not a measurement of assistance throughout your range of motion.

For partially supported movements, added loads and assistance must be measured changes in supported load, rather than the mass printed on equipment. If your hands support 140 lb unweighted and 146 lb while wearing a 10 lb vest, the added resistance for this setup is 6 lb. The unweighted supported load is the base. Whole-body movements can use the carried vest or belt weight directly.

For setups with known resistance, the model uses:

`effective resistance = bodyweight resistance + added weight − measured assistance`

The app uses this effective resistance for the strength estimate and load progression. Your actual RIR still means the number of clean repetitions you could have completed. A change in scale weight does not change previously logged RIR or establish a new strength result. Upcoming loads can account for the new weight; retest after changing technique, elevation, equipment, or range of motion.

When resistance is unknown, a reps-only baseline accepts 2–100 clean repetitions and records your performance in the same setup. Retest after a bodyweight or setup change. It cannot support a precise weighted 1RM estimate or numeric load progression. Do not invent a resistance value to make the calculation available.

## Apple Health in the current web app

PANDR currently runs as a web app on iPhone and as an Electron app on desktop. It has no native iOS HealthKit bridge. Apple documents HealthKit access through an app capability, a HealthKit store, and explicit permission for each data type. The conclusion that PANDR cannot directly read Apple Health in Safari or its installed web app follows from those native requirements; there is no HealthKit browser API in this app. [Apple: Setting up HealthKit](https://developer.apple.com/documentation/healthkit/setting-up-healthkit), [Apple: Authorizing access to health data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data).

The current integration is a **foreground Shortcut import**. The Shortcut reads your most recent Weight sample and opens PANDR with the value, unit, and measurement date. PANDR validates the link and shows a review panel. It saves nothing until you select **Use imported bodyweight**, and saving requires a signed-in account. This is not background Health synchronization.

## Create a weight Shortcut on iPhone

1. Open **Shortcuts**, create a new shortcut, and name it **PANDR bodyweight**.
2. Add **Find Health Samples**. Choose **Weight** (Body Mass), sort by **Start Date → Latest First**, enable **Limit**, and select **1**. Grant the Shortcut access to Weight when iOS asks. If it returns no sample, show an alert and stop the Shortcut; use manual bodyweight entry in PANDR instead.
3. Use **Get Details of Health Sample** to read the sample’s **Value** and **Start Date**. Use the numeric weight value without a unit suffix. Use the matching `unit=kg` or `unit=lb`; convert the measurement first if it is in another unit.
4. Pass the sample’s Start Date to **Format Date** with **ISO 8601** formatting. Include its time zone. Use the sample’s date, rather than the time at which the Shortcut runs.
5. Pass the formatted date to **URL Encode**. This preserves a positive time-zone offset and other special characters when they appear in the URL.
6. Add **Text** containing this template. Replace the bracketed text with the appropriate Shortcut variables, without brackets:

   ```text
   https://pandr-5.vercel.app/#bodyweight=[numeric weight]&unit=kg&measuredAt=[URL-encoded ISO date]
   ```

   For a weight value in pounds, use `unit=lb`. The decimal separator must be a period, and the number must not include grouping commas or units.
7. Add **Open URLs** using that text. Run the Shortcut. PANDR shows the imported value and date. Sign in if needed and choose **Use imported bodyweight**. Safari may open separately from the installed PANDR app, so its sign-in state may differ.

An example link for a 235 lb measurement at 8 a.m. Pacific daylight time on October 10, 2026 is:

```text
https://pandr-5.vercel.app/#bodyweight=235&unit=lb&measuredAt=2026-10-10T08%3A00%3A00-07%3A00
```

Apple documents the **Find Health Samples** action and filtering/sorting actions in its Shortcuts guide. The exact labels can differ by iOS version. [Apple: Find and Filter actions](https://support.apple.com/guide/shortcuts/intro-to-find-and-filter-actions-apd3c845e881/ios), [Apple: Date timestamps](https://support.apple.com/guide/shortcuts/format-date-timestamps-apdfb33b0e17/ios).

## Import behavior and privacy

- Accepted units are kg and lb. Weight must be finite, positive, and at most 500 kg (about 1,102.3 lb).
- The measurement date must be valid ISO 8601 with a time zone. Dates more than five minutes in the future are rejected. The allowance handles small clock differences.
- Measurements over 14 days old show a review notice. A measurement older than your saved bodyweight shows a separate warning. Neither silently replaces the current weight; you must deliberately apply it.
- The link contains the weight, unit, and date only. Never put account passwords, access tokens, or API secrets into a Shortcut link.
- Values travel in the URL fragment after `#`. Fragments are not part of the web server request. They can remain in browser history, clipboard contents, or a shared link, so do not share your import URL. PANDR removes the reviewed fragment from the current history entry after a successful save or cancellation. A failed save retains the import for retry.
- Unrelated navigation fragments and authentication responses are ignored. Unexpected import fields are rejected. No URL triggers an automatic account write.

The parser and its unit tests verify conversion, malformed values, field duplication, dates, future timestamps, stale/older measurements, and safe fragment removal. The actual Shortcut and iOS browser/PWA handoff require verification on an iPhone; desktop tests cannot verify Health permissions or the phone’s Shortcuts actions.

## Requirements for unattended synchronization

Direct background Health access would need a native iOS app or wrapper requesting read-only **bodyMass** access, reading the newest available sample, and uploading through the authenticated account service. Apple defines bodyMass as a discrete sample measured in mass units. Background delivery additionally requires its entitlement and an observer query; the operating system controls delivery timing. [Apple: bodyMass](https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/bodymass), [Apple: background delivery](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)).

A scheduled Shortcut could instead send a JSON POST to a dedicated weight importer. That importer would need a private, per-user, revocable token limited to writing weight samples, input validation, timestamp ordering, duplicate detection, and a separate measurement record. It must not give the Shortcut a broad account access token or permission to replace all training metadata. The current app has no such endpoint. Apple supports JSON HTTP requests and time-based Shortcut automations, but this capability alone does not provide a secure PANDR importer. [Apple: HTTP requests in Shortcuts](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios), [Apple: automation event triggers](https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/ios).
