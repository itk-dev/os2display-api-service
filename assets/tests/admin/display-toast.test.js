import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("react-toastify", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("i18next", () => ({
  default: { t: (key) => key },
}));

import { toast } from "react-toastify";
import { displayError } from "../../admin/components/util/list/toast-component/display-toast";

describe("displayError", () => {
  beforeEach(() => {
    toast.error.mockClear();
  });

  it("explains an nginx 413 instead of showing the raw HTTP status", () => {
    // nginx rejects the body before Symfony is reached and answers text/html,
    // so RTK Query hands us a PARSING_ERROR with the original status.
    displayError("prefix", { status: "PARSING_ERROR", originalStatus: 413 });

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [displayText] = toast.error.mock.calls[0];
    expect(displayText).toContain("error-messages.upload-too-large");
    expect(displayText).not.toContain("HTTP 413");
  });

  it("explains a structured 413 from the API", () => {
    displayError("prefix", { status: 413, data: {} });

    const [displayText] = toast.error.mock.calls[0];
    expect(displayText).toContain("error-messages.upload-too-large");
  });

  it("keeps the hydra description when the API supplies one", () => {
    displayError("prefix", {
      status: 400,
      data: { "hydra:description": '"file" is required' },
    });

    const [displayText] = toast.error.mock.calls[0];
    expect(displayText).toContain('"file" is required');
  });

  it("falls back to a readable message for other parse failures", () => {
    displayError("prefix", { status: "PARSING_ERROR", originalStatus: 502 });

    const [displayText] = toast.error.mock.calls[0];
    expect(displayText).toContain("error-messages.unexpected-server-response");
    expect(displayText).toContain("502");
  });
});
