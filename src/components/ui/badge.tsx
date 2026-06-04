import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-accent-foreground",
        outline: "border-border text-foreground",
        success: "border-transparent bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
        warning: "border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
        danger: "border-transparent bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
