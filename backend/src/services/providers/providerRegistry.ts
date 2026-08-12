import type { CourseProvider } from "../../types/provider.js";
import { MockCanvasProvider } from "./mockCanvasProvider.js";

const providers: Record<string, CourseProvider> = { mock_canvas: new MockCanvasProvider() };

export function getProvider(providerId: string): CourseProvider {
  const provider = providers[providerId];
  if (!provider) throw new Error(`Provider '${providerId}' is not available.`);
  return provider;
}
