"use client";

import {
  memo,
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type FC,
} from "react";
import { Select as SelectPrimitive } from "radix-ui";
import type { VariantProps } from "class-variance-authority";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  type selectTriggerVariants,
} from "@/components/assistant-ui/select";
import { MessageCircleIcon, ScissorsIcon } from "lucide-react";
import { useAgentId, setAgentId } from "@/bridge";
import { agents } from "@/ai/agents";

export type ModeOption = {
  id: string;
  name: string;
  description?: string;
  icon?: ReactNode;
};

type ModeSelectorContextValue = {
  modes: ModeOption[];
  value: string;
};

const ModeSelectorContext = createContext<ModeSelectorContextValue | null>(null);

function useModeSelectorContext() {
  const ctx = useContext(ModeSelectorContext);
  if (!ctx) {
    throw new Error("ModeSelector sub-components must be used within ModeSelector.Root");
  }
  return ctx;
}

// ─── Sub-components ───────────────────────────────────────────────

type ModeSelectorRootProps = {
  modes: ModeOption[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
};

function ModeSelectorRoot({ modes, value, onValueChange, children }: ModeSelectorRootProps) {
  return (
    <ModeSelectorContext.Provider value={{ modes, value }}>
      <SelectRoot value={value} onValueChange={onValueChange}>
        {children}
      </SelectRoot>
    </ModeSelectorContext.Provider>
  );
}

type ModeSelectorTriggerProps = ComponentPropsWithoutRef<typeof SelectTrigger>;

function ModeSelectorTrigger({ className, ...props }: ModeSelectorTriggerProps) {
  return (
    <SelectTrigger className={className} {...props}>
      <ModeSelectorValue />
    </SelectTrigger>
  );
}

function ModeSelectorValue() {
  const { modes, value } = useModeSelectorContext();
  const selected = modes.find((m) => m.id === value);
  if (!selected) return <SelectPrimitive.Value />;

  return (
    <span className="!inline-flex items-center gap-1.5">
      {selected.icon && <span className="flex shrink-0">{selected.icon}</span>}
      <span className="truncate">{selected.name}</span>
    </span>
  );
}

type ModeSelectorContentProps = ComponentPropsWithoutRef<typeof SelectContent>;

function ModeSelectorContent({ className, children, ...props }: ModeSelectorContentProps) {
  const { modes } = useModeSelectorContext();
  return (
    <SelectContent className={className} {...props}>
      {children ?? modes.map((mode) => <ModeSelectorItem key={mode.id} mode={mode} />)}
    </SelectContent>
  );
}

type ModeSelectorItemProps = Omit<
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>,
  "value" | "children"
> & {
  mode: ModeOption;
};

function ModeSelectorItem({ mode, className, ...props }: ModeSelectorItemProps) {
  return (
    <SelectPrimitive.Item
      value={mode.id}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pe-8 ps-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute end-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>
        <span className="flex items-center gap-1.5">
          {mode.icon && <span className="flex shrink-0">{mode.icon}</span>}
          <span>{mode.name}</span>
        </span>
      </SelectPrimitive.ItemText>
      {mode.description && (
        <span className="ms-auto ps-4 text-xs text-muted-foreground">
          {mode.description}
        </span>
      )}
    </SelectPrimitive.Item>
  );
}

// ─── Default export (wired to bridge agent state) ─────────────────

const DEFAULT_MODE_ID = "chat";

const agentIcons: Record<string, ReactNode> = {
  sprite_decompose: <ScissorsIcon className="size-3.5" />,
};

const defaultModes: ModeOption[] = [
  { id: DEFAULT_MODE_ID, name: "Chat", icon: <MessageCircleIcon className="size-3.5" /> },
  ...agents.map((a) => ({
    id: a.id,
    name: a.displayName,
    icon: agentIcons[a.id],
  })),
];

type ModeSelectorProps = VariantProps<typeof selectTriggerVariants> & {
  contentClassName?: string;
};

const ModeSelectorImpl: FC<ModeSelectorProps> = ({
  variant = "ghost",
  size = "sm",
  contentClassName,
}) => {
  const value = useAgentId();

  return (
    <ModeSelectorRoot modes={defaultModes} value={value} onValueChange={setAgentId}>
      <ModeSelectorTrigger variant={variant} size={size} />
      <ModeSelectorContent className={contentClassName} />
    </ModeSelectorRoot>
  );
};

const ModeSelector = memo(ModeSelectorImpl) as unknown as typeof ModeSelectorImpl & {
  Root: typeof ModeSelectorRoot;
  Trigger: typeof ModeSelectorTrigger;
  Content: typeof ModeSelectorContent;
  Item: typeof ModeSelectorItem;
  Value: typeof ModeSelectorValue;
};

(ModeSelector as any).displayName = "ModeSelector";
(ModeSelector as any).Root = ModeSelectorRoot;
(ModeSelector as any).Trigger = ModeSelectorTrigger;
(ModeSelector as any).Content = ModeSelectorContent;
(ModeSelector as any).Item = ModeSelectorItem;
(ModeSelector as any).Value = ModeSelectorValue;

export {
  DEFAULT_MODE_ID,
  ModeSelector,
  ModeSelectorRoot,
  ModeSelectorTrigger,
  ModeSelectorContent,
  ModeSelectorItem,
  ModeSelectorValue,
};
