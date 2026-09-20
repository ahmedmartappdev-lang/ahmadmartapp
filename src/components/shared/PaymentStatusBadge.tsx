import React from 'react';
import { CheckCircle2, AlertTriangle, Clock, XCircle, Banknote, Smartphone, CreditCard, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type OrderLike = {
  payment_status?: string | null;
  payment_method?: string | null;
  total_amount?: number | string | null;
  status?: string | null;
};

interface Props {
  order: OrderLike;
  variant?: 'compact' | 'prominent';
  className?: string;
}

interface Resolved {
  tone: 'paid' | 'collect' | 'awaiting' | 'failed' | 'refunded' | 'cancelled' | 'neutral';
  short: string;          // for compact
  long: string;           // for prominent (one strong action line)
  helper?: string;        // optional second line in prominent
  Icon: React.ComponentType<{ className?: string }>;
}

function resolve(order: OrderLike): Resolved {
  const ps = String(order.payment_status ?? '').toLowerCase();
  const pm = String(order.payment_method ?? '').toLowerCase();
  const st = String(order.status ?? '').toLowerCase();
  const amt = Number(order.total_amount ?? 0);

  if (st === 'cancelled') {
    return { tone: 'cancelled', short: 'Cancelled', long: 'ORDER CANCELLED', Icon: XCircle };
  }
  if (ps === 'refunded') {
    return { tone: 'refunded', short: `Refunded ₹${Math.round(amt)}`, long: `REFUNDED ₹${Math.round(amt)}`, Icon: Undo2 };
  }
  if (ps === 'failed') {
    return { tone: 'failed', short: 'Payment failed', long: 'PAYMENT FAILED', Icon: AlertTriangle };
  }

  if (ps === 'completed') {
    if (pm === 'online') {
      return {
        tone: 'paid',
        short: 'Paid · Online',
        long: 'PAID ONLINE',
        helper: 'Do not collect cash',
        Icon: Smartphone,
      };
    }
    if (pm === 'credit') {
      return {
        tone: 'paid',
        short: 'Paid · Credit',
        long: 'PAID VIA CREDIT',
        helper: 'Do not collect cash',
        Icon: CreditCard,
      };
    }
    if (pm === 'cash') {
      return {
        tone: 'paid',
        short: 'Cash collected',
        long: 'CASH COLLECTED',
        Icon: CheckCircle2,
      };
    }
    return { tone: 'paid', short: 'Paid', long: 'PAID', Icon: CheckCircle2 };
  }

  // payment_status pending or unknown
  if (pm === 'cash') {
    return {
      tone: 'collect',
      short: `Collect ₹${Math.round(amt)}`,
      long: `COLLECT ₹${Math.round(amt)} CASH`,
      helper: 'Pay on delivery',
      Icon: Banknote,
    };
  }
  if (pm === 'online') {
    return {
      tone: 'awaiting',
      short: 'Awaiting payment',
      long: 'AWAITING PAYMENT',
      helper: 'Customer has not paid yet',
      Icon: Clock,
    };
  }
  return { tone: 'neutral', short: pm || 'Pending', long: 'PENDING', Icon: Clock };
}

const TONE: Record<Resolved['tone'], { compact: string; prominent: string }> = {
  paid:      { compact: 'bg-green-50 text-green-700 border-green-200',   prominent: 'bg-green-50 text-green-800 border-green-300' },
  collect:   { compact: 'bg-orange-50 text-orange-700 border-orange-200', prominent: 'bg-orange-50 text-orange-800 border-orange-300' },
  awaiting:  { compact: 'bg-yellow-50 text-yellow-700 border-yellow-200', prominent: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  failed:    { compact: 'bg-red-50 text-red-700 border-red-200',         prominent: 'bg-red-50 text-red-800 border-red-300' },
  refunded:  { compact: 'bg-gray-100 text-gray-600 border-gray-200',     prominent: 'bg-gray-100 text-gray-700 border-gray-300' },
  cancelled: { compact: 'bg-gray-100 text-gray-500 border-gray-200',     prominent: 'bg-gray-100 text-gray-600 border-gray-300' },
  neutral:   { compact: 'bg-gray-50 text-gray-600 border-gray-200',      prominent: 'bg-gray-50 text-gray-700 border-gray-300' },
};

export const PaymentStatusBadge: React.FC<Props> = ({ order, variant = 'compact', className }) => {
  const r = resolve(order);
  const t = TONE[r.tone];
  const Icon = r.Icon;

  if (variant === 'prominent') {
    return (
      <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-3', t.prominent, className)}>
        <Icon className="w-5 h-5 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-extrabold tracking-wide truncate">{r.long}</div>
          {r.helper && <div className="text-[11px] opacity-80 mt-0.5">{r.helper}</div>}
        </div>
      </div>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', t.compact, className)}>
      <Icon className="w-3 h-3" />
      {r.short}
    </span>
  );
};
