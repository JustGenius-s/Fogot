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
import { CheckIcon, BotIcon, ImageIcon, AudioLinesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  type selectTriggerVariants,
} from "@/components/assistant-ui/select";
import {
  useConfig,
  useAgentId,
  useSelectedChatModelId,
  setSelectedChatModelId,
  useSelectedImageModelId,
  setSelectedImageModelId,
  useSelectedAudioModelId,
  setSelectedAudioModelId,
  type ModelConfig,
  type ModelType,
} from "@/bridge";

/** Icon for a model based on its type. */
function modelTypeIcon(type: ModelType) {
  if (type === "image") return <ImageIcon className="size-3.5" />;
  if (type === "audio") return <AudioLinesIcon className="size-3.5" />;
  return <BotIcon className="size-3.5" />;
}

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
      <span className="flex shrink-0">{modelTypeIcon(selected.type)}</span>
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
          <span className="flex shrink-0">{modelTypeIcon(model.type)}</span>
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

type ModelSelectorViewProps = ModelSelectorProps & {
  models: ModelConfig[];
  value: string;
  onValueChange: (value: string) => void;
  emptyLabel: string;
};

/** Shared rendering for a single-type model selector (empty/single/multi). */
const ModelSelectorView: FC<ModelSelectorViewProps> = ({
  variant = "ghost",
  size = "sm",
  contentClassName,
  models,
  value,
  onValueChange,
  emptyLabel,
}) => {
  if (models.length === 0) {
    return (
      <span className="px-2 py-1 text-xs text-destructive/80">{emptyLabel}</span>
    );
  }

  if (models.length === 1) {
    const m = models[0];
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground">
        {modelTypeIcon(m.type)}
        <span className="truncate">{m.name}</span>
      </span>
    );
  }

  return (
    <ModelSelectorRoot models={models} value={value} onValueChange={onValueChange}>
      <ModelSelectorTrigger variant={variant} size={size} />
      <ModelSelectorContent className={contentClassName} />
    </ModelSelectorRoot>
  );
};

/**
 * The primary model selector shown in the composer. Picks the chat model in
 * every mode except Image mode (which picks the image model). Audio mode is
 * chat-driven, so it also shows the chat model here; the audio backend is
 * chosen separately via {@link AudioModelSelector}.
 */
const ModelSelectorImpl: FC<ModelSelectorProps> = (props) => {
  const config = useConfig();
  const agentId = useAgentId();
  const chatModelId = useSelectedChatModelId();
  const imageModelId = useSelectedImageModelId();

  const isImageMode = agentId === "image";
  const models = config.models.filter((m) =>
    m.type === (isImageMode ? "image" : "chat"),
  );

  return (
    <ModelSelectorView
      {...props}
      models={models}
      value={isImageMode ? imageModelId : chatModelId}
      onValueChange={
        isImageMode
          ? (v) => { if (v) setSelectedImageModelId(v); }
          : (v) => { if (v) setSelectedChatModelId(v); }
      }
      emptyLabel={isImageMode ? "No image model" : "No model"}
    />
  );
};

const ModelSelector = memo(ModelSelectorImpl);
(ModelSelector as any).displayName = "ModelSelector";

/** Audio backend selector, shown only in Audio mode. */
const AudioModelSelectorImpl: FC<ModelSelectorProps> = (props) => {
  const config = useConfig();
  const audioModelId = useSelectedAudioModelId();
  const models = config.models.filter((m) => m.type === "audio");

  return (
    <ModelSelectorView
      {...props}
      models={models}
      value={audioModelId}
      onValueChange={(v) => { if (v) setSelectedAudioModelId(v); }}
      emptyLabel="No audio model"
    />
  );
};

const AudioModelSelector = memo(AudioModelSelectorImpl);
(AudioModelSelector as any).displayName = "AudioModelSelector";

export { ModelSelector, AudioModelSelector };
