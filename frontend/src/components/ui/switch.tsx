"use client";
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full bg-elev2 transition-colors data-[state=checked]:bg-sakura",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 translate-x-[3px] rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[19px]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
