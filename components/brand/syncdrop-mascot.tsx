import Image from "next/image";
import { withBasePath } from "@/lib/app-paths";
import { cn } from "@/lib/utils";

export function SyncDropMascot({ className, sizes = "128px", priority = false }: {
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none relative isolate w-32 shrink-0 select-none", className)}>
      <span className="absolute bottom-[3%] left-[24%] -z-10 h-[7%] w-[52%] rounded-[50%] bg-sky-950/15 blur-md" />
      <Image
        src={withBasePath("/Mascot Syncdrop.png")}
        alt=""
        width={1254}
        height={1254}
        sizes={sizes}
        priority={priority}
        className="mascot-float h-auto w-full object-contain drop-shadow-[0_8px_12px_rgba(15,60,100,0.12)]"
      />
    </div>
  );
}
