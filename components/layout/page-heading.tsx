import Image from "next/image";
import { withBasePath } from "@/lib/app-paths";
import { cn } from "@/lib/utils";

export function PageHeading({ title, description, actions, compact = false }: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="page-heading relative isolate overflow-hidden rounded-2xl bg-slate-950 text-white">
      <Image src={withBasePath("/warehouse-background.webp")} alt="" fill priority={!compact} sizes="(max-width: 1024px) 100vw, 80vw" className="-z-20 object-cover object-[center_58%]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#071c39]/95 via-[#0b2e55]/85 to-[#0b2e55]/60" />
      <div className={cn(
        "flex flex-col gap-4 px-5 py-5 sm:px-7 sm:py-6 xl:flex-row xl:items-center xl:justify-between",
        compact && "sm:py-5",
      )}>
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-2xl font-bold leading-snug tracking-tight sm:text-[28px]">{title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-200">{description}</p>
        </div>
        {actions ? <div className="hero-actions flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
      </div>
      <div className="absolute bottom-0 left-0 h-[3px] w-32 bg-gradient-to-r from-sky-400 to-cyan-300" />
    </section>
  );
}
