import * as React from "react";
import * as Primitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export const DialogClose = Primitive.Close;
export function DialogContent({
  children,
  className,
  overlayClassName,
  showCloseButton = true,
  ...props
}: React.ComponentPropsWithoutRef<typeof Primitive.Content> & {
  overlayClassName?: string;
  showCloseButton?: boolean;
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className={cn("dialog-overlay", overlayClassName)} />
      <Primitive.Content className={cn("dialog-content", className)} {...props}>
        {children}
        {showCloseButton && (
          <Primitive.Close
            className="button button-ghost button-icon dialog-close"
            aria-label="Close dialog"
          >
            <X size={17} />
          </Primitive.Close>
        )}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
