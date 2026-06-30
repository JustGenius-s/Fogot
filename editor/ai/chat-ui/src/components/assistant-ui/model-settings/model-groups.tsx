"use client";

import { type FC, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon, Trash2Icon, SquarePenIcon } from "lucide-react";
import {
  useSelectedImageModelId,
  setSelectedImageModelId,
  useImageModelConfirmed,
  setImageModelConfirmed,
  type ModelConfig,
  type ModelType,
} from "@/bridge";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MODEL_TYPE_KEY, SectionHeader } from "./shared";

const ModelListItem: FC<{
  model: ModelConfig;
  onEdit: () => void;
  onDelete: () => void;
  extra?: ReactNode;
}> = ({ model, onEdit, onDelete, extra }) => (
  <div className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/50">
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium leading-snug">{model.name}</div>
      <div className="truncate text-xs text-muted-foreground">{model.model}</div>
    </div>
    {extra && <div className="flex shrink-0 items-center">{extra}</div>}
    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <Button variant="ghost" size="icon-xs" onClick={onEdit}>
        <SquarePenIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onDelete}>
        <Trash2Icon />
      </Button>
    </div>
  </div>
);

export const ModelGroup: FC<{
  title: string;
  type: ModelType;
  items: ModelConfig[];
  allModels: ModelConfig[];
  onEdit: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAdd: (type: ModelType) => void;
  extra?: (model: ModelConfig) => ReactNode;
  footer?: ReactNode;
}> = ({ title, type, items, allModels, onEdit, onDelete, onAdd, extra, footer }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        title={title}
        action={
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => onAdd(type)}
          >
            <PlusIcon className="size-3" />
            {t("common.add")}
          </Button>
        }
      />
      {items.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {items.map((m) => {
            const idx = allModels.indexOf(m);
            return (
              <ModelListItem
                key={m.id}
                model={m}
                onEdit={() => onEdit(idx)}
                onDelete={() => onDelete(idx)}
                extra={extra?.(m)}
              />
            );
          })}
          {footer}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/60">
          {t("settings.noModelsYet", { type: t(MODEL_TYPE_KEY[type]) })}
        </div>
      )}
    </div>
  );
};

/** Compact inline switch reusing the same track/knob styling as CapabilityToggle. */
const DefaultModelToggle: FC<{
  isDefault: boolean;
  onToggle: (next: boolean) => void;
}> = ({ isDefault, onToggle }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDefault}
      title={isDefault ? t("imgModel.alwaysHint") : t("imgModel.defaultModel")}
      onClick={() => onToggle(!isDefault)}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-muted"
    >
      <span
        className={cn(
          "text-[11px] font-medium",
          isDefault ? "text-primary" : "text-muted-foreground/60",
        )}
      >
        {t("imgModel.defaultModel")}
      </span>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          isDefault ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "inline-block size-4 transform rounded-full bg-background shadow transition-transform",
            isDefault ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
};

/**
 * Image-model group with an inline "default" switch on each row. Only shown
 * when there are 2+ models — with a single model there's nothing to choose.
 * Turning a switch on sets it as the default (Always); turning the active one
 * off reverts to "ask every time" mode.
 */
export const ImageModelGroup: FC<{
  title: string;
  items: ModelConfig[];
  allModels: ModelConfig[];
  onEdit: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAdd: (type: ModelType) => void;
}> = ({ title, items, allModels, onEdit, onDelete, onAdd }) => {
  const { t } = useTranslation();
  const selectedId = useSelectedImageModelId();
  const confirmed = useImageModelConfirmed();

  const showToggle = items.length > 1;

  const extra = showToggle
    ? (m: ModelConfig) => {
        const isDefault = confirmed && selectedId === m.id;
        return (
          <DefaultModelToggle
            isDefault={isDefault}
            onToggle={(next) => {
              if (next) {
                setSelectedImageModelId(m.id);
                setImageModelConfirmed(true);
              } else {
                setImageModelConfirmed(false);
              }
            }}
          />
        );
      }
    : undefined;

  const footer = showToggle ? (
    <p className="px-1 text-[10px] text-muted-foreground/60">
      {t("imgModel.defaultToggleHint")}
    </p>
  ) : undefined;

  return (
    <ModelGroup
      title={title}
      type="image"
      items={items}
      allModels={allModels}
      onEdit={onEdit}
      onDelete={onDelete}
      onAdd={onAdd}
      extra={extra}
      footer={footer}
    />
  );
};
