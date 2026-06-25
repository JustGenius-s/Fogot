"use client";

import {
  memo,
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type FC,
} from "react";
import { Select as SelectPrimitive, HoverCard as HoverCardPrimitive } from "radix-ui";
import type { VariantProps } from "class-variance-authority";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  type selectTriggerVariants,
} from "@/components/assistant-ui/select";
import { BotIcon, ListTodoIcon, ImagePlusIcon, PencilRulerIcon } from "lucide-react";
import { useAgentId, setAgentId } from "@/bridge";
import { useTranslation, type MessageKey } from "@/lib/i18n";

/** Extra intro shown in the hover popup of the mode picker. */
export type ModeIntro = {
  taglineKey: MessageKey;
  capsKey: MessageKey;
  whenKey: MessageKey;
};

export type ModeOption = {
  id: string;
  name: string;
  description?: string;
  icon?: ReactNode;
  intro?: ModeIntro;
};

type ModeSelectorContextValue = {
  modes: ModeOption[];
  value: string;
  hoverGate: boolean;
};

const ModeSelectorContext = createContext<ModeSelectorContextValue | null>(null);

function useModeSelectorContext() {
  const ctx = useContext(ModeSelectorContext);
  if (!ctx) {
    throw new Error("ModeSelector sub-components must be used within ModeSelector.Root");
  }
  return ctx;
}

const GATE_MS = 350

// ─── Sub-components ───────────────────────────────────────────────

type ModeSelectorRootProps = {
  modes: ModeOption[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
};

function ModeSelectorRoot({ modes, value, onValueChange, children }: ModeSelectorRootProps) {
  const [hoverGate, setHoverGate] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function armGate() {
    setHoverGate(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHoverGate(false), GATE_MS)
  }

  function disarmGate() {
    setHoverGate(true)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }

  return (
    <ModeSelectorContext.Provider value={{ modes, value, hoverGate }}>
      <SelectRoot
        value={value}
        onValueChange={onValueChange}
        onOpenChange={(open) => { if (open) armGate(); else disarmGate() }}
      >
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
    <span className="inline-flex! items-center gap-1.5">
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
  const { hoverGate } = useModeSelectorContext();
  const [hovered, setHovered] = useState(false)

  const itemEl = (
    <SelectPrimitive.Item
      value={mode.id}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pe-8 ps-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      onPointerEnter={(e) => { if (!hoverGate) setHovered(true); props.onPointerEnter?.(e) }}
      onPointerLeave={(e) => { setHovered(false); props.onPointerLeave?.(e) }}
      {...props}
    >
      <span className="absolute inset-e-2 flex size-3.5 items-center justify-center">
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

  if (!mode.intro) return itemEl;

  // Controlled so the gate (just-opened / selected item under cursor) can
  // suppress the popup until the user actually moves onto an item.
  const open = !hoverGate && hovered;

  return (
    <HoverCardPrimitive.Root open={open} openDelay={0} closeDelay={0}>
      <HoverCardPrimitive.Trigger asChild>{itemEl}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="right"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=right]:slide-in-from-left-2",
          )}
        >
          <ModeIntroCard mode={mode} />
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

// ─── Default export (wired to bridge agent state) ─────────────────

const DEFAULT_MODE_ID = "agent";

type ModeSelectorProps = VariantProps<typeof selectTriggerVariants> & {
  contentClassName?: string;
};

const ModeSelectorImpl: FC<ModeSelectorProps> = ({
  variant = "ghost",
  size = "sm",
  contentClassName,
}) => {
  const value = useAgentId();
  const { t } = useTranslation();

  const defaultModes: ModeOption[] = [
    {
      id: "agent",
      name: t("mode.agent"),
      icon: <BotIcon className="size-3.5" />,
      intro: {
        taglineKey: "mode.agent.intro.tagline",
        capsKey: "mode.agent.intro.caps",
        whenKey: "mode.agent.intro.when",
      },
    },
    {
      id: "plan",
      name: t("mode.plan"),
      icon: <ListTodoIcon className="size-3.5" />,
      intro: {
        taglineKey: "mode.plan.intro.tagline",
        capsKey: "mode.plan.intro.caps",
        whenKey: "mode.plan.intro.when",
      },
    },
    {
      id: "design",
      name: t("mode.design"),
      icon: <PencilRulerIcon className="size-3.5" />,
      intro: {
        taglineKey: "mode.design.intro.tagline",
        capsKey: "mode.design.intro.caps",
        whenKey: "mode.design.intro.when",
      },
    },
    {
      id: "image",
      name: t("mode.image"),
      icon: <ImagePlusIcon className="size-3.5" />,
      intro: {
        taglineKey: "mode.image.intro.tagline",
        capsKey: "mode.image.intro.caps",
        whenKey: "mode.image.intro.when",
      },
    },
  ];

  return (
    <ModeSelectorRoot modes={defaultModes} value={value} onValueChange={setAgentId}>
      <ModeSelectorTrigger variant={variant} size={size} />
      <ModeSelectorContent className={contentClassName} />
    </ModeSelectorRoot>
  );
};

const ModeIntroCard: FC<{ mode: ModeOption }> = ({ mode }) => {
  const { t } = useTranslation();
  if (!mode.intro) return null;
  const caps = t(mode.intro.capsKey).split("\n").filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {mode.icon && <span className="flex shrink-0 text-foreground">{mode.icon}</span>}
        <span className="text-sm font-medium text-foreground">{mode.name}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(mode.intro.taglineKey)}
      </p>
      {caps.length > 0 && (
        <div className="mt-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {t("mode.intro.capLabel")}
          </p>
          <ul className="mt-1 space-y-0.5">
            {caps.map((cap) => (
              <li key={cap} className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground/80">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span>{cap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-1 text-xs leading-relaxed text-foreground/80">
        <span className="text-muted-foreground/70">{t("mode.intro.whenLabel")}:</span>{" "}
        {t(mode.intro.whenKey)}
      </p>
    </div>
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
