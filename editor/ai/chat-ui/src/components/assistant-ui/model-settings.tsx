"use client";

import { useState, type FC } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/assistant-ui/select";
import { SettingsIcon, PlusIcon, Trash2Icon, PencilIcon } from "lucide-react";
import {
  useConfig,
  setModels,
  type ModelConfig,
  type ModelAuthMode,
  type ModelType,
} from "@/bridge";

function emptyModel(type: ModelType = "chat"): ModelConfig {
  return {
    id: `model-${Date.now()}`,
    type,
    name: "",
    apiKey: "",
    apiEndpoint: "",
    model: "",
    authMode: "bearer",
    maxTokens: 4096,
    temperature: 0.7,
  };
}

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {isNew ? "New" : "Edit"} {model.type === "chat" ? "Chat" : "Image"} Model
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            placeholder="My Model"
            value={model.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Model ID</label>
          <input
            className={inputClass}
            placeholder="gpt-4o"
            value={model.model}
            onChange={(e) => set({ model: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>API Endpoint</label>
          <input
            className={inputClass}
            placeholder="https://api.openai.com/v1"
            value={model.apiEndpoint}
            onChange={(e) => set({ apiEndpoint: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>API Key</label>
          <input
            className={inputClass}
            type="password"
            placeholder="sk-..."
            value={model.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
          />
        </div>

        {model.type === "image" && (
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Auth Mode</label>
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
                <SelectItem value="bearer">Bearer header</SelectItem>
                <SelectItem value="none">
                  No automatic auth header
                </SelectItem>
              </SelectContent>
            </SelectRoot>
            <p className="text-[10px] text-muted-foreground/60">
              APIMart uses Bearer header. Use no automatic auth header when an
              OpenAPI gateway or proxy handles authentication.
            </p>
          </div>
        )}

        {model.type === "chat" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Max Tokens</label>
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
                <label className={labelClass}>Temperature</label>
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
              <label className={labelClass}>Context Window (tokens)</label>
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
                DeepSeek: 1M, GPT-4o: 128k, Claude: 200k
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Extra Body (JSON)</label>
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
                Additional JSON merged into request body. MiniMax: {'{"reasoning_split": true}'}
              </p>
            </div>

          </>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          {isNew ? "Add" : "Save"}
        </Button>
      </DialogFooter>
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
}> = ({ title, type, items, allModels, onEdit, onDelete, onAdd }) => (
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
          Add
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
        No {title.toLowerCase()} models yet
      </div>
    )}
  </div>
);

export const ModelSettings: FC = () => {
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

  const chatModels = models.filter((m) => m.type === "chat");
  const imageModels = models.filter((m) => m.type === "image");

  return (
    <Dialog>
      <DialogTrigger className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <SettingsIcon className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage AI model configurations and preferences.
          </DialogDescription>
        </DialogHeader>

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
              title="Chat Models"
              type="chat"
              items={chatModels}
              allModels={models}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdd={handleAdd}
            />

            <ModelGroup
              title="Image Models"
              type="image"
              items={imageModels}
              allModels={models}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdd={handleAdd}
            />

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
