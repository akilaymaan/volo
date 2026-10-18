import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("upgrades duplicate historical attempts and orphan feedback without deleting legacy data", async () => {
  const client = new PGlite();
  try {
    for (const name of ["0000_init", "0001_seed_interviewers", "0002_review_hardening"])
      await client.exec(await readFile(`drizzle/${name}.sql`, "utf8"));
    await client.exec(`
      INSERT INTO "user" (id, name, email) VALUES ('legacy-owner', 'Owner', 'legacy@example.test');
      INSERT INTO interview (id, owner_id, interviewer_id, name, objective)
        VALUES ('legacy-role', 'legacy-owner', 'preset-bob', 'Role', 'Objective');
      INSERT INTO response (id, interview_id, email, status)
        VALUES ('legacy-done', 'legacy-role', 'Candidate@Example.Test', 'completed'),
               ('legacy-live', 'legacy-role', 'candidate@example.test', 'in_progress');
      INSERT INTO feedback (interview_id, response_id, satisfaction, comment)
        VALUES ('legacy-role', 'deleted-before-upgrade', 5, 'Historical orphan'),
               ('legacy-role', 'legacy-done', 4, 'Linked feedback');
    `);
    for (const name of ["0003_production_foundation", "0004_email_invitations", "0005_usage_and_retention_indexes", "0006_interview_templates"])
      await client.exec(await readFile(`drizzle/${name}.sql`, "utf8"));
    const attempts = (await client.query("select * from candidate_attempt")).rows;
    expect(attempts).toEqual([{ interview_id: "legacy-role", email: "candidate@example.test", response_id: "legacy-done" }]);
    const rows = (await client.query<{ consented_at: unknown; delete_after: unknown }>("select * from response")).rows;
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.consented_at === null && r.delete_after === null)).toBe(true);
    expect((await client.query("select * from feedback")).rows).toHaveLength(2);
    expect((await client.query("select * from interview_template")).rows).toHaveLength(0);
    await client.exec("delete from response where id = 'legacy-done'");
    expect((await client.query("select * from feedback")).rows).toHaveLength(1);
    expect((await client.query("select * from candidate_attempt")).rows).toHaveLength(0);
  } finally { await client.close(); }
}, 30_000);
