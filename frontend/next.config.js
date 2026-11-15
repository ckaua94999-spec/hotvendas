/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_PROXY || 'http://127.0.0.1:3001'}/api/:path*` }]
  },
}
module.exports = nextConfig
