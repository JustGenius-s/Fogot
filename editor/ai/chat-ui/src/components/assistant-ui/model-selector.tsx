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
import { CheckIcon, BotIcon, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  type selectTriggerVariants,
} from "@/components/assistant-ui/select";
import {
  useConfig,
  useSelectedChatModelId,
  setSelectedChatModelId,
  type ModelConfig,
} from "@/bridge";

// ─── Context ──────────────────────────────────────────────────────

type ModelSelectorContextValue = {
  models: ModelConfig[];
  value: string;
};

const ModelSelectorContext = createContext<ModelSelectorContextValue | null>(null);

function useModelSelectorContext() {
  const ctx = useContext(ModelSelectorContext);
  if (!ctx) {
    throw new Error("ModelSelector sub-components must be used within ModelSelector.Root");
  }
  return ctx;
}

// ─── Sub-components ───────────────────────────────────────────────

type ModelSelectorRootProps = {
  models: ModelConfig[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
};

function ModelSelectorRoot({ models, value, onValueChange, children }: ModelSelectorRootProps) {
  return (
    <ModelSelectorContext.Provider value={{ models, value }}>
      <SelectRoot value={value} onValueChange={onValueChange}>
        {children}
      </SelectRoot>
    </ModelSelectorContext.Provider>
  );
}

type ModelSelectorTriggerProps = ComponentPropsWithoutRef<typeof SelectTrigger>;

function ModelSelectorTrigger({ className, ...props }: ModelSelectorTriggerProps) {
  return (
    <SelectTrigger className={className} {...props}>
      <ModelSelectorValue />
    </SelectTrigger>
  );
}

function ModelSelectorValue() {
  const { models, value } = useModelSelectorContext();
  const selected = models.find((m) => m.id === value);
  if (!selected) return <SelectPrimitive.Value />;

  return (
    <span className="inline-flex! items-center gap-1.5">
      <span className="flex shrink-0">
        {selected.type === "image" ? (
          <ImageIcon className="size-3.5" />
        ) : (
          <BotIcon className="size-3.5" />
        )}
      </span>
      <span className="truncate">{selected.name}</span>
    </span>
  );
}

type ModelSelectorContentProps = ComponentPropsWithoutRef<typeof SelectContent>;

function ModelSelectorContent({ className, children, ...props }: ModelSelectorContentProps) {
  const { models } = useModelSelectorContext();
  return (
    <SelectContent className={className} {...props}>
      {children ??
        models.map((model) => <ModelSelectorItem key={model.id} model={model} />)}
    </SelectContent>
  );
}

type ModelSelectorItemProps = Omit<
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>,
  "value" | "children"
> & {
  model: ModelConfig;
};

function ModelSelectorItem({ model, className, ...props }: ModelSelectorItemProps) {
  return (
    <SelectPrimitive.Item
      value={model.id}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pe-8 ps-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute inset-e-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>
        <span className="flex items-center gap-1.5">
          <span className="flex shrink-0">
            {model.type === "image" ? (
              <ImageIcon className="size-3.5" />
            ) : (
              <BotIcon className="size-3.5" />
            )}
          </span>
          <span>{model.name}</span>
        </span>
      </SelectPrimitive.ItemText>
      <span className="ms-auto ps-4 text-xs text-muted-foreground">{model.model}</span>
    </SelectPrimitive.Item>
  );
}

// ─── Default export (wired to bridge model state) ─────────────────

type ModelSelectorProps = VariantProps<typeof selectTriggerVariants> & {
  contentClassName?: string;
};

const ModelSelectorImpl: FC<ModelSelectorProps> = ({
  variant = "ghost",
  size = "sm",
  contentClassName,
}) => {
  const config = useConfig();
  const value = useSelectedChatModelId();
  const chatModels = config.models.filter((m) => m.type === "chat");

  if (chatModels.length === 0) {
    return (
      <span className="px-2 py-1 text-xs text-destructive/80">
        No model
      </span>
    );
  }

  if (chatModels.length === 1) return null;

  return (
    <ModelSelectorRoot models={chatModels} value={value} onValueChange={setSelectedChatModelId}>
      <ModelSelectorTrigger variant={variant} size={size} />
      <ModelSelectorContent className={contentClassName} />
    </ModelSelectorRoot>
  );
};

const ModelSelector = memo(ModelSelectorImpl);
(ModelSelector as any).displayName = "ModelSelector";

export { ModelSelector };
