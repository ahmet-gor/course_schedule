import { useEffect } from 'react'
import { useApp } from './store/useApp'
import { Layout, Onboarding } from './components/Layout'
import { Toaster } from '@/components/ui/sonner'
import { LicenseBanner, LicenseDialog } from './components/LicenseUI'
import { useLicensing } from './store/useLicensing'
import { useT } from './i18n'
import TimetablesPage from './pages/TimetablesPage'
import ClassesPage from './pages/ClassesPage'
import SubjectsPage from './pages/SubjectsPage'
import TeachersPage from './pages/TeachersPage'
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
      {page === 'classes' && <ClassesPage />}
      {page === 'subjects' && <SubjectsPage />}
      {page === 'teachers' && <TeachersPage />}
      {page === 'generate' && <GeneratePage />}
      {page === 'settings' && <SettingsPage />}
    </Layout>
  )
}
