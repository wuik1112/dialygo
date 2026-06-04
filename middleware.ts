// middleware.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // 1. Create a Supabase client configured for Next.js Middleware
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // 2. Get the authenticated user's session
  const { data: { user } } = await supabase.auth.getUser()
  
  const currentPath = request.nextUrl.pathname

  // 3. If no user is logged in, redirect all protected routes to the home page (login)
  if (!user && (currentPath.startsWith('/admin') || currentPath.startsWith('/manager') || currentPath.startsWith('/nurse') || currentPath.startsWith('/patient') || currentPath.startsWith('/nephrologist'))) {
     return NextResponse.redirect(new URL('/', request.url))
  }

  // 4. If a user IS logged in, verify their role from the database
  if (user) {
      // Fetch the role_id from your public.users table using the user's email
      const { data: userData } = await supabase
        .from('users')
        .select('role_id')
        .eq('user_email', user.email)
        .single()
      
      const role = userData?.role_id

      // 5. Route Protection Rules based on role_id
      // Assuming: 1 = Admin, 2 = Manager, 3 = Nephrologist, 4 = Nurse, 5 = Patient
      
      // If a non-admin tries to access /admin
      if (currentPath.startsWith('/admin') && role !== 1) {
         return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      
      // If a non-manager and non-admin tries to access /manager
      if (currentPath.startsWith('/manager') && role !== 2 && role !== 1) {
          return NextResponse.redirect(new URL('/unauthorized', request.url))
      }

      // If a non-nurse tries to access /nurse
      if (currentPath.startsWith('/nurse') && role !== 4) {
          return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
      
      // If a non-nephrologist tries to access /nephrologist
      if (currentPath.startsWith('/nephrologist') && role !== 3) {
          return NextResponse.redirect(new URL('/unauthorized', request.url))
      }
  }

  return response
}

// 6. Define which routes this middleware should run on.
// We ignore static files, images, and the favicon to save performance.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
