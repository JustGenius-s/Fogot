"use client";

import type { ThreadTokenUsage } from "@assistant-ui/react-ai-sdk";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createContext, useContext, useMemo, type FC } from "react";
import { getSelectedChatModel } from "@/bridge";
import { useUsageSnapshot } from "@/ai/context-manager";

const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${tokens}`;
};

const getUsagePercent = (
  totalTokens: number | undefined,
  modelContextWindow: number,
): number => {
  if (!totalTokens) return 0;
  return Math.min((totalTokens / modelContextWindow) * 100, 100);
};

type UsageSeverity = "normal" | "warning" | "critical";

const getUsageSeverity = (percent: number): UsageSeverity => {
  if (percent > 85) return "critical";
  if (percent >= 65) return "warning";
  return "normal";
};

const getStrokeColor = (percent: number): string => {
  const severity = getUsageSeverity(percent);
  if (severity === "critical") return "stroke-red-500";
  if (severity === "warning") return "stroke-amber-500";
  return "stroke-emerald-500";
};

type ContextDisplayContextValue = {
  usage: ThreadTokenUsage | undefined;
  totalTokens: number;
  percent: number;
  modelContextWindow: number;
};

const ContextDisplayContext = createContext<ContextDisplayContextValue | null>(
  null,
);

function useContextDisplay(): ContextDisplayContextValue {
  const ctx = useContext(ContextDisplayContext);
  if (!ctx) {
    throw new Error(
      "ContextDisplay.* must be used within ContextDisplay.Root",
    );
  }
  return ctx;
}

function ContextDisplayPopoverContent({
  side = "top",
  className,
}: {
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  const { usage, totalTokens, percent, modelContextWindow } =
    useContextDisplay();

  return (
    <TooltipContent
      side={side}
      sideOffset={8}
      className={cn(
        "rounded-lg border px-3 py-2 shadow-md",
        className,
      )}
    >
      <div className="grid min-w-40 gap-1.5 text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Usage</span>
          <span className="font-mono tabular-nums">
            {Math.round(percent)}%
          </span>
        </div>

        {usage?.inputTokens !== undefined && usage.inputTokens > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Input</span>
            <span className="font-mono tabular-nums">
              {formatTokenCount(usage.inputTokens)}
            </span>
          </div>
        )}

        {usage?.cachedInputTokens !== undefined &&
          usage.cachedInputTokens > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Cached</span>
              <span className="font-mono tabular-nums">
                {formatTokenCount(usage.cachedInputTokens)}
              </span>
            </div>
          )}

        {usage?.outputTokens !== undefined && usage.outputTokens > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Output</span>
            <span className="font-mono tabular-nums">
              {formatTokenCount(usage.outputTokens)}
            </span>
          </div>
        )}

        {usage?.reasoningTokens !== undefined &&
          usage.reasoningTokens > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Reasoning</span>
              <span className="font-mono tabular-nums">
                {formatTokenCount(usage.reasoningTokens)}
              </span>
            </div>
          )}

        <div className="mt-0.5 border-t pt-1.5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono tabular-nums">
              {formatTokenCount(totalTokens)} /{" "}
              {formatTokenCount(modelContextWindow)}
            </span>
          </div>
        </div>
      </div>
    </TooltipContent>
  );
}

const RING_SIZE = 16;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export const ContextDisplayRing: FC<{
  modelContextWindow?: number;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}> = ({ modelContextWindow: mwProp, className, side = "top" }) => {
  const snapshot = useUsageSnapshot();
  const usage: ThreadTokenUsage | undefined = snapshot
    ? { inputTokens: snapshot.inputTokens, outputTokens: snapshot.outputTokens, totalTokens: snapshot.totalTokens }
    : undefined;

  const contextWindow =
    mwProp ?? getSelectedChatModel()?.contextWindow ?? 1_000_000;

  const totalTokens = usage?.totalTokens ?? 0;
  const percent = getUsagePercent(totalTokens, contextWindow);

  const contextValue = useMemo(
    () => ({ usage, totalTokens, percent, modelContextWindow: contextWindow }),
    [usage, totalTokens, percent, contextWindow],
  );

  return (
    <ContextDisplayContext.Provider value={contextValue}>
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={cn(
                  "inline-flex items-center rounded-md p-1 transition-colors hover:bg-muted",
                  className,
                )}
                aria-label="Context usage"
              />
            }
          >
            <svg
              aria-hidden="true"
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              className="-rotate-90"
            >
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                strokeWidth={RING_STROKE}
                className="stroke-muted"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={
                  RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE
                }
                className={cn(
                  "transition-[stroke-dashoffset,stroke] duration-300",
                  percent > 0 ? getStrokeColor(percent) : "stroke-muted-foreground/30",
                )}
              />
            </svg>
          </TooltipTrigger>
          <ContextDisplayPopoverContent side={side} />
        </Tooltip>
      </TooltipProvider>
    </ContextDisplayContext.Provider>
  );
};

export { useContextDisplay, formatTokenCount, getUsagePercent, getUsageSeverity };
export type { ThreadTokenUsage };
