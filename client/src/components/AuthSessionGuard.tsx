import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hasAuthSession, refreshAccessToken } from '../lib/api';

const REFRESH_INTERVAL_MS = 12 * 60 * 1000;

interface Props {
  children: ReactNode;
}

export default function AuthSessionGuard({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!hasAuthSession()) {
      navigate('/login', { replace: true, state: { from: location.pathname } });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const onCleared = () => {
      navigate('/login', { replace: true, state: { from: location.pathname } });
    };
    window.addEventListener('eco-auth-cleared', onCleared);
    return () => window.removeEventListener('eco-auth-cleared', onCleared);
  }, [location.pathname, navigate]);

  useEffect(() => {
    const refresh = () => {
      if (hasAuthSession()) void refreshAccessToken();
    };
    refresh();
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (!hasAuthSession()) return null;

  return children;
}
