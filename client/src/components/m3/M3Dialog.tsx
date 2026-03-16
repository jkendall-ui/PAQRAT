import { type ReactNode } from 'react';
import Modal, {
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from '@atlaskit/modal-dialog';

export interface M3DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function M3Dialog({ open, onClose, title, children, actions }: M3DialogProps) {
  return (
    <ModalTransition>
      {open && (
        <Modal onClose={onClose}>
          {title && (
            <ModalHeader>
              <ModalTitle>{title}</ModalTitle>
            </ModalHeader>
          )}
          <ModalBody>{children}</ModalBody>
          {actions && <ModalFooter>{actions}</ModalFooter>}
        </Modal>
      )}
    </ModalTransition>
  );
}
