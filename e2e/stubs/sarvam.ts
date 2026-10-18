// Test-build-only speech double, with decodable audio for browser recording tests.
export { paceFor, SarvamError } from "../../src/lib/ai/sarvam";

export async function transcribe(audio: Blob) {
  return audio.size ? "This is a test answer from the candidate." : "";
}

export async function synthesize() {
  const samples = 3200;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(16000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples * 2, 40);
  return buf;
}
