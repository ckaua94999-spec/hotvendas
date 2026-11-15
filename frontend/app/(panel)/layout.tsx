'use client'
import { Suspense } from 'react'
import { BrandMark } from '../../components/icons'
import { Shell } from '../../components/shell'

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Carregando o painel">
      <BrandMark size={72} animated />
    </div>
  )
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Splash />}>
      <Shell>{children}</Shell>
    </Suspense>
  )
}
