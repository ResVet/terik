import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { useT } from '../i18n';
import { ForecastPage } from '../ui/pages/ForecastPage';
import { Footer } from '../ui/layout/Footer';
import { Header, TabBar } from '../ui/layout/Header';
import { useDocumentSettings } from './useDocument';
import { usePlaceBootstrap } from './usePlace';
import styles from './App.module.css';

const ClimatePage = lazy(() => import('../ui/pages/ClimatePage'));
const MethodPage = lazy(() => import('../ui/pages/MethodPage'));

function ScrollToTop() {
  const [path] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);
  return null;
}

function NotFound() {
  const t = useT();
  return (
    <div className={`wrap ${styles.notFound}`}>
      <p>{t.common.notFound}</p>
      <Link href="/">{t.common.home}</Link>
    </div>
  );
}

function PageFallback() {
  const t = useT();
  return (
    <div className={`wrap ${styles.fallback}`} aria-busy="true">
      {t.common.loading}
    </div>
  );
}

export function App() {
  const t = useT();
  useDocumentSettings();
  usePlaceBootstrap();

  return (
    <>
      <a className="skip-link" href="#main">
        {t.nav.skip}
      </a>
      <Header />
      <ScrollToTop />
      <main id="main" className={styles.main} tabIndex={-1}>
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={ForecastPage} />
            <Route path="/climate" component={ClimatePage} />
            <Route path="/method" component={MethodPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
      <Footer />
      <TabBar />
    </>
  );
}
