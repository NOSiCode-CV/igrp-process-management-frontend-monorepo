import {
  cn,
  IGRPButton,
  Button,
  CollapsibleContent,
  Collapsible,
  CollapsibleTrigger,
  IGRPCopyTo,
  DialogContent as DialogContentRaw,
  DialogDescription as DialogDescriptionRaw,
  DialogFooter,
  DialogHeader,
  Dialog as DialogRaw,
  DialogTitle as DialogTitleRaw,
  IGRPIcon,
} from "@igrp/igrp-framework-react-design-system";
import type { ComponentType, ReactNode } from "react";
import { useEffect } from "react";
import { useState } from "react";

/**
 * design-system 0.2.x re-exports the Dialog primitives from the unified
 * `radix-ui` package (`Dialog as reactDialog` → `@radix-ui/react-dialog`). Those
 * `React.ComponentProps<typeof DialogPrimitive.Root|Content|...>` types collapse
 * to no-props (`IntrinsicAttributes`) when this package is type-checked as a
 * consumer, so the compiler rejects `open`/`onOpenChange`/`className`/the Radix
 * dismissal handlers. The components are runtime-correct; re-type only the
 * props we actually pass so the behaviour is preserved without a raw `any`.
 * Remove these aliases once the design-system stops leaking radix namespace
 * types across the package boundary.
 */
const Dialog = DialogRaw as unknown as ComponentType<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}>;
const DialogContent = DialogContentRaw as unknown as ComponentType<{
  className?: string;
  showCloseButton?: boolean;
  onEscapeKeyDown?: (event: Event) => void;
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
  children?: ReactNode;
}>;
const DialogTitle = DialogTitleRaw as unknown as ComponentType<{
  className?: string;
  children?: ReactNode;
}>;
const DialogDescription = DialogDescriptionRaw as unknown as ComponentType<{
  className?: string;
  children?: ReactNode;
}>;

export interface IGRPConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmDelete: () => Promise<void>;
  description?: string;
  labelBtnCancel?: string;
  labelBtnConfirm?: string;
  textHeader?: string;
  isCompleted?: boolean;
  message?: string;
  /**
   * When `false`, the dialog can only be closed via the confirm action.
   * Escape, backdrop click and the X button are all neutralised. Useful for
   * non-cancellable success confirmations after destructive / one-shot
   * actions (e.g. "task completed" — the user must press the explicit
   * button so the host can decide where to navigate).
   * Defaults to `true`.
   */
  dismissable?: boolean;
}

const IGRPConfirmationDialogIconConfig = {
  success: {
    iconName: "CircleCheckBig" as const,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    animation: "animate-scale-in",
  },
  error: {
    iconName: "Ban" as const,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    animation: "animate-shake",
  },
};

export function IGRPConfirmationDialog({
  open,
  onOpenChange,
  confirmDelete,
  description,
  labelBtnConfirm = "Continuar",
  textHeader = "Confirmação Final",
  isCompleted = false,
  message = "",
  dismissable = true,
}: IGRPConfirmationDialogProps) {
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [showIcon, setShowIcon] = useState(false);

  useEffect(() => {
    if (open) {
      setIsMessageOpen(false);
      const timer = setTimeout(() => setShowIcon(true), 50);
      return () => clearTimeout(timer);
    }
    setShowIcon(false);
  }, [open]);

  const config = isCompleted
    ? IGRPConfirmationDialogIconConfig.success
    : IGRPConfirmationDialogIconConfig.error;

  // When `dismissable` is false, only allow the dialog to be opened from the
  // outside. Any attempt to close it (X, Esc, backdrop) is swallowed so the
  // host stays in control of when it actually goes away (typically via the
  // confirm button's navigation).
  const handleOpenChange = (next: boolean) => {
    if (!dismissable && !next) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-md overflow-hidden space-y-4"
        showCloseButton={dismissable}
        onEscapeKeyDown={(e) => {
          if (!dismissable) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (!dismissable) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (!dismissable) e.preventDefault();
        }}
      >
        <div className="flex flex-col items-center gap-2 justify-center">
          <div
            aria-hidden="true"
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full transition-all duration-500",
              config.bgColor,
              showIcon ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          >
            <IGRPIcon
              iconName={config.iconName}
              className={cn(
                "h-10 w-10",
                config.color,
                showIcon && config.animation,
              )}
            />
          </div>
          <DialogHeader className="min-w-0 max-w-full">
            <DialogTitle className="text-center break-words">
              {textHeader}
            </DialogTitle>
            <DialogDescription className="text-center break-words">
              {description}
            </DialogDescription>
          </DialogHeader>
        </div>
        {message && (
          <Collapsible
            open={isMessageOpen}
            onOpenChange={setIsMessageOpen}
          >
            <CollapsibleTrigger asChild>
              <IGRPButton
                variant="ghost"
                className="w-full justify-center"
                type="button"
              >
                <span className="text-sm font-medium">
                  {isMessageOpen ? "Ocultar detalhes" : "Mostrar detalhes"}
                </span>
                {isMessageOpen ? (
                  <IGRPIcon iconName="ChevronUp" />
                ) : (
                  <IGRPIcon iconName="ChevronDown" />
                )}
              </IGRPButton>
            </CollapsibleTrigger>
            <CollapsibleContent className="min-w-0 space-y-2">
              <div className="flex min-w-0 items-start gap-2">
                <pre className="min-w-0 flex-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
                  {message}
                </pre>
                <IGRPCopyTo value={message} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        <DialogFooter>
          <Button
            variant="default"
            onClick={() => confirmDelete()}
            className="w-full"
          >
            {labelBtnConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
