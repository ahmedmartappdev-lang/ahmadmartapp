import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { getAgreedPolicyVersion, recordConsentOnSignIn } from '@/lib/consent';
import { CURRENT_POLICY_VERSION } from '@/lib/policy';
import { toast } from 'sonner';

/**
 * Listens to the auth store and, every time a session goes from
 * "no user" → "user", checks whether the user has already agreed to
 * the current policy version. If they haven't, shows a blocking modal
 * that requires acknowledgement before they can continue using the
 * app. Acknowledging writes a new consent_logs row + stamps the
 * profile.metadata.policy_version field.
 *
 * Mount this once near the top of the React tree (App.tsx), inside
 * QueryClientProvider/Router. It has no UI of its own when there's
 * nothing to do — just a controlled <Dialog>.
 */
export const ReConsentGate: React.FC = () => {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setOpen(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const agreed = await getAgreedPolicyVersion(user.id);
        if (cancelled) return;
        if (agreed !== CURRENT_POLICY_VERSION) {
          setOpen(true);
        }
      } catch {
        // If we can't check, fail open — better UX than blocking
        // everyone for an unrelated query failure.
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleAgree = async () => {
    setSubmitting(true);
    try {
      await recordConsentOnSignIn('re-consent');
      setOpen(false);
    } catch (err) {
      console.error('re-consent failed', err);
      toast.error('Could not record consent — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      // Prevent dismissal via outside click / Esc — the customer MUST
      // make an explicit choice.
      onOpenChange={(next) => { if (next) setOpen(true); }}
    >
      <DialogContent
        className="sm:max-w-md"
        // Suppress the default close button — there is no opt-out.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Privacy Policy updated</DialogTitle>
          <DialogDescription>
            We've updated our Terms &amp; Privacy Policy. Please review and agree
            to continue using Ahmad Mart.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p>
            See the latest{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline text-primary"
            >
              Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline text-primary"
            >
              Terms of Service
            </a>
            .
          </p>
          <p className="text-xs text-muted-foreground">
            By continuing, you agree to the updated policy (version{' '}
            <span className="font-mono">{CURRENT_POLICY_VERSION}</span>).
          </p>
        </div>

        <Button onClick={handleAgree} disabled={submitting} className="w-full mt-2">
          {submitting ? 'Saving…' : 'Agree & continue'}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
