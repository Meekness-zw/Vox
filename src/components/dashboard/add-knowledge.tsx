"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Check } from "lucide-react";
import {
  addKnowledgeSource,
  type IngestState,
} from "@/app/(dashboard)/dashboard/knowledge/actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";

const types = ["URL", "Manual Q&A", "FAQ", "Document", "CSV"] as const;

export function AddKnowledge() {
  const [type, setType] = useState<(typeof types)[number]>("URL");
  const [state, formAction, pending] = useActionState<IngestState, FormData>(
    addKnowledgeSource,
    {}
  );

  const isUrl = type === "URL";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="type" value={type} />

      <div className="space-y-1.5">
        <Label>Source type</Label>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                type === t
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kb-name">Name</Label>
        <Input
          id="kb-name"
          name="name"
          placeholder={isUrl ? "Homepage" : "Services & pricing"}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kb-content">{isUrl ? "URL to crawl" : "Content"}</Label>
        {isUrl ? (
          <Input
            id="kb-content"
            name="content"
            type="url"
            placeholder="https://yourbusiness.com/services"
            required
          />
        ) : (
          <Textarea
            id="kb-content"
            name="content"
            rows={6}
            placeholder="Paste FAQs, policies, pricing, or Q&A pairs the agent should know…"
            required
          />
        )}
      </div>

      {state.error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <Check className="size-4" /> {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {pending ? "Indexing…" : "Add & train"}
      </Button>
    </form>
  );
}
