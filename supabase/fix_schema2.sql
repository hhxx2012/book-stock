-- ========================================
-- 数据库完整修复脚本（第二次）
-- 在 Supabase SQL Editor 中执行此脚本
-- 补全所有缺失的字段
-- ========================================

-- ========== 1. books 表 ==========
ALTER TABLE books ADD COLUMN IF NOT EXISTS book_code TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS total_quantity INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS honghe_quantity INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS longhua_quantity INTEGER DEFAULT 0;

-- ========== 2. stock 表 ==========
ALTER TABLE stock ADD COLUMN IF NOT EXISTS campus_name TEXT;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS book_code TEXT;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS total_quantity INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS honghe_quantity INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS longhua_quantity INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS total_in INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS total_out INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS remaining_stock INTEGER DEFAULT 0;

-- ========== 3. logs 表 ==========
ALTER TABLE logs ADD COLUMN IF NOT EXISTS stock_id TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS operator_name TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS campus TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS book_name TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS note TEXT;

-- ========== 4. forecasts 表 ==========
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS operator_name TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS campus_name TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS book_name TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS campus TEXT;

-- ========== 5. users 表 ==========
ALTER TABLE users ADD COLUMN IF NOT EXISTS campus_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['teacher'];
ALTER TABLE users ADD COLUMN IF NOT EXISTS campuses TEXT[] DEFAULT ARRAY['honghe'];

-- ========== 6. 关闭所有表的 RLS ==========
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE difficulties DISABLE ROW LEVEL SECURITY;
ALTER TABLE books DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock DISABLE ROW LEVEL SECURITY;
ALTER TABLE forecasts DISABLE ROW LEVEL SECURITY;
ALTER TABLE logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings DISABLE ROW LEVEL SECURITY;

-- ========== 7. 确认 stock 表所有字段 ==========
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'stock' AND table_schema = 'public'
ORDER BY ordinal_position;

-- ========== 8. 确认 RLS 状态 ==========
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users','roles','role_permissions','grades','subjects','difficulties','books','stock','forecasts','logs','system_settings');
