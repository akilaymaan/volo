import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/auth";
import { LandingMobileMenu } from "@/components/landing-mobile-menu";

const STEPS = [
  {
    title: "Describe the role",
    body: "Paste or upload the job description. Claude drafts focused, open-ended questions you can edit, reorder and extend.",
  },
  {
    title: "Share one link",
    body: "Candidates open it on any device, check their mic, and talk to an AI interviewer that follows up like a person would.",
  },
  {
    title: "Review the shortlist",
    body: "Every conversation comes back scored, summarized question by question, with the recording and full transcript.",
  },
];

const FEATURES = [
  {
    title: "Speaks your candidates' language",
    body: "English plus Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati, Punjabi and Odia — with natural Indian voices from Sarvam AI. Reports always arrive in English.",
  },
  {
    title: "Follows up like a real interviewer",
    body: "Claude listens to each answer and decides whether to dig deeper or move on, within the time you set. Tune each interviewer's empathy, depth, rapport and pace.",
  },
  {
    title: "Reports you can act on",
    body: "Overall score, hiring recommendation, communication rating, strengths, gaps and verbatim quotes. Insights across all candidates show where the pool is strong or thin.",
  },
  {
    title: "Fair and hard to game",
    body: "One attempt per email, optional invite lists, tab-switch tracking, and server-side timing. Transcripts are judged on substance, not accent.",
  },
];

export default async function Home() {
  const user = await getUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
        <Logo className="shrink-0" />
        <LandingMobileMenu authenticated={!!user} />
        <nav aria-label="Main landing navigation" className="hidden items-center gap-1 sm:flex">
          <ThemeToggle />
          {user ? (
            <Button asChild size="lg" className="ml-2">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg">
                <Link href="/sign-in?method=account">Existing account</Link>
              </Button>
              <Button asChild size="lg" className="ml-1">
                <Link href="/sign-in">Enter Volo</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-4 pb-12 pt-8 text-center sm:px-6 sm:pb-20 sm:pt-10 lg:pt-16">
          <div>
            <h1 className="mx-auto max-w-3xl text-[2rem] font-bold leading-[1.12] sm:text-6xl sm:leading-[1.05]">
              First-round interviews, spoken in your candidate&apos;s language.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
              Paste a job description. Volo writes the questions, runs a live voice interview in
              English or ten Indian languages, and hands you a scored report with the recording and
              transcript.
            </p>
            <div className="mx-auto mt-7 flex max-w-sm flex-col justify-center gap-3 sm:mt-8 sm:max-w-none sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="h-11 px-5 text-base">
                <Link href={user ? "/dashboard/interviews/new" : "/sign-in"}>Create your first interview</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Free and open source. Self-host in minutes.</p>
          </div>
        </section>

        <section id="how-it-works" className="border-y bg-card">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold">From job description to shortlist</h2>
            <ol className="mt-10 grid gap-10 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative pl-12">
                  <span className="absolute left-0 top-0 flex size-8 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-x-16 gap-y-10 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="border-l-2 border-border pl-5">
                <h3 className="text-xl font-semibold">{f.title}</h3>
                <p className="mt-2 text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <Logo className="text-base text-foreground" />
          <p>MIT licensed. Voice by Sarvam AI, intelligence by Claude.</p>
        </div>
      </footer>
    </div>
  );
}
