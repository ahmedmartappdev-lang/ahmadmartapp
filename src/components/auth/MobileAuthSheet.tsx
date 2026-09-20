import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ArrowLeft, ShoppingCart, Truck, ChevronRight, ChevronDown } from 'lucide-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getRoleRedirectPath, type SelectedRole } from '@/hooks/useRoleValidation';
import { useMobileAuthSheet } from '@/stores/mobileAuthSheetStore';

type AuthStep = 'role-selection' | 'phone-input' | 'otp-input';

const roleOptions: { value: SelectedRole; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'customer', label: 'Customer', description: 'Shop for groceries', icon: <ShoppingCart className="w-5 h-5" /> },
  { value: 'delivery_partner', label: 'Delivery Partner', description: 'Deliver orders & earn money', icon: <Truck className="w-5 h-5" /> },
];

export const MobileAuthSheet: React.FC = () => {
  const { isOpen, closeAuthSheet } = useMobileAuthSheet();
  const [step, setStep] = useState<AuthStep>('role-selection');
  const [selectedRole, setSelectedRole] = useState<SelectedRole>('customer');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const { sendOtp, verifyOtp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const resetForm = () => {
    setStep('role-selection');
    setSelectedRole('customer');
    setPhoneNumber('');
    setOtp('');
    setResendTimer(0);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      closeAuthSheet();
      setTimeout(resetForm, 300);
    }
  };

  const handleRoleSelect = (role: SelectedRole) => {
    setSelectedRole(role);
    setStep('phone-input');
  };

  const goBack = () => {
    if (step === 'otp-input') {
      setStep('phone-input');
      setOtp('');
    } else if (step === 'phone-input') {
      setStep('role-selection');
      setPhoneNumber('');
    }
  };

  const handleSendOtp = async () => {
    if (phoneNumber.length !== 10) return;
    setIsSending(true);
    const { success, error } = await sendOtp(phoneNumber, selectedRole);
    setIsSending(false);
    if (success) {
      setStep('otp-input');
      setResendTimer(30);
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
      closeAuthSheet();
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
    } else {
      toast({ title: 'Failed', description: error || 'Try again.', variant: 'destructive' });
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={handleClose}>
      <DrawerContent className="max-h-[85vh] px-5 pb-10 pt-2 rounded-t-[30px] bg-white text-center">
        <div className="mx-auto w-12 h-1.5 rounded-full bg-gray-200 mb-4 flex-shrink-0" />

        {step !== 'role-selection' && (
          <div className="absolute top-6 left-5 z-50">
             <button onClick={goBack} className="w-[38px] h-[38px] bg-white border border-gray-100 rounded-full flex items-center justify-center shadow-sm">
              <ArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
          </div>
        )}

        <div className="flex-1 mt-4">
          <AnimatePresence mode="wait">
            {step === 'role-selection' ? (
              <motion.div key="role-selection" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <div className="bg-[#FF601F] w-[64px] h-[64px] rounded-[18px] flex items-center justify-center text-white font-[800] text-[14px] mx-auto mb-5 shadow-[0_8px_20px_rgba(255,96,31,0.3)]">
                  Fooder
                </div>
                <h2 className="text-[28px] font-[800] tracking-tight leading-tight text-black mb-1">Welcome</h2>
                <p className="text-gray-500 font-semibold mt-1 mb-8 text-[15px]">Select your role to continue</p>
                
                <div className="space-y-3">
                  {roleOptions.map((role) => (
                    <button key={role.value} onClick={() => handleRoleSelect(role.value)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl border border-gray-200 bg-white hover:border-[#FF601F] transition-all text-left group">
                      <div className="text-[#FF601F] shrink-0 bg-[#FF601F]/10 p-2 rounded-full">
                        {React.cloneElement(role.icon as React.ReactElement, { className: 'w-5 h-5' })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 text-[14px]">{role.label}</p>
                        <p className="text-[12px] text-gray-500 font-medium mt-0.5">{role.description}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : step === 'phone-input' ? (
              <motion.div key="phone-input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <div className="bg-[#FF601F] w-[64px] h-[64px] rounded-[18px] flex items-center justify-center text-white font-[800] text-[14px] mx-auto mb-5 shadow-[0_8px_20px_rgba(255,96,31,0.3)]">
                  Fooder
                </div>
                <h2 className="text-[28px] font-[800] tracking-tight leading-tight text-black mb-1">India's fastest app</h2>
                <p className="text-gray-500 font-semibold mt-1 text-[15px]">Log in or sign up</p>

                <div className="flex border-[1.5px] border-gray-200 rounded-[14px] mt-8 overflow-hidden h-[56px] transition-all focus-within:border-[#FF601F] focus-within:ring-4 focus-within:ring-[#FF601F]/10 bg-white">
                  <div className="px-4 flex items-center border-r border-gray-200 font-semibold text-gray-700 bg-white">
                    +91 <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
                  </div>
                  <input
                    type="tel"
                    className="flex-1 border-none px-[16px] text-[16px] outline-none font-medium tracking-[0.5px] bg-transparent w-full"
                    placeholder="Phone Number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    autoFocus
                  />
                </div>

                <button
                  onClick={handleSendOtp}
                  disabled={phoneNumber.length !== 10 || isSending}
                  className={`w-full py-[16px] rounded-[14px] font-bold text-[15px] transition-all mt-[15px] flex items-center justify-center gap-2
                    ${phoneNumber.length === 10 
                      ? 'bg-[#FF601F] text-white shadow-[0_8px_20px_rgba(255,96,31,0.3)]' 
                      : 'bg-[#eeeeee] text-[#9ca3af]'}`}
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Continue
                </button>

                <p className="text-center text-[12px] text-gray-400 mt-[25px] leading-relaxed">
                  By continuing, you agree to our <br/>
                  <a href="/terms" className="text-gray-600 font-bold underline">Terms of Service</a>{' & '}
                  <a href="/privacy" className="text-gray-600 font-bold underline">Privacy Policy</a>
                </p>
              </motion.div>
            ) : (
              <motion.div key="otp-input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <h2 className="text-[28px] font-[800] tracking-tight leading-tight text-black mb-1 mt-4">Verify OTP</h2>
                <p className="text-gray-500 font-semibold mt-2 text-[15px] mb-8">
                  Code sent to <span className="font-bold text-black">+91 {phoneNumber}</span>
                </p>

                <div className="space-y-6">
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="h-12 w-11 text-lg border-gray-200 focus-visible:ring-[#FF601F]" />
                        <InputOTPSlot index={1} className="h-12 w-11 text-lg border-gray-200 focus-visible:ring-[#FF601F]" />
                        <InputOTPSlot index={2} className="h-12 w-11 text-lg border-gray-200 focus-visible:ring-[#FF601F]" />
                        <InputOTPSlot index={3} className="h-12 w-11 text-lg border-gray-200 focus-visible:ring-[#FF601F]" />
                        <InputOTPSlot index={4} className="h-12 w-11 text-lg border-gray-200 focus-visible:ring-[#FF601F]" />
                        <InputOTPSlot index={5} className="h-12 w-11 text-lg border-gray-200 focus-visible:ring-[#FF601F]" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <button
                    onClick={handleVerifyOtp}
                    disabled={otp.length !== 6 || isVerifying}
                    className={`w-full py-[16px] rounded-[14px] font-bold text-[15px] transition-all flex items-center justify-center gap-2
                      ${otp.length === 6 
                        ? 'bg-[#FF601F] text-white shadow-[0_8px_20px_rgba(255,96,31,0.3)]' 
                        : 'bg-[#eeeeee] text-[#9ca3af]'}`}
                  >
                    {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Verify & Continue
                  </button>

                  <div className="text-center">
                    {resendTimer > 0 ? (
                      <p className="text-[13px] text-gray-500 font-medium">Resend in <span className="font-bold text-black">{resendTimer}s</span></p>
                    ) : (
                      <button onClick={handleResendOtp} disabled={isSending} className="text-[13px] text-[#FF601F] font-bold hover:underline">
                        {isSending ? 'Sending...' : 'Resend OTP'}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileAuthSheet;
