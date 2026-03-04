// supabase/functions/test-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  console.log('✅ Test function invoked!')
  return new Response(
    JSON.stringify({ message: 'success' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
