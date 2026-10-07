// jsdom doesn't implement a few browser APIs the wizard touches.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

Element.prototype.scrollIntoView = () => {};
if (!URL.createObjectURL) {
  (URL as any).createObjectURL = () => "blob:mock";
  (URL as any).revokeObjectURL = () => {};
}
if (!(globalThis as any).crypto?.randomUUID) {
  (globalThis as any).crypto = { ...(globalThis as any).crypto, randomUUID: () => `uuid-${Math.random().toString(16).slice(2)}` };
}
afterEach(() => {
  cleanup();
  localStorage.clear();
});
