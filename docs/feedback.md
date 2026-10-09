# PANDR-5 feedback form

The Settings feedback button uses the published Google Form owned by Carter's connected Google account. Keep the same form and URL for future edits so existing app versions keep working.

- [Edit the form](https://docs.google.com/forms/d/1T0982_95KuIuCMmXtrp8oLdQYUcIvQGOnvT91BouJWA/edit)
- [Open the public form](https://docs.google.com/forms/d/e/1FAIpQLSc9Jr6dKWbZGWHa-PYq6H6oWMq4N2XF7qSRKFts80TOIuae3w/viewform)

The form has ten questions, six required. Contact email, app version, frequency, and device/screenshot details are optional. It does not automatically collect account emails or require sign-in, and public response summaries are disabled. Responses can be reviewed in the editor's Responses tab. No test response was submitted.

The update history lives in `src/data/updates.ts`. Add the new release when bumping package metadata, using Added, Improved, and Fixed where appropriate. Settings displays the installed build version rather than a remote latest-version label.
