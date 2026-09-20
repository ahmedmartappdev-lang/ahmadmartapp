import React, { useState, useEffect } from 'react';
import { recordConsentOnSignIn } from '@/lib/consent';
import { NOTIF_CONSENT_PENDING_KEY } from '@/components/auth/NotificationConsentBootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowLeft, ShoppingCart, Truck, Store, Shield, Phone, ChevronDown } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getRoleRedirectPath, type SelectedRole } from '@/hooks/useRoleValidation';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

type AuthStep = 'role-selection' | 'phone-input' | 'otp-input' | 'google-auth';

const roleOptions: { value: SelectedRole; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'customer', label: 'Customer', description: 'Shop for groceries', icon: <ShoppingCart className="w-5 h-5" /> },
  { value: 'delivery_partner', label: 'Delivery Partner', description: 'Deliver orders & earn money', icon: <Truck className="w-5 h-5" /> },
  { value: 'vendor', label: 'Vendor / Store Owner', description: 'Sell your products', icon: <Store className="w-5 h-5" /> },
  { value: 'admin', label: 'Admin', description: 'Manage platform', icon: <Shield className="w-5 h-5" /> },
];

const productImages1 = [
  "https://cdn-icons-png.flaticon.com/512/2907/2907444.png",
  "https://cdn-icons-png.flaticon.com/512/3082/3082011.png",
  "https://cdn-icons-png.flaticon.com/512/2674/2674486.png",
  "https://cdn-icons-png.flaticon.com/512/2553/2553691.png"
];
const productImages2 = [
  "https://cdn-icons-png.flaticon.com/512/2447/2447665.png",
  "https://cdn-icons-png.flaticon.com/512/938/938063.png",
  "https://cdn-icons-png.flaticon.com/512/825/825451.png",
  "https://cdn-icons-png.flaticon.com/512/305/305829.png"
];
const productImages3 = [
  "https://cdn-icons-png.flaticon.com/512/135/135620.png",
  "https://cdn-icons-png.flaticon.com/512/706/706164.png",
  "https://cdn-icons-png.flaticon.com/512/1201/1201643.png",
  "https://cdn-icons-png.flaticon.com/512/2329/2329891.png"
];

