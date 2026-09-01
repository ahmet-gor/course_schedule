import { useEffect } from 'react'
import { useApp } from './store/useApp'
import { Layout, Onboarding } from './components/Layout'
import { Toaster } from '@/components/ui/sonner'
import { LicenseBanner, LicenseDialog } from './components/LicenseUI'
import { useLicensing } from './store/useLicensing'
import { useT } from './i18n'
import TimetablesPage from './pages/TimetablesPage'
import SectionsPage from './pages/SectionsPage'
import CoursesPage from './pages/CoursesPage'
import InstructorsPage from './pages/InstructorsPage'
import RoomsPage from './pages/RoomsPage'
import GeneratePage from './pages/GeneratePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const { ready, terms, loadTerms, page } = useApp()
  const t = useT()
  const refreshLicensing = useLicensing((s) => s.refresh)

  useEffect(() => {
    void loadTerms()
    void refreshLicensing()
  }, [loadTerms, refreshLicensing])

  const shell = (children: React.ReactNode) => (
    <>
      {children}
      <LicenseBanner />
      <LicenseDialog />
      <Toaster position="bottom-right" />
    </>
  )

  if (!ready) {
    return shell(
      <div className="h-full flex items-center justify-center text-muted-foreground">{t('common.loading')}</div>
    )
  }

  if (terms.length === 0) {
    return shell(<Onboarding />)
  }

  return shell(
    <Layout>
      {page === 'timetables' && <TimetablesPage />}
      {page === 'sections' && <SectionsPage />}
      {page === 'courses' && <CoursesPage />}
      {page === 'instructors' && <InstructorsPage />}
      {page === 'rooms' && <RoomsPage />}
      {page === 'generate' && <GeneratePage />}
      {page === 'settings' && <SettingsPage />}
    </Layout>
  )
}
