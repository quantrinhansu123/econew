import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { sidebarMenu, extraMenuItems } from '../../data/sidebarMenu';
import type { SidebarItem } from '../../data/sidebarMenu';
import { getModulePathForRoute } from '../../data/moduleData';
import { clsx } from 'clsx';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  return (
    <>
      {/* Overlay - visible whenever sidebar is open ON MOBILE */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 bg-card border-r border-border transition-all duration-300 flex flex-col h-full",
          // Mobile: hidden when closed, w-64 when open
          // Desktop: w-[72px] when closed, w-64 when open
          isOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-[72px]"
        )}
      >
        {/* Header / Logo */}
        <div className={clsx(
          "h-[55px] flex items-center border-b border-border overflow-hidden shrink-0 transition-all duration-300",
          isOpen ? "px-4" : "justify-center"
        )}>
          <div className={clsx(
            "rounded-xl bg-white border border-border flex items-center justify-center shrink-0 transition-all duration-300 p-1 shadow-xs",
            isOpen ? "w-9 h-9" : "w-10 h-10"
          )}>
            <img src="/logo-express-exacting.png" alt="ECO Transport" className="h-full w-full object-contain" />
          </div>
          <div className={clsx("flex flex-col ml-3 whitespace-nowrap transition-opacity duration-300", !isOpen && "opacity-0 hidden")}>
            <span className="font-bold text-[15px] leading-tight text-foreground">ECO Transport</span>
            <span className="text-[11px] text-muted-foreground leading-tight">Express &amp; Exacting</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-2 custom-scrollbar flex flex-col items-center lg:items-stretch">
          {sidebarMenu.map((item) => (
            <NavItem key={item.path} item={item} isOpen={isOpen} onClick={() => {
              if (window.innerWidth < 1024) setIsOpen(false);
            }} />
          ))}

          <div className="my-4 border-t border-border w-full"></div>

          {extraMenuItems.map((item) => (
            <NavItem key={item.path} item={item} isOpen={isOpen} onClick={() => {
              if (window.innerWidth < 1024) setIsOpen(false);
            }} />
          ))}
        </nav>
      </aside>
    </>
  );
};

const NavItem = ({ item, onClick, isOpen }: { item: SidebarItem; onClick?: () => void; isOpen: boolean }) => {
  const location = useLocation();
  const activeModulePath = getModulePathForRoute(location.pathname);

  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) =>
        clsx(
          'flex items-center rounded-xl text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap',
          isOpen ? 'px-3 py-2.5 w-full justify-start' : 'w-11 h-11 justify-center',
          (isActive || activeModulePath === item.path)
            ? 'bg-primary text-white shadow-sm'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )
      }
      title={!isOpen ? item.label : undefined}
    >
      <div className={clsx("flex items-center justify-center shrink-0", isOpen && "w-5 mr-3")}>
        <item.icon size={22} className={clsx(!isOpen && "mt-0.5")} strokeWidth={1.75} />
      </div>
      <span className={clsx("transition-all duration-300", !isOpen && "opacity-0 w-0 hidden")}>{item.label}</span>
    </NavLink>
  );
};

export default Sidebar;
