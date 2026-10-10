export function HealthWeightHelp() {
  const current = new URL(location.href);
  const base = current.protocol === 'https:' ? `${current.origin}${current.pathname}` : 'https://pandr-5.vercel.app/';
  const template = `${base}#bodyweight=[Weight]&unit=kg&measuredAt=[Encoded measurement date]`;
  return <details>
    <summary>Import weight from Apple Health with Shortcuts</summary>
    <p>Apple Health access requires an iPhone app with HealthKit permission. The current PANDR web app supports a Shortcut that opens a weight for you to review and save. It does not sync from Health in the background.</p>
    <ol>
      <li>In Shortcuts on your iPhone, create a shortcut named “PANDR bodyweight”. Add <strong>Find Health Samples</strong>, select <strong>Weight</strong> (Body Mass), sort by <strong>Start Date · Latest First</strong>, and limit to <strong>1</strong>. Allow the Shortcut to read Weight when iOS asks.</li>
      <li>Add <strong>Get Details of Health Sample</strong> to obtain the sample’s numeric <strong>Value</strong> and its <strong>Start Date</strong>. Use the matching <code>unit=kg</code> or <code>unit=lb</code> in the link; convert first if the sample uses another unit. Keep the sample’s measurement date, rather than the time you run the Shortcut.</li>
      <li>Format that date with <strong>Format Date · ISO 8601</strong>, then use <strong>URL Encode</strong> on the formatted date.</li>
      <li>Add <strong>Text</strong> containing the template below. Replace each bracketed placeholder with the corresponding Shortcut variable, without brackets. Use the numeric weight value with a period as the decimal separator, without grouping commas or a unit suffix.</li>
      <li>Pass the text to <strong>Open URLs</strong>. PANDR shows the weight and measurement date. Choose <strong>Use imported bodyweight</strong> to save it through your signed-in account.</li>
    </ol>
    <p><code style={{ overflowWrap: 'anywhere' }}>{template}</code></p>
    <p>If Health returns no sample, stop the Shortcut and enter bodyweight above. Do not send an empty value or substitute zero. Safari may open separately from your installed PANDR app; sign in there if needed.</p>
    <p>The link contains only the weight, unit, and date. Never add an account token, password, or API secret. Health values remain in the URL fragment until you save or cancel the import; PANDR then removes that fragment from the current browser history entry.</p>
    <p><a href="https://support.apple.com/guide/shortcuts/intro-to-find-and-filter-actions-apd3c845e881/ios" target="_blank" rel="noreferrer">Apple’s guide to finding Health samples</a> · <a href="https://developer.apple.com/documentation/healthkit/setting-up-healthkit" target="_blank" rel="noreferrer">HealthKit access requirements</a></p>
  </details>;
}
