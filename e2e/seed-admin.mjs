// Disposable E2E fixtures only. Never called by build/start or a deployment.
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { hashPassword } from "better-auth/crypto";

const target = path.resolve(process.env.PGLITE_DIR || ".");
if (process.env.VOLO_E2E_BUILD !== "1" || process.env.DATABASE_MODE !== "pglite" || process.env.DATABASE_URL ||
    path.dirname(target) !== path.resolve(".data") || !/^e2e-[a-f0-9-]{36}$/.test(path.basename(target))) {
  throw new Error("Admin fixtures require an isolated disposable E2E database.");
}
const client = new PGlite(target);
try {
  const password = await hashPassword("local-admin-pass-123");
  await client.query(`insert into "user" (id, name, email) values
    ('e2e-platform-admin', 'Platform Admin', 'admin@example.test'),
    ('e2e-usage-account', 'Other Account', 'ledger@example.test')`);
  await client.query(`insert into account (id, account_id, provider_id, user_id, password, updated_at)
    values ('e2e-admin-password', 'e2e-platform-admin', 'credential', 'e2e-platform-admin', $1, now())`, [password]);
  await client.query(`insert into usage_event (id, account_id, operation, model, units, estimated_cost_microusd) values
    ('e2e-usage-one', 'e2e-platform-admin', 'Admin fixture operation', 'fixture-model', '{}', 1000000),
    ('e2e-usage-two', 'e2e-usage-account', 'Other account operation', 'fixture-model', '{}', null)`);
  await client.query(`insert into interview (id, owner_id, interviewer_id, name, objective, description, theme_color, questions, is_active) values
    ('e2e-legacy-teal', 'e2e-usage-account', 'preset-bob', 'Candidate neutral theme check', 'Relevant skills', 'A short conversation about your experience.', '#0e6e66', '[{"id":"q1","question":"Describe a project","followUps":0}]', true),
    ('e2e-closed-teal', 'e2e-usage-account', 'preset-bob', 'Closed theme check', 'Relevant skills', '', '#0e6e66', '[]', false)`);
} finally { await client.close(); }