const AuthPage: React.FC = () => {
  const [step, setStep] = useState<AuthStep>('role-selection');
  const [selectedRole, setSelectedRole] = useState<SelectedRole>('customer');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  // Consent gate. Must be ticked before the customer can request an OTP.
  // We persist for the session — re-entering a phone number doesn't
  // un-tick. Resets on full reload.
  const [consentAccepted, setConsentAccepted] = useState(false);
  // Optional, does not gate login. When ticked, the intent is stored in
  // localStorage and redeemed post-session by NotificationConsentBootstrap
  // (survives the Google OAuth full-page redirect).
  const [notifConsent, setNotifConsent] = useState(false);

  const stampNotifConsent = () => {
    try {
      if (notifConsent) window.localStorage.setItem(NOTIF_CONSENT_PENDING_KEY, '1');
    } catch { /* storage unavailable — opt-in still possible from /profile */ }
  };

  const { sendOtp, verifyOtp, signInWithGoogle } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  useEffect(() => {
    const role = searchParams.get('role') as SelectedRole | null;
    if (user && role && (role === 'vendor' || role === 'admin')) {
      validateEmailRole(user.email || '', role).then((hasRole) => {
        if (hasRole) {
          toast({ title: 'Welcome!', description: 'You have successfully signed in.' });
          navigate(getRoleRedirectPath(role));
        } else {
          toast({
            title: 'Access denied',
            description: `Your Google account is not registered as ${roleOptions.find(r => r.value === role)?.label}. Contact admin for access.`,
            variant: 'destructive',
          });
          supabase.auth.signOut();
          navigate('/auth');
        }
      });
    }
  }, [user, searchParams]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(prev => prev - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const handleRoleSelect = (role: SelectedRole) => {
    setSelectedRole(role);
    if (role === 'vendor' || role === 'admin') {
      setStep('google-auth');
    } else {
      setStep('phone-input');
    }
  };

  const goBack = () => {
    if (step === 'otp-input') {
      setStep('phone-input');
      setOtp('');
    } else if (step === 'phone-input' || step === 'google-auth') {
      setStep('role-selection');
      setPhoneNumber('');
    } else {
      navigate('/');
    }
  };

  const handleGoogleSignIn = async () => {
    // Stamp BEFORE the OAuth redirect leaves the page.
    stampNotifConsent();
    setIsGoogleLoading(true);
    const { error } = await signInWithGoogle(selectedRole);
    setIsGoogleLoading(false);
    if (error) {
      toast({ title: 'Sign in failed', description: error, variant: 'destructive' });
      return;
    }
    // Google sign-in returns asynchronously via OAuth redirect — the
    // consent recording happens in the Re-Consent provider on the next
    // app load (it detects a fresh policy_version mismatch and writes
    // a row + updates the profile). We intentionally do not call
    // recordConsentOnSignIn here because the auth session isn't live
    // yet at this point in the redirect flow.
  };

  const handleSendOtp = async () => {
    if (phoneNumber.length !== 10) {
      toast({ title: 'Invalid number', description: 'Enter a valid 10-digit phone number.', variant: 'destructive' });
      return;
    }
    setIsSending(true);
    const { success, error } = await sendOtp(phoneNumber, selectedRole);
    setIsSending(false);
    if (success) {
      setStep('otp-input');
      setResendTimer(30);
      toast({ title: 'OTP Sent', description: `OTP sent to +91 ${phoneNumber}` });
    } else {
      toast({ title: 'Failed to send OTP', description: error || 'Please try again.', variant: 'destructive' });
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsVerifying(true);
    const { success, error } = await verifyOtp(phoneNumber, otp);
    setIsVerifying(false);
    if (success) {
      // Record consent + stamp the user's profile metadata with the
      // policy version they agreed to. Done after the auth session is
      // live so RLS recognises the user_id.
      try {
        await recordConsentOnSignIn('register');
      } catch (e) {
        // Don't block sign-in if consent logging fails; we just lose
        // one audit row, the policy_version still ends up in profiles.
        console.warn('consent_logs insert failed', e);
      }
      // Optional notifications opt-in — redeemed by
      // NotificationConsentBootstrap now that the session is live.
      stampNotifConsent();
      toast({ title: 'Welcome!', description: 'You have successfully signed in.' });
      navigate(getRoleRedirectPath(selectedRole));
    } else {
      toast({ title: 'Verification failed', description: error || 'Invalid OTP.', variant: 'destructive' });
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setIsSending(true);
    const { success, error } = await sendOtp(phoneNumber, selectedRole);
    setIsSending(false);
    if (success) {
      setResendTimer(30);
      toast({ title: 'OTP Resent', description: `New OTP sent to +91 ${phoneNumber}` });
    } else {
      toast({ title: 'Failed', description: error || 'Please try again.', variant: 'destructive' });
    }
  };

  const formContent = (
    <AnimatePresence mode="wait">
      {step === 'role-selection' ? (
        <motion.div key="role-selection" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="w-full text-center md:text-left">
          <div className="mb-3 md:mb-6">
             <img src="/logo-round.png" alt="Logo" className="md:hidden w-[50px] h-[50px] rounded-full object-cover mx-auto mb-3 shadow-[0_8px_20px_rgba(0,0,0,0.1)]" />
            <h1 className="text-[22px] md:text-2xl font-[800] tracking-tight leading-tight text-foreground mb-0.5">India's fastest app</h1>
            <p className="text-muted-foreground font-medium text-[13px] md:text-sm">Select your role to continue</p>
          </div>
          <div className="space-y-1.5">
            {roleOptions.map((role) => (
               <button key={role.value} onClick={() => handleRoleSelect(role.value)}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-gray-100 bg-card hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all text-left group">
                <div className="text-primary group-hover:text-primary-foreground shrink-0">
                  {role.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground group-hover:text-primary-foreground text-sm">{role.label}</p>
                  <p className="text-xs text-muted-foreground group-hover:text-primary-foreground/80 leading-tight">{role.description}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      ) : step === 'google-auth' ? (
        <motion.div key="google-auth" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="w-full text-center md:text-left">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground mb-1">Sign in with Google</h1>
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="text-sm text-muted-foreground">as</span>
              <span className="px-2.5 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold">
                {roleOptions.find(r => r.value === selectedRole)?.label}
              </span>
            </div>
          </div>
          <label className="flex items-start gap-2 text-[12px] text-left leading-snug text-muted-foreground cursor-pointer select-none mb-3">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary w-4 h-4 shrink-0"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
            />
            <span>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-foreground font-bold underline">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground font-bold underline">Privacy Policy</a>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-[12px] text-left leading-snug text-muted-foreground cursor-pointer select-none mb-3">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary w-4 h-4 shrink-0"
              checked={notifConsent}
              onChange={(e) => setNotifConsent(e.target.checked)}
            />
            <span>
              Send me order updates and offers as notifications. <span className="text-muted-foreground/70">(Optional)</span>
            </span>
          </label>
          <button
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || !consentAccepted}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 h-12 rounded-2xl font-medium text-sm text-[#3c4043] hover:bg-[#f8f9fa] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isGoogleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.07 24.07 0 0 0 0 21.56l7.98-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            )}
            Sign in with Google
          </button>
        </motion.div>
      ) : step === 'phone-input' ? (
        <motion.div key="phone-input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="w-full text-center md:text-left">
          <div className="mb-4 md:mb-6">
             <img src="/logo-round.png" alt="Logo" className="md:hidden w-[60px] h-[60px] rounded-full object-cover mx-auto mb-4 shadow-[0_8px_20px_rgba(0,0,0,0.1)]" />
            <h1 className="text-[26px] md:text-2xl font-[800] tracking-tight leading-tight text-foreground mb-1">India's fastest app</h1>
            <div className="flex items-center justify-center md:justify-start gap-2 mt-1">
              <span className="text-muted-foreground font-medium text-[14px] md:text-sm">Log in as</span>
              <span className="px-2.5 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold">
                {roleOptions.find(r => r.value === selectedRole)?.label}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex border-[1.5px] border-border rounded-[14px] overflow-hidden h-[54px] transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 bg-card">
              <div className="px-4 flex items-center border-r border-border font-semibold text-foreground bg-card">
                +91 <ChevronDown className="w-3 h-3 ml-2 text-muted-foreground" />
              </div>
              <input
                type="tel"
                className="flex-1 border-none px-[16px] text-[16px] outline-none font-medium tracking-[0.5px] bg-transparent w-full text-foreground placeholder:text-muted-foreground"
                placeholder="Phone Number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
                autoFocus
              />
            </div>
            
            <label className="flex items-start gap-2 text-[12px] text-left leading-snug text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 accent-primary w-4 h-4 shrink-0"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
              />
              <span>
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-foreground font-bold underline">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground font-bold underline">Privacy Policy</a>.
              </span>
            </label>

            <label className="flex items-start gap-2 text-[12px] text-left leading-snug text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 accent-primary w-4 h-4 shrink-0"
                checked={notifConsent}
                onChange={(e) => setNotifConsent(e.target.checked)}
              />
              <span>
                Send me order updates and offers as notifications. <span className="text-muted-foreground/70">(Optional)</span>
              </span>
            </label>

            <button
              onClick={handleSendOtp}
              disabled={phoneNumber.length !== 10 || isSending || !consentAccepted}
              className={`w-full h-12 rounded-2xl font-semibold text-[15px] transition-all flex items-center justify-center gap-2
                ${phoneNumber.length === 10 && consentAccepted
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-gray-100 text-gray-400'}`}
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Continue
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div key="otp-input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="w-full text-center">
          <div className="mb-5">
            <h1 className="text-[26px] md:text-2xl font-[800] tracking-tight leading-tight text-foreground mb-1">Verify OTP</h1>
            <p className="text-muted-foreground font-medium mt-1 text-[14px] md:text-sm">
              Enter the 6-digit code sent to <span className="font-bold text-foreground">+91 {phoneNumber}</span>
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
                <InputOTPGroup className="gap-2">
                  <InputOTPSlot index={0} className="h-14 w-12 text-xl font-bold rounded-xl border-2 border-gray-200 text-foreground focus-visible:ring-primary"/>
                  <InputOTPSlot index={1} className="h-14 w-12 text-xl font-bold rounded-xl border-2 border-gray-200 text-foreground focus-visible:ring-primary"/>
                  <InputOTPSlot index={2} className="h-14 w-12 text-xl font-bold rounded-xl border-2 border-gray-200 text-foreground focus-visible:ring-primary"/>
                  <InputOTPSlot index={3} className="h-14 w-12 text-xl font-bold rounded-xl border-2 border-gray-200 text-foreground focus-visible:ring-primary"/>
                  <InputOTPSlot index={4} className="h-14 w-12 text-xl font-bold rounded-xl border-2 border-gray-200 text-foreground focus-visible:ring-primary"/>
                  <InputOTPSlot index={5} className="h-14 w-12 text-xl font-bold rounded-xl border-2 border-gray-200 text-foreground focus-visible:ring-primary"/>
                </InputOTPGroup>
              </InputOTP>
            </div>

            <button
              onClick={handleVerifyOtp}
              disabled={otp.length !== 6 || isVerifying}
              className={`w-full h-12 rounded-2xl font-semibold text-[15px] transition-all flex items-center justify-center gap-2
                ${otp.length === 6 
                  ? 'bg-primary text-primary-foreground shadow-sm' 
                  : 'bg-gray-100 text-gray-400'}`}
            >
              {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify & Continue
            </button>

            <div className="text-center">
              {resendTimer > 0 ? (
                <p className="text-sm text-muted-foreground font-medium">Resend OTP in <span className="text-foreground font-bold">{resendTimer}s</span></p>
              ) : (
                <button onClick={handleResendOtp} disabled={isSending} className="text-sm text-primary font-bold hover:underline">
                  {isSending ? 'Sending...' : 'Resend OTP'}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen w-full bg-white md:bg-background">
      {/* --- DESKTOP LAYOUT --- */}
      <div className="hidden md:flex min-h-screen">
        <div className="w-1/2 relative overflow-hidden">
          <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80" alt="Fresh groceries" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-12 left-12 right-12">
            <img src="/logo-round.png" alt="Logo" className="h-12 w-12 rounded-full mb-4" />
            <h2 className="text-3xl font-bold text-white leading-tight">Fresh groceries<br />delivered to your door</h2>
            <p className="text-white/70 mt-2 text-sm">Quality products at the best prices</p>
          </div>
        </div>
        <div className="w-1/2 flex flex-col">
          <div className="absolute top-6 right-6 z-10">
            <button onClick={goBack} className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full p-2 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-12 lg:px-20 py-12">
            <div className="w-full max-w-[400px]">{formContent}</div>
          </div>
        </div>
      </div>

      {/* --- MOBILE LAYOUT --- */}
      <div className="md:hidden h-[100dvh] relative bg-[#f3f4f6] flex flex-col overflow-hidden">
        <style>{`
          @keyframes scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-scroll-1 { animation: scroll 20s linear infinite; }
          .animate-scroll-2 { animation: scroll 25s linear infinite; }
          .animate-scroll-3 { animation: scroll 18s linear infinite; }
        `}</style>
        
        {step !== 'role-selection' && (
          <button onClick={goBack} className="absolute top-6 left-4 z-50 w-[38px] h-[38px] bg-white rounded-full flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
            <ArrowLeft className="w-4 h-4 text-gray-800" />
          </button>
        )}

        {/* Animated Background - compact */}
        <div className="flex-shrink-0 w-full pt-[30px] flex flex-col gap-2.5 z-0">
          <div className="flex w-max gap-2.5 animate-scroll-1">
            {[...productImages1, ...productImages1].map((src, i) => (
              <div key={i} className="bg-[#f0f9ff] rounded-[16px] w-[80px] h-[80px] flex items-center justify-center p-[16px] shrink-0">
                  <img src={src} className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
          <div className="flex w-max gap-2.5 animate-scroll-2 pl-[40px]">
            {[...productImages2, ...productImages2].map((src, i) => (
              <div key={i} className="bg-[#f0f9ff] rounded-[16px] w-[80px] h-[80px] flex items-center justify-center p-[16px] shrink-0">
                  <img src={src} className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
          <div className="flex w-max gap-2.5 animate-scroll-3">
            {[...productImages3, ...productImages3].map((src, i) => (
              <div key={i} className="bg-[#f0f9ff] rounded-[16px] w-[80px] h-[80px] flex items-center justify-center p-[16px] shrink-0">
                  <img src={src} className="max-w-full max-h-full object-contain" />
              </div>
            ))}
          </div>
        </div>

        {/* Form Container */}
        <div className="relative z-20 flex-1 px-6 bg-white rounded-t-[30px] pt-6 pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] overflow-y-auto -mt-4">
          {formContent}
        </div>
      </div>
    </div>
  );
};

// Calls the SECURITY DEFINER RPC that bypasses RLS to look up admins/vendors
// by the caller's *verified* email (read server-side from auth.users), and
// links the user_id on first successful login. The previous direct
// .from('admins').select(...).eq('email', email) query was blocked by RLS
// for any admin row whose user_id was still NULL, which is exactly the
// state every newly-added admin starts in.
async function validateEmailRole(_email: string, role: SelectedRole): Promise<boolean> {
  if (role !== 'admin' && role !== 'vendor') return false;
  const { data, error } = await (supabase.rpc as any)('claim_role_by_email', { p_role: role });
  if (error) {
    console.error('claim_role_by_email error:', error);
    return false;
  }
  return !!(data && (data as any).ok);
}

export default AuthPage;
