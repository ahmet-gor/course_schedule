import { useEffect } from 'react'
import { useApp } from './store/useApp'
import { Layout } from './components/Layout'
import { Toaster } from '@/components/ui/sonner'
import { LicenseBanner, LicenseDialog } from './components/LicenseUI'
import { useLicensing } from './store/useLicensing'
import { useT } from './i18n'
import SchedulesPage from './pages/SchedulesPage'
import DepartmentsPage from './pages/DepartmentsPage'
import LessonsPage from './pages/LessonsPage'
import TeachersPage from './pages/TeachersPage'
import TimetablesPage from './pages/TimetablesPage'
import GeneratePage from './pages/GeneratePage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const { ready, loadSchedules, page } = useApp()
  const t = useT()
  const refreshLicensing = useLicensing((s) => s.refresh)

  useEffect(() => {
    void loadSchedules()
    void refreshLicensing()
  }, [loadSchedules, refreshLicensing])

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

  return shell(
    <Layout>
      {page === 'schedules' && <SchedulesPage />}
      {page === 'departments' && <DepartmentsPage />}
      {page === 'lessons' && <LessonsPage />}
      {page === 'teachers' && <TeachersPage />}
      {page === 'timetables' && <TimetablesPage />}
      {page === 'generate' && <GeneratePage />}
      {page === 'settings' && <SettingsPage />}
    </Layout>
  )
}
