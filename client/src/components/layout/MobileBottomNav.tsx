import React from 'react';
import { ArrowLeft, Home, Bell } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-start justify-between border-t border-border bg-card px-6 pt-1 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Điều hướng mobile">
      <button 
        onClick={() => navigate(-1)}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Quay lại"
      >
        <ArrowLeft size={24} />
      </button>

      <button
        onClick={() => navigate('/')}
        className={clsx(
          "flex h-12 w-12 -translate-y-4 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95",
          isHome ? "bg-primary text-white" : "bg-card text-muted-foreground border border-border"
        )}
        aria-label="Về trang chủ"
      >
        <Home size={24} />
      </button>

      <button className="relative flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Mở thông báo">
        <Bell size={24} />
        <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-background">
          4
        </span>
      </button>
    </nav>
  );
};

export default MobileBottomNav;
