import type { Metadata } from "next";
import { RecordingRecovery } from "@/components/call/recording-recovery";

export const metadata: Metadata = { title: "Recording recovery", robots: { index: false, follow: false } };

export default function RecordingRecoveryPage() {
  return <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
    <h1 className="mb-4 text-2xl font-bold">Recording recovery</h1>
    <RecordingRecovery />
  </main>;
}
