// Public client configuration. This is intentionally safe to ship in app bundles.
// Database access is enforced independently by Supabase Auth and row policies.
export const PUBLIC_CLOUD = {
  url: 'https://mhzryeqnmykkdpmabyeo.supabase.co',
  publishableKey: 'sb_publishable_i3Rt4dWxbsKcHbIg-D7z-A_dR6WS4C_',
} as const;
