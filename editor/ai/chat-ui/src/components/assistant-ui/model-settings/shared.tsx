"use client";

import { useState, useMemo, type FC, type ReactNode } from "react";
import {
  SearchIcon,
  CheckIcon,
  ImageIcon,
  BlocksIcon,
  SparklesIcon,
  AudioLinesIcon,
  MessageSquareIcon,
} from "lucide-react";
import type { CatalogModel } from "@/lib/models-catalog";
import { useTranslation, type MessageKey } from "@/lib/i18n";
import type { ModelConfig, ModelType, ProviderConfig } from "@/bridge";
import { cn } from "@/lib/utils";

export function emptyModel(type: ModelType = "chat"): ModelConfig {
  return {
    id: `model-${Date.now()}`,
    type,
    name: "",
    apiKey: "",
    apiEndpoint: type === "audio" ? "https://api.minimaxi.com" : "",
    model: type === "audio" ? "speech-2.5-hd-preview" : "",
    authMode: "bearer",
    maxTokens: 4096,
    temperature: 0.7,
    ...(type === "audio" ? { provider: "minimax" } : {}),
  };
}

/** A new, empty provider connection draft. */
export function emptyProvider(): ProviderConfig {
  return { id: `custom-${Date.now()}`, name: "", apiKey: "", baseURL: "", models: {} };
}

export const MODEL_TYPE_KEY: Record<ModelType, MessageKey> = {
  chat: "type.chat",
  image: "type.image",
  audio: "type.audio",
};

export const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50";

export const labelClass = "text-xs font-medium text-muted-foreground/80";

export const CapabilityToggle: FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/50"
  >
    <span className="text-sm">{label}</span>
    <span
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </span>
  </button>
);

export interface SearchSelectItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  badges?: ReactNode;
}

export const SearchSelect: FC<{
  placeholder: string;
  items: SearchSelectItem[];
  value?: string;
  onSelect: (id: string) => void;
  emptyHint?: string;
}> = ({ placeholder, items, value, onSelect, emptyHint }) => {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(s) ||
        it.id.toLowerCase().includes(s) ||
        (it.sublabel?.toLowerCase().includes(s) ?? false),
    );
  }, [q, items]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute inset-s-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <input
          className={cn(inputClass, "ps-7")}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-56 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/60">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground/60">
            {emptyHint ?? "—"}
          </div>
        ) : (
          filtered.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                value === it.id && "bg-accent/60",
              )}
            >
              {it.icon}
              <span className="min-w-0 flex-1 truncate">
                {it.label}
                {it.sublabel && (
                  <span className="ms-1.5 text-xs text-muted-foreground/60">
                    {it.sublabel}
                  </span>
                )}
              </span>
              {it.badges}
              {value === it.id && <CheckIcon className="size-3.5 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export const CapabilityBadges: FC<{ model: CatalogModel }> = ({ model }) => {
  const vision = model.attachment || model.modalities?.input?.includes("image");
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground/70">
      {vision && <ImageIcon className="size-3.5" />}
      {model.tool_call && <BlocksIcon className="size-3.5" />}
      {model.reasoning && <SparklesIcon className="size-3.5" />}
    </span>
  );
};

/** Modality derived from a catalog model's output (image / audio / chat). */
export function modelTypeOf(m: CatalogModel): ModelType {
  const out = m.modalities?.output ?? [];
  if (out.includes("image")) return "image";
  if (out.includes("audio")) return "audio";
  return "chat";
}

export const MODALITY_ICON: Record<ModelType, FC<{ className?: string }>> = {
  chat: MessageSquareIcon,
  image: ImageIcon,
  audio: AudioLinesIcon,
};

/** Small modality pill (icon + label) for an enabled/listed model. */
export const ModalityBadge: FC<{ type: ModelType }> = ({ type }) => {
  const { t } = useTranslation();
  const Icon = MODALITY_ICON[type];
  return (
    <span className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Icon className="size-3" />
      {t(`type.${type}` as MessageKey)}
    </span>
  );
};

/** Capability icons from plain boolean flags (for live-fetched models). */
export const FlagBadges: FC<{ vision?: boolean; toolCall?: boolean; reasoning?: boolean }> = ({
  vision,
  toolCall,
  reasoning,
}) => (
  <span className="flex shrink-0 items-center gap-1 text-muted-foreground/70">
    {vision && <ImageIcon className="size-3.5" />}
    {toolCall && <BlocksIcon className="size-3.5" />}
    {reasoning && <SparklesIcon className="size-3.5" />}
  </span>
);

export interface CheckItem {
  id: string;
  name: string;
  on: boolean;
  right?: ReactNode;
}

/** Searchable, multi-select checklist of models. Shared by catalog & live fetch. */
export const ModelCheckList: FC<{
  items: CheckItem[];
  query: string;
  onQuery: (s: string) => void;
  onToggle: (id: string) => void;
}> = ({ items, query, onQuery, onToggle }) => {
  const { t } = useTranslation();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (it) => it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q),
      )
    : items;
  return (
    <>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(inputClass, "pl-8")}
          placeholder={t("settings.searchModels")}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border/60 p-1">
        {filtered.length > 0 ? (
          filtered.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                it.on ? "bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  it.on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {it.on && <CheckIcon className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
              {it.right}
            </button>
          ))
        ) : (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground/60">
            {t("settings.noModelsMatch")}
          </div>
        )}
      </div>
    </>
  );
};

export const SectionHeader: FC<{
  title: string;
  action?: ReactNode;
}> = ({ title, action }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-muted-foreground">{title}</span>
    {action}
  </div>
);

export const ModeToggle: FC<{
  mode: "catalog" | "custom";
  onChange: (m: "catalog" | "custom") => void;
}> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  const opt = (id: "catalog" | "custom", label: string) => (
    <button
      type="button"
      onClick={() => onChange(id)}
      className={cn(
        "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        mode === id
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
      {opt("catalog", t("settings.sourceCatalog"))}
      {opt("custom", t("settings.sourceCustom"))}
    </div>
  );
};
