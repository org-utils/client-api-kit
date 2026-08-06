import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "./query-client.js";

export interface ApiQueryProviderProps {
  children: ReactNode;
  /** Provide your own QueryClient (e.g. one created with `createQueryClient(overrides)`); otherwise a default one is created once per mount. */
  queryClient?: QueryClient;
}

/**
 * Convenience wrapper around `QueryClientProvider`. Mount once near the root
 * of your client tree (e.g. in a Next.js `app/providers.tsx` client component):
 *
 *   "use client";
 *   export function Providers({ children }: { children: React.ReactNode }) {
 *     return <ApiQueryProvider>{children}</ApiQueryProvider>;
 *   }
 */
export function ApiQueryProvider({ children, queryClient }: ApiQueryProviderProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
