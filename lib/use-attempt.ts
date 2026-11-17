"use client";

import { useEffect, useState } from "react";
import { reconcile, transition } from "./engine";
import type { Action } from "./engine";
import type { Test, UserAttempt } from "./types";

const storageKey = "amirnet-attempts-v1";
export function readAttempts(): UserAttempt[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveAttempt(attempt: UserAttempt) {
  try {
    const attempts = readAttempts().filter(entry => entry.id !== attempt.id);
    localStorage.setItem(storageKey, JSON.stringify([attempt, ...attempts]));
    return true;
  } catch {
    return false;
  }
}

export function useAttempt(test: Test | null, active: UserAttempt | null) {
  const [attempt, setAttempt] = useState<UserAttempt | null>(null);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    if (!test || !active) return;
    const time = Date.now();
    setNow(time);
    setAttempt(reconcile(test, active, time));
  }, [test, active]);

  useEffect(() => {
    if (attempt) setSaved(saveAttempt(attempt));
  }, [attempt]);

  useEffect(() => {
    if (!test || !active || active.mode !== "strict") return;
    const sync = () => {
      const time = Date.now();
      setNow(time);
      setAttempt(previous => previous?.id === active.id ? reconcile(test, previous, time) : previous);
    };
    const interval = window.setInterval(sync, 250);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [test, active]);

  function dispatch(action: Action) {
    if (!test || !active) return;
    const time = Date.now();
    setNow(time);
    setAttempt(previous => previous?.id === active.id ? transition(test, previous, action, time) : previous);
  }

  return { attempt: attempt?.id === active?.id ? attempt : null, now, dispatch, saved };
}
