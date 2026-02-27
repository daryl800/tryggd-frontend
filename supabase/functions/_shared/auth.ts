// supabase/functions/_shared/auth.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function validateAndGetUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  
  // Case 1: No auth header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { 
      user: null, 
      error: 'Missing or invalid Authorization header',
      status: 401 
    }
  }

  const token = authHeader.replace('Bearer ', '')
  
  // Case 2: Token is malformed (quick check)
  if (token.split('.').length !== 3) {
    console.error('Malformed token - invalid segment count:', token.split('.').length)
    return { 
      user: null, 
      error: 'Invalid token format',
      status: 401 
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  )

  // Case 3: Token validation
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError) {
    console.error('Auth error:', {
      message: authError.message,
      status: authError.status,
      name: authError.name
    })
    
    // Specific error messages
    if (authError.message.includes('JWT')) {
      return { 
        user: null, 
        error: 'Invalid or expired token',
        status: 401 
      }
    }
    
    return { 
      user: null, 
      error: 'Authentication failed',
      status: 401 
    }
  }

  if (!user) {
    return { 
      user: null, 
      error: 'User not found',
      status: 401 
    }
  }

  return { user, error: null, status: 200 }
}
