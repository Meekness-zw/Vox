import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
  showText = true,
}: {
  className?: string;
  href?: string;
  showText?: boolean;
}) {
  const mark = (
    <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      {/* waveform mark */}
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
        <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="5" y1="9" x2="5" y2="15" />
          <line x1="9.5" y1="6" x2="9.5" y2="18" />
          <line x1="14" y1="8" x2="14" y2="16" />
          <line x1="18.5" y1="10" x2="18.5" y2="14" />
        </g>
      </svg>
    </span>
  );

  return (
    <Link href={href} className={cn("flex items-center gap-2", className)}>
      {mark}
      {showText && (
        <span className="text-lg font-semibold tracking-tight">Vox</span>
      )}
    </Link>
  );
}
