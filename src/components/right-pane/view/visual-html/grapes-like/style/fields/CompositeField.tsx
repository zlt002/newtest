import type { ReactNode } from 'react';

type CompositeFieldProps = {
  label: string;
  description?: string;
  children: ReactNode;
};

export default function CompositeField({
  label,
  description,
  children,
}: CompositeFieldProps) {
  return (
    <section className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md text-foreground">
      <header className="flex flex-col gap-0.5">
        <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
      </header>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}
