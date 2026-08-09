import type { ReactNode } from 'react';
import { clsx } from 'clsx';

const inputClass =
  'h-8 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 text-[12px] font-semibold text-slate-950 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15';

export function CompactInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputClass, props.className)} />;
}

export function CompactSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputClass, props.className)} />;
}

export function CompactTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(inputClass, 'h-16 resize-none py-2', props.className)} />;
}

export function CompactField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  labelWidth?: string;
}) {
  return (
    <div className={clsx('flex min-w-0 flex-col gap-1', className)}>
      <label className="min-h-[15px] text-[11px] font-extrabold leading-tight text-slate-700">{label}</label>
      <div className="min-h-8 min-w-0">{children}</div>
    </div>
  );
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-300/80 bg-white/95 p-2.5 shadow-sm ring-1 ring-white/70">
      <h3 className="mb-2 border-b border-slate-200 pb-1.5 text-[12px] font-black uppercase tracking-wide text-slate-800">
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
