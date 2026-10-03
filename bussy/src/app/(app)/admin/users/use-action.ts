"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

/** Run a server action, toast the result, refresh the page. */
export function useAction() {
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast({ message: r.message });
        after?.();
        router.refresh();
      } else toast({ message: r.error ?? "That didn't work.", tone: "error" });
    });
  return { busy, run };
}
