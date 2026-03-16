import { type ReactNode } from 'react';
import Drawer from '@atlaskit/drawer';

export interface M3BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function M3BottomSheet({ open, onClose, children }: M3BottomSheetProps) {
  return (
    <Drawer isOpen={open} onClose={onClose} width="full">
      <div className="p-4">{children}</div>
    </Drawer>
  );
}
