import { supabase } from '@/integrations/supabase/client';

export type SelectedRole = 'customer' | 'delivery_partner' | 'vendor' | 'admin';

interface ValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validates if a phone number is pre-registered for a specific role.
 * - Customer: Always valid (no pre-registration required)
 * - Other roles: Must exist in the respective table
 */
export async function validateRoleAccess(
  phone: string,
  selectedRole: SelectedRole
): Promise<ValidationResult> {
  if (selectedRole === 'customer') {
    return { isValid: true, error: null };
  }

  try {
    let tableName: 'admins' | 'vendors' | 'delivery_partners';
    let roleLabel: string;

    switch (selectedRole) {
      case 'admin':
        tableName = 'admins';
        roleLabel = 'Admin';
        break;
      case 'vendor':
        tableName = 'vendors';
        roleLabel = 'Vendor';
        break;
      case 'delivery_partner':
        tableName = 'delivery_partners';
        roleLabel = 'Delivery Partner';
        break;
      default:
        return { isValid: false, error: 'Invalid role selected' };
    }

    const { data, error } = await supabase
      .from(tableName)
      .select('id, phone')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.error('Role validation error:', error);
      return { isValid: false, error: 'Unable to verify your account. Please try again.' };
    }

    if (!data) {
      return {
        isValid: false,
        error: `Your phone number is not registered as a ${roleLabel}. Please contact the admin to get access.`,
      };
    }

    return { isValid: true, error: null };
  } catch (err) {
    console.error('Role validation exception:', err);
    return { isValid: false, error: 'An unexpected error occurred. Please try again.' };
  }
}

/**
 * Gets the dashboard redirect path for a given role
 */
export function getRoleRedirectPath(role: SelectedRole): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'vendor':
      return '/vendor';
    case 'delivery_partner':
      return '/delivery';
    case 'customer':
    default:
      return '/';
  }
}
