import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'Hot Vendas', description: 'Operação de vendas no Telegram' }

// Aplica o tema salvo antes da primeira pintura, para a tela não piscar na cor errada.
const themeScript = `try{var t=localStorage.getItem('hotvendas-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400..800&family=Literata:opsz,wght@7..72,400..700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
