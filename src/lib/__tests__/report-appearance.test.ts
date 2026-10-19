import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PersonaDot } from "@/components/voice-orb";
import { scoreTone, ScoreRing } from "@/components/score";
import { CANDIDATE_STATUSES, RECOMMENDATIONS } from "@/lib/constants";

it("monochrome report avatars ignore legacy teal and purple without changing identity", () => {
  for (const color of ["#0e6e66", "#14b8a6", "#8b5cf6"]) {
    const html = renderToStaticMarkup(createElement(PersonaDot, { color, name: "Explorer Lisa", size: 26, monochrome: true }));
    expect(html).toContain('data-persona-avatar="monochrome"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("bg-secondary text-secondary-foreground");
    expect(html).toContain(">L</span>");
    expect(html).not.toContain(color);
    expect(html).not.toContain("gradient");
  }
});

it("does not overwrite saved persona colors in other persona views", () => {
  const html = renderToStaticMarkup(createElement(PersonaDot, { color: "#8b5cf6", name: "Explorer Lisa" }));
  expect(html).toContain("#8b5cf6");
  expect(html).toContain("radial-gradient");
});

it("positive assessment and review labels are neutral while their meanings and scores are preserved", () => {
  expect(scoreTone(75)).toBe("text-foreground");
  expect(scoreTone(100)).toBe("text-foreground");
  expect(scoreTone(50)).toContain("amber");
  expect(scoreTone(20)).toContain("rose");
  expect(RECOMMENDATIONS.yes).toEqual({ label: "Hire", className: "text-foreground" });
  expect(RECOMMENDATIONS.strong_yes).toEqual({ label: "Strong hire", className: "text-foreground" });
  expect(CANDIDATE_STATUSES.shortlisted.label).toBe("Shortlisted");
  expect(CANDIDATE_STATUSES.shortlisted.className).toBe("border bg-secondary text-secondary-foreground");
  const html = renderToStaticMarkup(createElement(ScoreRing, { score: 75, label: "Overall" }));
  expect(html).toContain('aria-label="Overall: 75 out of 100"');
  expect(html).not.toMatch(/emerald|teal|green|cyan/);
});
