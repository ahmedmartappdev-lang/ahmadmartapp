// Thin client-side helper for Razorpay Checkout.
// - loadRazorpayScript: idempotent script injection.
// - openRazorpay: promise-based wrapper that resolves with the handler payload
//   (razorpay_order_id, razorpay_payment_id, razorpay_signature) and rejects
//   when the customer dismisses the modal.

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
      on: (event: string, cb: (data: unknown) => void) => void;
      close: () => void;
    };
  }
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number; // paise
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (response: RazorpayHandlerResponse) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
    escape?: boolean;
  };
  retry?: { enabled: boolean; max_count?: number };
}

export interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Razorpay script load failed")));
      if ((existing as any).readyState === "complete" || window.Razorpay) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Razorpay script load failed"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function openRazorpay(
  options: Omit<RazorpayCheckoutOptions, "handler" | "modal">
): Promise<RazorpayHandlerResponse> {
  await loadRazorpayScript();
  if (!window.Razorpay) {
    throw new Error("Razorpay unavailable");
  }

  return await new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    let settled = false;
    const rzp = new window.Razorpay!({
      ...options,
      handler: (response) => {
        settled = true;
        resolve(response);
      },
      modal: {
        confirm_close: true,
        escape: true,
        ondismiss: () => {
          if (!settled) reject(new Error("PAYMENT_CANCELLED"));
        },
      },
    });
    rzp.on("payment.failed", (resp: unknown) => {
      if (!settled) {
        settled = true;
        const err: any = new Error("PAYMENT_FAILED");
        err.detail = resp;
        reject(err);
      }
    });
    rzp.open();
  });
}
