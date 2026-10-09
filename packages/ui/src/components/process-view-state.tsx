"use client";

import {
  cn,
  IGRPButton,
  IGRPIcon,
} from "@igrp/igrp-framework-react-design-system";
import type { IGRPProcessErrorCode } from "../lib/process-error";

const COPY: Record<
  IGRPProcessErrorCode,
  { iconName: string; title: string; description: string; tone: string }
> = {
  NOT_FOUND: {
    iconName: "SearchX",
    title: "Processo não encontrado",
    description:
      "Não existe nenhum processo com este número. Confirme se o número está correto ou se o processo foi anulado.",
    tone: "bg-muted text-muted-foreground",
  },
  UNAUTHORIZED: {
    iconName: "LogIn",
    title: "Sessão expirada",
    description:
      "A sua sessão terminou. Inicie sessão novamente para consultar este processo.",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  FORBIDDEN: {
    iconName: "Lock",
    title: "Sem acesso a este processo",
    description:
      "Não tem permissão para consultar este processo. Contacte o administrador se precisar de acesso.",
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  },
  UNKNOWN: {
    iconName: "TriangleAlert",
    title: "Não foi possível carregar o processo",
    description:
      "Ocorreu um erro inesperado. Tente novamente dentro de instantes e, se persistir, contacte o suporte indicando a referência abaixo.",
    tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  },
};

export interface IGRPProcessViewStateProps {
  code: IGRPProcessErrorCode;
  /** Process number or instance id shown as a chip. */
  processRef?: string;
  /** Support reference (e.g. Next.js error digest), shown for UNKNOWN only. */
  reference?: string;
  /** Override the default title/description per app if needed. */
  title?: string;
  description?: string;
  onBack?: () => void;
  onRetry?: () => void;
  className?: string;
}

/**
 * Empty/error state for the process page (not found, no access, failure).
 * Used by `IGRPProcessPage`; exported so apps can reuse it in their own
 * process-related screens and keep the same look.
 */
export function IGRPProcessViewState({
  code,
  processRef,
  reference,
  title,
  description,
  onBack,
  onRetry,
  className,
}: IGRPProcessViewStateProps) {
  const copy = COPY[code] ?? COPY.UNKNOWN;
  const handleBack =
    onBack ??
    (() => {
      if (typeof window !== "undefined") window.history.back();
    });

  return (
    <div className={cn("flex w-full justify-center px-4 py-16", className)}>
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-10 text-center">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            copy.tone,
          )}
        >
          <IGRPIcon iconName={copy.iconName} className="h-6 w-6" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold">{title ?? copy.title}</h2>
          <p className="text-sm text-muted-foreground">
            {description ?? copy.description}
          </p>
        </div>

        {processRef && (
          <span className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {processRef}
          </span>
        )}

        {code === "UNKNOWN" && reference && (
          <p className="text-xs text-muted-foreground/80">
            Referência: <span className="font-mono">{reference}</span>
          </p>
        )}

        <div className="flex flex-row flex-wrap justify-center gap-2 pt-2">
          <IGRPButton
            variant="outline"
            size="default"
            showIcon={true}
            iconName="ArrowLeft"
            onClick={handleBack}
          >
            Voltar
          </IGRPButton>
          {code === "UNKNOWN" && onRetry && (
            <IGRPButton
              variant="default"
              size="default"
              showIcon={true}
              iconName="RefreshCw"
              onClick={onRetry}
            >
              Tentar novamente
            </IGRPButton>
          )}
        </div>
      </div>
    </div>
  );
}
