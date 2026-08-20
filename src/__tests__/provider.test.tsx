import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { ApiQueryProvider } from "../react/provider.js";

vi.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: ({ initialIsOpen, position }: { initialIsOpen?: boolean; position?: string }) => (
    <div>
      devtools-mocked position={position ?? "unset"} initialIsOpen={String(initialIsOpen)}
    </div>
  ),
}));

describe("ApiQueryProvider", () => {
  it("renders children and lazy-loads the devtools when enabled", async () => {
    const { container } = render(
      <ApiQueryProvider enableDevtools>
        <div>content</div>
      </ApiQueryProvider>,
    );
    expect(within(container).getByText("content")).toBeDefined();
    expect(await within(container).findByText(/devtools-mocked/)).toBeDefined();
  });

  it("forwards devtoolsProps to ReactQueryDevtools (overriding the default)", async () => {
    const { container } = render(
      <ApiQueryProvider enableDevtools devtoolsProps={{ position: "bottom", initialIsOpen: true }}>
        <div>content</div>
      </ApiQueryProvider>,
    );
    const view = within(container);
    expect(await view.findByText(/devtools-mocked/)).toBeDefined();
    expect(view.getByText(/position=bottom/)).toBeDefined();
    expect(view.getByText(/initialIsOpen=true/)).toBeDefined();
  });

  it("renders children without devtools", () => {
    const { container } = render(
      <ApiQueryProvider>
        <div>content</div>
      </ApiQueryProvider>,
    );
    expect(within(container).getByText("content")).toBeDefined();
    expect(within(container).queryByText(/devtools-mocked/)).toBeNull();
  });
});