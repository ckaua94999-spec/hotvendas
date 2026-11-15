import { Body, Controller, Get, HttpException, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { AuthService, loginAllowed } from '../app/auth.service'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Req() req: any, @Res({ passthrough: true }) res: any) {
    if (!loginAllowed(req.ip || 'local')) throw new HttpException('muitas tentativas', 429)
    const result = await this.auth.login(body.email || '', body.password || '')
    if (!result) throw new UnauthorizedException('credenciais inválidas')
    res.setHeader('Set-Cookie', `admin_session=${result.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`)
    return { email: result.admin.email, role: result.admin.role }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: any) {
    res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0')
    return { ok: true }
  }

  @Get('me')
  me(@Req() req: any) {
    const session = this.auth.fromCookie(req.headers.cookie)
    if (!session) throw new UnauthorizedException()
    return { email: session.email, role: session.role }
  }
}
