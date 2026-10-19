import { describe, expect, it } from "vitest";
import { cancelStep } from "../lib/cancel-flow";

describe("prevenção de cancelamento acidental", () => {
  it("fechar ou cancelar abre confirmação e só a confirmação autoriza a interrupção", () => {
    expect(cancelStep("running","confirm")).toBe("running");
    const confirmation=cancelStep("running","request");
    expect(confirmation).toBe("confirming");
    expect(cancelStep(confirmation,"confirm")).toBe("cancelling");
    expect(cancelStep(confirmation,"continue")).toBe("running");
    expect(cancelStep(confirmation,"request")).toBe("running");
  });
  it("impede solicitações duplicadas e permite tentar cancelar de novo após falha", () => {
    expect(cancelStep("cancelling","confirm")).toBe("cancelling");
    expect(cancelStep("cancelling","request")).toBe("cancelling");
    expect(cancelStep("cancelling","continue")).toBe("cancelling");
    const failure=cancelStep("cancelling","failed");
    expect(failure).toBe("error"); expect(cancelStep(failure,"confirm")).toBe("cancelling");
  });
});
