"use client";

import { useState } from "react";

/**
 * Keep showing the last non-null value after it becomes null — lets a dialog
 * keep its content during the close animation. Uses React's "adjust state
 * during render" pattern instead of an effect.
 */
export function useRetained<T>(value: T | null): T | null {
  const [kept, setKept] = useState<T | null>(value);
  if (value !== null && value !== kept) setKept(value);
  return value ?? kept;
}

const ids = new WeakMap<object, number>();
let counter = 0;

/** Stable numeric key per object identity — remounts a form for each new draft object. */
export function objectKey(obj: object): number {
  let id = ids.get(obj);
  if (id === undefined) {
    id = ++counter;
    ids.set(obj, id);
  }
  return id;
}
