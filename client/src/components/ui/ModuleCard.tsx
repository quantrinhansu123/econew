import React from 'react';
import { clsx } from 'clsx';
import { HelpCircle, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface ModuleCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  colorScheme: 'red' | 'green' | 'pink' | 'blue' | 'orange' | 'teal' | 'purple' | 'cyan' | 'emerald' | 'amber' | 'slate';
  path?: string;
}

const colorMap = {
  red: 'bg-red-500/10 text-red-500',
  green: 'bg-emerald-500/10 text-emerald-500',
  pink: 'bg-pink-500/10 text-pink-500',
  blue: 'bg-blue-500/10 text-blue-500',
  orange: 'bg-orange-500/10 text-orange-500',
  teal: 'bg-teal-500/10 text-teal-500',
  purple: 'bg-purple-500/10 text-purple-500',
  cyan: 'bg-cyan-500/10 text-cyan-500',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  slate: 'bg-slate-500/10 text-slate-500',
};

export const ModuleCard: React.FC<ModuleCardProps> = ({
  icon: Icon,
  title,
  description,
  colorScheme,
  path
}) => {
  const navigate = useNavigate();
  const isPlaceholderPath = path?.includes('/:') ?? false;
  const isNavigable = Boolean(path) && !isPlaceholderPath;

  const handleClick = () => {
    if (isNavigable && path) {
      navigate(path);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={clsx(
        "group flex items-center bg-card rounded-xl p-4 transition-all duration-300 border border-border hover:border-primary/30 hover:shadow-sm cursor-pointer hover:-translate-y-0.5",
        !isNavigable && "opacity-60 grayscale-[0.5] cursor-not-allowed hover:translate-y-0 hover:border-border"
      )}
    >
      <div 
        className={clsx(
          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mr-3 transition-transform group-hover:scale-110",
          colorMap[colorScheme]
        )}
      >
        <Icon size={22} />
      </div>
      
      <div className="flex-1 min-w-0 pr-2">
        <h3 className="font-bold text-[14px] text-foreground mb-0.5 truncate transition-colors">
          {title}
        </h3>
        <p className="text-[12px] text-muted-foreground truncate leading-snug">
          {description}
        </p>
      </div>

      <div className="flex shrink-0 flex-col gap-1 text-muted-foreground/30" onClick={(e) => e.stopPropagation()}>
        <button className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-amber-50 hover:text-amber-500" title="Đánh dấu" aria-label={`Đánh dấu ${title}`}>
          <Star size={15} />
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-primary/5 hover:text-primary" title="Hướng dẫn sử dụng" aria-label={`Hướng dẫn ${title}`}>
          <HelpCircle size={15} />
        </button>
      </div>
    </div>
  );
};
