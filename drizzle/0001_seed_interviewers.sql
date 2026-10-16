-- Built-in interviewer personas (owner_id NULL = visible to every account)
INSERT INTO "interviewer" ("id", "owner_id", "name", "description", "voice", "color", "empathy", "exploration", "rapport", "speed") VALUES
('preset-lisa', NULL, 'Explorer Lisa', 'Curious and energetic. Lisa digs into the "how" and "why" behind every answer with thoughtful follow-ups, while keeping a warm, steady pace.', 'ritu', '#8b5cf6', 7, 10, 7, 5),
('preset-bob', NULL, 'Empathetic Bob', 'Calm and reassuring. Bob puts candidates at ease, listens closely and connects on a human level — great for early-career and culture-fit rounds.', 'shubh', '#0ea5e9', 10, 7, 7, 5),
('preset-aarav', NULL, 'Technical Aarav', 'Precise and structured. Aarav probes depth of technical knowledge, trade-offs and real project experience without wasting a minute.', 'aditya', '#10b981', 5, 9, 5, 7),
('preset-meera', NULL, 'HR Meera', 'Friendly and professional. Meera covers motivation, teamwork, communication and expectations — ideal for screening and HR rounds.', 'kavya', '#f43f5e', 9, 6, 10, 5)
ON CONFLICT ("id") DO NOTHING;
