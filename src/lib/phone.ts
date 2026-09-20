/**
 * Sanitize a phone number input by stripping country code prefixes (+91, 91)
 * and non-digit characters, then limiting to 10 digits.
 * Used everywhere except the login/OTP interface.
 */
export function sanitizePhone(value: string): string {
  // Remove all non-digit characters
  let digits = value.replace(/\D/g, '');
  // Strip leading "91" country code if the result would be > 10 digits
  if (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // Limit to 10 digits
  return digits.slice(0, 10);
}

/**
 * Format a 10-digit phone number for storage with +91 prefix.
 * Returns null if the input is empty or not exactly 10 digits after sanitization.
 * Used when saving phone numbers to role tables (admins, vendors, delivery_partners)
 * so the handle_new_user trigger can match them against auth.users.phone.
 */
export function formatPhoneForStorage(value: string): string | null {
  const digits = sanitizePhone(value);
  if (digits.length !== 10) return digits.length === 0 ? null : digits;
  return `+91${digits}`;
}

/**
 * Display a stored phone number (which may have +91 prefix) as 10-digit number.
 */
export function displayPhone(value: string | null | undefined): string {
  if (!value) return '';
  return sanitizePhone(value);
}
