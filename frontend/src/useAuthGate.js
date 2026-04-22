import { useCallback, useState } from 'react';

const DEFAULT_CONTEXT = 'Bu işlemi gerçekleştirmek';

function useAuthGate() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalContext, setAuthModalContext] = useState(DEFAULT_CONTEXT);

  const ensureAuth = useCallback((contextText = DEFAULT_CONTEXT) => {
    const token = localStorage.getItem('sb_token');
    if (token) return token;
    setAuthModalContext(contextText);
    setIsAuthModalOpen(true);
    return null;
  }, []);

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
  }, []);

  return {
    isAuthModalOpen,
    authModalContext,
    ensureAuth,
    closeAuthModal
  };
}

export default useAuthGate;