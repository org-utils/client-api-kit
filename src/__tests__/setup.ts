import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mock-server.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
