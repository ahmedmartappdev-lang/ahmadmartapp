// Shared regex validators + format helpers for entity-edit forms.
// Used by VendorSettings, DeliverySettings, AdminVendors, AdminDelivery.
//
// Convention: validators ALLOW empty strings (return ok) so optional fields
// don't error when blank. Combine with isPresent() when a field is required.
// Format helpers strip-and-cap input so users physically cannot type
// out-of-range characters (e.g. typing letters into an Aadhar field).

export type ValidationResult = { ok: boolean; error?: string };

const ok = (): ValidationResult => ({ ok: true });
const fail = (error: string): ValidationResult => ({ ok: false, error });

// --- Format helpers (apply onChange to coerce input as user types) ---

export const formatDigits = (s: string, max: number): string =>
  (s || '').replace(/\D/g, '').slice(0, max);

export const formatUpper = (s: string, max: number): string =>
  (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);

// --- Validators ---

export const isPresent = (s: string | null | undefined): ValidationResult => {
  const v = (s || '').trim();
  return v.length > 0 ? ok() : fail('Required');
};

export const isValidPhone = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^[6-9]\d{9}$/.test(s) ? ok() : fail('Phone must be 10 digits starting with 6-9');
};

export const isValidEmail = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? ok() : fail('Enter a valid email');
};

export const isValidAadhar = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^\d{12}$/.test(s) ? ok() : fail('Aadhar must be 12 digits');
};

export const isValidPAN = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s) ? ok() : fail('PAN must be like ABCDE1234F');
};

export const isValidGST = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)
    ? ok()
    : fail('GST must be 15 chars (e.g. 22ABCDE1234F1Z5)');
};

export const isValidFSSAI = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^\d{14}$/.test(s) ? ok() : fail('FSSAI must be 14 digits');
};

export const isValidIFSC = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s) ? ok() : fail('IFSC must be like HDFC0001234');
};

export const isValidBankAccount = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^\d{9,18}$/.test(s) ? ok() : fail('Account number must be 9-18 digits');
};

export const isValidPincode = (s: string): ValidationResult => {
  if (!s) return ok();
  return /^[1-9]\d{5}$/.test(s) ? ok() : fail('Pincode must be 6 digits');
};

export const isValidVehicleNumber = (s: string): ValidationResult => {
  if (!s) return ok();
  // Accepts KA01AB1234, KA-01-AB-1234, KA 01 AB 1234 — normalize before checking
  const compact = s.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/.test(compact)
    ? ok()
    : fail('Vehicle number must be like KA01AB1234');
};

export const isValidDrivingLicense = (s: string): ValidationResult => {
  if (!s) return ok();
  const compact = s.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{8,16}$/.test(compact)
    ? ok()
    : fail('License number must be 8-16 alphanumeric chars');
};

export const isValidCommissionRate = (n: number | string): ValidationResult => {
  const v = typeof n === 'number' ? n : Number(n);
  if (Number.isNaN(v)) return fail('Must be a number');
  return v >= 0 && v <= 100 ? ok() : fail('Must be between 0 and 100');
};

// --- Batch helper for submit-time validation ---

export type FieldChecks = Record<string, ValidationResult>;

/**
 * Collect errors from a map of field -> ValidationResult.
 * Returns an `errors` map of only failures. Use at submit time:
 *
 *   const errs = collectErrors({
 *     phone: isValidPhone(form.phone),
 *     pan:   isValidPAN(form.pan),
 *   });
 *   if (Object.keys(errs).length > 0) { setErrors(errs); toast.error('Fix highlighted fields'); return; }
 */
export const collectErrors = (checks: FieldChecks): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, r] of Object.entries(checks)) {
    if (!r.ok && r.error) out[k] = r.error;
  }
  return out;
};
