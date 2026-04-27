import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3333'
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/settings', '/stats', '/login', '/api'] },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
