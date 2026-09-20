import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUserRoles } from '@/hooks/useUserRoles';
import { toast } from 'sonner';

type AllowedRole = 'admin' | 'vendor' | 'delivery_partner' | 'customer';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  requireAuth?: boolean;
  redirectTo?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requireAuth = true,
  redirectTo = '/auth',
}) => {
  const { user, isLoading: authLoading } = useAuthStore();
  const {
    isAdmin,
    isVendor,
    isDeliveryPartner,
    isCustomer,
    isLoading: rolesLoading
  } = useUserRoles();
  const location = useLocation();
  const [showTimeoutError, setShowTimeoutError] = useState(false);

  // Safety Timeout: If loading takes > 6 seconds, stop the spinner
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (authLoading || (user && rolesLoading)) {
      timeoutId = setTimeout(() => {
        console.error("ProtectedRoute: Authorization timed out.");
        setShowTimeoutError(true);
        toast.error("Connection timed out. Please check your internet or permissions.");
      }, 6000);
    }

    return () => clearTimeout(timeoutId);
  }, [authLoading, rolesLoading, user]);

  // Debug logs
  useEffect(() => {
    if (authLoading || rolesLoading) {
      console.log('ProtectedRoute: Verifying access...', {
        authLoading,
        rolesLoading,
        user: user?.email
      });
    }
  }, [authLoading, rolesLoading, user]);

  // 1. Loading State (with Timeout escape hatch)
  if ((authLoading || (user && rolesLoading)) && !showTimeoutError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  // 2. Not Authenticated
  if (requireAuth && !user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // 3. Role Validation
  if (allowedRoles && allowedRoles.length > 0) {
    // If we hit the timeout, we assume no roles loaded, so access will fail naturally below
    const roleMap: Record<AllowedRole, boolean | undefined> = {
      admin: isAdmin,
      vendor: isVendor,
      delivery_partner: isDeliveryPartner,
      customer: isCustomer,
    };

    const hasAccess = allowedRoles.some((role) => roleMap[role]);
    
    if (!hasAccess) {
      // If we timed out, show a specific error instead of just redirecting silently
      if (showTimeoutError) {
         return (
           <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 text-center">
             <h2 className="text-xl font-bold text-destructive">Authorization Failed</h2>
             <p className="text-muted-foreground">
               We couldn't verify your permissions. This might be a database connection issue.
             </p>
             <button 
               onClick={() => window.location.reload()}
               className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
             >
               Retry
             </button>
             <button 
               onClick={() => window.location.href = '/'}
               className="text-sm text-muted-foreground hover:underline"
             >
               Go to Home
             </button>
           </div>
         );
      }

      console.warn(`Access denied for ${user?.email} to ${location.pathname}`);
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};
