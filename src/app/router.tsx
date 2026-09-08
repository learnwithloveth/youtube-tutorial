import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { MarketingLayout } from './layouts/MarketingLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { LegalLayout } from './layouts/LegalLayout';
import HomePage from '@/pages/HomePage';

/**
 * Route map.
 *
 * The home page is bundled eagerly (it is the overwhelming majority of entry
 * traffic); every other surface is a lazy boundary so first paint ships only
 * the shell + hero. Chunk names come from the manualChunks strategy in
 * vite.config.ts.
 */
const TradePage = lazy(() => import('@/pages/TradePage'));
const MarketsPage = lazy(() => import('@/pages/MarketsPage'));
const AssetPage = lazy(() => import('@/pages/AssetPage'));
const FeaturesPage = lazy(() => import('@/pages/FeaturesPage'));
const FeesPage = lazy(() => import('@/pages/FeesPage'));
const SecurityPage = lazy(() => import('@/pages/SecurityPage'));
const EarnPage = lazy(() => import('@/pages/EarnPage'));
const WalletPage = lazy(() => import('@/pages/WalletPage'));
const AppPage = lazy(() => import('@/pages/AppPage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const CareersPage = lazy(() => import('@/pages/CareersPage'));
const BlogPage = lazy(() => import('@/pages/BlogPage'));
const BlogPostPage = lazy(() => import('@/pages/BlogPostPage'));
const LearnPage = lazy(() => import('@/pages/LearnPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const InstitutionalPage = lazy(() => import('@/pages/InstitutionalPage'));
const DevelopersPage = lazy(() => import('@/pages/DevelopersPage'));
const AffiliatesPage = lazy(() => import('@/pages/AffiliatesPage'));
const PressPage = lazy(() => import('@/pages/PressPage'));
const StatusPage = lazy(() => import('@/pages/StatusPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const SignupPage = lazy(() => import('@/pages/auth/SignupPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const TwoFactorPage = lazy(() => import('@/pages/auth/TwoFactorPage'));
const VerifyIdentityPage = lazy(() => import('@/pages/auth/VerifyIdentityPage'));

const TermsPage = lazy(() => import('@/pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('@/pages/legal/PrivacyPage'));
const CookiesPage = lazy(() => import('@/pages/legal/CookiesPage'));

export const routes: RouteObject[] = [
  {
    element: <MarketingLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'trade', element: <TradePage /> },
      { path: 'markets', element: <MarketsPage /> },
      { path: 'markets/:assetId', element: <AssetPage /> },
      { path: 'features', element: <FeaturesPage /> },
      { path: 'fees', element: <FeesPage /> },
      { path: 'security', element: <SecurityPage /> },
      { path: 'earn', element: <EarnPage /> },
      { path: 'wallet', element: <WalletPage /> },
      { path: 'app', element: <AppPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'careers', element: <CareersPage /> },
      { path: 'blog', element: <BlogPage /> },
      { path: 'blog/:slug', element: <BlogPostPage /> },
      { path: 'learn', element: <LearnPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: 'institutional', element: <InstitutionalPage /> },
      { path: 'developers', element: <DevelopersPage /> },
      { path: 'affiliates', element: <AffiliatesPage /> },
      { path: 'press', element: <PressPage /> },
      { path: 'status', element: <StatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: 'signup', element: <SignupPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'two-factor', element: <TwoFactorPage /> },
      { path: 'verify-identity', element: <VerifyIdentityPage /> },
    ],
  },
  {
    path: 'legal',
    element: <LegalLayout />,
    children: [
      { path: 'terms', element: <TermsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'cookies', element: <CookiesPage /> },
    ],
  },
];
