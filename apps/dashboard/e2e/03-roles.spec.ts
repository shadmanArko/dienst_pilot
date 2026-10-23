import { expect, test } from "@playwright/test";

import { asPersona } from "./helpers.ts";

test("Oversight (Vogel): read-only W12, no planner screens, W8 without a single name", async ({
  page,
}) => {
  await asPersona(page, "vogel");
  await page.goto("/de/aufsicht");
  await expect(page.getByTestId("read-only")).toContainText("Nur Lesezugriff");
  await expect(page.getByTestId("cost-placeholder")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
  await expect(nav.getByRole("link", { name: "Aufsicht" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Varianten" })).toHaveCount(0);
  // Nothing on the page can change the roster.
  await expect(page.getByRole("button", { name: /veröffentlichen|genehmigen/i })).toHaveCount(0);

  await page.goto("/de/varianten");
  await expect(
    page.getByRole("heading", { name: "Für diese Rolle nicht verfügbar" }),
  ).toBeVisible();

  // W8: fairness only as anonymous statistics; no staff name anywhere in the content.
  await page.goto("/de/fairness");
  await expect(page.getByTestId("dist-nights")).toBeVisible();
  await expect(page.getByTestId("compliance-summary")).toBeVisible();
  const main = page.getByRole("main");
  await expect(main).toContainText("Nur Statistik, keine Namen");
  await expect(main).not.toContainText("Dr. ");
  await expect(main).not.toContainText("Prof. ");
  await expect(page.getByRole("table", { name: "Belastung je Person" })).toHaveCount(0);
});

test("Planner (Brandt): W8 names the people behind the distribution", async ({ page }) => {
  await asPersona(page, "brandt");
  await page.goto("/de/fairness");
  await expect(page.getByRole("table", { name: "Belastung je Person" })).toContainText("Dr. ");
});

test("Administrator: rules, master data and the demo clock", async ({ page }) => {
  await asPersona(page, "it-admin");
  await page.goto("/de/regeln");
  await expect(page.getByTestId("rule-sets")).toContainText("Regelversion 2026-1");
  await expect(page.getByTestId("clock-now")).toBeVisible();
  await page.getByLabel("Datum").fill("2026-10-27");
  await page.getByLabel("Uhrzeit").fill("06:00");
  await page.getByTestId("set-clock").click();
  await expect(page.getByTestId("clock-now")).toContainText("27.10.2026, 06:00");
  await page.getByRole("button", { name: "Auf Ausgangswert zurücksetzen" }).click();
  await expect(page.getByTestId("clock-now")).toContainText("20.10.2026, 06:00");
});

test("W13: every component with its real status; none can change the roster", async ({ page }) => {
  await asPersona(page, "brandt");
  await page.goto("/de/ki-transparenz");
  for (const c of ["C1", "C2", "C3", "C4", "C5", "C6", "RAG"])
    await expect(page.getByTestId(`component-${c}`)).toHaveAttribute(
      "data-implementation",
      "built",
    );
  for (const c of ["C7", "C8"])
    await expect(page.getByTestId(`component-${c}`)).toHaveAttribute(
      "data-implementation",
      "stand-in",
    );
  await expect(page.getByTestId("component-C8").getByTestId("metric-placeholder")).toBeVisible();
  // C7 was evaluated; the language model did not meet its pre-registered rule, so the stand-in is
  // served and the card says so, with the measured results.
  await expect(page.getByTestId("c7-served")).toContainText("Stichwort-Platzhalter");
  await expect(page.getByTestId("c7-promotion")).toContainText("Nicht bestandene Prüfungen");
  await expect(page.getByTestId("c7-metrics")).toContainText("Eingeschleuste Anweisung befolgt");
  await expect(page.getByTestId("can-change").filter({ hasText: "Nein" })).toHaveCount(9);
  // The summary line is computed from the cards on screen: the eight numbered components only,
  // with the unnumbered rulebook card named after the count, never added to it.
  const numbered = await page.locator('[data-testid^="component-C"]').count();
  const built = await page
    .locator('[data-testid^="component-C"][data-implementation="built"]')
    .count();
  const standIns = await page
    .locator('[data-testid^="component-C"][data-implementation="stand-in"]')
    .count();
  expect(numbered).toBe(8);
  await expect(
    page.getByText(
      `${String(built)} von ${String(numbered)} Komponenten gebaut, ${String(standIns)} Platzhalter`,
    ),
  ).toBeVisible();
  await expect(page.getByText("Zusätzlich, ohne Nummer: Regelwerk-Suche (gebaut)")).toBeVisible();
  await expect(page.getByTestId("rag-served")).toContainText("Nur Vektoren");
  await expect(page.getByTestId("rag-check")).toContainText("durchgefallen");
  await expect(page.getByTestId("c1-metrics")).toContainText("Wünsche erfüllt");
  await expect(page.getByTestId("c2-metrics")).toContainText("71/71");
  await expect(page.getByTestId("c3-served")).toContainText("Saisonal-naiv");
  await expect(page.getByTestId("c3-metrics")).toContainText("Poisson-Devianz");
  await expect(page.getByTestId("c3-promotion")).toContainText("nicht befördert");
  await expect(page.getByTestId("c4-served")).toContainText("Eigene Raten");
  await expect(page.getByTestId("c4-metrics")).toContainText("Log-Likelihood");
  await expect(page.getByTestId("c4-promotion")).toContainText("nicht befördert");
  await expect(page.getByTestId("c5-served")).toContainText("Basisrate");
  await expect(page.getByTestId("c5-metrics")).toContainText("Brier-Score");
  await expect(page.getByTestId("c5-promotion")).toContainText("nicht befördert");
  await expect(page.getByTestId("c5-policy-stand_in")).toBeVisible();
  // C6 leads with the natural states; the pooled figure says it includes simulated stress states.
  await expect(page.getByTestId("c6-metrics")).toContainText("Natürliche Lagen");
  await expect(page.getByTestId("c6-metrics")).toContainText(
    "einschließlich simulierter Stresslagen",
  );
  await expect(page.getByTestId("c6-model-stand_in")).toBeVisible();
  await expect(page.getByTestId("c6-served")).toBeVisible();
});
