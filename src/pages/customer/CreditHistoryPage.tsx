import React, { useState } from 'react';
import { ArrowLeft, ArrowUpRight, ArrowDownRight, CreditCard, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useCustomerCredits } from '@/hooks/useCustomerCredits';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { OrderDetailsDialog } from '@/components/customer/OrderDetailsDialog';
import { useOrderById } from '@/hooks/useOrders';

const CreditHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { creditLimit, dueAmount, availableCredit, creditHistory, isLoading } = useCustomerCredits();
  const usagePercent = creditLimit > 0 ? (dueAmount / creditLimit) * 100 : 0;
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  // Click-to-view: when txn has order_id we open the shared OrderDetailsDialog;
  // when it doesn't (admin-set limit, online credit payment, etc.) we open a
  // small txn-detail dialog with the description / amount / balance / time.
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeTxn, setActiveTxn] = useState<any | null>(null);
  const { data: activeOrder, isLoading: isOrderLoading } = useOrderById(activeOrderId);

  const handleTxnClick = (txn: any) => {
    if (txn.order_id) {
      setActiveOrderId(txn.order_id);
    } else {
      setActiveTxn(txn);
    }
  };

  const handlePayDues = async () => {
    if (!user) { toast.error('Please login'); return; }
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return; }
    if (amt > dueAmount) { toast.error('Cannot pay more than your due amount'); return; }

    setPaying(true);
    try {
      const { openRazorpay, loadRazorpayScript } = await import('@/lib/razorpay');
      await loadRazorpayScript();

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Session expired. Please login again.');

      const SUPABASE_URL = (supabase as any).supabaseUrl || 'https://otksdfphbgneusgjvjzg.supabase.co';
      const SUPABASE_KEY = (supabase as any).supabaseKey;

      // 1. Init
      const initRes = await fetch(`${SUPABASE_URL}/functions/v1/pay-credit-dues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: amt }),
      });
      const initText = await initRes.text();
      if (!initRes.ok) throw new Error(`[${initRes.status}] ${initText}`);
      const init = JSON.parse(initText);

      // Close our own Dialog *before* opening Razorpay's modal.
      // Radix Dialog leaves a pointer-events:none overlay layered over
      // the rest of the page, which makes the Razorpay iframe appear
      // unclickable. Closing here ensures Razorpay's overlay is the
      // only focus trap on the page.
      setPayOpen(false);

      // 2. Razorpay modal
      const rzpResp = await openRazorpay({
        key: init.key_id,
        amount: init.amount,
        currency: init.currency,
        order_id: init.razorpay_order_id,
        name: 'Ahmad Mart',
        description: `Credit dues payment ₹${amt}`,
        prefill: {
          name: init.prefill_name || undefined,
          contact: init.prefill_contact || undefined,
        },
        theme: { color: '#16a34a' },
      });

      // 3. Verify on server
      const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-credit-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rzpResp),
      });
      const verifyText = await verifyRes.text();
      if (!verifyRes.ok) throw new Error(`[${verifyRes.status}] ${verifyText}`);

      toast.success(`Paid ₹${amt} towards your credit dues`);
      setPayOpen(false);
      setPayAmount('');
      queryClient.invalidateQueries({ queryKey: ['customer-credit-balance', user.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-credit-history', user.id] });
    } catch (e: any) {
      if (e?.message === 'PAYMENT_CANCELLED') toast.error('Payment cancelled');
      else if (e?.message === 'PAYMENT_FAILED') toast.error('Payment failed. Please try again.');
      else toast.error(e?.message || 'Payment failed');
    } finally {
      setPaying(false);
    }
  };

  const openPayDialog = () => {
    setPayAmount(String(Math.round(dueAmount * 100) / 100));
    setPayOpen(true);
  };

  // Strip the razorpay payment_id suffix from "Online credit payment pay_xxxx"
  // so the txn rows read cleanly. Keep the id as a small subtitle.
  const formatTxnDescription = (raw: string | null | undefined): { primary: string; subtitle?: string } => {
    if (!raw) return { primary: 'Transaction' };
    const m = raw.match(/^Online credit payment\s+(pay_[A-Za-z0-9]+)\s*$/i);
    if (m) return { primary: 'Online credit payment', subtitle: m[1] };
    return { primary: raw };
  };

  return (
    <CustomerLayout>
      <div className="max-w-[800px] mx-auto px-3 md:px-4 py-4 md:py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 -ml-1" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg md:text-xl font-bold">Credit History</h1>
        </div>

        {/* Hero card: gradient credit summary */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold uppercase tracking-widest opacity-80">Available Credit</span>
            <CreditCard className="w-5 h-5 opacity-80" />
          </div>
          <p className="text-3xl font-extrabold tracking-tight">₹{availableCredit.toLocaleString()}</p>
          {creditLimit > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-[11px] opacity-90 mb-1.5">
                <span>Used ₹{dueAmount.toLocaleString()} of ₹{creditLimit.toLocaleString()}</span>
                <span>{usagePercent.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Credit Limit</p>
            <p className="text-base font-bold mt-1">₹{creditLimit.toLocaleString()}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${dueAmount > 0 ? 'border-destructive/20 bg-destructive/5' : 'border-gray-100 bg-white'}`}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Due Amount</p>
            <p className={`text-base font-bold mt-1 ${dueAmount > 0 ? 'text-destructive' : ''}`}>
              ₹{dueAmount.toLocaleString()}
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div className="grid gap-3 sm:grid-cols-2">
          {dueAmount > 0 && (
            <Button
              className="w-full h-12 rounded-2xl shadow-sm font-semibold"
              onClick={openPayDialog}
              disabled={paying}
            >
              {paying ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
              ) : (
                <>Pay ₹{dueAmount.toLocaleString()} now</>
              )}
            </Button>
          )}
          <Button variant="outline" className="w-full h-12 rounded-2xl border-gray-200" onClick={() => navigate('/credit-apply')}>
            <CreditCard className="w-4 h-4 mr-2" />
            Apply for higher limit
          </Button>
        </div>

        {/* Pay Dues amount dialog */}
        <Dialog open={payOpen} onOpenChange={(o) => { if (!paying) { setPayOpen(o); if (!o) setPayAmount(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pay your credit dues</DialogTitle>
              <DialogDescription>
                Pay online via UPI, card, or netbanking. Your credit balance updates instantly after payment.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Outstanding due</span>
                <span className="text-base font-bold text-destructive">₹{dueAmount.toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pay-amount">Amount to pay</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={dueAmount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder="Enter amount"
                  disabled={paying}
                />
                <div className="flex gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" className="flex-1 rounded-full" onClick={() => setPayAmount(String(Math.round(dueAmount)))} disabled={paying}>
                    Pay Full ₹{Math.round(dueAmount).toLocaleString()}
                  </Button>
                  {dueAmount > 100 && (
                    <Button type="button" size="sm" variant="outline" className="flex-1 rounded-full" onClick={() => setPayAmount(String(Math.round(dueAmount / 2)))} disabled={paying}>
                      Half
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayOpen(false)} disabled={paying}>Cancel</Button>
              <Button onClick={handlePayDues} disabled={paying || !payAmount || Number(payAmount) <= 0 || Number(payAmount) > dueAmount}>
                {paying ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>) : 'Pay Now'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transaction history */}
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-4 md:px-5 py-3 md:py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold tracking-tight">Transaction History</h2>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-sm text-muted-foreground">Loading…</div>
          ) : creditHistory.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">No transactions yet</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {creditHistory.map((txn: any) => {
                const isCredit = txn.transaction_type === 'credit' || txn.transaction_type === 'refund';
                const { primary, subtitle } = formatTxnDescription(txn.description);
                const clickable = !!txn.order_id;
                return (
                  <li key={txn.id}>
                    <button
                      type="button"
                      onClick={() => handleTxnClick(txn)}
                      className={`w-full flex items-start gap-3 px-4 md:px-5 py-3.5 text-left transition-colors ${
                        clickable ? 'hover:bg-gray-50 active:bg-gray-100' : 'hover:bg-gray-50/60'
                      }`}
                    >
                      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isCredit ? 'bg-green-100' : 'bg-red-50'}`}>
                        {isCredit ? (
                          <ArrowUpRight className="w-4 h-4 text-green-600" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{primary}</p>
                        {subtitle && (
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{subtitle}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(txn.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className={`text-sm font-extrabold whitespace-nowrap ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                            {isCredit ? '+' : '−'}₹{Number(txn.amount).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                            Due ₹{Number(txn.balance_after).toLocaleString()}
                          </p>
                        </div>
                        <ChevronRight className={`w-4 h-4 ${clickable ? 'text-muted-foreground/60' : 'text-muted-foreground/20'}`} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Order detail — opens when a txn linked to an order is tapped */}
      <OrderDetailsDialog
        order={activeOrder}
        loading={isOrderLoading}
        open={!!activeOrderId}
        onOpenChange={(open) => { if (!open) setActiveOrderId(null); }}
      />

      {/* Generic txn detail — opens for non-order txns (limit changes, manual payments, online credit payments) */}
      <Dialog open={!!activeTxn} onOpenChange={(open) => { if (!open) setActiveTxn(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">Transaction</DialogTitle>
          </DialogHeader>
          {activeTxn && (() => {
            const isCredit = activeTxn.transaction_type === 'credit' || activeTxn.transaction_type === 'refund';
            const { primary, subtitle } = formatTxnDescription(activeTxn.description);
            return (
              <div className="space-y-4 pt-1">
                <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{primary}</p>
                    <p className={`text-base font-extrabold tabular-nums ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                      {isCredit ? '+' : '−'}₹{Number(activeTxn.amount).toLocaleString()}
                    </p>
                  </div>
                  {subtitle && (
                    <p className="text-[11px] text-muted-foreground font-mono break-all">{subtitle}</p>
                  )}
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="capitalize">{activeTxn.transaction_type}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Balance after</dt>
                    <dd className="tabular-nums">₹{Number(activeTxn.balance_after).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="text-right">
                      {new Date(activeTxn.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveTxn(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
};

export default CreditHistoryPage;
