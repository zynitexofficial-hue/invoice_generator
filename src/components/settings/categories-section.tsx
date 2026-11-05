"use client";

import { Plus, RotateCcw, Trash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  EXPENSE_ITC_DEFAULTS,
  type AppSettings,
  type ExpenseItcDefault,
} from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SettingsUpdate } from "./use-settings-draft";

interface SectionProps {
  draft: AppSettings;
  update: SettingsUpdate;
}

const MAX_CATEGORIES = 100;
const MAX_NAME = 60;

export const ITC_DEFAULT_LABELS: Record<ExpenseItcDefault, string> = {
  eligible: "GST & ITC",
  ineligible: "GST, no ITC (blocked)",
  no_gst: "No GST",
};

const ITC_OPTIONS = EXPENSE_ITC_DEFAULTS.map((v) => ({ value: v, label: ITC_DEFAULT_LABELS[v] }));

/** Validate a category name against the others; returns an error message or null. */
function nameProblem(name: string, others: string[]): string | null {
  const n = name.trim();
  if (!n) return "Add a name.";
  if (others.some((o) => o.toLowerCase() === n.toLowerCase())) return "That category exists.";
  return null;
}

export function CategoriesSection({ draft, update }: SectionProps) {
  return (
    <div className="space-y-4">
      <ExpenseCategoriesCard draft={draft} update={update} />
      <IncomeCategoriesCard draft={draft} update={update} />
    </div>
  );
}

function ExpenseCategoriesCard({ draft, update }: SectionProps) {
  const list = draft.expenseCategories;
  const [name, setName] = useState("");
  const [itc, setItc] = useState<ExpenseItcDefault>("eligible");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const problem = nameProblem(
      name,
      list.map((c) => c.name),
    );
    if (problem) return setError(problem);
    update("expenseCategories", (prev) => [...prev, { name: name.trim(), defaultItc: itc }]);
    setName("");
    setItc("eligible");
    setError(null);
  };

  const remove = (index: number) => {
    const removed = list[index];
    update("expenseCategories", (prev) => prev.filter((_, i) => i !== index));
    toast.success(`Removed “${removed.name}”`, {
      description: "Expenses that use it keep the name.",
      action: {
        label: "Undo",
        onClick: () =>
          update("expenseCategories", (prev) =>
            prev.some((c) => c.name === removed.name)
              ? prev
              : [...prev.slice(0, index), removed, ...prev.slice(index)],
          ),
      },
    });
  };

  const reset = async () => {
    if (
      await confirm({
        title: "Reset expense categories?",
        description:
          "Your list goes back to the standard categories. Expenses you already saved keep their category names.",
        confirmLabel: "Reset",
      })
    ) {
      update(
        "expenseCategories",
        DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c })),
      );
      toast.success("Expense categories reset");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Expense categories"
        description="Choosing a category on an expense sets its GST and input tax credit (ITC). Food, fuel and personal insurance are usually blocked from ITC."
        action={
          <Button variant="ghost" size="sm" onClick={() => void reset()}>
            <RotateCcw />
            Reset
          </Button>
        }
      />
      <CardContent className="grid gap-3">
        <ul className="grid gap-2" aria-label="Expense categories">
          {list.map((c, i) => (
            <li
              key={`${i}:${c.name}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_auto]"
            >
              <NameInput
                value={c.name}
                others={list.filter((_, j) => j !== i).map((x) => x.name)}
                label={`Rename ${c.name}`}
                onCommit={(next) =>
                  update("expenseCategories", (prev) =>
                    prev.map((x, j) => (j === i ? { ...x, name: next } : x)),
                  )
                }
              />
              <Select<ExpenseItcDefault>
                value={c.defaultItc}
                onValueChange={(defaultItc) =>
                  update("expenseCategories", (prev) =>
                    prev.map((x, j) => (j === i ? { ...x, defaultItc } : x)),
                  )
                }
                options={ITC_OPTIONS}
                className="order-last col-span-2 sm:order-none sm:col-span-1"
                aria-label={`GST default for ${c.name}`}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${c.name}`}
                disabled={list.length <= 1}
                onClick={() => remove(i)}
              >
                <Trash />
              </Button>
            </li>
          ))}
        </ul>

        <form
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t border-border pt-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field error={error}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value.slice(0, MAX_NAME));
                setError(null);
              }}
              placeholder="New category"
              aria-label="New expense category"
            />
          </Field>
          <Select<ExpenseItcDefault>
            value={itc}
            onValueChange={setItc}
            options={ITC_OPTIONS}
            className="order-last col-span-2 sm:order-none sm:col-span-1"
            aria-label="GST default for the new category"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!name.trim() || list.length >= MAX_CATEGORIES}
          >
            <Plus />
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function IncomeCategoriesCard({ draft, update }: SectionProps) {
  const list = draft.incomeCategories;
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const problem = nameProblem(name, list);
    if (problem) return setError(problem);
    update("incomeCategories", (prev) => [...prev, name.trim()]);
    setName("");
    setError(null);
  };

  const remove = (index: number) => {
    const removed = list[index];
    update("incomeCategories", (prev) => prev.filter((_, i) => i !== index));
    toast.success(`Removed “${removed}”`, {
      description: "Income entries that use it keep the name.",
      action: {
        label: "Undo",
        onClick: () =>
          update("incomeCategories", (prev) =>
            prev.includes(removed)
              ? prev
              : [...prev.slice(0, index), removed, ...prev.slice(index)],
          ),
      },
    });
  };

  const reset = async () => {
    if (
      await confirm({
        title: "Reset income categories?",
        description:
          "Your list goes back to the standard categories. Entries you already saved keep their category names.",
        confirmLabel: "Reset",
      })
    ) {
      update("incomeCategories", [...DEFAULT_INCOME_CATEGORIES]);
      toast.success("Income categories reset");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Income categories"
        description="For money in without an invoice — interest, commission, refunds."
        action={
          <Button variant="ghost" size="sm" onClick={() => void reset()}>
            <RotateCcw />
            Reset
          </Button>
        }
      />
      <CardContent className="grid gap-3">
        <ul className="grid gap-2" aria-label="Income categories">
          {list.map((c, i) => (
            <li key={`${i}:${c}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <NameInput
                value={c}
                others={list.filter((_, j) => j !== i)}
                label={`Rename ${c}`}
                onCommit={(next) =>
                  update("incomeCategories", (prev) => prev.map((x, j) => (j === i ? next : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${c}`}
                disabled={list.length <= 1}
                onClick={() => remove(i)}
              >
                <Trash />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field error={error}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value.slice(0, MAX_NAME));
                setError(null);
              }}
              placeholder="New category"
              aria-label="New income category"
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={!name.trim() || list.length >= MAX_CATEGORIES}
          >
            <Plus />
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Inline rename: edits locally and commits on blur/Enter, so the saved list
 * never holds an empty or duplicate name. Invalid input reverts.
 */
function NameInput({
  value,
  others,
  label,
  onCommit,
}: {
  value: string;
  others: string[];
  label: string;
  onCommit: (name: string) => void;
}) {
  const [text, setText] = useState(value);
  const problem = text.trim() === value ? null : nameProblem(text, others);
  const commit = () => {
    const next = text.trim();
    if (next === value) return setText(value);
    if (problem) return setText(value);
    onCommit(next);
  };
  return (
    <Field error={problem && text.trim() ? problem : null}>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_NAME))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setText(value);
          }
        }}
        aria-label={label}
      />
    </Field>
  );
}
