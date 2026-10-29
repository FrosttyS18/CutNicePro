import { expect, it } from "vitest";
import { parseExportReceipt } from "../lib/composition-export";

it("distingue cancelamento de um arquivo publicado e valida a resposta nativa", () => {
  expect(parseExportReceipt(null)).toBeNull();
  const receipt = { id: "d7529093-d489-4ee7-b44c-1828d6763142", path: "C:/exports/teste.mp4", bytes: 100, reused: true };
  expect(parseExportReceipt(receipt)).toEqual(receipt);
  for (const invalid of [true, false, {}, { ...receipt, bytes: 0 }, { ...receipt, bytes: NaN }, { ...receipt, path: "" }, { ...receipt, reused: 1 }, { ...receipt, id: "../../secret" }]) {
    expect(() => parseExportReceipt(invalid)).toThrow("confirmar");
  }
});
