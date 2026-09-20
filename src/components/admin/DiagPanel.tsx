import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

/**
 * Headless diagnostic — emits a `console.info` line on every dashboard
 * route mount. No UI, no perf cost. If the client sends a screenshot
 * of a blank screen we ask them to also screenshot the console; that
 * one line tells us the exact route, user id and build SHA they're
 * looking at.
 *
 * Mounted once inside DashboardLayout, so it logs for /admin/*, the
 * vendor self-edit dashboard and the delivery partner dashboard.
 */
export const DiagPanel: React.FC = () => {
  const location = useLocation();
  const { user } = useAuthStore();

  useEffect(() => {
    const sha = (typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev') as string;
    const built = (typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '') as string;
    // eslint-disable-next-line no-console
    console.info(
      `[DASHBOARD DIAG] route=${location.pathname} user=${user?.id || '(none)'} build=${sha} tsBuild=${built}`,
    );
  }, [location.pathname, user?.id]);

  return null;
};
