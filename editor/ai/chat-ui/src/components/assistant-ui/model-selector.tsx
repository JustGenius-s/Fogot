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
import {
  CheckIcon,
  BotIcon,
  ImageIcon,
  AudioLinesIcon,
  BlocksIcon,
  SparklesIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveCapabilities } from "@/lib/model-capabilities";
import { getProvider } from "@/lib/models-catalog";
import { ProviderLogo } from "@/components/assistant-ui/provider-logo";
import { useTranslation } from "@/lib/i18n";
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

/**
 * Provider logo (from models.dev) with a graceful fallback to the model-type
 * icon, mirroring opencode's provider-led model list.
 */
function ModelGlyph({ model }: { model: ModelConfig }) {
  const typeIcon = <span className="flex shrink-0">{modelTypeIcon(model.type)}</span>;
  if (!model.providerId) return typeIcon;
  return (
    <ProviderLogo
      providerId={model.providerId}
      className="size-3.5 shrink-0"
      fallback={typeIcon}
    />
  );
}

/** Small capability indicators (vision / tools / reasoning) for chat models. */
function ModelCapBadges({ model }: { model: ModelConfig }) {
  const { t } = useTranslation();
  if (model.type !== "chat") return null;
  const caps = resolveCapabilities(model);
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground/70">
      {caps.vision && (
        <span title={t("selector.capVision")} className="flex">
          <ImageIcon className="size-3" />
        </span>
      )}
      {caps.toolCall && (
        <span title={t("selector.capToolCall")} className="flex">
          <BlocksIcon className="size-3" />
        </span>
      )}
      {caps.reasoning && (
        <span title={t("selector.capReasoning")} className="flex">
          <SparklesIcon className="size-3" />
        </span>
      )}
    </span>
  );
}

interface ModelGroup {
  key: string;
  label: string;
  providerId?: string;
  items: ModelConfig[];
}

/** Group models by their catalog provider, with a fallback for custom models. */
function groupModelsByProvider(models: ModelConfig[], customLabel: string): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const m of models) {
    const key = m.providerId ?? "__custom__";
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: m.providerId ? getProvider(m.providerId)?.name ?? m.providerId : customLabel,
        providerId: m.providerId,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(m);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
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
      <ModelGlyph model={selected} />
      <span className="truncate">{selected.name}</span>
    </span>
  );
}

type ModelSelectorContentProps = ComponentPropsWithoutRef<typeof SelectContent>;

function ModelSelectorContent({ className, children, ...props }: ModelSelectorContentProps) {
  const { models } = useModelSelectorContext();
  const { t } = useTranslation();

  if (children) {
    return (
      <SelectContent className={className} {...props}>
        {children}
      </SelectContent>
    );
  }

  const groups = groupModelsByProvider(models, t("selector.customGroup"));
  const showLabels = groups.length > 1;

  return (
    <SelectContent className={className} {...props}>
      {groups.map((group) => (
        <SelectPrimitive.Group key={group.key}>
          {showLabels && (
            <SelectPrimitive.Label className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-muted-foreground/70">
              {group.providerId && (
                <ProviderLogo
                  providerId={group.providerId}
                  className="size-3.5 shrink-0"
                  fallback={<span className="hidden" />}
                />
              )}
              <span className="truncate">{group.label}</span>
            </SelectPrimitive.Label>
          )}
          {group.items.map((model) => (
            <ModelSelectorItem key={model.id} model={model} />
          ))}
        </SelectPrimitive.Group>
      ))}
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
          <ModelGlyph model={model} />
          <span>{model.name}</span>
        </span>
      </SelectPrimitive.ItemText>
      <span className="ms-auto ps-3">
        <ModelCapBadges model={model} />
      </span>
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
        <ModelGlyph model={m} />
        <span className="truncate">{m.name}</span>
        <ModelCapBadges model={m} />
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
