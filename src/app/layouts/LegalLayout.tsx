import { NavLink, Outlet } from 'react-router-dom';
import { Navbar } from '@/components/chrome/Navbar';
import { Footer } from '@/components/chrome/Footer';
import { AmbientBackdrop } from '@/components/visuals/AmbientBackdrop';
import { cn } from '@/lib/cn';

const DOCS = [
  { to: '/legal/terms', label: 'Terms of service' },
  { to: '/legal/privacy', label: 'Privacy policy' },
  { to: '/legal/cookies', label: 'Cookie policy' },
];

export function LegalLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AmbientBackdrop />
      <Navbar />
      <main id="main" className="flex-1">
        <div className="shell grid gap-12 py-16 lg:grid-cols-[16rem_1fr] lg:py-24">
          <nav aria-label="Legal documents" className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow mb-4">Legal centre</p>
            <ul className="space-y-1">
              {DOCS.map((doc) => (
                <li key={doc.to}>
                  <NavLink
                    to={doc.to}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-md px-3 py-2 text-sm transition-colors duration-200',
                        isActive
                          ? 'bg-surface text-fg font-medium'
                          : 'text-fg-muted hover:bg-surface hover:text-fg',
                      )
                    }
                  >
                    {doc.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <article className="prose-legal max-w-3xl">
            <Outlet />
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
