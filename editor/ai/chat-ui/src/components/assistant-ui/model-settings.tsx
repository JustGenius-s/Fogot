"use client";

import { useState, type FC } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SettingsIcon, PlusIcon, Trash2Icon, PencilIcon } from "lucide-react";
import {
  useConfig,
  setModels,
  type ModelConfig,
  type ModelType,
} from "@/bridge";

// ─── Empty model template ─────────────────────────────────────────

function emptyModel(type: ModelType = "chat"): ModelConfig {
  return {
    id: `model-${Date.now()}`,
    type,
    name: "",
    apiKey: "",
    apiEndpoint: "",
    model: "",
    maxTokens: 4096,
    temperature: 0.7,
  };
}

// ─── Model Form ───────────────────────────────────────────────────

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/60";

const labelClass = "text-xs font-medium text-muted-foreground";

const ModelForm: FC<{
  model: ModelConfig;
  onChange: (m: ModelConfig) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ model, onChange, onSave, onCancel }) => {
  const set = (patch: Partial<ModelConfig>) => onChange({ ...model, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Name</label>
          <input
            className={inputClass}
            placeholder="My Model"
            value={model.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Type</label>
          <select
            className={inputClass}
            value={model.type}
            onChange={(e) => set({ type: e.target.value as ModelType })}
          >
            <option value="chat">Chat</option>
            <option value="image">Image</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>API Endpoint</label>
        <input
          className={inputClass}
          placeholder="https://api.openai.com/v1"
          value={model.apiEndpoint}
          onChange={(e) => set({ apiEndpoint: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>API Key</label>
        <input
          className={inputClass}
          type="password"
          placeholder="sk-..."
          value={model.apiKey}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Model</label>
        <input
          className={inputClass}
          placeholder="gpt-4o"
          value={model.model}
          onChange={(e) => set({ model: e.target.value })}
        />
      </div>

      {model.type === "chat" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Max Tokens</label>
            <input
              className={inputClass}
              type="number"
              value={model.maxTokens ?? 4096}
              onChange={(e) => set({ maxTokens: Number(e.target.value) || 4096 })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Temperature</label>
            <input
              className={inputClass}
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={model.temperature ?? 0.7}
              onChange={(e) => set({ temperature: Number(e.target.value) || 0.7 })}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!model.name || !model.apiKey || !model.apiEndpoint || !model.model}
        >
          Save
        </Button>
      </div>
    </div>
  );
};

// ─── Model List Item ──────────────────────────────────────────────

const ModelListItem: FC<{
  model: ModelConfig;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ model, onEdit, onDelete }) => (
  <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium">{model.name}</div>
      <div className="truncate text-xs text-muted-foreground">{model.model}</div>
    </div>
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {model.type}
    </span>
    <Button variant="ghost" size="icon-xs" onClick={onEdit}>
      <PencilIcon />
    </Button>
    <Button variant="ghost" size="icon-xs" onClick={onDelete}>
      <Trash2Icon />
    </Button>
  </div>
);

// ─── Settings Dialog ──────────────────────────────────────────────

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
      <DialogTrigger
        className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <SettingsIcon className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI Models</DialogTitle>
        </DialogHeader>

        {editing ? (
          <ModelForm
            model={editing}
            onChange={setEditing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {chatModels.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Chat
                </div>
                {chatModels.map((m) => {
                  const idx = models.indexOf(m);
                  return (
                    <ModelListItem
                      key={m.id}
                      model={m}
                      onEdit={() => handleEdit(idx)}
                      onDelete={() => handleDelete(idx)}
                    />
                  );
                })}
              </div>
            )}

            {imageModels.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Image
                </div>
                {imageModels.map((m) => {
                  const idx = models.indexOf(m);
                  return (
                    <ModelListItem
                      key={m.id}
                      model={m}
                      onEdit={() => handleEdit(idx)}
                      onDelete={() => handleDelete(idx)}
                    />
                  );
                })}
              </div>
            )}

            {models.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No models configured yet.
              </p>
            )}

            <DialogFooter className="sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleAdd("chat")}
              >
                <PlusIcon className="size-3.5" />
                Add Chat Model
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleAdd("image")}
              >
                <PlusIcon className="size-3.5" />
                Add Image Model
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
