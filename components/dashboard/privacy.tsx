import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { formatINR, formatINRCompact } from "../../utils/format";

const STORAGE_KEY = "@dashboard_privacy";
export const MASK = "₹ ••••";

// Any rupee amount inside a sentence: "₹39,337", "₹3.42L", "₹1.2Cr".
const AMOUNT_PATTERN = /-?₹\s?[\d,]+(?:\.\d+)?(?:L|Cr)?/g;

/** Replaces every rupee amount inside a sentence with the mask. */
export const maskAmounts = (text: string) => text.replace(AMOUNT_PATTERN, MASK);

interface PrivacyState {
  hidden: boolean;
  toggle: () => void;
}

const PrivacyContext = createContext<PrivacyState>({ hidden: false, toggle: () => {} });

/** Remembers (per device) whether amounts on the dashboard are masked. */
export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => setHidden(v === "1"))
      .catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? "1" : "0").catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export const usePrivacy = () => useContext(PrivacyContext);

/** Money formatters that respect privacy mode. */
export function useMoney() {
  const { hidden } = usePrivacy();
  return useMemo(
    () => ({
      hidden,
      exact: (n: number) => (hidden ? MASK : formatINR(n)),
      compact: (n: number) => (hidden ? MASK : formatINRCompact(n)),
      /** Spoken label: never reads the mask characters aloud. */
      spoken: (n: number) => (hidden ? "Amount hidden" : formatINR(n)),
      /** Masks amounts embedded in pre-written sentences (status line, insights). */
      text: (s: string) => (hidden ? maskAmounts(s) : s),
      /** Same as `text`, but for screen readers. */
      spokenText: (s: string) => (hidden ? s.replace(AMOUNT_PATTERN, "hidden amount") : s),
    }),
    [hidden],
  );
}
