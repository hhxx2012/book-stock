-- ========================================
-- 修复 users 表缺失的 password 列
-- 在 Supabase SQL Editor 中执行此脚本
-- ========================================

-- 给 users 表添加 password 列（如果不存在）
ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;

-- 确认 users 表所有字段
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;
