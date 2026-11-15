import { createHmac, timingSafeEqual } from 'crypto'
import { Injectable, OnModuleInit } from '@nestjs/common'
import bcrypt from 'bcryptjs'
import { settingsKey } from '../infra/env'
import { PrismaService } from '../infra/prisma.service'

type Session = { sub: string; email: string; role: string; exp: number }

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.adminUser.count()
    const email = process.env.ADMIN_EMAIL
    const password = process.env.ADMIN_PASSWORD
    if (count === 0 && email && password) {
      await this.prisma.adminUser.create({
        data: { email, passwordHash: await bcrypt.hash(password, 10), role: 'owner' },
      })
    }
  }

  async login(email: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } })
    if (!admin) return null
    const ok = await bcrypt.compare(password, admin.passwordHash)
    if (!ok) return null
    return { token: this.sign({ sub: admin.id, email: admin.email, role: admin.role, exp: Date.now() + 7 * 86400000 }), admin }
  }

  fromCookie(header?: string) {
    const token = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith('admin_session='))?.slice('admin_session='.length)
    if (!token) return null
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = createHmac('sha256', settingsKey()).update(body).digest('base64url')
    const left = Buffer.from(sig)
    const right = Buffer.from(expected)
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null
    const session = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session
    if (session.exp < Date.now()) return null
    return session
  }

  private sign(session: Session) {
    const body = Buffer.from(JSON.stringify(session)).toString('base64url')
    const sig = createHmac('sha256', settingsKey()).update(body).digest('base64url')
    return `${body}.${sig}`
  }
}

const hits = new Map<string, number[]>()
export function loginAllowed(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter((at) => now - at < 60_000)
  if (recent.length >= 10) return false
  recent.push(now)
  hits.set(ip, recent)
  return true
}
