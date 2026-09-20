import { create } from 'zustand';

interface MobileAuthSheetState {
  isOpen: boolean;
  openAuthSheet: () => void;
  closeAuthSheet: () => void;
}

export const useMobileAuthSheet = create<MobileAuthSheetState>((set) => ({
  isOpen: false,
  openAuthSheet: () => set({ isOpen: true }),
  closeAuthSheet: () => set({ isOpen: false }),
}));
