import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, MapPin, Package, LogOut, ChevronRight, Wallet,
  Info, FileText, ShieldCheck, HeartHandshake, Pencil, Check, X,
  Download, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Footer } from '@/components/customer/Footer';
import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCustomerCredits } from '@/hooks/useCustomerCredits';
import { sanitizePhone } from '@/lib/phone';
import { EnableNotificationsCard } from '@/components/customer/EnableNotificationsCard';

interface ProfileData {
  full_name: string;
  phone: string;
  profile_image_url: string | null;
}

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { signOut } = useAuth();
  const { creditBalance } = useCustomerCredits();

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  const [formData, setFormData] = useState<ProfileData>({
    full_name: '',
    phone: '',
    profile_image_url: null,
  });

  useEffect(() => {
    async function fetchProfile() {
      if (!user?.id) return;
      try {
        setIsLoading(true);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (error) throw error;
        if (profile) {
          const d: ProfileData = {
            full_name: profile.full_name || '',
            phone: sanitizePhone(profile.phone || ''),
            profile_image_url: profile.profile_image_url,
          };
          setFormData(d);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        toast.error('Failed to load profile details');
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfile();
  }, [user]);

  const handleSaveName = async () => {
    if (!user?.id) return;
    if (!formData.full_name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    try {
      setIsSavingName(true);
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: formData.full_name.trim(), updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success('Name updated successfully');
      setIsEditingName(false);
    } catch {
      toast.error('Failed to update name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  // Data right: download — opens a pre-filled support email. Handled
  // manually within 30 days per the policy.
  const handleDownloadData = () => {
    const phone = formData.phone || '';
    const subject = encodeURIComponent(`Data Request — ${phone || user?.id}`);
    const body = encodeURIComponent(
`Hi support team,

I would like to download my personal data from Ahmad Mart.

Registered phone: ${phone || '(not on file)'}
User ID: ${user?.id || ''}
Account email: ${(user as any)?.email || '(none)'}

Please share an export within 30 days as per your privacy policy.

Thanks.`
    );
    window.location.href = `mailto:support@ahmadenterprises.in?subject=${subject}&body=${body}`;
  };

  // Data right: delete. First we gate on outstanding dues + active
  // orders so the customer doesn't fire off an email that we'd just
  // bounce back. Only then do we open a pre-filled support email.
  const handleDeleteAccount = async () => {
    if (!user?.id) return;
    try {
      const [{ data: profile }, { data: liveOrders }] = await Promise.all([
        supabase.from('profiles').select('credit_balance').eq('user_id', user.id).single(),
        supabase
          .from('orders')
          .select('id')
          .eq('customer_id', user.id)
          .not('status', 'in', '("delivered","cancelled","refunded")' as any)
          .limit(1),
      ]);
      const dueAmount = Math.max(0, Number(profile?.credit_balance || 0));
      const hasActive = (liveOrders || []).length > 0;
      if (dueAmount > 0 || hasActive) {
        toast.error(
          dueAmount > 0 && hasActive
            ? `You have ₹${dueAmount.toFixed(2)} outstanding and an active order. Please settle both before requesting deletion.`
            : dueAmount > 0
              ? `You have ₹${dueAmount.toFixed(2)} outstanding. Please settle before requesting deletion.`
              : 'You have an active order. Please wait until it is delivered or cancelled.'
        );
        return;
      }
      if (!window.confirm('This will open an email to our support team requesting account deletion. Continue?')) return;

      // Persist a deletion_requests row first so we have an audit trail
      // and a reference number to show the customer. Pending status —
      // admin marks completed after manually deleting + emailing the
      // confirmation. If the insert fails we still let the email open
      // (the email itself is the customer's primary record).
      const phone = formData.phone || '';
      let referenceNumber: string | null = null;
      try {
        const { data: created } = await (supabase
          .from('deletion_requests') as any)
          .insert({
            user_id: user.id,
            customer_email: (user as any)?.email || null,
            customer_phone: phone || null,
            status: 'pending',
            notes: 'Requested via Profile → Delete My Account',
          })
          .select('reference_number')
          .single();
        referenceNumber = (created as any)?.reference_number || null;
      } catch (e) {
        console.warn('deletion_requests insert failed', e);
      }

      const subject = encodeURIComponent(
        referenceNumber
          ? `Account Deletion Request — ${referenceNumber}`
          : 'Account Deletion Request'
      );
      const body = encodeURIComponent(
`Hi support team,

I would like to permanently delete my Ahmad Mart account.

Reference: ${referenceNumber || '(pending)'}
Registered phone: ${phone || '(not on file)'}
User ID: ${user?.id || ''}
Account email: ${(user as any)?.email || '(none)'}

I understand that:
  - You will verify my identity using the registered phone.
  - Deletion is processed within 30 days.
  - Transaction records are retained for 7 years (GST compliance), anonymised.

Thanks.`
      );
      window.location.href = `mailto:support@ahmadenterprises.in?subject=${subject}&body=${body}`;
      if (referenceNumber) {
        toast.success(`Request recorded: ${referenceNumber}`);
      }
    } catch (err) {
      console.error('delete-precheck failed', err);
      toast.error('Could not check your account state. Please try again.');
    }
  };

  if (!user) return null;

  const MenuItem = ({ icon: Icon, label, subtitle, onClick, badge }: any) => (
    <div 
      onClick={onClick}
      className="flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="bg-gray-50 p-2.5 rounded-full text-gray-700 border border-gray-100">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 leading-tight">{label}</h3>
          {subtitle && <p className="text-[13px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {badge && <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">{badge}</span>}
        <ChevronRight className="w-5 h-5 text-gray-300" />
      </div>
    </div>
  );

  return (
    <CustomerLayout hideHeader={true} hideBottomNav={false}>
      <div className="bg-[#f6faf4] min-h-screen pb-6 font-['Plus_Jakarta_Sans',sans-serif]">
        
        {/* Premium Header Section */}
        <div className="bg-[#1d6c0a] rounded-b-[2rem] pt-14 pb-12 px-6 text-white shadow-md relative overflow-hidden">
          {/* Decorative Elements */}
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-[#a3f788]/20 blur-3xl rounded-full pointer-events-none"></div>
          <div className="absolute -left-12 -top-12 w-48 h-48 bg-white/5 blur-3xl rounded-full pointer-events-none"></div>

          <div className="relative z-10 flex items-center gap-4">
            <Avatar className="w-16 h-16 border-2 border-white/20 shadow-sm bg-white">
              <AvatarImage src={formData.profile_image_url || "/image_36e101.png"} className="object-cover" />
              <AvatarFallback className="bg-white text-[#1d6c0a] text-xl font-bold font-['Epilogue',sans-serif]">
                {formData.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2 bg-white/10 p-1 rounded-lg backdrop-blur-sm">
                  <Input 
                    value={formData.full_name} 
                    onChange={(e) => setFormData(p => ({...p, full_name: e.target.value}))} 
                    className="h-8 bg-transparent border-none text-white placeholder:text-white/50 focus-visible:ring-0 text-lg font-bold p-1"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-[#a3f788] hover:bg-white/20 rounded-md" onClick={handleSaveName} disabled={isSavingName}>
                    <Check className="w-5 h-5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-white/70 hover:bg-white/20 rounded-md" onClick={() => setIsEditingName(false)}>
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-['Epilogue',sans-serif] font-bold tracking-tight truncate pr-2">
                    {formData.full_name || 'Guest User'}
                  </h1>
                  <p className="text-white/80 text-sm font-medium mt-0.5 tracking-wide">
                    {formData.phone ? `+91 ${formData.phone}` : 'No phone connected'}
                  </p>
                </>
              )}
            </div>

            {!isEditingName && (
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full shrink-0" onClick={() => setIsEditingName(true)}>
                <Pencil className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Floating Credit Card */}
        <div className="mx-4 -mt-6 relative z-20">
          <div 
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow group" 
            onClick={() => navigate('/credit-history')}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#f6faf4] rounded-xl flex items-center justify-center border border-[#a3f788]/30 group-hover:bg-[#1d6c0a] group-hover:text-white transition-colors duration-300">
                <Wallet className="w-6 h-6 text-[#1d6c0a] group-hover:text-white" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Ahmad Credit</p>
                <p className={`text-xl font-black font-['Epilogue',sans-serif] ${creditBalance < 0 ? 'text-red-600' : 'text-[#181d19]'}`}>
                  {creditBalance < 0 ? '-' : ''}₹{Math.abs(creditBalance).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center">
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Push-notifications opt-in — silent if unsupported / already on / dismissed */}
        <div className="px-4 mt-6 max-w-3xl mx-auto">
          <EnableNotificationsCard />
        </div>

        {/* Account Menu */}
        <div className="px-4 mt-4 space-y-3 max-w-3xl mx-auto">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2">My Account</h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <MenuItem 
              icon={Package} 
              label="My Orders" 
              subtitle="Track, reorder and view details" 
              onClick={() => navigate('/orders')} 
            />
            <div className="h-[1px] bg-gray-50 mx-4"></div>
            <MenuItem 
              icon={MapPin} 
              label="Saved Addresses" 
              subtitle="Manage your delivery locations" 
              onClick={() => navigate('/addresses')} 
            />
          </div>
        </div>

        {/* Support & Legal Menu */}
        <div className="px-4 mt-6 space-y-3 max-w-3xl mx-auto">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2">Support & Legal</h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <MenuItem icon={Info} label="About Us" onClick={() => navigate('/about')} />
            <div className="h-[1px] bg-gray-50 mx-4"></div>
            <MenuItem icon={ShieldCheck} label="Privacy Policy" onClick={() => navigate('/privacy')} />
            <div className="h-[1px] bg-gray-50 mx-4"></div>
            <MenuItem icon={FileText} label="Terms & Conditions" onClick={() => navigate('/terms')} />
            <div className="h-[1px] bg-gray-50 mx-4"></div>
            <MenuItem icon={HeartHandshake} label="Merchant Policy" onClick={() => navigate('/merchant-policy')} badge="Partners" />
          </div>
        </div>

        {/* Privacy & Data — user data rights per GDPR-style policy */}
        <div className="px-4 mt-6 space-y-3 max-w-3xl mx-auto">
          <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2">Privacy & Data</h3>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <MenuItem
              icon={Download}
              label="Download My Data"
              subtitle="Email request — handled within 30 days"
              onClick={handleDownloadData}
            />
            <div className="h-[1px] bg-gray-50 mx-4"></div>
            <MenuItem
              icon={Trash2}
              label="Delete My Account"
              subtitle="Settle dues first · 7-year tax retention applies"
              onClick={handleDeleteAccount}
            />
          </div>
          <p className="text-[11px] text-gray-400 px-2">
            See <button onClick={() => navigate('/account-deletion')} className="underline">Account Deletion policy</button> for details.
          </p>
        </div>

        {/* Logout Button */}
        <div className="px-4 mt-8 mb-12 max-w-3xl mx-auto">
          <Button 
            onClick={handleLogout} 
            className="w-full bg-white text-red-600 hover:bg-red-50 hover:text-red-700 border border-red-100 font-semibold h-12 rounded-2xl shadow-sm transition-all text-base"
          >
            <LogOut className="w-5 h-5 mr-2" /> Log Out
          </Button>
          <p className="text-center text-xs text-gray-400 mt-6 font-medium tracking-wide uppercase">App Version 1.0.0</p>
        </div>

      </div>
      
      {/* Footer — desktop only; mobile uses BottomNavigation */}
      <div className="hidden md:block">
        <Footer />
      </div>
    </CustomerLayout>
  );
};

export default ProfilePage;
