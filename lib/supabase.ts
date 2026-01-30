import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from "@supabase/supabase-js";
// 如果未安装，运行: npx expo install @react-native-async-storage/async-storage

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

console.log("🔍 SUPABASE URL:", supabaseUrl);
console.log("🔍 SUPABASE ANON KEY PREFIX:", supabaseAnonKey?.slice(0, 10));

export const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
        auth: {
            storage: AsyncStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    }
);
