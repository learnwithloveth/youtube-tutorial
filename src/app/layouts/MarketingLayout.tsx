import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/chrome/Navbar';
import { Footer } from '@/components/chrome/Footer';
import { AmbientBackdrop } from '@/components/visuals/AmbientBackdrop';

export function MarketingLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <AmbientBackdrop />
      <a
        href="#main"
        className="sr-only rounded-full bg-brand px-5 py-2 text-sm font-medium text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
