import { supabase } from '@/integrations/supabase/client';
import { CURRENT_POLICY_VERSION, APP_VERSION } from './policy';

/**
 * Persist a consent acknowledgement against the currently-signed-in
 * user. Writes one row to consent_logs AND stamps the policy version
 * onto profiles.metadata so we can detect re-consent need later.
 *
 * `source = 'register'` for first-time consent; `'re-consent'` when
 * the user accepts an updated policy version on subsequent login.
 *
 * Safe to call multiple times — idempotent within a session because
 * the re-consent provider only fires it when there's a mismatch.
 */
export async function recordConsentOnSignIn(
  source: 'register' | 're-consent' = 'register',
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('No active session');

  // 1) audit row
  await (supabase.from('consent_logs') as any).insert({
    user_id: user.id,
    policy_version: CURRENT_POLICY_VERSION,
    app_version: APP_VERSION,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    source,
  });

  // 2) update profile.metadata.policy_version so subsequent loads skip
  //    the re-consent modal.
  const { data: profile } = await supabase
    .from('profiles')
    .select('metadata')
    .eq('user_id', user.id)
    .single();
  const prevMeta = (profile?.metadata as any) || {};
  await supabase
    .from('profiles')
    .update({ metadata: { ...prevMeta, policy_version: CURRENT_POLICY_VERSION } } as any)
    .eq('user_id', user.id);
}

/**
 * Look up the policy version the user last agreed to. Returns null if
 * the profile or the field doesn't exist (treat as needs-consent).
 */
export async function getAgreedPolicyVersion(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('metadata')
    .eq('user_id', userId)
    .single();
  const v = (data?.metadata as any)?.policy_version;
  return typeof v === 'string' ? v : null;
}
