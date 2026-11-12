"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adapterProxyPath, readApiError } from "../harness-api";
import styles from "./onboarding.module.css";

type ClearState =
  | Readonly<{ status: "idle" | "clearing" | "cleared" }>
  | Readonly<{ status: "failed"; message: string }>;

const statusMessages = {
  idle: "",
  clearing: "Clearing…",
  cleared: "Cleared. To see the terms again, wait 10 seconds, then reload the lesson.",
} as const;

async function clearAcceptance(token: string | null): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${adapterProxyPath}/dev/terms`, {
      cache: "no-store",
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
      method: "DELETE",
    });
  } catch {
    throw new Error("Couldn't reach the API.");
  }
  if (response.status === 404) {
    throw new Error("The API needs ENABLE_DEV_ROUTES, outside production.");
  }
  if (!response.ok) {
    throw await readApiError(response);
  }
}

export function ClearTermsButton() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<ClearState>({ status: "idle" });

  async function clear() {
    setState({ status: "clearing" });
    try {
      await clearAcceptance(await getToken());
      setState({ status: "cleared" });
      router.refresh();
    } catch (error) {
      setState({
        status: "failed",
        message:
          error instanceof Error ? error.message : "Couldn't clear your acceptance.",
      });
    }
  }

  return (
    <div className={styles.form}>
      <button
        className={styles.secondary}
        disabled={state.status === "clearing"}
        onClick={() => void clear()}
        type="button"
      >
        Clear acceptance
      </button>
      {state.status === "failed" ? (
        <p className={styles.hint} role="alert">
          {state.message}
        </p>
      ) : (
        <output className={styles.hint}>{statusMessages[state.status]}</output>
      )}
    </div>
  );
}
