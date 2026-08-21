// @canva-harness/capabilities
import { createServiceKey, HarnessContext, HarnessPlugin, ServiceKey } from "@canva-harness/runtime";
import { CanvaCanvasElement, CanvaDesignState, SessionStore } from "@canva-harness/session";

export type DesignFormat = "presentation" | "social_media" | "doc" | "whiteboard" | "video";

export interface BrandKit {
  readonly id: string;
  readonly name: string;
  readonly palette: readonly string[];
  readonly fonts: { readonly header: string; readonly body: string };
  readonly primaryColor: string;
}

export interface LayoutViolation {
  readonly elementId?: string;
  readonly rule: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
}

export interface LayoutValidationReport {
  readonly valid: boolean;
  readonly violations: readonly LayoutViolation[];
}

export interface ICanvaDocumentService {
  createDesign(input: { title: string; format: DesignFormat; width?: number; height?: number }): CanvaDesignState;
  addElement(element: CanvaCanvasElement): void;
  applyBrandKit(kit: BrandKit): void;
  validateLayout(state: CanvaDesignState): LayoutValidationReport;
  exportDesign(format: "png" | "svg" | "pdf" | "pptx"): { format: string; urlOrPath: string };
}

export interface ICanvaDeepLinkService {
  createOpenLink(designId: string): string;
  createTemplateLink(format: DesignFormat): string;
  parseDeepLink(url: string): { action: "open" | "create"; id?: string; format?: string } | null;
}

export const CANVA_DOC_SERVICE_KEY: ServiceKey<ICanvaDocumentService> = createServiceKey<ICanvaDocumentService>("canva.document");
export const CANVA_DEEPLINK_SERVICE_KEY: ServiceKey<ICanvaDeepLinkService> = createServiceKey<ICanvaDeepLinkService>("canva.deeplink");

export class CanvaDocumentService implements ICanvaDocumentService {
  constructor(private readonly session: SessionStore) {}

  createDesign(input: { title: string; format: DesignFormat; width?: number; height?: number }): CanvaDesignState {
    const dimensions = this.resolveDimensions(input.format, input.width, input.height);
    const id = crypto.randomUUID();

    this.session.append("design.created", {
      id,
      title: input.title,
      format: input.format,
      width: dimensions.width,
      height: dimensions.height,
    });

    return {
      id,
      title: input.title,
      format: input.format,
      width: dimensions.width,
      height: dimensions.height,
      elements: [],
      exports: [],
    };
  }

  addElement(element: CanvaCanvasElement): void {
    this.session.append("design.element_added", { element });
  }

  applyBrandKit(kit: BrandKit): void {
    this.session.append("brand_kit.applied", {
      brandKit: {
        palette: kit.palette,
        fonts: kit.fonts,
      },
    });
  }

  validateLayout(state: CanvaDesignState): LayoutValidationReport {
    const violations: LayoutViolation[] = [];

    // Margin and boundary checks
    const margin = 40;
    for (const el of state.elements) {
      if (el.x < margin || el.y < margin || el.x + el.width > state.width - margin || el.y + el.height > state.height - margin) {
        violations.push({
          elementId: el.id,
          rule: "safe-margins",
          severity: "warning",
          message: `Element ${el.id} is outside the safe margin zone (${margin}px)`,
        });
      }

      // Brand font compliance
      if (state.brandKit && el.style?.fontFamily) {
        const font = el.style.fontFamily as string;
        const allowed = [state.brandKit.fonts.header, state.brandKit.fonts.body];
        if (!allowed.includes(font)) {
          violations.push({
            elementId: el.id,
            rule: "brand-font-compliance",
            severity: "error",
            message: `Font "${font}" is not part of the active brand kit (${allowed.join(", ")})`,
          });
        }
      }
    }

    return {
      valid: violations.filter((v) => v.severity === "error").length === 0,
      violations,
    };
  }

  exportDesign(format: "png" | "svg" | "pdf" | "pptx"): { format: string; urlOrPath: string } {
    const urlOrPath = `canva://exports/${crypto.randomUUID()}.${format}`;
    this.session.append("export.generated", { format, urlOrPath });
    return { format, urlOrPath };
  }

  private resolveDimensions(format: DesignFormat, customW?: number, customH?: number): { width: number; height: number } {
    if (customW && customH) return { width: customW, height: customH };
    switch (format) {
      case "presentation":
        return { width: 1920, height: 1080 };
      case "social_media":
        return { width: 1080, height: 1080 };
      case "doc":
        return { width: 816, height: 1056 }; // standard letter
      case "whiteboard":
        return { width: 3840, height: 2160 };
      case "video":
        return { width: 1920, height: 1080 };
    }
  }
}

export class CanvaDeepLinkService implements ICanvaDeepLinkService {
  createOpenLink(designId: string): string {
    return `canva://design/${encodeURIComponent(designId)}`;
  }

  createTemplateLink(format: DesignFormat): string {
    return `canva://create?type=${encodeURIComponent(format)}`;
  }

  parseDeepLink(url: string): { action: "open" | "create"; id?: string; format?: string } | null {
    if (!url.startsWith("canva://")) return null;
    const path = url.slice("canva://".length);

    if (path.startsWith("design/")) {
      const id = path.slice("design/".length);
      return { action: "open", id };
    }

    if (path.startsWith("create")) {
      const query = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?")) : "");
      return { action: "create", format: query.get("type") ?? "presentation" };
    }

    return null;
  }
}

export function createCanvaCapabilitiesPlugin(session: SessionStore): HarnessPlugin {
  return {
    manifest: {
      id: "canva-core-capabilities",
      name: "Canva Core Capabilities",
      version: "0.1.0",
    },
    setup: (ctx: HarnessContext) => {
      const docService = new CanvaDocumentService(session);
      const deepLinkService = new CanvaDeepLinkService();

      const d1 = ctx.services.register(CANVA_DOC_SERVICE_KEY, docService);
      const d2 = ctx.services.register(CANVA_DEEPLINK_SERVICE_KEY, deepLinkService);

      ctx.disposables.push(d1, d2);
    },
  };
}
