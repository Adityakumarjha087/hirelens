import { BarChart3, EyeOff, KanbanSquare, Sparkles, Target, Wand2 } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { Logo, ThemeToggle } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { homeFor, useAuth } from '@/lib/auth';

const FEATURES = [
  { icon: Wand2, title: 'AI resume parsing', text: 'PDF/DOCX to structured skills, experience and education in seconds.' },
  { icon: Target, title: 'Explainable matching', text: 'Vector similarity + skill overlap + experience fit, with a clear breakdown.' },
  { icon: EyeOff, title: 'Blind screening', text: 'Hide names, contact, gender and age signals during initial review.' },
  { icon: KanbanSquare, title: 'Pipeline board', text: 'Drag candidates from Applied to Offer with automatic email updates.' },
  { icon: Sparkles, title: 'Resume feedback', text: 'ATS score, missing keywords and rewritten bullet points for candidates.' },
  { icon: BarChart3, title: 'Hiring analytics', text: 'Applicants per job, average match score and time-to-hire.' },
];

export function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-4">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/register">Get started</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-16">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Find the right candidate, <span className="text-primary">explained</span>.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            HireLens ranks applicants with transparent AI scoring and helps candidates make their resumes stand out.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">Create free account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Try the demo</Link>
            </Button>
          </div>
        </section>
        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Features">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent className="p-5">
                <f.icon className="mb-3 h-6 w-6 text-primary" aria-hidden />
                <h2 className="font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
