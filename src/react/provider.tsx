import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ComponentProps, type ReactNode } from "react";
import type { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createQueryClient } from "./query-client.js";

// Loaded on demand via `enableDevtools` so the optional peer dependency
// `@tanstack/react-query-devtools` is never bundled into consumers who
// don't use it. The dynamic import only fires once the devtools render.
const LazyReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })),
);

/** Props accepted by `ReactQueryDevtools` (e.g. `initialIsOpen`, `position`, `buttonPosition`, ...). */
export type DevtoolsProps = ComponentProps<typeof ReactQueryDevtools>;

export interface ApiQueryProviderProps {
  /** The tree rendered inside the `QueryClientProvider`. */
  children: ReactNode;
  /**
   * Provide your own `QueryClient` (e.g. one created with
   * `createQueryClient(overrides)`); otherwise a default one is created once
   * per mount.
   */
  queryClient?: QueryClient;
  /**
   * When `true`, renders the
   * [React Query Devtools](https://tanstack.com/query/latest/docs/framework/react/devtools)
   * overlay below the provider tree. Requires installing the optional peer
   * dependency `@tanstack/react-query-devtools` (a dev dependency in
   * development); it is lazily imported only when this flag is on.
   */
  enableDevtools?: boolean;
  /**
   * Extra props forwarded to `ReactQueryDevtools` when `enableDevtools` is
   * on - e.g. `{ position: "bottom-right", initialIsOpen: true }`. Anything
   * you set here overrides the built-in `initialIsOpen: false` default.
   */
  devtoolsProps?: DevtoolsProps;
}

/**
 * Convenience wrapper around `QueryClientProvider`. Mount once near the root
 * of your client tree (e.g. in a Next.js `app/providers.tsx` client component):
 *
 *   "use client";
 *   export function Providers({ children }: { children: React.ReactNode }) {
 *     return <ApiQueryProvider>{children}</ApiQueryProvider>;
 *   }
 *
 * @param props - Provider props: children, an optional pre-configured query
 *   client, an optional `enableDevtools` flag for the devtools overlay, and
 *   optional `devtoolsProps` forwarded to `ReactQueryDevtools`.
 * @returns A `QueryClientProvider` with a stable `QueryClient` instance.
 */
export function ApiQueryProvider({ children, queryClient, enableDevtools = false, devtoolsProps }: ApiQueryProviderProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
      {enableDevtools && (
        <Suspense fallback={null}>
          <LazyReactQueryDevtools initialIsOpen={false} {...devtoolsProps} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}