import React from 'react';
import { Header } from '@/components/customer/Header';
import { BottomNavigation } from '@/components/customer/BottomNavigation';
import { RequireNameGate } from '@/components/customer/RequireNameGate';

interface CustomerLayoutProps {
  children: React.ReactNode;
  hideSearch?: boolean;
  hideHeader?: boolean;
  hideBottomNav?: boolean;
}

export const CustomerLayout: React.FC<CustomerLayoutProps> = ({
  children,
  hideHeader = false,
  hideBottomNav = false,
}) => {
  return (
    <RequireNameGate>
      <div className="min-h-screen bg-white flex flex-col">
        {!hideHeader && <Header />}

        {/* Main content expands to fill available space */}
        <main className={`flex-1 w-full ${hideBottomNav ? "" : "pb-24 md:pb-0"}`}>
          {children}
        </main>

        {/* Mobile Bottom Nav (Fixed) */}
        {!hideBottomNav && <BottomNavigation />}
      </div>
    </RequireNameGate>
  );
};

export default CustomerLayout;
