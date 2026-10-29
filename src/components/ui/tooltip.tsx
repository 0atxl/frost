import * as Primitive from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
export const TooltipProvider = Primitive.Provider;
export function Tip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content className="tooltip" sideOffset={7}>
          {label}
          <Primitive.Arrow className="tooltip-arrow" />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
