"use client";

import { useState, type FC } from "react";
import { Button } from "@/components/ui/button";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/assistant-ui/select";
import { SettingsIcon, PlusIcon, Trash2Icon, PencilIcon, ArrowLeftIcon } from "lucide-react";
import {
  useConfig,
  setModels,
  setAppView,
  type ModelConfig,
  type ModelAuthMode,
  type ModelType,
} from "@/bridge";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useTranslation, type MessageKey } from "@/lib/i18n";

function emptyModel(type: ModelType = "chat"): ModelConfig {
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

const MODEL_TYPE_KEY: Record<ModelType, MessageKey> = {
  chat: "type.chat",
  image: "type.image",
  audio: "type.audio",
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50";

const labelClass = "text-xs font-medium text-muted-foreground/80";

const SectionHeader: FC<{
  title: string;
  action?: React.ReactNode;
}> = ({ title, action }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-muted-foreground">
      {title}
    </span>
    {action}
  </div>
);

const ModelForm: FC<{
  model: ModelConfig;
  isNew: boolean;
  onChange: (m: ModelConfig) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ model, isNew, onChange, onSave, onCancel }) => {
  const { t } = useTranslation();
  const set = (patch: Partial<ModelConfig>) =>
    onChange({ ...model, ...patch });
  const authMode = model.authMode ?? "bearer";
  const requiresApiKey = model.type !== "image" || authMode !== "none";
  const canSave = Boolean(
    model.name &&
      model.apiEndpoint &&
      model.model &&
      (!requiresApiKey || model.apiKey),
  );
  const typeLabel = t(MODEL_TYPE_KEY[model.type]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {isNew
            ? t("settings.newModel", { type: typeLabel })
            : t("settings.editModel", { type: typeLabel })}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.name")}</label>
          <input
            className={inputClass}
            placeholder="My Model"
            value={model.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.modelId")}</label>
          <input
            className={inputClass}
            placeholder="gpt-4o"
            value={model.model}
            onChange={(e) => set({ model: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.apiEndpoint")}</label>
          <input
            className={inputClass}
            placeholder="https://api.openai.com/v1"
            value={model.apiEndpoint}
            onChange={(e) => set({ apiEndpoint: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.apiKey")}</label>
          <input
            className={inputClass}
            type="password"
            placeholder="sk-..."
            value={model.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
          />
        </div>

        {model.type === "image" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.provider")}</label>
              <SelectRoot
                value={model.provider || "auto"}
                onValueChange={(value) => set({ provider: value === "auto" ? undefined : value })}
              >
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("settings.providerAuto")}</SelectItem>
                  <SelectItem value="openai">OpenAI / OpenAI-compatible</SelectItem>
                  <SelectItem value="apimart">APIMart</SelectItem>
                  <SelectItem value="minimax">MiniMax</SelectItem>
                </SelectContent>
              </SelectRoot>
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.imageProviderHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.authMode")}</label>
              <SelectRoot
                value={authMode}
                onValueChange={(value) =>
                  set({ authMode: value as ModelAuthMode })
                }
              >
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">{t("settings.authBearer")}</SelectItem>
                  <SelectItem value="none">
                    {t("settings.authNone")}
                  </SelectItem>
                </SelectContent>
              </SelectRoot>
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.authHint")}
              </p>
            </div>
          </>
        )}

        {model.type === "chat" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>{t("settings.maxTokens")}</label>
                <input
                  className={inputClass}
                  type="number"
                  value={model.maxTokens ?? 4096}
                  onChange={(e) =>
                    set({ maxTokens: Number(e.target.value) || 4096 })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>{t("settings.temperature")}</label>
                <input
                  className={inputClass}
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={model.temperature ?? 0.7}
                  onChange={(e) =>
                    set({ temperature: Number(e.target.value) || 0.7 })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.contextWindow")}</label>
              <input
                className={inputClass}
                type="number"
                placeholder="1000000"
                value={model.contextWindow ?? ""}
                onChange={(e) =>
                  set({
                    contextWindow: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.contextHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.extraBody")}</label>
              <input
                className={inputClass}
                placeholder='{"reasoning_split": true}'
                value={model.extraBody ?? ""}
                onChange={(e) =>
                  set({ extraBody: e.target.value || undefined })
                }
                spellCheck={false}
              />
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.extraBodyHint")} MiniMax: {'{"reasoning_split": true}'}
              </p>
            </div>

          </>
        )}

        {model.type === "audio" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.provider")}</label>
              <SelectRoot
                value={model.provider ?? "minimax"}
                onValueChange={(value) => set({ provider: value })}
              >
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimax">MiniMax</SelectItem>
                </SelectContent>
              </SelectRoot>
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.providerHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.groupId")}</label>
              <input
                className={inputClass}
                placeholder="MiniMax GroupId"
                value={model.groupId ?? ""}
                onChange={(e) => set({ groupId: e.target.value || undefined })}
              />
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.groupIdHint")}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          {isNew ? t("common.add") : t("common.save")}
        </Button>
      </div>
    </div>
  );
};

const ModelListItem: FC<{
  model: ModelConfig;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ model, onEdit, onDelete }) => (
  <div className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/50">
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium leading-snug">
        {model.name}
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {model.model}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <Button variant="ghost" size="icon-xs" onClick={onEdit}>
        <PencilIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onDelete}>
        <Trash2Icon />
      </Button>
    </div>
  </div>
);

const ModelGroup: FC<{
  title: string;
  type: ModelType;
  items: ModelConfig[];
  allModels: ModelConfig[];
  onEdit: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAdd: (type: ModelType) => void;
}> = ({ title, type, items, allModels, onEdit, onDelete, onAdd }) => {
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
              />
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/60">
          {t("settings.noModelsYet", { type: t(MODEL_TYPE_KEY[type]) })}
        </div>
      )}
    </div>
  );
};

/** Shared settings form/list state, used by the settings page and any future hosts. */
function useSettingsState() {
  const { models } = useConfig();
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [editIndex, setEditIndex] = useState(-1);

  const handleEdit = (idx: number) => {
    setEditing({ ...models[idx] });
    setEditIndex(idx);
  };

  const handleAdd = (type: ModelType = "chat") => {
    setEditing(emptyModel(type));
    setEditIndex(-1);
  };

  const handleDelete = (idx: number) => {
    setModels(models.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!editing) return;
    const updated = [...models];
    if (editIndex >= 0) {
      updated[editIndex] = editing;
    } else {
      updated.push(editing);
    }
    setModels(updated);
    setEditing(null);
  };

  return {
    models,
    editing,
    editIndex,
    handleEdit,
    handleAdd,
    handleDelete,
    handleSave,
    setEditing,
  };
}

/** Header gear button — opens the settings page (an AppView, not a modal). */
export const ModelSettings: FC = () => {
  const { t } = useTranslation();
  return (
    <TooltipIconButton
      tooltip={t("settings.title")}
      side="bottom"
      className="size-7"
      onClick={() => setAppView("settings")}
    >
      <SettingsIcon className="size-4" />
    </TooltipIconButton>
  );
};

/** Standalone settings page: model groups + inline edit form, mirroring the design/audio view chrome. */
export const SettingsView: FC = () => {
  const { t } = useTranslation();
  const {
    models,
    editing,
    editIndex,
    handleEdit,
    handleAdd,
    handleDelete,
    handleSave,
    setEditing,
  } = useSettingsState();

  const chatModels = models.filter((m) => m.type === "chat");
  const imageModels = models.filter((m) => m.type === "image");
  const audioModels = models.filter((m) => m.type === "audio");

  return (
    <div className="flex h-full flex-col bg-background @container">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        <TooltipIconButton
          tooltip={t("common.back")}
          side="bottom"
          className="size-7"
          onClick={() => setAppView("chat")}
        >
          <ArrowLeftIcon className="size-4" />
        </TooltipIconButton>
        <span className="text-sm font-medium text-foreground">{t("settings.title")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t("settings.description")}</p>

          {editing ? (
            <ModelForm
              model={editing}
              isNew={editIndex < 0}
              onChange={setEditing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <ModelGroup
                title={t("settings.chatModels")}
                type="chat"
                items={chatModels}
                allModels={models}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
              />

              <ModelGroup
                title={t("settings.imageModels")}
                type="image"
                items={imageModels}
                allModels={models}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
              />

              <ModelGroup
                title={t("settings.audioModels")}
                type="audio"
                items={audioModels}
                allModels={models}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
