import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

function escapePdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdfBuffer(lines: string[]) {
  const contentLines = ["BT", "/F1 18 Tf", "72 720 Td"];

  lines.forEach((line, index) => {
    if (index > 0) {
      contentLines.push("0 -28 Td");
    }

    contentLines.push(`(${escapePdfText(line)}) Tj`);
  });

  contentLines.push("ET");

  const stream = `${contentLines.join("\n")}\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

test.describe("Workspace upload-to-chat smoke", () => {
  test("signs up, uploads a PDF, and answers from document text", async ({
    page,
  }) => {
    test.slow();

    const email = `smoke-${randomUUID()}@lexora.local`;
    const password = "LexoraSmokePass123!";
    const pdfPath = test.info().outputPath("workspace-smoke.pdf");

    await writeFile(
      pdfPath,
      buildPdfBuffer([
        "Lexora smoke test document",
        "The rocket color is blue.",
        "The launch city is Jaipur.",
      ]),
    );

    await page.goto("/auth?mode=signup");
    await page.getByTestId("auth-name-input").fill("Smoke Test");
    await page.getByTestId("auth-email-input").fill(email);
    await page.getByTestId("auth-password-input").fill(password);
    await page.getByTestId("auth-confirm-password-input").fill(password);
    await page.getByTestId("auth-submit").click();

    await page.waitForURL("**/chat", { timeout: 60_000 });
    await page.goto("/upload");

    await expect(page.getByText("System Inventory")).toBeVisible();
    await page.getByTestId("upload-input").setInputFiles(pdfPath);
    await page.getByTestId("upload-submit").click();

    await expect(page.getByTestId("open-last-indexed-document")).toBeVisible({
      timeout: 90_000,
    });
    await page.getByTestId("open-last-indexed-document").click();

    await page.waitForURL(/\/chat\?doc=/, { timeout: 60_000 });
    await expect(page.getByTestId("chat-input")).toBeEnabled({
      timeout: 60_000,
    });

    await page.getByTestId("chat-input").fill("What color is the rocket?");
    await page.getByTestId("chat-input").press("Enter");

    await expect(page.getByTestId("user-message").last()).toContainText(
      "What color is the rocket?",
    );
    await expect(page.getByTestId("assistant-message").last()).toContainText(
      /blue/i,
      {
        timeout: 90_000,
      },
    );
  });
});
