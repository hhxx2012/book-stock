-- ========================================
-- 数据库修复脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- 解决：Could not find the 'book_code' column of 'books' in the schema cache
-- ========================================

-- 1. 确保 books 表有 book_code 字段
ALTER TABLE books ADD COLUMN IF NOT EXISTS book_code TEXT;

-- 2. 确保 stock 表有 book_code 字段
ALTER TABLE stock ADD COLUMN IF NOT EXISTS book_code TEXT;

-- 3. 确保 logs 表有所有需要的字段
ALTER TABLE logs ADD COLUMN IF NOT EXISTS stock_id TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS operator_name TEXT;

-- 4. 确保 forecasts 表有所有需要的字段
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS operator_name TEXT;

-- 5. 确保 books 表有 difficulty 字段（允许为空）
ALTER TABLE books ADD COLUMN IF NOT EXISTS difficulty TEXT;

-- 6. 确保 stock 表有所有需要的字段
ALTER TABLE stock ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS total_quantity INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS honghe_quantity INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS longhua_quantity INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS total_in INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS total_out INTEGER DEFAULT 0;
ALTER TABLE stock ADD COLUMN IF NOT EXISTS remaining_stock INTEGER DEFAULT 0;

-- 7. 确保 books 表有数量字段
ALTER TABLE books ADD COLUMN IF NOT EXISTS total_quantity INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS honghe_quantity INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS longhua_quantity INTEGER DEFAULT 0;

-- 8. 关闭所有表的 RLS（行级安全）
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

-- 9. 确认修复结果
SELECT 'books 表结构' as table_name;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'books' AND table_schema = 'public'
ORDER BY ordinal_position;

SELECT 'stock 表结构' as table_name;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'stock' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 10. 确认 RLS 状态
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users','roles','role_permissions','grades','subjects','difficulties','books','stock','forecasts','logs','system_settings');
