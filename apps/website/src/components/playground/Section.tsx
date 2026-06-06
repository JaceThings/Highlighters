import type { ReactNode } from "react";

interface SectionProps {
  title: ReactNode;
  description: string;
  children: ReactNode;
}

export function Section({ title, description, children }: SectionProps) {
  // Everything sits on the 24px ruled grid: each text line is one row.
  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-col px-[4px] text-text-primary">
        <h2 className="text-[16px] leading-[24px] font-[550] tracking-[-0.25px]">
          {title}
        </h2>
        <p className="text-[14px] leading-[24px] font-medium tracking-[-0.25px] text-wrap-pretty">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
